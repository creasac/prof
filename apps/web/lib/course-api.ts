import {
  courseSummaryListSchema,
  courseVisibilitySchema,
  type CourseSummary,
  type CourseCoverImage,
  persistedCourseSchema,
  type CourseVisibility,
  type PersistedCourse,
} from "@prof/contracts";

import { buildApiUrl, fetchApi } from "./api";

export function buildCourseCoverPath(username: string, courseSlug: string) {
  return `/api/courses/${encodeURIComponent(username)}/${encodeURIComponent(courseSlug)}/cover`;
}

export function buildCourseCoverUrl(options: {
  username: string;
  courseSlug: string;
  coverImage: CourseCoverImage | null;
  cacheBust?: string | number | null;
}) {
  if (!options.coverImage) {
    return null;
  }

  const query = new URLSearchParams({
    v: options.coverImage.updatedAt,
  });

  if (options.cacheBust !== null && options.cacheBust !== undefined && `${options.cacheBust}`.trim()) {
    query.set("r", String(options.cacheBust));
  }

  return `${buildApiUrl(buildCourseCoverPath(options.username, options.courseSlug))}?${query.toString()}`;
}

export async function loadPublicCourses(): Promise<CourseSummary[]> {
  const response = await fetchApi("/api/courses/public");

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load public courses.");
  }

  return courseSummaryListSchema.parse(await response.json());
}

export async function loadRemoteCourse(
  username: string,
  courseSlug: string,
): Promise<PersistedCourse | null> {
  const pathname = `/api/courses/${encodeURIComponent(username)}/${encodeURIComponent(courseSlug)}`;
  const response = await fetchApi(pathname);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load the saved course.");
  }

  return persistedCourseSchema.parse(await response.json());
}

export async function forkRemoteCourse(username: string, courseSlug: string): Promise<PersistedCourse> {
  const pathname = `/api/courses/${encodeURIComponent(username)}/${encodeURIComponent(courseSlug)}/fork`;
  const response = await fetchApi(pathname, {
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to save a copy of this course.");
  }

  return persistedCourseSchema.parse(await response.json());
}

export async function generateRemoteCourseCover(username: string, courseSlug: string): Promise<PersistedCourse> {
  const response = await fetchApi(buildCourseCoverPath(username, courseSlug), {
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to generate the course cover.");
  }

  return persistedCourseSchema.parse(await response.json());
}

export async function updateRemoteCourseVisibility(
  username: string,
  courseSlug: string,
  visibility: CourseVisibility,
): Promise<PersistedCourse> {
  const pathname = `/api/courses/${encodeURIComponent(username)}/${encodeURIComponent(courseSlug)}`;
  const response = await fetchApi(pathname, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      visibility: courseVisibilitySchema.parse(visibility),
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to update course visibility.");
  }

  return persistedCourseSchema.parse(await response.json());
}
