import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CourseSnapshot, LearnSessionSnapshot } from "@prof/contracts";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    username: text("username"),
    displayUsername: text("display_username"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
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
    latestVersionNumber: integer("latest_version_number").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIndex: index("course_owner_id_idx").on(table.ownerId),
    ownerSlugUnique: uniqueIndex("course_owner_slug_unique").on(table.ownerId, table.slug),
    updatedAtIndex: index("course_updated_at_idx").on(table.updatedAt),
  }),
);

export const courseVersion = pgTable(
  "course_version",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    parentVersionId: text("parent_version_id"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    artifactCount: integer("artifact_count").notNull().default(0),
    snapshot: jsonb("snapshot").$type<CourseSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    courseIndex: index("course_version_course_id_idx").on(table.courseId),
    courseVersionUnique: uniqueIndex("course_version_course_version_unique").on(table.courseId, table.versionNumber),
    parentIndex: index("course_version_parent_version_id_idx").on(table.parentVersionId),
    createdAtIndex: index("course_version_created_at_idx").on(table.createdAt),
  }),
);

export const schema = {
  user,
  session,
  account,
  verification,
  learnSession,
  course,
  courseVersion,
};

export const emptyJsonArray = sql`'[]'::jsonb`;
