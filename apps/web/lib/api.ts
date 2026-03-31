const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const AUTH_API_BASE_URL = `${DEFAULT_API_BASE_URL.replace(/\/$/, "")}/api/auth`;

export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    return DEFAULT_API_BASE_URL.replace(/\/$/, "");
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
    return DEFAULT_API_BASE_URL.replace(/\/$/, "");
  }
}

export function buildApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

export async function fetchApi(path: string, init?: RequestInit) {
  const url = buildApiUrl(path);

  try {
    return await fetch(url, {
      credentials: "include",
      ...init,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Failed to reach the API at ${url}.`);
    }

    throw error;
  }
}
