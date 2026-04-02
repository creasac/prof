import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { env } from "../env.js";
import { schema } from "./schema.js";

const poolConfig = buildPoolConfig();

export const isDatabaseEnabled = Boolean(poolConfig);

export const pool = poolConfig ? new Pool(poolConfig) : null;

export const db = pool ? drizzle(pool, { schema }) : null;

export function requireDb() {
  if (!db) {
    throw new Error("Database is not configured. Set DATABASE_URL to enable persistence.");
  }

  return db;
}

function buildPoolConfig(): PoolConfig | null {
  const ssl =
    env.DATABASE_SSL === "true"
      ? {
          rejectUnauthorized: false,
        }
      : undefined;

  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
      ssl,
    };
  }

  if (env.INSTANCE_CONNECTION_NAME && env.DB_USER && env.DB_PASS && env.DB_NAME) {
    return {
      host: `/cloudsql/${env.INSTANCE_CONNECTION_NAME}`,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASS,
      database: env.DB_NAME,
    };
  }

  if (env.DB_HOST && env.DB_USER && env.DB_PASS && env.DB_NAME) {
    return {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASS,
      database: env.DB_NAME,
      ssl,
    };
  }

  return null;
}
