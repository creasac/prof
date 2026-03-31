import type { LearnSessionSnapshot } from "@prof/contracts";

const LEARN_SESSION_STORAGE_PREFIX = "prof.learn.session.v1:";

function getLearnSessionStorageKey(sessionId: string) {
  return `${LEARN_SESSION_STORAGE_PREFIX}${sessionId}`;
}

export function readLearnSessionSnapshot(sessionId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const snapshot = window.sessionStorage.getItem(getLearnSessionStorageKey(sessionId));
    return snapshot ? (JSON.parse(snapshot) as LearnSessionSnapshot) : null;
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
  } catch {
    // Ignore storage failures and keep the live in-memory state working.
  }
}
