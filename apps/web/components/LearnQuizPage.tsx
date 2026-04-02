"use client";

import type { LearnSessionSnapshot, QuizBlock } from "@prof/contracts";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { authClient } from "../lib/auth-client";
import {
  readLocalLearnSessionTimestamps,
  readLearnSessionSnapshot,
  serializeLearnSessionActivity,
  serializeLearnSessionSnapshot,
  writeLearnSessionSnapshot,
} from "../lib/learn-session";
import { loadRemoteLearnSession, saveRemoteLearnSession } from "../lib/learn-session-api";
import { buildLearnHref } from "../lib/learn-route";
import {
  createEmptyQuizProgress,
  ensureQuizProgress,
  getQuestionKindLabel,
  gradeQuiz,
  questionHasAnswer,
  type QuizAnswerState,
  type QuizProgress,
} from "../lib/quiz";

type LearnQuizPageProps = {
  sessionId: string;
};

export function LearnQuizPage({ sessionId }: LearnQuizPageProps) {
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const [snapshot, setSnapshot] = useState<LearnSessionSnapshot | null>(null);
  const [quiz, setQuiz] = useState<QuizBlock | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const lastCachedSnapshotKeyRef = useRef<string | null>(null);
  const lastTrackedActivityKeyRef = useRef<string | null>(null);
  const sessionTimestampsRef = useRef<{ createdAt: string; updatedAt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateQuiz() {
      if (isAuthPending) {
        return;
      }

      let nextSnapshot = readLearnSessionSnapshot(sessionId);
      let nextTimestamps = readLocalLearnSessionTimestamps(sessionId);

      if (authSession?.user?.id && !nextSnapshot) {
        try {
          const remoteSession = await loadRemoteLearnSession(sessionId, {
            cacheKey: authSession.user.id,
          });
          if (!cancelled && remoteSession) {
            nextSnapshot = remoteSession.snapshot;
            nextTimestamps = {
              createdAt: remoteSession.createdAt,
              updatedAt: remoteSession.updatedAt,
            };
          }
        } catch (error) {
          console.error(error);
        }
      }

      if (cancelled) {
        return;
      }

      const nextQuiz = getGeneratedQuiz(nextSnapshot);
      const nextTopicId = nextSnapshot?.generatedQuizTopicId ?? nextSnapshot?.generatedTopicId ?? null;
      const nextProgress = nextQuiz ? ensureQuizProgress(nextQuiz, nextSnapshot?.quizProgress, nextTopicId) : null;
      const hydratedSnapshot =
        nextSnapshot && nextProgress
          ? {
              ...nextSnapshot,
              quizProgress: nextProgress,
              quizResultsByTopic: nextSnapshot.quizResultsByTopic ?? {},
            }
          : nextSnapshot;

      if (hydratedSnapshot && nextTimestamps) {
        writeLearnSessionSnapshot(sessionId, hydratedSnapshot, {
          createdAt: nextTimestamps.createdAt,
          updatedAt: nextTimestamps.updatedAt,
          notifyHistoryUpdate: false,
        });
      }

      if (hydratedSnapshot) {
        lastCachedSnapshotKeyRef.current = serializeLearnSessionSnapshot(hydratedSnapshot);
        lastTrackedActivityKeyRef.current = serializeLearnSessionActivity(hydratedSnapshot);
      } else {
        lastCachedSnapshotKeyRef.current = null;
        lastTrackedActivityKeyRef.current = null;
      }
      sessionTimestampsRef.current = nextTimestamps;

      setSnapshot(hydratedSnapshot);
      setQuiz(nextQuiz);
      setTopicId(nextTopicId);
      setProgress(nextProgress);
      setCurrentQuestionIndex(0);
      setIsLoaded(true);
    }

    void hydrateQuiz();

    return () => {
      cancelled = true;
    };
  }, [authSession?.user?.id, isAuthPending, sessionId]);

  useEffect(() => {
    if (!progress || !isLoaded) {
      return;
    }

    setSnapshot((current) => {
      if (!current) {
        return current;
      }

      let nextSnapshot: LearnSessionSnapshot = {
        ...current,
        quizProgress: progress,
      };

      if (quiz && topicId && progress.submitted) {
        const result = gradeQuiz(quiz, progress);
        const nextResults = { ...(current.quizResultsByTopic ?? {}) };
        nextResults[topicId] = result.percent;
        nextSnapshot = {
          ...nextSnapshot,
          quizResultsByTopic: nextResults,
        };
      }

      const snapshotKey = serializeLearnSessionSnapshot(nextSnapshot);
      if (snapshotKey === lastCachedSnapshotKeyRef.current) {
        return nextSnapshot;
      }

      const activityKey = serializeLearnSessionActivity(nextSnapshot);
      const hasTrackedActivityChange = activityKey !== lastTrackedActivityKeyRef.current;

      writeLearnSessionSnapshot(sessionId, nextSnapshot, {
        createdAt: sessionTimestampsRef.current?.createdAt,
        trackInHistory: hasTrackedActivityChange,
      });
      lastCachedSnapshotKeyRef.current = snapshotKey;

      if (!hasTrackedActivityChange) {
        return nextSnapshot;
      }

      lastTrackedActivityKeyRef.current = activityKey;
      sessionTimestampsRef.current = {
        createdAt: sessionTimestampsRef.current?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (authSession?.user?.id) {
        void saveRemoteLearnSession(sessionId, nextSnapshot, {
          cacheKey: authSession.user.id,
        })
          .then((persistedSession) => {
            sessionTimestampsRef.current = {
              createdAt: persistedSession.createdAt,
              updatedAt: persistedSession.updatedAt,
            };
            lastCachedSnapshotKeyRef.current = serializeLearnSessionSnapshot(persistedSession.snapshot);
            lastTrackedActivityKeyRef.current = serializeLearnSessionActivity(persistedSession.snapshot);
            writeLearnSessionSnapshot(sessionId, persistedSession.snapshot, {
              createdAt: persistedSession.createdAt,
              updatedAt: persistedSession.updatedAt,
              notifyHistoryUpdate: false,
            });
          })
          .catch((error) => {
            console.error(error);
          });
      }
      return nextSnapshot;
    });
  }, [authSession?.user?.id, isLoaded, progress, quiz, sessionId, topicId]);

  const result = useMemo(() => {
    if (!quiz || !progress || !progress.submitted) {
      return null;
    }

    return gradeQuiz(quiz, progress);
  }, [progress, quiz]);

  if (!isLoaded) {
    return null;
  }

  if (!snapshot || !quiz || !progress) {
    return (
      <main style={styles.page}>
        <section style={styles.shell}>
          <header style={styles.header}>
            <h1 style={styles.title}>Quiz</h1>
          </header>
          <div style={styles.card}>
            <p style={styles.bodyText}>Quiz is not ready in this session yet.</p>
            <Link
              href={buildLearnHref({
                sessionId,
                courseOwnerUsername: snapshot?.course?.ownerUsername ?? null,
                courseSlug: snapshot?.course?.courseSlug ?? null,
                goal: "",
                autoStartAction: null,
              })}
              style={styles.link}
            >
              Back to lesson
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const activeQuiz = quiz;
  const activeProgress = progress;
  const currentQuestion = activeQuiz.questions[currentQuestionIndex];
  const currentAnswer = activeProgress.answers[currentQuestionIndex];
  const answeredCount = activeQuiz.questions.filter((question, index) =>
    questionHasAnswer(question, activeProgress.answers[index]),
  ).length;
  const lessonHref = buildLearnHref({
    sessionId,
    courseOwnerUsername: snapshot.course?.ownerUsername ?? null,
    courseSlug: snapshot.course?.courseSlug ?? null,
    goal: "",
    autoStartAction: null,
  });

  function updateAnswer(nextAnswer: QuizAnswerState) {
    setProgress((current) => {
      if (!current) {
        return current;
      }

      const nextAnswers = current.answers.map((answer, index) =>
        index === currentQuestionIndex ? nextAnswer : answer,
      );

      return {
        ...current,
        submitted: false,
        answers: nextAnswers,
      };
    });
  }

  function submitQuiz() {
    setProgress((current) => (current ? { ...current, submitted: true } : current));
  }

  function restartQuiz() {
    setProgress(createEmptyQuizProgress(activeQuiz, topicId));
    setCurrentQuestionIndex(0);
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.headerCopy}>
            <h1 style={styles.title}>Quiz</h1>
            <p style={styles.metaText}>{activeQuiz.title}</p>
          </div>
          <Link href={lessonHref} style={styles.link}>
            Back to lesson
          </Link>
        </header>

        {!activeProgress.submitted ? (
          <section style={styles.card}>
            <div style={styles.progressRow}>
              <span style={styles.progressText}>
                Question {currentQuestionIndex + 1} of {activeQuiz.questions.length}
              </span>
              <span style={styles.progressText}>{answeredCount} answered</span>
            </div>

            <div style={styles.questionHeader}>
              <p style={styles.questionKind}>{getQuestionKindLabel(currentQuestion)}</p>
              <h2 style={styles.questionPrompt}>{currentQuestion.prompt}</h2>
            </div>

            <div style={styles.answerArea}>
              {currentQuestion.kind === "multiple_choice" ? (
                <div style={styles.optionList}>
                  {currentQuestion.choices.map((choice, index) => {
                    const selected = currentAnswer?.selectedIndex === index;

                    return (
                      <button
                        key={choice}
                        type="button"
                        style={{
                          ...styles.optionButton,
                          ...(selected ? styles.optionButtonSelected : null),
                        }}
                        onClick={() =>
                          updateAnswer({
                            selectedIndex: index,
                            selectedIndexes: [],
                            text: "",
                          })
                        }
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {currentQuestion.kind === "multiple_select" ? (
                <div style={styles.optionList}>
                  {currentQuestion.choices.map((choice, index) => {
                    const selected = currentAnswer?.selectedIndexes.includes(index) ?? false;

                    return (
                      <label
                        key={choice}
                        style={{
                          ...styles.checkboxRow,
                          ...(selected ? styles.checkboxRowSelected : null),
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            const selectedIndexes = new Set(currentAnswer?.selectedIndexes ?? []);

                            if (event.target.checked) {
                              selectedIndexes.add(index);
                            } else {
                              selectedIndexes.delete(index);
                            }

                            updateAnswer({
                              selectedIndex: null,
                              selectedIndexes: Array.from(selectedIndexes).sort((left, right) => left - right),
                              text: "",
                            });
                          }}
                        />
                        <span>{choice}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {currentQuestion.kind === "short_answer" ? (
                <textarea
                  rows={5}
                  value={currentAnswer?.text ?? ""}
                  onChange={(event) =>
                    updateAnswer({
                      selectedIndex: null,
                      selectedIndexes: [],
                      text: event.target.value,
                    })
                  }
                  placeholder="Type your answer"
                  style={styles.textarea}
                />
              ) : null}
            </div>

            <div style={styles.navRow}>
              <button
                type="button"
                style={{
                  ...styles.navButton,
                  ...(currentQuestionIndex === 0 ? styles.navButtonDisabled : null),
                }}
                onClick={() => setCurrentQuestionIndex((current) => Math.max(0, current - 1))}
                disabled={currentQuestionIndex === 0}
              >
                Previous
              </button>

              {currentQuestionIndex < activeQuiz.questions.length - 1 ? (
                <button
                  type="button"
                  style={{
                    ...styles.navButton,
                    ...styles.navButtonPrimary,
                  }}
                  onClick={() =>
                    setCurrentQuestionIndex((current) => Math.min(activeQuiz.questions.length - 1, current + 1))
                  }
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  style={{
                    ...styles.navButton,
                    ...styles.navButtonPrimary,
                  }}
                  onClick={submitQuiz}
                >
                  Finish
                </button>
              )}
            </div>
          </section>
        ) : null}

        {activeProgress.submitted && result ? (
          <section style={styles.resultsShell}>
            <div style={styles.card}>
              <h2 style={styles.resultTitle}>
                {result.correctCount}/{result.totalCount} correct
              </h2>
              <p style={styles.resultPercent}>{result.percent}%</p>
              <div style={styles.resultActions}>
                <button
                  type="button"
                  style={{
                    ...styles.navButton,
                    ...styles.navButtonPrimary,
                  }}
                  onClick={restartQuiz}
                >
                  Retake
                </button>
                <Link href={lessonHref} style={styles.link}>
                  Back to lesson
                </Link>
              </div>
            </div>

            <div style={styles.reviewList}>
              {result.questions.map((entry, index) => (
                <article
                  key={`${entry.question.kind}-${index}`}
                  style={{
                    ...styles.reviewCard,
                    ...(entry.correct ? styles.reviewCardCorrect : styles.reviewCardWrong),
                  }}
                >
                  <p style={styles.reviewMeta}>
                    Question {index + 1} • {getQuestionKindLabel(entry.question)}
                  </p>
                  <h3 style={styles.reviewPrompt}>{entry.question.prompt}</h3>
                  <p style={styles.reviewText}>Your answer: {entry.userAnswerLabel}</p>
                  <p style={styles.reviewText}>Correct answer: {entry.correctAnswerLabel}</p>
                  {entry.explanation ? <p style={styles.reviewExplanation}>{entry.explanation}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function getGeneratedQuiz(snapshot: LearnSessionSnapshot | null): QuizBlock | null {
  if (!snapshot) {
    return null;
  }

  if (snapshot.generatedQuiz) {
    return snapshot.generatedQuiz;
  }

  return snapshot.generatedBlock?.type === "quiz" ? snapshot.generatedBlock : null;
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    padding: "32px 20px 56px",
  },
  shell: {
    width: "100%",
    maxWidth: "760px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  headerCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  title: {
    margin: 0,
    fontSize: "1.28rem",
    lineHeight: 1.1,
    color: "var(--text-soft)",
  },
  metaText: {
    margin: 0,
    fontSize: "0.9rem",
    lineHeight: 1.5,
    color: "#6a5447",
  },
  link: {
    color: "var(--text-soft)",
    textDecoration: "none",
    fontSize: "0.92rem",
    fontWeight: 500,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    padding: "24px 22px",
    borderRadius: "18px",
    background: "var(--surface-1)",
    border: "1px solid var(--border)",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.06)",
  },
  bodyText: {
    margin: 0,
    fontSize: "0.96rem",
    lineHeight: 1.7,
    color: "var(--text-soft)",
  },
  progressRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  progressText: {
    fontSize: "0.84rem",
    lineHeight: 1.4,
    color: "#6a5447",
  },
  questionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  questionKind: {
    margin: 0,
    fontSize: "0.8rem",
    lineHeight: 1.4,
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    color: "var(--muted-strong)",
  },
  questionPrompt: {
    margin: 0,
    fontSize: "1.12rem",
    lineHeight: 1.45,
    color: "var(--text-soft)",
  },
  answerArea: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  optionList: {
    display: "grid",
    gap: "10px",
  },
  optionButton: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: "14px",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    padding: "14px 16px",
    textAlign: "left",
    fontSize: "0.95rem",
    lineHeight: 1.55,
    cursor: "pointer",
  },
  optionButtonSelected: {
    borderColor: "var(--border-strong)",
    background: "var(--surface-subtle)",
    color: "var(--accent-strong)",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "14px 16px",
    borderRadius: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    fontSize: "0.95rem",
    lineHeight: 1.55,
  },
  checkboxRowSelected: {
    borderColor: "var(--border-strong)",
    background: "var(--surface-subtle)",
  },
  textarea: {
    width: "100%",
    minHeight: "132px",
    borderRadius: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    background: "var(--surface-2)",
    padding: "14px 16px",
    resize: "vertical",
    font: "inherit",
    lineHeight: 1.6,
    color: "var(--text-soft)",
  },
  navRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  navButton: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: "999px",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    padding: "11px 16px",
    cursor: "pointer",
    fontSize: "0.92rem",
    fontWeight: 500,
  },
  navButtonPrimary: {
    background: "var(--surface-contrast)",
    borderColor: "var(--surface-contrast)",
    color: "#fff",
  },
  navButtonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  resultsShell: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  resultTitle: {
    margin: 0,
    fontSize: "1.4rem",
    lineHeight: 1.2,
    color: "var(--text-soft)",
  },
  resultPercent: {
    margin: 0,
    fontSize: "2rem",
    lineHeight: 1,
    fontWeight: 700,
    color: "var(--text-soft)",
  },
  resultActions: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    flexWrap: "wrap",
  },
  reviewList: {
    display: "grid",
    gap: "12px",
  },
  reviewCard: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "18px",
    borderRadius: "16px",
    border: "1px solid var(--border)",
    background: "var(--surface-muted)",
  },
  reviewCardCorrect: {
    borderColor: "rgba(36, 107, 74, 0.24)",
    background: "var(--success-subtle)",
  },
  reviewCardWrong: {
    borderColor: "rgba(162, 52, 52, 0.2)",
    background: "var(--danger-subtle)",
  },
  reviewMeta: {
    margin: 0,
    fontSize: "0.8rem",
    lineHeight: 1.4,
    color: "#6a5447",
  },
  reviewPrompt: {
    margin: 0,
    fontSize: "1rem",
    lineHeight: 1.45,
    color: "var(--text-soft)",
  },
  reviewText: {
    margin: 0,
    fontSize: "0.92rem",
    lineHeight: 1.6,
    color: "var(--text-soft)",
  },
  reviewExplanation: {
    margin: 0,
    fontSize: "0.88rem",
    lineHeight: 1.6,
    color: "var(--muted)",
  },
};
