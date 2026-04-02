import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CourseSnapshot, LearnSessionSnapshot } from "@prof/contracts";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    displayUsername: text("display_username"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    nameNotBlank: check("user_name_not_blank", sql`char_length(btrim(${table.name})) > 0`),
    emailNotBlank: check("user_email_not_blank", sql`char_length(btrim(${table.email})) > 0`),
    usernameNotBlank: check("user_username_not_blank", sql`char_length(btrim(${table.username})) > 0`),
    emailUnique: uniqueIndex("user_email_unique").on(table.email),
    usernameUnique: uniqueIndex("user_username_unique").on(table.username),
  }),
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenUnique: uniqueIndex("session_token_unique").on(table.token),
    userIndex: index("session_user_id_idx").on(table.userId),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId),
    userIndex: index("account_user_id_idx").on(table.userId),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    identifierIndex: index("verification_identifier_idx").on(table.identifier),
  }),
);

export const learnSession = pgTable(
  "learn_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id"),
    goal: text("goal").notNull().default(""),
    snapshot: jsonb("snapshot").$type<LearnSessionSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    userIndex: index("learn_session_user_id_idx").on(table.userId),
    courseIndex: index("learn_session_course_id_idx").on(table.courseId),
    updatedAtIndex: index("learn_session_updated_at_idx").on(table.updatedAt),
  }),
);

export const course = pgTable(
  "course",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    visibility: text("visibility").notNull().default("private"),
    artifactCount: integer("artifact_count").notNull().default(0),
    snapshot: jsonb("snapshot").$type<CourseSnapshot>().notNull(),
    coverImageKey: text("cover_image_key"),
    coverImageMimeType: text("cover_image_mime_type"),
    coverImagePrompt: text("cover_image_prompt"),
    coverImageAltText: text("cover_image_alt_text"),
    coverImageUpdatedAt: timestamp("cover_image_updated_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIndex: index("course_owner_id_idx").on(table.ownerId),
    ownerSlugUnique: uniqueIndex("course_owner_slug_unique").on(table.ownerId, table.slug),
    updatedAtIndex: index("course_updated_at_idx").on(table.updatedAt),
  }),
);

export const usageAccessGrant = pgTable(
  "usage_access_grant",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    campaignKey: text("campaign_key").notNull(),
    scope: text("scope").notNull().default("all"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    campaignNotBlank: check("usage_access_grant_campaign_not_blank", sql`char_length(btrim(${table.campaignKey})) > 0`),
    scopeValid: check("usage_access_grant_scope_valid", sql`${table.scope} in ('all', 'live', 'text')`),
    windowValid: check("usage_access_grant_window_valid", sql`${table.expiresAt} > ${table.startsAt}`),
    userCampaignUnique: uniqueIndex("usage_access_grant_user_campaign_unique").on(table.userId, table.campaignKey),
    userExpiresAtIndex: index("usage_access_grant_user_expires_at_idx").on(table.userId, table.expiresAt),
    userRevokedAtIndex: index("usage_access_grant_user_revoked_at_idx").on(table.userId, table.revokedAt),
  }),
);

export const usageEvent = pgTable(
  "usage_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    guestId: text("guest_id"),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    actorPresent: check("usage_event_actor_present", sql`num_nonnulls(${table.userId}, ${table.guestId}) = 1`),
    kindValid: check("usage_event_kind_valid", sql`${table.kind} in ('live', 'text')`),
    userKindCreatedAtIndex: index("usage_event_user_kind_created_at_idx").on(table.userId, table.kind, table.createdAt),
    guestKindCreatedAtIndex: index("usage_event_guest_kind_created_at_idx").on(table.guestId, table.kind, table.createdAt),
    createdAtIndex: index("usage_event_created_at_idx").on(table.createdAt),
  }),
);

export const schema = {
  user,
  session,
  account,
  verification,
  learnSession,
  course,
  usageAccessGrant,
  usageEvent,
};

export const emptyJsonArray = sql`'[]'::jsonb`;
