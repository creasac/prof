import {
  createLearnSessionSummary,
  learnSessionSnapshotSchema,
  type LearnSessionSnapshot,
  type LearnSessionSummary,
} from "@prof/contracts";

const LEARN_SESSION_STORAGE_PREFIX = "prof.learn.session.v1:";
const LEARN_SESSION_INDEX_STORAGE_KEY = `${LEARN_SESSION_STORAGE_PREFIX}index`;

type LearnSessionStorageIndexRecord = {
  createdAt: string;
  updatedAt: string;
};

type LearnSessionStorageIndex = Record<string, LearnSessionStorageIndexRecord>;

function getLearnSessionStorageKey(sessionId: string) {
  return `${LEARN_SESSION_STORAGE_PREFIX}${sessionId}`;
}

function readLearnSessionIndex() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(LEARN_SESSION_INDEX_STORAGE_KEY);
    if (!raw) {
      return {} as LearnSessionStorageIndex;
    }

    const parsed = JSON.parse(raw) as LearnSessionStorageIndex;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLearnSessionIndex(index: LearnSessionStorageIndex) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(LEARN_SESSION_INDEX_STORAGE_KEY, JSON.stringify(index));
  } catch {
    // Ignore storage failures and keep the live in-memory state working.
  }
}

function listStoredLearnSessionIds() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  const ids = new Set(Object.keys(readLearnSessionIndex()));

  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key || key === LEARN_SESSION_INDEX_STORAGE_KEY || !key.startsWith(LEARN_SESSION_STORAGE_PREFIX)) {
        continue;
      }

      ids.add(key.slice(LEARN_SESSION_STORAGE_PREFIX.length));
    }
  } catch {
    return Array.from(ids);
  }

  return Array.from(ids);
}

function inferSessionTimestamp(snapshot: LearnSessionSnapshot) {
  const candidates = [...(snapshot.chatMessages ?? []), ...(snapshot.liveMessages ?? [])]
    .map((message) => message.createdAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((left, right) => right.timestamp - left.timestamp);

  return candidates[0]?.value ?? new Date(0).toISOString();
}

export function readLearnSessionSnapshot(sessionId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const snapshot = window.sessionStorage.getItem(getLearnSessionStorageKey(sessionId));
    return snapshot ? learnSessionSnapshotSchema.parse(JSON.parse(snapshot)) : null;
  } catch {
    return null;
  }
}

export function writeLearnSessionSnapshot(sessionId: string, snapshot: LearnSessionSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getLearnSessionStorageKey(sessionId), JSON.stringify(snapshot));
    const now = new Date().toISOString();
    const currentIndex = readLearnSessionIndex();
    const previousEntry = currentIndex[sessionId];

    writeLearnSessionIndex({
      ...currentIndex,
      [sessionId]: {
        createdAt: previousEntry?.createdAt ?? now,
        updatedAt: now,
      },
    });
  } catch {
    // Ignore storage failures and keep the live in-memory state working.
  }
}

export function listLocalLearnSessionSummaries() {
  if (typeof window === "undefined") {
    return [] as LearnSessionSummary[];
  }

  const index = readLearnSessionIndex();
  const summaries: LearnSessionSummary[] = [];

  for (const sessionId of listStoredLearnSessionIds()) {
    const snapshot = readLearnSessionSnapshot(sessionId);
    if (!snapshot) {
      continue;
    }

    const timestamps = index[sessionId];
    const updatedAt = timestamps?.updatedAt ?? inferSessionTimestamp(snapshot);
    const createdAt = timestamps?.createdAt ?? updatedAt;

    summaries.push(
      createLearnSessionSummary({
        sessionId,
        snapshot,
        createdAt,
        updatedAt,
      }),
    );
  }

  summaries.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return summaries;
}
