"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { courseCoverAspectRatioCss, type PrivateProfile } from "@prof/contracts";

import { authClient } from "../lib/auth-client";
import { getSessionUsername } from "../lib/auth-user";
import { buildCourseCoverUrl } from "../lib/course-api";
import { buildCourseHref } from "../lib/course-route";
import { loadProfile } from "../lib/profile-api";
import { buildSettingsHref } from "../lib/profile-route";

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
  const sessionUsername = getSessionUsername(session);
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
          <div style={styles.headerIdentity}>
            <h1 style={styles.title}>{profile.name}</h1>
            <p style={styles.username}>@{profile.username ?? normalizedUsername}</p>
          </div>
          {isOwnerProfile ? (
            <Link href={buildSettingsHref()} style={styles.editLink}>
              Edit profile
            </Link>
          ) : null}
        </header>

        {pageError ? <p style={styles.errorText}>{pageError}</p> : null}

        {profile && profile.courses.length > 0 ? (
          <div style={styles.grid}>
            {profile.courses.map((course) => {
              const isCoursePending = isNavigating && pendingCourseId === course.courseId;
              const coverImageUrl = buildCourseCoverUrl({
                username: course.ownerUsername,
                courseSlug: course.courseSlug,
                coverImage: course.coverImage,
              });

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
                  {coverImageUrl ? (
                    <img
                      src={coverImageUrl}
                      alt={course.coverImage?.altText ?? `${course.title} course cover`}
                      style={styles.coverImage}
                    />
                  ) : (
                    <div style={styles.placeholder}>prof</div>
                  )}
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
    padding: "52px 18px 28px",
  },
  shell: {
    width: "100%",
    maxWidth: "1160px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
  },
  headerIdentity: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  title: {
    margin: 0,
    fontSize: "clamp(1.5rem, 4vw, 2.6rem)",
    lineHeight: 1,
    color: "var(--text-soft)",
    letterSpacing: "-0.02em",
  },
  username: {
    margin: 0,
    fontSize: "0.96rem",
    lineHeight: 1.3,
    color: "var(--muted)",
  },
  editLink: {
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    padding: "8px 12px",
    fontSize: "0.88rem",
    fontWeight: 600,
    textDecoration: "none",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
    gap: "16px",
  },
  card: {
    border: "1px solid var(--border)",
    borderRadius: "18px",
    background: "var(--surface-1)",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "9px",
    cursor: "pointer",
    textAlign: "left",
  },
  placeholder: {
    borderRadius: "12px",
    aspectRatio: courseCoverAspectRatioCss,
    background: "var(--surface-muted)",
    border: "1px dashed var(--border-strong)",
    color: "var(--muted)",
    display: "grid",
    placeItems: "center",
    fontSize: "0.86rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  coverImage: {
    display: "block",
    width: "100%",
    height: "auto",
    borderRadius: "14px",
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    padding: "0 2px 2px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "0.96rem",
    lineHeight: 1.28,
    color: "var(--text-soft)",
  },
  cardMeta: {
    margin: 0,
    fontSize: "0.8rem",
    lineHeight: 1.4,
    color: "#6a5447",
  },
  visibilityPill: {
    alignSelf: "flex-start",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-muted)",
    color: "var(--muted-strong)",
    padding: "3px 8px",
    fontSize: "0.72rem",
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
    color: "var(--danger)",
    fontSize: "0.9rem",
  },
};
