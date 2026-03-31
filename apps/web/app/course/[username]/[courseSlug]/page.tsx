import { Suspense } from "react";

import { CourseWorkspace } from "../../../../components/CourseWorkspace";

type CoursePageProps = {
  params: Promise<{
    username: string;
    courseSlug: string;
  }>;
};

export default async function CoursePage({ params }: CoursePageProps) {
  const { username, courseSlug } = await params;

  return (
    <Suspense fallback={null}>
      <CourseWorkspace username={username} courseSlug={courseSlug} />
    </Suspense>
  );
}
