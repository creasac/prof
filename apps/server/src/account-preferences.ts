import { accountPreferencesSchema, type AccountPreferences, type ThemePreference } from "@prof/contracts";
import { eq } from "drizzle-orm";

import { requireDb } from "./db/client.js";
import { user } from "./db/schema.js";

export async function readAccountPreferences(userId: string): Promise<AccountPreferences | null> {
  const [record] = await requireDb()
    .select({
      themePreference: user.themePreference,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!record) {
    return null;
  }

  return accountPreferencesSchema.parse(record);
}

export async function updateAccountThemePreference(
  userId: string,
  themePreference: ThemePreference,
): Promise<AccountPreferences | null> {
  const [record] = await requireDb()
    .update(user)
    .set({
      themePreference,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))
    .returning({
      themePreference: user.themePreference,
    });

  if (!record) {
    return null;
  }

  return accountPreferencesSchema.parse(record);
}
