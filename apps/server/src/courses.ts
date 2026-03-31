import { and, desc, eq } from "drizzle-orm";
import {
  courseRefSchema,
  courseSnapshotSchema,
  courseSummarySchema,
  courseVisibilitySchema,
  createPublicId,
  learnSessionSnapshotSchema,
  persistedCourseSchema,
  type CourseRef,
  type CourseSnapshot,
  type CourseSummary,
  type LearnSessionSnapshot,
  type PersistedCourse,
} from "@prof/contracts";

import { requireDb } from "./db/client.js";
import { course, learnSession, user } from "./db/schema.js";

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCourseSlug(value: string) {
  return value.trim().toLowerCase();
}

function slugifyCourseTitle(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "untitled-course";
}

function deriveCourseTitle(snapshot: CourseSnapshot) {
  if (snapshot.plan?.title?.trim()) {
    return snapshot.plan.title.trim();
  }

  if (snapshot.generatedBlock && "title" in snapshot.generatedBlock && snapshot.generatedBlock.title.trim()) {
    return snapshot.generatedBlock.title.trim();
  }

  if (snapshot.generatedQuiz?.title?.trim()) {
    return snapshot.generatedQuiz.title.trim();
  }

  if (snapshot.goal.trim()) {
    return snapshot.goal.trim();
  }

  return "Untitled course";
}

function countTopicArtifacts(topicArtifacts: CourseSnapshot["topicArtifacts"]) {
  return Object.values(topicArtifacts).reduce((count, topicArtifactsEntry) => {
    let nextCount = count;

    if (topicArtifactsEntry.block) {
      nextCount += 1;
    }

    if (topicArtifactsEntry.quiz && topicArtifactsEntry.block?.type !== "quiz") {
      nextCount += 1;
    }

    return nextCount;
  }, 0);
}

function countSnapshotArtifacts(snapshot: CourseSnapshot) {
  const topicArtifactCount = countTopicArtifacts(snapshot.topicArtifacts ?? {});
  if (topicArtifactCount > 0) {
    return topicArtifactCount;
  }

  let fallbackCount = 0;

  if (snapshot.generatedBlock) {
    fallbackCount += 1;
  }

  if (snapshot.generatedQuiz && snapshot.generatedBlock?.type !== "quiz") {
    fallbackCount += 1;
  }

  return fallbackCount;
}

function hasCourseContent(snapshot: CourseSnapshot) {
  return Boolean(snapshot.plan || snapshot.generatedBlock || snapshot.generatedQuiz || countSnapshotArtifacts(snapshot) > 0);
}

function deriveCourseSnapshot(snapshot: LearnSessionSnapshot) {
  const nextSnapshot = courseSnapshotSchema.parse({
    goal: snapshot.goal,
    plan: snapshot.plan,
    planSources: snapshot.planSources ?? [],
    // Topic selection is session UI state. It should not mutate the saved course on every click.
    selectedTopicId: null,
    generatedBlock: snapshot.generatedBlock,
    generatedTopicId: snapshot.generatedTopicId,
    generatedQuiz: snapshot.generatedQuiz,
    generatedQuizTopicId: snapshot.generatedQuizTopicId,
    topicArtifacts: snapshot.topicArtifacts ?? {},
    blockSources: snapshot.blockSources ?? [],
  });

  return hasCourseContent(nextSnapshot) ? nextSnapshot : null;
}

function snapshotsMatch(left: CourseSnapshot, right: CourseSnapshot) {
  return JSON.stringify(courseSnapshotSchema.parse(left)) === JSON.stringify(courseSnapshotSchema.parse(right));
}

