import { createPublicId, formatCourseVersionSegment, parseCourseVersionSegment, type TutorBlockType } from "@prof/contracts";

export type TutorLaunchAction = "generate" | "live" | null;

export type LearnRouteState = {
  courseOwnerUsername: string | null;
  courseSlug: string | null;
  courseVersionNumber: number | null;
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
  const rawCourseOwnerUsername = readParam(searchParams, "owner");
  const rawCourseSlug = readParam(searchParams, "course");
  const rawCourseVersion = readParam(searchParams, "version");

  return {
    courseOwnerUsername: rawCourseOwnerUsername?.trim() ? rawCourseOwnerUsername.trim().toLowerCase() : null,
    courseSlug: rawCourseSlug?.trim() ? rawCourseSlug.trim().toLowerCase() : null,
    courseVersionNumber: parseCourseVersionSegment(rawCourseVersion),
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
  return createPublicId(10);
}

export function buildLearnHref(state: LearnHrefState) {
  const params = new URLSearchParams();

  if (state.courseOwnerUsername && state.courseSlug) {
    params.set("owner", state.courseOwnerUsername);
    params.set("course", state.courseSlug);
  }

  if (state.courseVersionNumber) {
    params.set("version", formatCourseVersionSegment(state.courseVersionNumber));
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
