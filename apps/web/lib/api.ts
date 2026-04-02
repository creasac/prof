import { PROF_GUEST_USAGE_HEADER } from "@prof/contracts";

import { getGuestUsageId } from "./guest-usage";

const DEFAULT_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:8080");
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const NORMALIZED_API_BASE_URL = DEFAULT_API_BASE_URL.replace(/\/$/, "");

export const AUTH_API_BASE_URL = NORMALIZED_API_BASE_URL ? `${NORMALIZED_API_BASE_URL}/api/auth` : "/api/auth";
export const USAGE_LIMIT_ERROR_CODE = "usage_limit_reached";

type ApiErrorPayload = {
  error?: string;
  code?: string;
};

export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return NORMALIZED_API_BASE_URL;
  }

  try {
    const configuredUrl = new URL(DEFAULT_API_BASE_URL);
    const currentHostname = window.location.hostname;

    if (!LOOPBACK_HOSTS.has(configuredUrl.hostname) || LOOPBACK_HOSTS.has(currentHostname)) {
      return configuredUrl.toString().replace(/\/$/, "");
    }

    configuredUrl.hostname = currentHostname;
    return configuredUrl.toString().replace(/\/$/, "");
  } catch {
    return NORMALIZED_API_BASE_URL;
  }
}

export function buildApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

export async function fetchApi(path: string, init?: RequestInit) {
  const url = buildApiUrl(path);
  const headers = new Headers(init?.headers);
  const guestUsageId = getGuestUsageId();

  if (guestUsageId) {
    headers.set(PROF_GUEST_USAGE_HEADER, guestUsageId);
  }

  try {
    return await fetch(url, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Failed to reach the API at ${url}.`);
    }

    throw error;
  }
}

export async function parseApiError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as ApiErrorPayload;

  return {
    status: response.status,
    code: typeof body.code === "string" ? body.code : undefined,
    message: typeof body.error === "string" && body.error.trim() ? body.error : fallback,
  };
}
