"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { PrivateProfile } from "@prof/contracts";

import { authClient } from "../lib/auth-client";
import { buildCourseHref } from "../lib/course-route";
import { loadProfile } from "../lib/profile-api";

type ProfilePageProps = {
  username: string;
};

function formatUpdatedAt(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getArtifactLabel(count: number) {
  return `${count} artifact${count === 1 ? "" : "s"}`;
}

export function ProfilePage({ username }: ProfilePageProps) {
  const router = useRouter();
  const { data: session, isPending: isAuthPending } = authClient.useSession();
  const [profile, setProfile] = useState<PrivateProfile | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const normalizedUsername = username.toLowerCase();
  const sessionUsername =
    session?.user && "username" in session.user && typeof session.user.username === "string" ? session.user.username : "";
  const isOwnerProfile = Boolean(session?.user?.id && sessionUsername && sessionUsername === normalizedUsername);

  useEffect(() => {
    let cancelled = false;

    async function hydrateProfile() {
      if (isAuthPending) {
        return;
      }

      setIsLoading(true);
      setProfile(null);
      setPageError(null);

      try {
        const nextProfile = await loadProfile(normalizedUsername);
        if (!cancelled) {
          setProfile(nextProfile);
          if (!nextProfile) {
            setPageError("Profile not found.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load profile.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void hydrateProfile();

    return () => {
      cancelled = true;
    };
  }, [isAuthPending, normalizedUsername, session?.user?.id]);

  function openCourse(courseId: string) {
    setPendingCourseId(courseId);
  }

  if (isLoading) {
    return null;
  }

  if (!profile) {
    return (
      <main style={styles.page}>
        <section style={styles.shell}>
          <header style={styles.header}>
            <h1 style={styles.title}>@{normalizedUsername}</h1>
          </header>
          <p style={styles.emptyText}>{pageError ?? "Profile not found."}</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <h1 style={styles.title}>@{profile?.username ?? normalizedUsername}</h1>
        </header>

        {pageError ? <p style={styles.errorText}>{pageError}</p> : null}

        {profile && profile.courses.length > 0 ? (
          <div style={styles.grid}>
            {profile.courses.map((course) => {
              const isCoursePending = isNavigating && pendingCourseId === course.courseId;

              return (
                <button
                  key={course.courseId}
                  type="button"
                  style={styles.card}
                  onClick={() => {
                    openCourse(course.courseId);
                    startTransition(() => {
                      router.push(
                        buildCourseHref({
                          username: course.ownerUsername,
                          courseSlug: course.courseSlug,
                        }),
                      );
                    });
                  }}
                  disabled={isCoursePending}
                >
                  <div style={styles.placeholder}>prof</div>
                  <div style={styles.cardBody}>
                    <h2 style={styles.cardTitle}>{course.title}</h2>
                    <p style={styles.cardMeta}>
                      {getArtifactLabel(course.artifactCount)} · {formatUpdatedAt(course.updatedAt)}
                    </p>
                    {isOwnerProfile ? (
                      <span style={styles.visibilityPill}>
                        {course.visibility === "public" ? "Public" : "Private"}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p style={styles.emptyText}>{isOwnerProfile ? "No materials yet." : "No public courses yet."}</p>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    padding: "80px 20px 48px",
  },
  shell: {
    width: "100%",
    maxWidth: "1080px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
  },
  title: {
    margin: 0,
    fontSize: "clamp(1.5rem, 4vw, 2.6rem)",
    lineHeight: 1,
    color: "#2c1c14",
    letterSpacing: "-0.02em",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
  },
  card: {
    border: "1px solid rgba(94, 73, 61, 0.12)",
    borderRadius: "20px",
    background: "rgba(255, 252, 247, 0.88)",
    boxShadow: "0 14px 34px rgba(93, 70, 51, 0.08)",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    cursor: "pointer",
    textAlign: "left",
  },
  placeholder: {
    borderRadius: "14px",
    minHeight: "140px",
    background:
      "linear-gradient(135deg, rgba(94, 73, 61, 0.1), rgba(191, 91, 44, 0.12)), repeating-linear-gradient(135deg, rgba(94, 73, 61, 0.06), rgba(94, 73, 61, 0.06) 12px, rgba(255, 255, 255, 0) 12px, rgba(255, 255, 255, 0) 24px)",
    color: "#6c5648",
    display: "grid",
    placeItems: "center",
    fontSize: "0.92rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "1rem",
    lineHeight: 1.3,
    color: "#2c1c14",
  },
  cardMeta: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.4,
    color: "#6a5447",
  },
  visibilityPill: {
    alignSelf: "flex-start",
    borderRadius: "999px",
    border: "1px solid rgba(138, 55, 21, 0.14)",
    background: "rgba(255, 247, 240, 0.9)",
    color: "#8a3715",
    padding: "4px 10px",
    fontSize: "0.76rem",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  emptyText: {
    margin: 0,
    color: "#6a5447",
    fontSize: "0.94rem",
  },
  errorText: {
    margin: 0,
    color: "#a22e2e",
    fontSize: "0.9rem",
  },
};
