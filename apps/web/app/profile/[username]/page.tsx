import { Suspense } from "react";

import { ProfilePage } from "../../../components/ProfilePage";

type ProfileRoutePageProps = {
  params: Promise<{
    username: string;
  }>;
};

export default async function ProfileRoutePage({ params }: ProfileRoutePageProps) {
  const { username } = await params;

  return (
    <Suspense fallback={null}>
      <ProfilePage username={username} />
    </Suspense>
  );
}
