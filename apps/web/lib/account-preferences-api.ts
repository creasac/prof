"use client";

import { accountPreferencesSchema, type AccountPreferences, type ThemePreference } from "@prof/contracts";

import { fetchApi, parseApiError } from "./api";

export async function loadAccountPreferences(): Promise<AccountPreferences> {
  const response = await fetchApi("/api/account/preferences");

  if (!response.ok) {
    const error = await parseApiError(response, "Failed to load account preferences.");
    throw new Error(error.message);
  }

  return accountPreferencesSchema.parse(await response.json());
}

export async function saveAccountThemePreference(themePreference: ThemePreference): Promise<AccountPreferences> {
  const response = await fetchApi("/api/account/preferences", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      themePreference,
    }),
  });

  if (!response.ok) {
    const error = await parseApiError(response, "Failed to save account preferences.");
    throw new Error(error.message);
  }

  return accountPreferencesSchema.parse(await response.json());
}
