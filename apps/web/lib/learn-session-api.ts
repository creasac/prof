import {
  learnCourseSeedSchema,
  learnSessionSnapshotSchema,
  persistedLearnSessionSchema,
  type LearnCourseSeed,
  type LearnSessionSnapshot,
  type PersistedLearnSession,
} from "@prof/contracts";

import { fetchApi } from "./api";

export async function loadRemoteLearnSession(sessionId: string): Promise<PersistedLearnSession | null> {
  const response = await fetchApi(`/api/learn/sessions/${encodeURIComponent(sessionId)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load the saved learn session.");
  }

  return persistedLearnSessionSchema.parse(await response.json());
}

export async function loadRemoteLearnCourse(courseId: string): Promise<LearnCourseSeed | null> {
  const response = await fetchApi(`/api/learn/courses/${encodeURIComponent(courseId)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load the saved course.");
  }

  return learnCourseSeedSchema.parse(await response.json());
}

export async function saveRemoteLearnSession(sessionId: string, snapshot: LearnSessionSnapshot) {
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

  return persistedLearnSessionSchema.parse(await response.json());
}
