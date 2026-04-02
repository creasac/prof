import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const envModuleDir = dirname(fileURLToPath(import.meta.url));
loadEnv({
  path: resolve(envModuleDir, "../../../.env"),
});

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().optional(),
  DB_PASS: z.string().optional(),
  DB_NAME: z.string().optional(),
  INSTANCE_CONNECTION_NAME: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  AUTH_BASE_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  VOICE_PROVIDER: z.enum(["none", "elevenlabs"]).default("none"),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  SEARCH_PROVIDER: z.enum(["none", "google-genai"]).default("none"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  SOURCE_MATERIAL_MAX_COUNT: z.coerce.number().int().min(1).max(50).default(12),
  SOURCE_MATERIAL_MAX_PROMPT_CHARS: z.coerce.number().int().min(1000).max(100000).default(20000),
  SOURCE_MATERIAL_MAX_EXCERPT_CHARS: z.coerce.number().int().min(1000).max(50000).default(12000),
  PDF_UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(15 * 1024 * 1024),
  URL2MD_API_BASE_URL: z.string().optional(),
  URL_IMPORT_MAX_URLS: z.coerce.number().int().min(0).max(5).default(2),
  URL_IMPORT_MAX_CHARS_PER_URL: z.coerce.number().int().min(500).max(50000).default(8000),
  URL_IMPORT_MAX_TOTAL_CHARS: z.coerce.number().int().min(1000).max(100000).default(16000),
  URL_IMPORT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  REASONING_PROVIDER: z.enum(["google-genai"]).default("google-genai"),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_GENAI_USE_VERTEXAI: z.enum(["true", "false"]).default("false"),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default("global"),
  REASONING_MODEL: z.string().default("gemini-2.5-flash"),
  COURSE_COVER_PROMPT_MODEL: z.string().default("gemini-2.5-flash"),
  COURSE_COVER_IMAGE_MODEL: z.string().default("gemini-2.5-flash-image"),
});

const parsed = rawEnvSchema.parse(process.env);

export const env = {
  ...parsed,
  DATABASE_URL: parsed.DATABASE_URL?.trim() || undefined,
  DB_HOST: parsed.DB_HOST?.trim() || undefined,
  DB_USER: parsed.DB_USER?.trim() || undefined,
  DB_PASS: parsed.DB_PASS?.trim() || undefined,
  DB_NAME: parsed.DB_NAME?.trim() || undefined,
  INSTANCE_CONNECTION_NAME: parsed.INSTANCE_CONNECTION_NAME?.trim() || undefined,
  R2_ACCOUNT_ID: parsed.R2_ACCOUNT_ID?.trim() || undefined,
  R2_ACCESS_KEY_ID: parsed.R2_ACCESS_KEY_ID?.trim() || undefined,
  R2_SECRET_ACCESS_KEY: parsed.R2_SECRET_ACCESS_KEY?.trim() || undefined,
  R2_BUCKET: parsed.R2_BUCKET?.trim() || undefined,
  URL2MD_API_BASE_URL: parsed.URL2MD_API_BASE_URL?.trim() || undefined,
  GOOGLE_GENAI_USE_VERTEXAI: parsed.GOOGLE_GENAI_USE_VERTEXAI === "true",
};
