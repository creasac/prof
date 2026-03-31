import { Suspense } from "react";

import { CourseQuizPage } from "../../../../../../components/CourseQuizPage";

type CourseQuizRoutePageProps = {
  params: Promise<{
    username: string;
    courseSlug: string;
    quizIndex: string;
  }>;
};

export default async function CourseQuizRoutePage({ params }: CourseQuizRoutePageProps) {
  const { username, courseSlug, quizIndex } = await params;
  const parsedQuizIndex = Number.parseInt(quizIndex, 10);

  return (
    <Suspense fallback={null}>
      <CourseQuizPage
        username={username}
        courseSlug={courseSlug}
        quizIndex={Number.isFinite(parsedQuizIndex) && parsedQuizIndex >= 1 ? parsedQuizIndex : 1}
      />
    </Suspense>
  );
}
