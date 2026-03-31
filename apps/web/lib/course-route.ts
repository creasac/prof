type CourseHrefState = {
  username: string;
  courseSlug: string;
};

export function buildCourseHref({ username, courseSlug }: CourseHrefState) {
  const ownerSegment = `@${encodeURIComponent(username)}`;
  const slugSegment = encodeURIComponent(courseSlug);
  return `/${ownerSegment}/${slugSegment}`;
}

export function buildCourseQuizHref({
  username,
  courseSlug,
  quizIndex,
}: CourseHrefState & { quizIndex: number }) {
  return `/${`@${encodeURIComponent(username)}`}/${encodeURIComponent(courseSlug)}/quiz/${encodeURIComponent(String(quizIndex))}`;
}
