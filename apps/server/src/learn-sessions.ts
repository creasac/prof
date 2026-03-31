import { and, eq } from "drizzle-orm";
import { learnSessionSnapshotSchema, persistedLearnSessionSchema, type LearnSessionSnapshot } from "@prof/contracts";

import { requireDb } from "./db/client.js";
import { learnSession } from "./db/schema.js";

function toPersistedLearnSession(record: typeof learnSession.$inferSelect) {
  return persistedLearnSessionSchema.parse({
    sessionId: record.id,
    snapshot: learnSessionSnapshotSchema.parse(record.snapshot),
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

export async function saveLearnSessionForUser(userId: string, sessionId: string, snapshot: LearnSessionSnapshot) {
  const normalizedSnapshot = learnSessionSnapshotSchema.parse(snapshot);
  const now = new Date();

  const [record] = await requireDb()
    .insert(learnSession)
    .values({
      id: sessionId,
      userId,
      goal: normalizedSnapshot.goal,
      snapshot: normalizedSnapshot,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: learnSession.id,
      set: {
        userId,
        goal: normalizedSnapshot.goal,
        snapshot: normalizedSnapshot,
        updatedAt: now,
      },
    })
    .returning();

  return toPersistedLearnSession(record);
}
