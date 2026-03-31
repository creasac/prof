import { persistedCourseSchema, type PersistedCourse } from "@prof/contracts";

import { fetchApi } from "./api";

export async function loadRemoteCourse(
  username: string,
  courseSlug: string,
  versionSegment?: string | null,
): Promise<PersistedCourse | null> {
  const pathname = versionSegment
    ? `/api/courses/${encodeURIComponent(username)}/${encodeURIComponent(courseSlug)}/${encodeURIComponent(versionSegment)}`
    : `/api/courses/${encodeURIComponent(username)}/${encodeURIComponent(courseSlug)}`;
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
