import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { username } from "better-auth/plugins/username";

import { env } from "./env.js";
import { db, isDatabaseEnabled } from "./db/client.js";
import { schema } from "./db/schema.js";

const trustedOrigins = env.WEB_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 24;
const MIN_PASSWORD_LENGTH = 8;

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

function normalizeNameInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeEmailInput(value: string) {
  return value.trim().toLowerCase();
}

function normalizeUsernameInput(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .replace(/_+/g, "_")
    .replace(/\.+/g, ".");

  if (!normalized) {
    return "";
  }

  return normalized.slice(0, MAX_USERNAME_LENGTH);
}

function assertNonEmptyString(value: string, fieldLabel: string) {
  if (!value) {
    throw new APIError("BAD_REQUEST", {
      message: `${fieldLabel} is required.`,
    });
  }
}

function assertValidUsername(value: string) {
  if (value.length < MIN_USERNAME_LENGTH) {
    throw new APIError("BAD_REQUEST", {
      message: `Username must be at least ${MIN_USERNAME_LENGTH} characters.`,
    });
  }

  if (!/^[a-z0-9._]+$/.test(value)) {
    throw new APIError("BAD_REQUEST", {
      message: "Username can only use lowercase letters, numbers, dots, and underscores.",
    });
  }
}

function assertValidPassword(value: string, fieldLabel: string) {
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new APIError("BAD_REQUEST", {
      message: `${fieldLabel} must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }
}

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
        minPasswordLength: MIN_PASSWORD_LENGTH,
        autoSignIn: true,
      },
      databaseHooks: {
        user: {
          create: {
            before(userRecord) {
              const nextName = normalizeNameInput(userRecord.name);
              const nextEmail = normalizeEmailInput(userRecord.email);
              const nextUsername = normalizeUsernameInput(userRecord.username ?? "");

              assertNonEmptyString(nextName, "Name");
              assertNonEmptyString(nextEmail, "Email");
              assertNonEmptyString(nextUsername, "Username");
              assertValidUsername(nextUsername);

              return {
                data: {
                  ...userRecord,
                  name: nextName,
                  email: nextEmail,
                  username: nextUsername,
                },
              };
            },
          },
          update: {
            before(userRecord) {
              const nextUserRecord = { ...userRecord };

              if (typeof nextUserRecord.name === "string") {
                nextUserRecord.name = normalizeNameInput(nextUserRecord.name);
                assertNonEmptyString(nextUserRecord.name, "Name");
              }

              if (typeof nextUserRecord.email === "string") {
                nextUserRecord.email = normalizeEmailInput(nextUserRecord.email);
                assertNonEmptyString(nextUserRecord.email, "Email");
              }

              if (typeof nextUserRecord.username === "string") {
                nextUserRecord.username = normalizeUsernameInput(nextUserRecord.username);
                assertNonEmptyString(nextUserRecord.username, "Username");
                assertValidUsername(nextUserRecord.username);
              }

              return {
                data: nextUserRecord,
              };
            },
          },
        },
      },
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (ctx.path === "/sign-up/email") {
            assertValidPassword(String(ctx.body.password ?? ""), "Password");
            return;
          }

          if (ctx.path === "/change-password") {
            assertNonEmptyString(String(ctx.body.currentPassword ?? ""), "Current password");
            assertValidPassword(String(ctx.body.newPassword ?? ""), "New password");
          }
        }),
      },
      user: {
        changeEmail: {
          enabled: true,
          updateEmailWithoutVerification: true,
        },
      },
      plugins: [
        username({
          minUsernameLength: MIN_USERNAME_LENGTH,
          maxUsernameLength: MAX_USERNAME_LENGTH,
          usernameNormalization: normalizeUsernameInput,
          usernameValidator(value) {
            return /^[a-z0-9._]+$/.test(value);
          },
          validationOrder: {
            username: "post-normalization",
          },
        }),
      ],
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
