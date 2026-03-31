import { and, eq } from "drizzle-orm";
import {
  learnSessionSnapshotSchema,
  persistedLearnSessionSchema,
  type LearnSessionSnapshot,
} from "@prof/contracts";

import { syncCourseForUser } from "./courses.js";
import { requireDb } from "./db/client.js";
import { learnSession } from "./db/schema.js";

function normalizeLearnSessionSnapshot(snapshot: LearnSessionSnapshot) {
  const parsed = learnSessionSnapshotSchema.parse(snapshot);

  return learnSessionSnapshotSchema.parse({
    ...parsed,
    courseId: parsed.course?.courseId ?? null,
  });
}

function toPersistedLearnSession(record: typeof learnSession.$inferSelect) {
  const snapshot = normalizeLearnSessionSnapshot(record.snapshot);

  return persistedLearnSessionSchema.parse({
    sessionId: record.id,
    courseId: snapshot.course?.courseId ?? null,
    snapshot,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function readLearnSessionForUser(userId: string, sessionId: string) {
  const [record] = await requireDb()
    .select()
    .from(learnSession)
    .where(and(eq(learnSession.id, sessionId), eq(learnSession.userId, userId)))
    .limit(1);

  return record ? toPersistedLearnSession(record) : null;
}

export async function saveLearnSessionForUser(
  userId: string,
  username: string | null,
  sessionId: string,
  snapshot: LearnSessionSnapshot,
) {
  const normalizedSnapshot = normalizeLearnSessionSnapshot(snapshot);
  const courseRef = await syncCourseForUser({
    userId,
    username,
    snapshot: normalizedSnapshot,
  });
  const nextSnapshot = learnSessionSnapshotSchema.parse({
    ...normalizedSnapshot,
    courseId: courseRef?.courseId ?? null,
    course: courseRef ?? null,
  });
  const now = new Date();

  const [record] = await requireDb()
    .insert(learnSession)
    .values({
      id: sessionId,
      userId,
      courseId: nextSnapshot.courseId,
      goal: nextSnapshot.goal,
      snapshot: nextSnapshot,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: learnSession.id,
      set: {
        userId,
        courseId: nextSnapshot.courseId,
        goal: nextSnapshot.goal,
        snapshot: nextSnapshot,
        updatedAt: now,
      },
    })
    .returning();

  return toPersistedLearnSession(record);
}
