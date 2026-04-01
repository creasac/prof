import { authClient } from "./auth-client";

type AuthSession = ReturnType<typeof authClient.useSession>["data"];

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 24;

export function getSessionUsername(session: AuthSession) {
  if (!session?.user || !("username" in session.user)) {
    return "";
  }

  return typeof session.user.username === "string" ? session.user.username : "";
}

export function getSessionUserName(session: AuthSession) {
  if (!session?.user?.name || typeof session.user.name !== "string") {
    return "";
  }

  return normalizeNameInput(session.user.name);
}

export function getSessionUserImage(session: AuthSession) {
  if (!session?.user?.image) {
    return "";
  }

  return typeof session.user.image === "string" ? session.user.image : "";
}

export function getAvatarLabel(value: string) {
  return value.trim().charAt(0).toUpperCase() || "?";
}

export function normalizeNameInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeUsernameInput(value: string) {
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

export function createUsernameBase(name: string) {
  const normalized = normalizeUsernameInput(name);
  if (!normalized) {
    return "user";
  }

  if (normalized.length >= MIN_USERNAME_LENGTH) {
    return normalized;
  }

  return `${normalized}${"user".slice(0, MIN_USERNAME_LENGTH - normalized.length)}`;
}

export function sanitizeNextPath(nextPath: string | null | undefined) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return null;
  }

  if (nextPath.startsWith("//")) {
    return null;
  }

  if (nextPath.startsWith("/login") || nextPath.startsWith("/signup")) {
    return null;
  }

  return nextPath;
}

export function buildAuthHref(path: "/login" | "/signup", nextPath: string | null | undefined) {
  const sanitizedNextPath = sanitizeNextPath(nextPath);

  if (!sanitizedNextPath) {
    return path;
  }

  return `${path}?next=${encodeURIComponent(sanitizedNextPath)}`;
}
