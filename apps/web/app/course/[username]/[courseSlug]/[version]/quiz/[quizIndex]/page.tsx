import { Suspense } from "react";

import { CourseQuizPage } from "../../../../../../../components/CourseQuizPage";

type CourseQuizRoutePageProps = {
  params: Promise<{
    username: string;
    courseSlug: string;
    version: string;
    quizIndex: string;
  }>;
};

export default async function CourseQuizRoutePage({ params }: CourseQuizRoutePageProps) {
  const { username, courseSlug, version, quizIndex } = await params;
  const parsedQuizIndex = Number.parseInt(quizIndex, 10);

  return (
    <Suspense fallback={null}>
      <CourseQuizPage
        username={username}
        courseSlug={courseSlug}
        versionSegment={version}
        quizIndex={Number.isFinite(parsedQuizIndex) && parsedQuizIndex >= 1 ? parsedQuizIndex : 1}
      />
    </Suspense>
  );
}
