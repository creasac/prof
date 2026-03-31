"use client";

import { privateProfileSchema, type PrivateProfile } from "@prof/contracts";

import { fetchApi } from "./api";

export async function loadProfile(username: string): Promise<PrivateProfile | null> {
  const response = await fetchApi(`/api/profile/${encodeURIComponent(username)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load the profile.");
  }

  return privateProfileSchema.parse(await response.json());
}

export const loadPrivateProfile = loadProfile;
