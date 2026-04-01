import {
  courseSummaryListSchema,
  courseVisibilitySchema,
  type CourseSummary,
  persistedCourseSchema,
  type CourseVisibility,
  type PersistedCourse,
} from "@prof/contracts";

import { fetchApi } from "./api";

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
