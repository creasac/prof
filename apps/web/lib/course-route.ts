import { formatCourseVersionSegment } from "@prof/contracts";

type CourseHrefState = {
  username: string;
  courseSlug: string;
  versionNumber?: number | null;
};

export function buildCourseHref({ username, courseSlug, versionNumber }: CourseHrefState) {
  const ownerSegment = `@${encodeURIComponent(username)}`;
  const slugSegment = encodeURIComponent(courseSlug);
  const pathname = versionNumber
    ? `/${ownerSegment}/${slugSegment}/${encodeURIComponent(formatCourseVersionSegment(versionNumber))}`
    : `/${ownerSegment}/${slugSegment}`;

  return pathname;
}

export function buildCourseQuizHref({
  username,
  courseSlug,
  versionNumber,
  quizIndex,
}: CourseHrefState & { quizIndex: number }) {
  const versionSegment = versionNumber ? formatCourseVersionSegment(versionNumber) : null;
  const basePath = versionSegment
    ? `/${`@${encodeURIComponent(username)}`}/${encodeURIComponent(courseSlug)}/${encodeURIComponent(versionSegment)}`
    : `/${`@${encodeURIComponent(username)}`}/${encodeURIComponent(courseSlug)}`;

  return `${basePath}/quiz/${encodeURIComponent(String(quizIndex))}`;
}
