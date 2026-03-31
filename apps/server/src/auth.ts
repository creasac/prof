import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

import { env } from "./env.js";
import { db, isDatabaseEnabled } from "./db/client.js";
import { schema } from "./db/schema.js";

const trustedOrigins = env.WEB_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const googleProvider =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;

export const isAuthEnabled = Boolean(isDatabaseEnabled && env.AUTH_SECRET);

export const auth = isAuthEnabled
  ? betterAuth({
      secret: env.AUTH_SECRET,
      baseURL: env.AUTH_BASE_URL ?? `http://localhost:${env.PORT}`,
      basePath: "/api/auth",
      trustedOrigins,
      database: drizzleAdapter(db!, {
        provider: "pg",
        schema,
      }),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        autoSignIn: true,
      },
      socialProviders: googleProvider,
      advanced: {
        useSecureCookies: env.NODE_ENV === "production",
      },
    })
  : null;

export const authHandler = auth ? toNodeHandler(auth) : null;

export async function getAuthSession(headers: Headers | import("node:http").IncomingHttpHeaders) {
  if (!auth) {
    return null;
  }

  return auth.api.getSession({
    headers: headers instanceof Headers ? headers : fromNodeHeaders(headers),
  });
}
