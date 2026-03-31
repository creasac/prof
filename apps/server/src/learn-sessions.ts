import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  learnCourseSeedSchema,
  learnCourseSummarySchema,
  learnSessionSnapshotSchema,
  persistedLearnSessionSchema,
  type LearnCourseSummary,
  type LearnSessionSnapshot,
  type LearnTopicArtifacts,
} from "@prof/contracts";

import { requireDb } from "./db/client.js";
import { learnSession } from "./db/schema.js";

function normalizeLearnSessionSnapshot(snapshot: LearnSessionSnapshot, fallbackCourseId: string) {
  const parsed = learnSessionSnapshotSchema.parse(snapshot);
  const courseId = parsed.courseId?.trim() || fallbackCourseId;

  return learnSessionSnapshotSchema.parse({
    ...parsed,
    courseId,
  });
}

function getEffectiveCourseId(record: typeof learnSession.$inferSelect) {
  return record.courseId ?? record.id;
}

function toPersistedLearnSession(record: typeof learnSession.$inferSelect) {
  const courseId = getEffectiveCourseId(record);
  const snapshot = normalizeLearnSessionSnapshot(record.snapshot, courseId);

  return persistedLearnSessionSchema.parse({
    sessionId: record.id,
    courseId,
    snapshot,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

function deriveCourseTitle(snapshot: LearnSessionSnapshot) {
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

function countTopicArtifacts(topicArtifacts: Record<string, LearnTopicArtifacts>) {
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

function countSnapshotArtifacts(snapshot: LearnSessionSnapshot) {
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

export async function readLearnSessionForUser(userId: string, sessionId: string) {
  const [record] = await requireDb()
    .select()
    .from(learnSession)
    .where(and(eq(learnSession.id, sessionId), eq(learnSession.userId, userId)))
    .limit(1);

  return record ? toPersistedLearnSession(record) : null;
}

export async function readLearnCourseForUser(userId: string, courseId: string) {
  const [record] = await requireDb()
    .select()
    .from(learnSession)
    .where(
      and(
        eq(learnSession.userId, userId),
        or(eq(learnSession.courseId, courseId), and(isNull(learnSession.courseId), eq(learnSession.id, courseId))),
      ),
    )
    .orderBy(desc(learnSession.updatedAt))
    .limit(1);

  if (!record) {
    return null;
  }

  const persistedSession = toPersistedLearnSession(record);

  return learnCourseSeedSchema.parse({
    courseId: persistedSession.courseId,
    snapshot: persistedSession.snapshot,
    updatedAt: persistedSession.updatedAt,
  });
}

export async function listLearnCoursesForUser(userId: string) {
  const records = await requireDb()
    .select()
    .from(learnSession)
    .where(eq(learnSession.userId, userId))
    .orderBy(desc(learnSession.updatedAt));

  const summaries = new Map<string, LearnCourseSummary>();

  for (const record of records) {
    const courseId = getEffectiveCourseId(record);

    if (summaries.has(courseId)) {
      continue;
    }

    const persistedSession = toPersistedLearnSession(record);
    summaries.set(
      courseId,
      learnCourseSummarySchema.parse({
        courseId,
        title: deriveCourseTitle(persistedSession.snapshot),
        artifactCount: countSnapshotArtifacts(persistedSession.snapshot),
        updatedAt: persistedSession.updatedAt,
      }),
    );
  }

  return [...summaries.values()];
}

export async function saveLearnSessionForUser(userId: string, sessionId: string, snapshot: LearnSessionSnapshot) {
  const normalizedSnapshot = normalizeLearnSessionSnapshot(snapshot, sessionId);
  const now = new Date();

  const [record] = await requireDb()
    .insert(learnSession)
    .values({
      id: sessionId,
      userId,
      courseId: normalizedSnapshot.courseId,
      goal: normalizedSnapshot.goal,
      snapshot: normalizedSnapshot,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: learnSession.id,
      set: {
        userId,
        courseId: normalizedSnapshot.courseId,
        goal: normalizedSnapshot.goal,
        snapshot: normalizedSnapshot,
        updatedAt: now,
      },
    })
    .returning();

  return toPersistedLearnSession(record);
}
