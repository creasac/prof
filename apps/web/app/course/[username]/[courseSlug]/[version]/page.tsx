import { Suspense } from "react";

import { CourseWorkspace } from "../../../../../components/CourseWorkspace";

type CourseVersionPageProps = {
  params: Promise<{
    username: string;
    courseSlug: string;
    version: string;
  }>;
};

export default async function CourseVersionPage({ params }: CourseVersionPageProps) {
  const { username, courseSlug, version } = await params;

  return (
    <Suspense fallback={null}>
      <CourseWorkspace username={username} courseSlug={courseSlug} versionSegment={version} />
    </Suspense>
  );
}
