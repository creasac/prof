import { createPublicId } from "@prof/contracts";

export type TutorLaunchAction = "generate" | "live" | null;

export type LearnRouteState = {
  courseOwnerUsername: string | null;
  courseSlug: string | null;
  goal: string;
  autoStartAction: TutorLaunchAction;
};

export type LearnHrefState = LearnRouteState & {
  sessionId?: string | null;
};

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type SearchParamsLike = SearchParamsRecord | { get: (name: string) => string | null };

function hasGetter(searchParams: SearchParamsLike): searchParams is { get: (name: string) => string | null } {
  return typeof (searchParams as { get?: unknown }).get === "function";
}

function readParam(searchParams: SearchParamsLike, name: string) {
  if (hasGetter(searchParams)) {
    return searchParams.get(name);
  }

  const value = searchParams[name];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function parseLearnRouteState(searchParams: SearchParamsLike): LearnRouteState {
  const rawAutoStartAction = readParam(searchParams, "autostart");
  const rawCourseOwnerUsername = readParam(searchParams, "owner");
  const rawCourseSlug = readParam(searchParams, "course");

  return {
    courseOwnerUsername: rawCourseOwnerUsername?.trim() ? rawCourseOwnerUsername.trim().toLowerCase() : null,
    courseSlug: rawCourseSlug?.trim() ? rawCourseSlug.trim().toLowerCase() : null,
    goal: readParam(searchParams, "goal") ?? "",
    autoStartAction:
      rawAutoStartAction === "generate" || rawAutoStartAction === "live" ? rawAutoStartAction : null,
  };
}

export function createLearnSessionId() {
  return createPublicId(10);
}

export function buildLearnHref(state: LearnHrefState) {
  const params = new URLSearchParams();

  if (state.courseOwnerUsername && state.courseSlug) {
    params.set("owner", state.courseOwnerUsername);
    params.set("course", state.courseSlug);
  }

  if (state.goal) {
    params.set("goal", state.goal);
  }

  if (state.autoStartAction) {
    params.set("autostart", state.autoStartAction);
  }

  const query = params.toString();
  const pathname = state.sessionId ? `/learn/${encodeURIComponent(state.sessionId)}` : "/learn";
  return query ? `${pathname}?${query}` : pathname;
}

export function buildLearnQuizHref(sessionId: string) {
  return `/learn/${encodeURIComponent(sessionId)}/quiz`;
}