async function ensureUniqueSlug(ownerId: string, preferredSlug: string) {
  const db = requireDb();
  const baseSlug = slugifyCourseTitle(preferredSlug);
  let nextSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const [existing] = await db
      .select({ id: course.id })
      .from(course)
      .where(and(eq(course.ownerId, ownerId), eq(course.slug, nextSlug)))
      .limit(1);

    if (!existing) {
      return nextSlug;
    }

    nextSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function readCourseLineageById(courseId: string) {
  const [record] = await requireDb()
    .select({
      id: course.id,
      ownerId: course.ownerId,
      slug: course.slug,
      title: course.title,
      visibility: course.visibility,
      artifactCount: course.artifactCount,
      snapshot: course.snapshot,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      ownerUsername: user.username,
    })
    .from(course)
    .innerJoin(user, eq(course.ownerId, user.id))
    .where(eq(course.id, courseId))
    .limit(1);

  return record ?? null;
}

async function readCourseLineageByOwnerAndSlug(ownerUsername: string, courseSlug: string) {
  const [record] = await requireDb()
    .select({
      id: course.id,
      ownerId: course.ownerId,
      slug: course.slug,
      title: course.title,
      visibility: course.visibility,
      artifactCount: course.artifactCount,
      snapshot: course.snapshot,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      ownerUsername: user.username,
    })
    .from(course)
    .innerJoin(user, eq(course.ownerId, user.id))
    .where(and(eq(user.username, normalizeUsername(ownerUsername)), eq(course.slug, normalizeCourseSlug(courseSlug))))
    .limit(1);

  return record ?? null;
}

function toCourseRef(input: {
  courseId: string;
  ownerUsername: string;
  courseSlug: string;
  title: string;
}) {
  return courseRefSchema.parse(input);
}

async function createCourseLineage(options: {
  ownerId: string;
  ownerUsername: string;
  preferredSlug: string;
  title: string;
  artifactCount: number;
  snapshot: CourseSnapshot;
}) {
  const db = requireDb();
  const slug = await ensureUniqueSlug(options.ownerId, options.preferredSlug);
  const now = new Date();
  const [record] = await db
    .insert(course)
    .values({
      id: createPublicId(12),
      ownerId: options.ownerId,
      slug,
      title: options.title,
      visibility: "private",
      artifactCount: options.artifactCount,
      snapshot: options.snapshot,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    ...record,
    ownerUsername: options.ownerUsername,
  };
}

async function backfillLegacyCoursesForUser(userId: string) {
  const [ownerRecord] = await requireDb()
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const username = ownerRecord?.username ? normalizeUsername(ownerRecord.username) : null;
  if (!username) {
    return;
  }

  const sessionRecords = await requireDb()
    .select({
      id: learnSession.id,
      courseId: learnSession.courseId,
      snapshot: learnSession.snapshot,
    })
    .from(learnSession)
    .where(eq(learnSession.userId, userId))
    .orderBy(desc(learnSession.updatedAt));

  for (const record of sessionRecords) {
    let parsedSnapshot: LearnSessionSnapshot;

    try {
      parsedSnapshot = learnSessionSnapshotSchema.parse(record.snapshot);
    } catch {
      continue;
    }

    const currentCourseId = parsedSnapshot.course?.courseId ?? record.courseId ?? null;
    if (currentCourseId) {
      const existingCourse = await readCourseLineageById(currentCourseId);
      if (existingCourse) {
        continue;
      }
    }

    const courseRef = await syncCourseForUser({
      userId,
      username,
      snapshot: parsedSnapshot,
    });

    if (!courseRef) {
      continue;
    }

    const nextSnapshot = learnSessionSnapshotSchema.parse({
      ...parsedSnapshot,
      courseId: courseRef.courseId,
      course: courseRef,
    });

    await requireDb()
      .update(learnSession)
      .set({
        courseId: courseRef.courseId,
        snapshot: nextSnapshot,
      })
      .where(and(eq(learnSession.id, record.id), eq(learnSession.userId, userId)));
  }
}

export async function syncCourseForUser(options: {
  userId: string;
  username: string | null;
  snapshot: LearnSessionSnapshot;
}) {
  const { userId, username, snapshot } = options;
  const normalizedSnapshot = deriveCourseSnapshot(snapshot);

  if (!normalizedSnapshot || !username) {
    return snapshot.course ?? null;
  }

  const courseTitle = deriveCourseTitle(normalizedSnapshot);
  const artifactCount = countSnapshotArtifacts(normalizedSnapshot);
  const currentCourseRef = snapshot.course ?? null;

  if (currentCourseRef?.courseId && currentCourseRef.ownerUsername !== username) {
    const sourceCourse = await readCourseLineageById(currentCourseRef.courseId);
    if (sourceCourse && snapshotsMatch(sourceCourse.snapshot, normalizedSnapshot)) {
      return toCourseRef({
        courseId: sourceCourse.id,
        ownerUsername: sourceCourse.ownerUsername ?? currentCourseRef.ownerUsername,
        courseSlug: sourceCourse.slug,
        title: sourceCourse.title,
      });
    }
  }

  let courseRecord =
    currentCourseRef?.courseId && currentCourseRef.ownerUsername === username
      ? await readCourseLineageById(currentCourseRef.courseId)
      : null;

  if (!courseRecord) {
    const preferredSlug = currentCourseRef?.courseSlug || courseTitle;
    courseRecord = await createCourseLineage({
      ownerId: userId,
      ownerUsername: username,
      preferredSlug,
      title: courseTitle,
      artifactCount,
      snapshot: normalizedSnapshot,
    });
  } else if (!snapshotsMatch(courseRecord.snapshot, normalizedSnapshot) || courseRecord.title !== courseTitle) {
    const now = new Date();

    await requireDb()
      .update(course)
      .set({
        title: courseTitle,
        artifactCount,
        snapshot: normalizedSnapshot,
        updatedAt: now,
      })
      .where(eq(course.id, courseRecord.id));

    courseRecord = {
      ...courseRecord,
      title: courseTitle,
      artifactCount,
      snapshot: normalizedSnapshot,
      updatedAt: now,
    };
  }

  return toCourseRef({
    courseId: courseRecord.id,
    ownerUsername: courseRecord.ownerUsername ?? username,
    courseSlug: courseRecord.slug,
    title: courseRecord.title,
  });
}

export async function listCoursesForUser(userId: string) {
  await backfillLegacyCoursesForUser(userId);

  const courseRecords = await requireDb().select().from(course).where(eq(course.ownerId, userId)).orderBy(desc(course.updatedAt));
  const summaries: CourseSummary[] = [];

  for (const record of courseRecords) {
    const [ownerRecord] = await requireDb()
      .select({ username: user.username })
      .from(user)
      .where(eq(user.id, record.ownerId))
      .limit(1);

    if (!ownerRecord?.username) {
      continue;
    }

    summaries.push(
      courseSummarySchema.parse({
        courseId: record.id,
        ownerUsername: ownerRecord.username,
        courseSlug: record.slug,
        title: record.title,
        visibility: courseVisibilitySchema.parse(record.visibility),
        artifactCount: record.artifactCount,
        updatedAt: record.updatedAt.toISOString(),
      }),
    );
  }

  return summaries;
}

export async function readCourseForViewer(options: {
  viewerUserId: string | null;
  ownerUsername: string;
  courseSlug: string;
}) {
  const courseRecord = await readCourseLineageByOwnerAndSlug(options.ownerUsername, options.courseSlug);

  if (!courseRecord) {
    return null;
  }

  const isOwner = courseRecord.ownerId === options.viewerUserId;
  const visibility = courseVisibilitySchema.parse(courseRecord.visibility);

  if (!isOwner && visibility !== "public") {
    return null;
  }

  return persistedCourseSchema.parse({
    courseId: courseRecord.id,
    ownerUsername: courseRecord.ownerUsername ?? options.ownerUsername,
    courseSlug: courseRecord.slug,
    title: courseRecord.title,
    visibility,
    artifactCount: courseRecord.artifactCount,
    snapshot: courseRecord.snapshot,
    isOwner,
    updatedAt: courseRecord.updatedAt.toISOString(),
  });
}

export function buildCourseRefFromCourse(courseRecord: PersistedCourse): CourseRef {
  return toCourseRef({
    courseId: courseRecord.courseId,
    ownerUsername: courseRecord.ownerUsername,
    courseSlug: courseRecord.courseSlug,
    title: courseRecord.title,
  });
}
