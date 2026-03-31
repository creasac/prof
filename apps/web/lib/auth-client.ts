"use client";

import { createAuthClient } from "better-auth/react";

import { AUTH_API_BASE_URL } from "./api";

export const authClient = createAuthClient({
  baseURL: AUTH_API_BASE_URL,
  fetchOptions: {
    credentials: "include",
  },
});
