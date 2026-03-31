"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

import { AUTH_API_BASE_URL } from "./api";

export const authClient = createAuthClient({
  baseURL: AUTH_API_BASE_URL,
  plugins: [usernameClient()],
  fetchOptions: {
    credentials: "include",
  },
});
