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
  VOICE_PROVIDER: z.enum(["none", "elevenlabs"]).default("none"),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  SEARCH_PROVIDER: z.enum(["none", "firecrawl"]).default("none"),
  FIRECRAWL_API_KEY: z.string().optional(),
  FIRECRAWL_SEARCH_LIMIT: z.coerce.number().int().min(1).max(10).default(5),
  REASONING_PROVIDER: z.enum(["google-genai"]).default("google-genai"),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_GENAI_USE_VERTEXAI: z.enum(["true", "false"]).default("false"),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default("global"),
  REASONING_MODEL: z.string().default("gemini-2.5-flash"),
});

const parsed = rawEnvSchema.parse(process.env);

export const env = {
  ...parsed,
  GOOGLE_GENAI_USE_VERTEXAI: parsed.GOOGLE_GENAI_USE_VERTEXAI === "true",
};
