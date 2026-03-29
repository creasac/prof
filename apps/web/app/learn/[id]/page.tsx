import { Suspense } from "react";

import { LearnWorkspace } from "../../../components/LearnWorkspace";

type LearnSessionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LearnSessionPage({ params }: LearnSessionPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <LearnWorkspace sessionId={id} />
    </Suspense>
  );
}
