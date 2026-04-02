import { createHash } from "node:crypto";
import {
  accountUnlimitedAccessStatusSchema,
  createPublicId,
  redeemUnlimitedAccessCodeResponseSchema,
  type AccountUnlimitedAccessStatus,
} from "@prof/contracts";
import { and, desc, eq } from "drizzle-orm";

import { requireDb } from "./db/client.js";
import { usageAccessGrant } from "./db/schema.js";

type UsageKind = "live" | "text";
type UsageAccessScope = "all" | UsageKind;

const APRIL_2026_UNLIMITED_ACCESS_CAMPAIGN_KEY = "april_2026_unlimited_access";
const APRIL_2026_UNLIMITED_ACCESS_CODE_HASH = "696a1042cac0419ca9af935a77e8b59bf061679a766d58e45ca5dfb8dea9b533";
const APRIL_2026_UNLIMITED_ACCESS_START_AT = new Date(Date.UTC(2026, 3, 1, 0, 0, 0, 0));
const APRIL_2026_UNLIMITED_ACCESS_END_AT = new Date(Date.UTC(2026, 4, 1, 0, 0, 0, 0));

function normalizeUnlimitedAccessCode(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashUnlimitedAccessCode(value: string) {
  return createHash("sha256").update(normalizeUnlimitedAccessCode(value)).digest("hex");
}

function isCampaignActive(now: Date) {
  const nowMs = now.getTime();
  return nowMs >= APRIL_2026_UNLIMITED_ACCESS_START_AT.getTime() && nowMs < APRIL_2026_UNLIMITED_ACCESS_END_AT.getTime();
}

function hasGrantExpired(grant: typeof usageAccessGrant.$inferSelect, now: Date) {
  return grant.expiresAt.getTime() <= now.getTime();
}

function hasGrantStarted(grant: typeof usageAccessGrant.$inferSelect, now: Date) {
  return grant.startsAt.getTime() <= now.getTime();
}

function isGrantRevoked(grant: typeof usageAccessGrant.$inferSelect) {
  return Boolean(grant.revokedAt);
}

function hasScopeAccess(scope: UsageAccessScope, kind?: UsageKind) {
  if (!kind) {
    return true;
  }

  return scope === "all" || scope === kind;
}

function isGrantActive(grant: typeof usageAccessGrant.$inferSelect | null, now: Date, kind?: UsageKind) {
  if (!grant) {
    return false;
  }

  if (isGrantRevoked(grant) || !hasGrantStarted(grant, now) || hasGrantExpired(grant, now)) {
    return false;
  }

  return hasScopeAccess(grant.scope as UsageAccessScope, kind);
}

async function readCampaignGrantForUser(userId: string) {
  const [grant] = await requireDb()
    .select()
    .from(usageAccessGrant)
    .where(and(eq(usageAccessGrant.userId, userId), eq(usageAccessGrant.campaignKey, APRIL_2026_UNLIMITED_ACCESS_CAMPAIGN_KEY)))
    .orderBy(desc(usageAccessGrant.redeemedAt), desc(usageAccessGrant.createdAt))
    .limit(1);

  return grant ?? null;
}

function toUnlimitedAccessStatus(
  grant: typeof usageAccessGrant.$inferSelect | null,
  now: Date,
): AccountUnlimitedAccessStatus {
  const hasUnlimitedAccess = isGrantActive(grant, now);

  return accountUnlimitedAccessStatusSchema.parse({
    hasUnlimitedAccess,
    canRedeem: isCampaignActive(now) && !grant,
    campaignIsActive: isCampaignActive(now),
    campaignStartsAt: APRIL_2026_UNLIMITED_ACCESS_START_AT.toISOString(),
    campaignEndsAt: APRIL_2026_UNLIMITED_ACCESS_END_AT.toISOString(),
    accessStartsAt: grant?.startsAt.toISOString() ?? null,
    accessExpiresAt: grant?.expiresAt.toISOString() ?? null,
    redeemedAt: grant?.redeemedAt.toISOString() ?? null,
  });
}

export class RedeemUnlimitedAccessCodeError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RedeemUnlimitedAccessCodeError";
    this.status = status;
  }
}

export async function getAccountUnlimitedAccessStatus(userId: string, now = new Date()) {
  const grant = await readCampaignGrantForUser(userId);
  return toUnlimitedAccessStatus(grant, now);
}

export async function hasActiveUnlimitedAccess(userId: string, kind?: UsageKind, now = new Date()) {
  const grant = await readCampaignGrantForUser(userId);
  return isGrantActive(grant, now, kind);
}

export async function redeemUnlimitedAccessCode(userId: string, code: string, now = new Date()) {
  const normalizedCode = normalizeUnlimitedAccessCode(code);

  if (!normalizedCode) {
    throw new RedeemUnlimitedAccessCodeError("Enter the access code.");
  }

  if (!isCampaignActive(now)) {
    throw new RedeemUnlimitedAccessCodeError("This April 2026 access code is no longer active.", 403);
  }

  if (hashUnlimitedAccessCode(normalizedCode) !== APRIL_2026_UNLIMITED_ACCESS_CODE_HASH) {
    throw new RedeemUnlimitedAccessCodeError("That code is not valid.");
  }

  const result = await requireDb().transaction(async (tx) => {
    const [existingGrant] = await tx
      .select()
      .from(usageAccessGrant)
      .where(
        and(
          eq(usageAccessGrant.userId, userId),
          eq(usageAccessGrant.campaignKey, APRIL_2026_UNLIMITED_ACCESS_CAMPAIGN_KEY),
        ),
      )
      .limit(1);

    if (existingGrant) {
      if (isGrantRevoked(existingGrant)) {
        throw new RedeemUnlimitedAccessCodeError("Unlimited access is not available for this account.", 403);
      }

      return {
        created: false,
        grant: existingGrant,
      };
    }

    const [insertedGrant] = await tx
      .insert(usageAccessGrant)
      .values({
        id: createPublicId(12),
        userId,
        campaignKey: APRIL_2026_UNLIMITED_ACCESS_CAMPAIGN_KEY,
        scope: "all",
        redeemedAt: now,
        startsAt: now,
        expiresAt: APRIL_2026_UNLIMITED_ACCESS_END_AT,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (insertedGrant) {
      return {
        created: true,
        grant: insertedGrant,
      };
    }

    const [racedGrant] = await tx
      .select()
      .from(usageAccessGrant)
      .where(
        and(
          eq(usageAccessGrant.userId, userId),
          eq(usageAccessGrant.campaignKey, APRIL_2026_UNLIMITED_ACCESS_CAMPAIGN_KEY),
        ),
      )
      .limit(1);

    if (!racedGrant) {
      throw new Error("Failed to redeem the access code.");
    }

    return {
      created: false,
      grant: racedGrant,
    };
  });

  const status = toUnlimitedAccessStatus(result.grant, now);

  return redeemUnlimitedAccessCodeResponseSchema.parse({
    status,
    message: result.created
      ? "Unlimited access is active until May 1, 2026."
      : "Unlimited access is already active on your account.",
  });
}
