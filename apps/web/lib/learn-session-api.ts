import {
  createLearnSessionSummary,
  learnSessionSnapshotSchema,
  learnSessionSummaryListSchema,
  persistedLearnSessionSchema,
  type LearnSessionSnapshot,
  type LearnSessionSummary,
  type PersistedLearnSession,
} from "@prof/contracts";

import { fetchApi } from "./api";

const REMOTE_LEARN_SESSION_SUMMARY_CACHE_PREFIX = "prof.remote.learn.session.summaries.v1:";

const remoteSessionCache = new Map<string, Map<string, PersistedLearnSession | null>>();
const remoteSummaryCache = new Map<string, LearnSessionSummary[]>();

function getCacheKey(cacheKey?: string) {
  return cacheKey?.trim() || "__default__";
}

function getRemoteSessionBucket(cacheKey?: string) {
  const normalizedKey = getCacheKey(cacheKey);
  let bucket = remoteSessionCache.get(normalizedKey);
  if (!bucket) {
    bucket = new Map<string, PersistedLearnSession | null>();
    remoteSessionCache.set(normalizedKey, bucket);
  }
  return bucket;
}

function getRemoteSummaryStorageKey(cacheKey?: string) {
  return `${REMOTE_LEARN_SESSION_SUMMARY_CACHE_PREFIX}${getCacheKey(cacheKey)}`;
}

function readStoredRemoteLearnSessionSummaries(cacheKey?: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getRemoteSummaryStorageKey(cacheKey));
    if (!raw) {
      return null;
    }

    return learnSessionSummaryListSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredRemoteLearnSessionSummaries(cacheKey: string | undefined, summaries: LearnSessionSummary[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getRemoteSummaryStorageKey(cacheKey), JSON.stringify(summaries));
  } catch {
    // Ignore storage failures and keep the in-memory cache working.
  }
}

function cacheRemoteLearnSessionSummary(cacheKey: string | undefined, summary: LearnSessionSummary) {
  const normalizedKey = getCacheKey(cacheKey);
  const current = remoteSummaryCache.get(normalizedKey) ?? readStoredRemoteLearnSessionSummaries(normalizedKey) ?? [];
  const next = [...current.filter((entry) => entry.sessionId !== summary.sessionId), summary].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );

  remoteSummaryCache.set(normalizedKey, next);
  writeStoredRemoteLearnSessionSummaries(normalizedKey, next);
}

function cacheRemoteLearnSession(cacheKey: string | undefined, session: PersistedLearnSession | null, sessionId: string) {
  getRemoteSessionBucket(cacheKey).set(sessionId, session);

  if (!session) {
    return;
  }

  cacheRemoteLearnSessionSummary(
    cacheKey,
    createLearnSessionSummary({
      sessionId: session.sessionId,
      snapshot: session.snapshot,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }),
  );
}

export async function loadRemoteLearnSession(
  sessionId: string,
  options: { cacheKey?: string; force?: boolean } = {},
): Promise<PersistedLearnSession | null> {
  const bucket = getRemoteSessionBucket(options.cacheKey);
  if (!options.force && bucket.has(sessionId)) {
    return bucket.get(sessionId) ?? null;
  }

  const response = await fetchApi(`/api/learn/sessions/${encodeURIComponent(sessionId)}`);

  if (response.status === 404) {
    cacheRemoteLearnSession(options.cacheKey, null, sessionId);
    return null;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load the saved learn session.");
  }

  const session = persistedLearnSessionSchema.parse(await response.json());
  cacheRemoteLearnSession(options.cacheKey, session, sessionId);
  return session;
}

export async function loadRemoteLearnSessionSummaries(
  options: { cacheKey?: string; force?: boolean } = {},
): Promise<LearnSessionSummary[]> {
  const normalizedKey = getCacheKey(options.cacheKey);

  if (!options.force) {
    const cached = remoteSummaryCache.get(normalizedKey) ?? readStoredRemoteLearnSessionSummaries(normalizedKey);
    if (cached) {
      remoteSummaryCache.set(normalizedKey, cached);
      return cached;
    }
  }

  const response = await fetchApi("/api/learn/sessions");

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load saved learn sessions.");
  }

  const summaries = learnSessionSummaryListSchema.parse(await response.json());
  remoteSummaryCache.set(normalizedKey, summaries);
  writeStoredRemoteLearnSessionSummaries(normalizedKey, summaries);
  return summaries;
}

export async function saveRemoteLearnSession(
  sessionId: string,
  snapshot: LearnSessionSnapshot,
  options: { cacheKey?: string } = {},
) {
  const response = await fetchApi(`/api/learn/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(learnSessionSnapshotSchema.parse(snapshot)),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to save the learn session.");
  }

  const session = persistedLearnSessionSchema.parse(await response.json());
  cacheRemoteLearnSession(options.cacheKey, session, sessionId);
  return session;
}
