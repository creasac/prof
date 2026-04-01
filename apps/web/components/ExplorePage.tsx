"use client";

import Link from "next/link";
import type { CourseSummary } from "@prof/contracts";
import { useEffect, useState, type CSSProperties } from "react";

import { loadPublicCourses } from "../lib/course-api";
import { buildCourseHref } from "../lib/course-route";

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

export function ExplorePage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCourses() {
      setIsLoading(true);
      setPageError(null);

      try {
        const nextCourses = await loadPublicCourses();
        if (!cancelled) {
          setCourses(nextCourses);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load public courses.");
          setCourses([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void hydrateCourses();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.headerCopy}>
            <h1 style={styles.title}>Explore public courses</h1>
            <p style={styles.subtitle}>Browse everything that has been shared publicly.</p>
          </div>
        </header>

        {pageError ? <p style={styles.errorText}>{pageError}</p> : null}

        {isLoading ? (
          <p style={styles.emptyText}>Loading public courses...</p>
        ) : courses.length === 0 ? (
          <p style={styles.emptyText}>No public courses yet.</p>
        ) : (
          <div style={styles.grid}>
            {courses.map((course) => (
              <Link
                key={course.courseId}
                href={buildCourseHref({
                  username: course.ownerUsername,
                  courseSlug: course.courseSlug,
                })}
                style={styles.card}
              >
                <div style={styles.placeholder}>explore</div>
                <div style={styles.cardBody}>
                  <p style={styles.courseRoute}>
                    @{course.ownerUsername}/{course.courseSlug}
                  </p>
                  <h2 style={styles.cardTitle}>{course.title}</h2>
                  <p style={styles.cardMeta}>
                    {getArtifactLabel(course.artifactCount)} · updated {formatUpdatedAt(course.updatedAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
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
    maxWidth: "1080px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
  },
  headerCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  title: {
    margin: 0,
    fontSize: "clamp(1.5rem, 4vw, 2.6rem)",
    lineHeight: 1,
    color: "#2c1c14",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    margin: 0,
    color: "#6a5447",
    fontSize: "0.96rem",
    lineHeight: 1.5,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  card: {
    border: "1px solid rgba(94, 73, 61, 0.12)",
    borderRadius: "18px",
    background: "rgba(255, 252, 247, 0.88)",
    boxShadow: "0 14px 34px rgba(93, 70, 51, 0.08)",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    textAlign: "left",
    textDecoration: "none",
  },
  placeholder: {
    borderRadius: "12px",
    minHeight: "112px",
    background:
      "linear-gradient(135deg, rgba(94, 73, 61, 0.1), rgba(191, 91, 44, 0.12)), repeating-linear-gradient(135deg, rgba(94, 73, 61, 0.06), rgba(94, 73, 61, 0.06) 12px, rgba(255, 255, 255, 0) 12px, rgba(255, 255, 255, 0) 24px)",
    color: "#6c5648",
    display: "grid",
    placeItems: "center",
    fontSize: "0.86rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  courseRoute: {
    margin: 0,
    color: "#8a3715",
    fontSize: "0.76rem",
    fontWeight: 600,
    lineHeight: 1.4,
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
