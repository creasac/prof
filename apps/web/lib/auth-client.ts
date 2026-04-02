"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

const DEFAULT_AUTH_ORIGIN =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:8080");

function getAuthBaseUrl() {
  const normalizedOrigin = DEFAULT_AUTH_ORIGIN.replace(/\/$/, "");

  if (normalizedOrigin) {
    return `${normalizedOrigin}/api/auth`;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/auth`;
  }

  return "https://placeholder.invalid/api/auth";
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
  plugins: [usernameClient()],
  fetchOptions: {
    credentials: "include",
  },
});
