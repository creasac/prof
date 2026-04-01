import {
  createLearnSessionSummary,
  learnSessionSnapshotSchema,
  type LearnSessionSnapshot,
  type LearnSessionSummary,
} from "@prof/contracts";

import { notifyLocalSessionHistoryUpdated } from "./app-shell-events";

const LEARN_SESSION_STORAGE_PREFIX = "prof.learn.session.v1:";
const LEARN_SESSION_INDEX_STORAGE_KEY = `${LEARN_SESSION_STORAGE_PREFIX}index`;

type LearnSessionStorageIndexRecord = {
  createdAt: string;
  updatedAt: string;
};

type LearnSessionStorageIndex = Record<string, LearnSessionStorageIndexRecord>;

type WriteLearnSessionSnapshotOptions = {
  createdAt?: string;
  updatedAt?: string;
  trackInHistory?: boolean;
  notifyHistoryUpdate?: boolean;
};

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

export function readLocalLearnSessionTimestamps(sessionId: string) {
  const timestamps = readLearnSessionIndex()[sessionId];
  return timestamps ? { ...timestamps } : null;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
}

export function serializeLearnSessionSnapshot(snapshot: LearnSessionSnapshot) {
  return stableSerialize(learnSessionSnapshotSchema.parse(snapshot));
}

export function serializeLearnSessionActivity(snapshot: LearnSessionSnapshot) {
  return stableSerialize({
    sourceMaterials: snapshot.sourceMaterials ?? [],
    plan: snapshot.plan,
    planClarification: snapshot.planClarification,
    planSources: snapshot.planSources,
    generatedBlock: snapshot.generatedBlock,
    generatedTopicId: snapshot.generatedTopicId,
    generatedQuiz: snapshot.generatedQuiz,
    generatedQuizTopicId: snapshot.generatedQuizTopicId,
    generatedQuizError: snapshot.generatedQuizError,
    quizProgress: snapshot.quizProgress,
    quizResultsByTopic: snapshot.quizResultsByTopic ?? {},
    topicArtifacts: snapshot.topicArtifacts ?? {},
    blockSources: snapshot.blockSources,
    chatMessages: snapshot.chatMessages ?? [],
    liveMessages: snapshot.liveMessages ?? [],
    liveGoal: snapshot.liveGoal,
  });
}

export function writeLearnSessionSnapshot(
  sessionId: string,
  snapshot: LearnSessionSnapshot,
  options: WriteLearnSessionSnapshotOptions = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getLearnSessionStorageKey(sessionId), JSON.stringify(snapshot));

    if (options.trackInHistory === false) {
      return;
    }

    const now = new Date().toISOString();
    const currentIndex = readLearnSessionIndex();
    const previousEntry = currentIndex[sessionId];

    writeLearnSessionIndex({
      ...currentIndex,
      [sessionId]: {
        createdAt: options.createdAt ?? previousEntry?.createdAt ?? options.updatedAt ?? now,
        updatedAt: options.updatedAt ?? now,
      },
    });

    if (options.notifyHistoryUpdate !== false) {
      notifyLocalSessionHistoryUpdated();
    }
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

  for (const sessionId of Object.keys(index)) {
    const snapshot = readLearnSessionSnapshot(sessionId);
    if (!snapshot) {
      continue;
    }

    const timestamps = index[sessionId];
    summaries.push(
      createLearnSessionSummary({
        sessionId,
        snapshot,
        createdAt: timestamps.createdAt,
        updatedAt: timestamps.updatedAt,
      }),
    );
  }

  summaries.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return summaries;
}
