import { Suspense } from "react";

import { LearnQuizPage } from "../../../../components/LearnQuizPage";

type LearnQuizSessionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LearnQuizSessionPage({ params }: LearnQuizSessionPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <LearnQuizPage sessionId={id} />
    </Suspense>
  );
}
