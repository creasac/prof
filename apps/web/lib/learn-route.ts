import type { TutorBlockType } from "@prof/contracts";

export type TutorLaunchAction = "generate" | "live" | null;

export type LearnRouteState = {
  courseId: string | null;
  goal: string;
  preferredBlockType: TutorBlockType | "";
  useWebSearch: boolean;
  autoStartAction: TutorLaunchAction;
};

export type LearnHrefState = LearnRouteState & {
  sessionId?: string | null;
};

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type SearchParamsLike = SearchParamsRecord | { get: (name: string) => string | null };

const VALID_BLOCK_TYPES = new Set<TutorBlockType>([
  "lesson",
  "quiz",
  "flashcards",
  "essay_prompt",
  "follow_up_question",
]);

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
  const rawPreferredBlockType = readParam(searchParams, "format") ?? "";
  const rawAutoStartAction = readParam(searchParams, "autostart");
  const rawCourseId = readParam(searchParams, "course");

  return {
    courseId: rawCourseId?.trim() ? rawCourseId : null,
    goal: readParam(searchParams, "goal") ?? "",
    preferredBlockType: VALID_BLOCK_TYPES.has(rawPreferredBlockType as TutorBlockType)
      ? (rawPreferredBlockType as TutorBlockType)
      : "",
    useWebSearch: readParam(searchParams, "search") === "1",
    autoStartAction:
      rawAutoStartAction === "generate" || rawAutoStartAction === "live" ? rawAutoStartAction : null,
  };
}

export function createLearnSessionId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `learn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildLearnHref(state: LearnHrefState) {
  const params = new URLSearchParams();

  if (state.courseId && (!state.sessionId || state.courseId !== state.sessionId)) {
    params.set("course", state.courseId);
  }

  if (state.goal) {
    params.set("goal", state.goal);
  }

  if (state.preferredBlockType) {
    params.set("format", state.preferredBlockType);
  }

  if (state.useWebSearch) {
    params.set("search", "1");
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
