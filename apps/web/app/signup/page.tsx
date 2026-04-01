import { Suspense } from "react";

import { AuthPage } from "../../components/AuthPage";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage mode="signup" />
    </Suspense>
  );
}
