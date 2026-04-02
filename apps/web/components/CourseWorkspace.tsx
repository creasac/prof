"use client";

import type { CourseVisibility, PersistedCourse } from "@prof/contracts";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "../lib/auth-client";
import { notifyCourseLibraryUpdated } from "../lib/app-shell-events";
import {
  buildCourseCoverUrl,
  deleteRemoteCourse,
  forkRemoteCourse,
  generateRemoteCourseCover,
  loadRemoteCourse,
  updateRemoteCourseVisibility,
} from "../lib/course-api";
import { buildCourseHref, buildCourseQuizHref } from "../lib/course-route";
import { collectCourseQuizzes, findTopicInPlan, pickSelectedTopicId, resolveCourseBlock } from "../lib/course-view";
import { buildLearnHref, createLearnSessionId } from "../lib/learn-route";
import { buildProfileHref } from "../lib/profile-route";
import { buildCourseMaterialFileHref } from "../lib/source-materials";
import { PlannerView } from "./PlannerUi";
import { SourceMaterialsPanel } from "./SourceMaterialsPanel";
import { BlockView, IconText } from "./TutorUi";

type CourseWorkspaceProps = {
  username: string;
  courseSlug: string;
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

export function CourseWorkspace({ username, courseSlug }: CourseWorkspaceProps) {
  const router = useRouter();
  const { data: authSession } = authClient.useSession();
  const [course, setCourse] = useState<PersistedCourse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [coverRefreshKey, setCoverRefreshKey] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"copy" | "cover" | "public" | "private" | "delete" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCourse() {
      setIsLoading(true);
      setCourse(null);
      setPageError(null);
      setActionError(null);
      setSelectedTopicId(null);

      try {
        const nextCourse = await loadRemoteCourse(username, courseSlug);

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
        setSelectedTopicId(pickSelectedTopicId(nextCourse.snapshot));
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
  }, [courseSlug, username]);

  const snapshot = course?.snapshot ?? null;
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
  const visibilityLabel = course?.visibility === "public" ? "Public" : "Private";
  const coverImageUrl = course
    ? buildCourseCoverUrl({
        username: course.ownerUsername,
        courseSlug: course.courseSlug,
        coverImage: course.coverImage,
        cacheBust: coverRefreshKey,
      })
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
          goal: "",
          autoStartAction: null,
        }),
      );
    });
  }

  async function saveAsCopy() {
    if (!course || course.isOwner || !authSession?.user?.id) {
      return;
    }

    setPendingAction("copy");
    setActionError(null);

    try {
      const forkedCourse = await forkRemoteCourse(course.ownerUsername, course.courseSlug);
      setCourse(forkedCourse);
      setSelectedTopicId(pickSelectedTopicId(forkedCourse.snapshot));
      router.push(
        buildCourseHref({
          username: forkedCourse.ownerUsername,
          courseSlug: forkedCourse.courseSlug,
        }),
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to save a copy.");
    } finally {
      setPendingAction(null);
    }
  }

  async function changeVisibility(nextVisibility: CourseVisibility) {
    if (!course || !course.isOwner || course.visibility === nextVisibility) {
      return;
    }

    setPendingAction(nextVisibility);
    setActionError(null);

    try {
      const updatedCourse = await updateRemoteCourseVisibility(course.ownerUsername, course.courseSlug, nextVisibility);
      setCourse(updatedCourse);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update course visibility.");
    } finally {
      setPendingAction(null);
    }
  }

  async function generateCover() {
    if (!course || !course.isOwner) {
      return;
    }

    setPendingAction("cover");
    setActionError(null);

    try {
      const updatedCourse = await generateRemoteCourseCover(course.ownerUsername, course.courseSlug);
      setCoverRefreshKey(String(Date.now()));
      setCourse(updatedCourse);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to generate the course cover.");
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteCourse() {
    if (!course || !course.isOwner) {
      return;
    }

    const confirmed = window.confirm("Delete this course? This can't be undone.");
    if (!confirmed) {
      return;
    }

    const ownerUsername = course.ownerUsername;
    const courseSlug = course.courseSlug;

    setPendingAction("delete");
    setActionError(null);

    try {
      await deleteRemoteCourse(ownerUsername, courseSlug);
      notifyCourseLibraryUpdated();
      router.replace(buildProfileHref(ownerUsername));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete the course.");
      setPendingAction(null);
    }
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
              <p style={styles.ownerText}>
                @{username}/{courseSlug}
              </p>
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

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <section style={styles.heroCard}>
          <div style={styles.heroContent}>
            <div style={styles.headerCopy}>
              <p style={styles.ownerText}>
                @{course.ownerUsername}/{course.courseSlug}
              </p>
              <h1 style={styles.title}>{course.title}</h1>
              <div style={styles.metaRow}>
                <p style={styles.metaText}>updated {formatUpdatedAt(course.updatedAt)}</p>
                <span style={styles.visibilityPill}>{visibilityLabel}</span>
              </div>
              {actionError ? <p style={styles.errorText}>{actionError}</p> : null}
            </div>

            <div style={styles.headerActions}>
              {authSession?.user?.id && !course.isOwner ? (
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => {
                    void saveAsCopy();
                  }}
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "copy" ? "Saving..." : "Save as Copy"}
                </button>
              ) : null}

              {authSession?.user?.id && course.isOwner ? (
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => {
                    void generateCover();
                  }}
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "cover"
                    ? "Generating..."
                    : course.coverImage
                      ? "Regenerate cover"
                      : "Generate cover"}
                </button>
              ) : null}

              {authSession?.user?.id && course.isOwner ? (
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => {
                    void changeVisibility(course.visibility === "public" ? "private" : "public");
                  }}
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "public" || pendingAction === "private"
                    ? "Saving..."
                    : course.visibility === "public"
                      ? "Make private"
                      : "Make public"}
                </button>
              ) : null}

              {authSession?.user?.id && course.isOwner ? (
                <button
                  type="button"
                  style={styles.dangerButton}
                  onClick={() => {
                    void deleteCourse();
                  }}
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "delete" ? "Deleting..." : "Delete course"}
                </button>
              ) : null}

              <button type="button" style={styles.primaryButton} onClick={startLearning} disabled={isPending}>
                {isPending ? "Opening..." : "Learn"}
              </button>
            </div>
          </div>

          {coverImageUrl ? (
            <div style={styles.coverCard}>
              <img
                key={coverImageUrl}
                src={coverImageUrl}
                alt={course.coverImage?.altText ?? `${course.title} course cover`}
                style={styles.coverImage}
              />
            </div>
          ) : null}
        </section>

        {snapshot.sourceMaterials.length > 0 ? (
          <SourceMaterialsPanel
            title="Course Materials"
            materials={snapshot.sourceMaterials}
            resolveFileHref={(material) =>
              material.kind === "pdf"
                ? buildCourseMaterialFileHref(course.ownerUsername, course.courseSlug, material.id)
                : null
            }
          />
        ) : null}

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
              <h2 style={styles.sectionTitle}>{selectedTopic?.title ?? course.title}</h2>
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
                          {activeQuizEntry.quiz.questions.length === 1 ? "" : "s"} available in this course.
                        </p>
                      </div>
                      <Link
                        href={buildCourseQuizHref({
                          username: course.ownerUsername,
                          courseSlug: course.courseSlug,
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

        {authSession?.user?.id ? (
          <p style={styles.helperText}>
            <IconText icon="stack" size={15}>
              {course.isOwner
                ? "Learn opens a new session seeded from this course."
                : "Learn starts a seeded session. Save as Copy creates your own private course immediately."}
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
    padding: "36px 18px 24px",
  },
  shell: {
    width: "100%",
    maxWidth: "1180px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  heroCard: {
    borderRadius: "22px",
    border: "1px solid var(--border)",
    background: "var(--surface-1)",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
    padding: "18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "18px",
    flexWrap: "wrap",
  },
  heroContent: {
    flex: "1 1 520px",
    minWidth: 0,
    maxWidth: "760px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  headerCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  },
  ownerText: {
    margin: 0,
    color: "var(--muted-strong)",
    fontSize: "0.92rem",
  },
  title: {
    margin: 0,
    color: "var(--text-soft)",
    fontSize: "clamp(1.5rem, 4vw, 2.8rem)",
    lineHeight: 1,
    letterSpacing: "-0.03em",
  },
  metaText: {
    margin: 0,
    color: "var(--warm-muted)",
    fontSize: "0.9rem",
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "center",
  },
  visibilityPill: {
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-muted)",
    color: "var(--muted-strong)",
    padding: "3px 8px",
    fontSize: "0.74rem",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  headerActions: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: "auto",
  },
  coverCard: {
    flex: "0 0 300px",
    width: "100%",
    maxWidth: "300px",
    marginLeft: "auto",
  },
  coverImage: {
    display: "block",
    width: "100%",
    height: "auto",
    borderRadius: "14px",
  },
  primaryButton: {
    border: "none",
    borderRadius: "999px",
    padding: "8px 14px",
    background: "var(--surface-contrast)",
    color: "#fff",
    fontSize: "0.86rem",
    cursor: "pointer",
  },
  secondaryButton: {
    borderRadius: "999px",
    border: "1px solid var(--border)",
    padding: "8px 12px",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    fontSize: "0.86rem",
    cursor: "pointer",
  },
  dangerButton: {
    borderRadius: "999px",
    border: "1px solid color-mix(in srgb, var(--danger) 28%, var(--border))",
    padding: "8px 12px",
    background: "color-mix(in srgb, var(--danger) 8%, var(--surface-2))",
    color: "var(--danger)",
    fontSize: "0.86rem",
    cursor: "pointer",
  },
  secondaryLink: {
    borderRadius: "999px",
    border: "1px solid var(--border)",
    padding: "8px 12px",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    fontSize: "0.86rem",
    textDecoration: "none",
  },
  workspace: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: "14px",
  },
  panel: {
    borderRadius: "18px",
    border: "1px solid var(--border)",
    background: "var(--surface-1)",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: "380px",
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
    color: "var(--text-soft)",
    fontSize: "1.02rem",
  },
  quizCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    borderRadius: "16px",
    border: "1px solid var(--border)",
    background: "var(--surface-muted)",
    padding: "10px 12px",
  },
  quizTitle: {
    margin: 0,
    color: "var(--text-soft)",
    fontWeight: 600,
    fontSize: "0.92rem",
  },
  quizText: {
    margin: "4px 0 0",
    color: "var(--warm-muted)",
    fontSize: "0.88rem",
  },
  emptyState: {
    borderRadius: "16px",
    border: "1px dashed var(--border-strong)",
    background: "var(--surface-muted)",
    padding: "14px",
  },
  emptyTitle: {
    margin: 0,
    color: "var(--text-soft)",
    fontWeight: 600,
  },
  emptyText: {
    margin: "6px 0 0",
    color: "var(--warm-muted)",
    lineHeight: 1.6,
  },
  helperText: {
    margin: 0,
    color: "var(--warm-muted)",
    fontSize: "0.88rem",
  },
  errorText: {
    margin: 0,
    color: "var(--danger)",
    fontSize: "0.9rem",
  },
};
