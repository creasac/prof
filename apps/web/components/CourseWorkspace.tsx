"use client";

import type { PersistedCourse } from "@prof/contracts";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "../lib/auth-client";
import { loadRemoteCourse } from "../lib/course-api";
import { buildCourseHref, buildCourseQuizHref } from "../lib/course-route";
import { collectCourseQuizzes, findTopicInPlan, pickSelectedTopicId, resolveCourseBlock } from "../lib/course-view";
import { buildLearnHref, createLearnSessionId } from "../lib/learn-route";
import { PlannerView } from "./PlannerUi";
import { BlockView, IconText } from "./TutorUi";

type CourseWorkspaceProps = {
  username: string;
  courseSlug: string;
  versionSegment?: string | null;
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

export function CourseWorkspace({ username, courseSlug, versionSegment }: CourseWorkspaceProps) {
  const router = useRouter();
  const { data: authSession } = authClient.useSession();
  const [course, setCourse] = useState<PersistedCourse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function hydrateCourse() {
      setIsLoading(true);
      setPageError(null);

      try {
        const nextCourse = await loadRemoteCourse(username, courseSlug, versionSegment ?? null);

        if (cancelled) {
          return;
        }

        if (!nextCourse) {
          setCourse(null);
          setPageError("Course not found.");
          setIsLoading(false);
          return;
        }

        setCourse(nextCourse);
        setSelectedTopicId(pickSelectedTopicId(nextCourse.requestedVersion.snapshot));
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load course.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void hydrateCourse();

    return () => {
      cancelled = true;
    };
  }, [courseSlug, username, versionSegment]);

  const snapshot = course?.requestedVersion.snapshot ?? null;
  const effectiveTopicId = selectedTopicId ?? (snapshot ? pickSelectedTopicId(snapshot) : null);
  const selectedTopic = snapshot?.plan ? findTopicInPlan(snapshot.plan, effectiveTopicId) : null;
  const activeContent = snapshot ? resolveCourseBlock(snapshot, effectiveTopicId) : null;
  const quizzes = useMemo(() => (snapshot ? collectCourseQuizzes(snapshot) : []), [snapshot]);
  const activeQuizEntry = activeContent?.quiz
    ? quizzes.find((entry) => entry.quiz === activeContent.quiz) ??
      quizzes.find((entry) => entry.topicId === activeContent.topicId) ??
      quizzes[0] ??
      null
    : null;

  function startLearning() {
    if (!course) {
      return;
    }

    const nextSessionId = createLearnSessionId();
    startTransition(() => {
      router.push(
        buildLearnHref({
          sessionId: nextSessionId,
          courseOwnerUsername: course.ownerUsername,
          courseSlug: course.courseSlug,
          courseVersionNumber: course.requestedVersion.versionNumber,
          goal: "",
          preferredBlockType: "",
          useWebSearch: false,
          autoStartAction: null,
        }),
      );
    });
  }

  if (isLoading) {
    return null;
  }

  if (!course || !snapshot) {
    return (
      <main style={styles.page}>
        <section style={styles.shell}>
          <header style={styles.header}>
            <div>
              <p style={styles.ownerText}>@{username}</p>
              <h1 style={styles.title}>{courseSlug}</h1>
            </div>
          </header>
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>{pageError ?? "Course unavailable."}</p>
          </div>
        </section>
      </main>
    );
  }

  const latestHref = buildCourseHref({
    username: course.ownerUsername,
    courseSlug: course.courseSlug,
  });
  const isViewingLatest = course.requestedVersionNumber === course.latestVersionNumber;

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.headerCopy}>
            <p style={styles.ownerText}>@{course.ownerUsername}</p>
            <h1 style={styles.title}>{course.title}</h1>
            <p style={styles.metaText}>
              {course.courseSlug} · v{course.requestedVersionNumber} · updated {formatUpdatedAt(course.updatedAt)}
            </p>
          </div>

          <div style={styles.headerActions}>
            {!isViewingLatest ? (
              <Link href={latestHref} style={styles.secondaryLink}>
                Latest
              </Link>
            ) : null}
            <button type="button" style={styles.primaryButton} onClick={startLearning} disabled={isPending}>
              {isPending ? "Opening..." : "Learn"}
            </button>
          </div>
        </header>

        <div style={styles.versionRow}>
          {course.versions.map((version) => (
            <Link
              key={version.versionNumber}
              href={buildCourseHref({
                username: course.ownerUsername,
                courseSlug: course.courseSlug,
                versionNumber: version.versionNumber,
              })}
              style={{
                ...styles.versionPill,
                ...(version.versionNumber === course.requestedVersionNumber ? styles.versionPillActive : null),
              }}
            >
              v{version.versionNumber}
            </Link>
          ))}
        </div>

        <section style={styles.workspace}>
          <article style={styles.panel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.sectionTitle}>Course</h2>
            </div>
            <div style={styles.panelBody}>
              <PlannerView
                plan={snapshot.plan}
                clarification={null}
                streamedPlanTitle=""
                streamedTopics={[]}
                selectedTopicId={effectiveTopicId}
                generatedTopicId={activeContent?.topicId ?? null}
                quizResultsByTopic={{}}
                isPlanning={false}
                isGeneratingTopic={false}
                onSelectTopic={setSelectedTopicId}
                onGenerateTopic={() => {}}
                showAction={false}
              />
            </div>
          </article>

          <article style={styles.panel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.sectionTitle}>{selectedTopic?.title ?? course.requestedVersion.title}</h2>
            </div>

            <div style={styles.panelBody}>
              {pageError ? <p style={styles.errorText}>{pageError}</p> : null}

              {activeContent?.block ? (
                <>
                  <BlockView block={activeContent.block} sources={snapshot.blockSources} />

                  {activeQuizEntry ? (
                    <div style={styles.quizCard}>
                      <div>
                        <p style={styles.quizTitle}>Quiz</p>
                        <p style={styles.quizText}>
                          {activeQuizEntry.quiz.questions.length} question
                          {activeQuizEntry.quiz.questions.length === 1 ? "" : "s"} available in this version.
                        </p>
                      </div>
                      <Link
                        href={buildCourseQuizHref({
                          username: course.ownerUsername,
                          courseSlug: course.courseSlug,
                          versionNumber: course.requestedVersion.versionNumber,
                          quizIndex: activeQuizEntry.index,
                        })}
                        style={styles.secondaryLink}
                      >
                        Open quiz
                      </Link>
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={styles.emptyState}>
                  <p style={styles.emptyTitle}>No artifact selected yet.</p>
                  <p style={styles.emptyText}>Choose a topic on the left, or continue learning to create more content.</p>
                </div>
              )}
            </div>
          </article>
        </section>

        {authSession?.user?.id && course.isOwner ? (
          <p style={styles.helperText}>
            <IconText icon="stack" size={15}>
              Opening Learn from here seeds a new session from this exact version.
            </IconText>
          </p>
        ) : null}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    padding: "44px 20px 36px",
  },
  shell: {
    width: "100%",
    maxWidth: "1180px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    flexWrap: "wrap",
  },
  headerCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  ownerText: {
    margin: 0,
    color: "#8a3715",
    fontSize: "0.92rem",
  },
  title: {
    margin: 0,
    color: "#2c1c14",
    fontSize: "clamp(1.5rem, 4vw, 2.8rem)",
    lineHeight: 1,
    letterSpacing: "-0.03em",
  },
  metaText: {
    margin: 0,
    color: "#6a5447",
    fontSize: "0.9rem",
  },
  headerActions: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
  },
  primaryButton: {
    border: "none",
    borderRadius: "999px",
    padding: "10px 16px",
    background: "#8a3715",
    color: "#fff8f1",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  secondaryLink: {
    borderRadius: "999px",
    border: "1px solid rgba(72, 42, 22, 0.12)",
    padding: "9px 14px",
    background: "rgba(255, 253, 248, 0.84)",
    color: "#5f473b",
    fontSize: "0.9rem",
    textDecoration: "none",
  },
  versionRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  versionPill: {
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "0.82rem",
    border: "1px solid rgba(72, 42, 22, 0.08)",
    color: "#6a5447",
    textDecoration: "none",
    background: "rgba(255, 253, 248, 0.68)",
  },
  versionPillActive: {
    background: "rgba(255, 247, 239, 0.82)",
    borderColor: "rgba(191, 91, 44, 0.18)",
    color: "#8a3715",
  },
  workspace: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "18px",
  },
  panel: {
    borderRadius: "22px",
    border: "1px solid rgba(72, 42, 22, 0.08)",
    background: "rgba(255, 252, 247, 0.88)",
    boxShadow: "0 14px 34px rgba(93, 70, 51, 0.08)",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minHeight: "420px",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
  },
  panelBody: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  sectionTitle: {
    margin: 0,
    color: "#2c1c14",
    fontSize: "1.02rem",
  },
  quizCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    alignItems: "center",
    borderRadius: "18px",
    border: "1px solid rgba(191, 91, 44, 0.14)",
    background: "rgba(255, 248, 242, 0.82)",
    padding: "12px 14px",
  },
  quizTitle: {
    margin: 0,
    color: "#2c1c14",
    fontWeight: 600,
    fontSize: "0.92rem",
  },
  quizText: {
    margin: "4px 0 0",
    color: "#6a5447",
    fontSize: "0.88rem",
  },
  emptyState: {
    borderRadius: "18px",
    border: "1px dashed rgba(72, 42, 22, 0.12)",
    background: "rgba(255, 253, 248, 0.64)",
    padding: "18px",
  },
  emptyTitle: {
    margin: 0,
    color: "#3f3028",
    fontWeight: 600,
  },
  emptyText: {
    margin: "8px 0 0",
    color: "#6a5447",
    lineHeight: 1.6,
  },
  helperText: {
    margin: 0,
    color: "#6a5447",
    fontSize: "0.88rem",
  },
  errorText: {
    margin: 0,
    color: "#a22e2e",
    fontSize: "0.9rem",
  },
};
