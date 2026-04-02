import {
  PROF_GUEST_USAGE_HEADER,
  PROF_USAGE_CHANNEL_HEADER,
  createPublicId,
  normalizeGuestUsageId,
} from "@prof/contracts";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Request, Response } from "express";

import { getAuthSession } from "./auth.js";
import { db, isDatabaseEnabled } from "./db/client.js";
import { usageEvent } from "./db/schema.js";
import { hasActiveUnlimitedAccess } from "./usage-access.js";

type UsageKind = "live" | "text";
type UsageActorScope = "guest" | "user";
type UsageChannel = "live" | "text" | null;

type UsageActor = {
  scope: UsageActorScope;
  key: string;
  guestId: string | null;
  userId: string | null;
};

const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const USAGE_LIMIT_ERROR_CODE = "usage_limit_reached";
const USAGE_LIMITS = {
  guest: {
    live: 10,
    text: 20,
  },
  user: {
    live: 20,
    text: 40,
  },
} as const;

const inMemoryUsageEvents: Array<{
  actorKey: string;
  createdAt: number;
  kind: UsageKind;
}> = [];

function getUsageLimit(scope: UsageActorScope, kind: UsageKind) {
  return USAGE_LIMITS[scope][kind];
}

function getUsageLimitMessage(actor: UsageActor, kind: UsageKind) {
  const label = kind === "live" ? "live" : "text";
  const nextStep =
    actor.scope === "user"
      ? "Try again tomorrow, or let the author know you would pay for this."
      : "Try again tomorrow, or log in to get 2x more usage.";

  return `Sorry, the ${label} limit has been reached for the day. ${nextStep}`;
}

function normalizeUsageChannel(value: string | null | undefined): UsageChannel {
  return value === "live" || value === "text" ? value : null;
}

function resolveGuestActorKey(req: Request) {
  const headerGuestId = normalizeGuestUsageId(req.get(PROF_GUEST_USAGE_HEADER));
  if (headerGuestId) {
    return headerGuestId;
  }

  const rawIp = req.ip || req.socket.remoteAddress || "unknown";
  const safeIp = rawIp.replace(/[^A-Za-z0-9:._-]/g, "_").slice(0, 120) || "unknown";
  return `ip_${safeIp}`;
}

async function resolveUsageActor(req: Request): Promise<UsageActor> {
  const authSession = await getAuthSession(req.headers);
  const userId = authSession?.user?.id ?? null;

  if (userId) {
    return {
      scope: "user",
      key: userId,
      guestId: null,
      userId,
    };
  }

  const guestId = resolveGuestActorKey(req);
  return {
    scope: "guest",
    key: guestId,
    guestId,
    userId: null,
  };
}

function pruneInMemoryUsageEvents(now: number) {
  const cutoff = now - USAGE_WINDOW_MS;

  for (let index = inMemoryUsageEvents.length - 1; index >= 0; index -= 1) {
    if (inMemoryUsageEvents[index].createdAt < cutoff) {
      inMemoryUsageEvents.splice(index, 1);
    }
  }
}

function consumeInMemoryUsage(actor: UsageActor, kind: UsageKind) {
  const now = Date.now();
  const limit = getUsageLimit(actor.scope, kind);
  pruneInMemoryUsageEvents(now);

  const count = inMemoryUsageEvents.reduce((total, entry) => {
    if (entry.actorKey !== actor.key || entry.kind !== kind) {
      return total;
    }

    return total + 1;
  }, 0);

  if (count >= limit) {
    return false;
  }

  inMemoryUsageEvents.push({
    actorKey: actor.key,
    createdAt: now,
    kind,
  });
  return true;
}

async function consumeStoredUsage(actor: UsageActor, kind: UsageKind) {
  const windowStart = new Date(Date.now() - USAGE_WINDOW_MS);
  const limit = getUsageLimit(actor.scope, kind);
  const lockKey = `${actor.key}:${kind}`;

  return db!.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const whereClause =
      actor.scope === "user"
        ? and(eq(usageEvent.userId, actor.userId!), eq(usageEvent.kind, kind), gte(usageEvent.createdAt, windowStart))
        : and(eq(usageEvent.guestId, actor.guestId!), eq(usageEvent.kind, kind), gte(usageEvent.createdAt, windowStart));

    const result = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(usageEvent)
      .where(whereClause);

    const count = Number(result[0]?.count ?? 0);
    if (count >= limit) {
      return false;
    }

    await tx.insert(usageEvent).values({
      id: createPublicId(12),
      kind,
      userId: actor.userId,
      guestId: actor.guestId,
    });

    return true;
  });
}

export function getRequestUsageChannel(req: Request) {
  return normalizeUsageChannel(req.get(PROF_USAGE_CHANNEL_HEADER));
}

export async function enforceUsageLimit(req: Request, res: Response, kind: UsageKind) {
  const actor = await resolveUsageActor(req);

  if (actor.scope === "user" && actor.userId && isDatabaseEnabled && (await hasActiveUnlimitedAccess(actor.userId, kind))) {
    return true;
  }

  const allowed = isDatabaseEnabled ? await consumeStoredUsage(actor, kind) : consumeInMemoryUsage(actor, kind);

  if (allowed) {
    return true;
  }

  res.status(429).json({
    code: USAGE_LIMIT_ERROR_CODE,
    error: getUsageLimitMessage(actor, kind),
  });
  return false;
}
