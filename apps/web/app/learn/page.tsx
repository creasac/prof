import { Suspense } from "react";

import { LearnWorkspace } from "../../components/LearnWorkspace";

export default function LearnPage() {
  return (
    <Suspense fallback={null}>
      <LearnWorkspace />
    </Suspense>
  );
}
