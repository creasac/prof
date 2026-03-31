import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "../env.js";
import { schema } from "./schema.js";

const connectionString = env.DATABASE_URL?.trim();

export const isDatabaseEnabled = Boolean(connectionString);

const ssl =
  env.DATABASE_SSL === "true"
    ? {
        rejectUnauthorized: false,
      }
    : undefined;

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl,
    })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;

export function requireDb() {
  if (!db) {
    throw new Error("Database is not configured. Set DATABASE_URL to enable persistence.");
  }

  return db;
}
