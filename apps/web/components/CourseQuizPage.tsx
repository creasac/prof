"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { PersistedCourse, QuizBlock } from "@prof/contracts";

import { loadRemoteCourse } from "../lib/course-api";
import { buildCourseHref } from "../lib/course-route";
import { collectCourseQuizzes } from "../lib/course-view";
import {
  createEmptyQuizProgress,
  getQuestionKindLabel,
  gradeQuiz,
  questionHasAnswer,
  type QuizAnswerState,
  type QuizProgress,
} from "../lib/quiz";

type CourseQuizPageProps = {
  username: string;
  courseSlug: string;
  quizIndex: number;
};

export function CourseQuizPage({ username, courseSlug, quizIndex }: CourseQuizPageProps) {
  const [course, setCourse] = useState<PersistedCourse | null>(null);
  const [quiz, setQuiz] = useState<QuizBlock | null>(null);
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrateQuiz() {
      setIsLoaded(false);
      setPageError(null);

      try {
        const nextCourse = await loadRemoteCourse(username, courseSlug);
        if (cancelled) {
          return;
        }

        if (!nextCourse) {
          setCourse(null);
          setQuiz(null);
          setProgress(null);
          setPageError("Quiz not found.");
          setIsLoaded(true);
          return;
        }

        const quizzes = collectCourseQuizzes(nextCourse.snapshot);
        const entry = quizzes.find((candidate) => candidate.index === quizIndex) ?? null;

        setCourse(nextCourse);
        setQuiz(entry?.quiz ?? null);
        setProgress(entry ? createEmptyQuizProgress(entry.quiz, entry.topicId) : null);
        setCurrentQuestionIndex(0);
        setIsLoaded(true);
      } catch (error) {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Failed to load quiz.");
          setIsLoaded(true);
        }
      }
    }

    void hydrateQuiz();

    return () => {
      cancelled = true;
    };
  }, [courseSlug, quizIndex, username]);

  const result = useMemo(() => {
    if (!quiz || !progress || !progress.submitted) {
      return null;
    }

    return gradeQuiz(quiz, progress);
  }, [progress, quiz]);

  if (!isLoaded) {
    return null;
  }

  const backHref = buildCourseHref({
    username,
    courseSlug,
  });

  if (!course || !quiz || !progress) {
    return (
      <main style={styles.page}>
        <section style={styles.shell}>
          <header style={styles.header}>
            <h1 style={styles.title}>Quiz</h1>
            <Link href={backHref} style={styles.link}>
              Back to course
            </Link>
          </header>
          <div style={styles.card}>
            <p style={styles.bodyText}>{pageError ?? "Quiz is not available in this course."}</p>
          </div>
        </section>
      </main>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const currentAnswer = progress.answers[currentQuestionIndex];
  const answeredCount = quiz.questions.filter((question, index) => questionHasAnswer(question, progress.answers[index]))
    .length;

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

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Quiz</h1>
            <p style={styles.metaText}>{quiz.title}</p>
          </div>
          <Link href={backHref} style={styles.link}>
            Back to course
          </Link>
        </header>

        {!progress.submitted ? (
          <section style={styles.card}>
            <div style={styles.progressRow}>
              <span style={styles.progressText}>
                Question {currentQuestionIndex + 1} of {quiz.questions.length}
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
                      <button
                        key={choice}
                        type="button"
                        style={{
                          ...styles.optionButton,
                          ...(selected ? styles.optionButtonSelected : null),
                        }}
                        onClick={() => {
                          const selectedIndexes = currentAnswer?.selectedIndexes ?? [];
                          const nextSelectedIndexes = selected
                            ? selectedIndexes.filter((value) => value !== index)
                            : [...selectedIndexes, index].sort((left, right) => left - right);

                          updateAnswer({
                            selectedIndex: null,
                            selectedIndexes: nextSelectedIndexes,
                            text: "",
                          });
                        }}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {currentQuestion.kind === "short_answer" ? (
                <textarea
                  value={currentAnswer?.text ?? ""}
                  onChange={(event) =>
                    updateAnswer({
                      selectedIndex: null,
                      selectedIndexes: [],
                      text: event.target.value,
                    })
                  }
                  style={styles.textArea}
                  rows={6}
                />
              ) : null}
            </div>

            <div style={styles.navRow}>
              <button
                type="button"
                style={styles.navButton}
                onClick={() => setCurrentQuestionIndex((current) => Math.max(0, current - 1))}
                disabled={currentQuestionIndex === 0}
              >
                Previous
              </button>

              {currentQuestionIndex < quiz.questions.length - 1 ? (
                <button
                  type="button"
                  style={styles.navButton}
                  onClick={() =>
                    setCurrentQuestionIndex((current) => Math.min(quiz.questions.length - 1, current + 1))
                  }
                >
                  Next
                </button>
              ) : (
                <button type="button" style={styles.submitButton} onClick={() => setProgress((current) => (current ? { ...current, submitted: true } : current))}>
                  Submit
                </button>
              )}
            </div>
          </section>
        ) : (
          <section style={styles.card}>
            <p style={styles.scoreText}>
              Score: {result?.correctCount ?? 0}/{quiz.questions.length} ({result?.percent ?? 0}%)
            </p>
            <div style={styles.answerReview}>
              {quiz.questions.map((question, index) => (
                <article key={`${question.prompt}-${index}`} style={styles.reviewCard}>
                  <p style={styles.questionKind}>{getQuestionKindLabel(question)}</p>
                  <h2 style={styles.reviewPrompt}>{question.prompt}</h2>
                  <p style={styles.bodyText}>{question.explanation}</p>
                </article>
              ))}
            </div>

            <div style={styles.navRow}>
              <button type="button" style={styles.navButton} onClick={() => setProgress(createEmptyQuizProgress(quiz, progress.topicId))}>
                Restart
              </button>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    padding: "40px 20px 32px",
  },
  shell: {
    width: "100%",
    maxWidth: "860px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
  },
  title: {
    margin: 0,
    color: "#2c1c14",
    fontSize: "clamp(1.4rem, 4vw, 2.3rem)",
  },
  metaText: {
    margin: "6px 0 0",
    color: "#6a5447",
  },
  link: {
    borderRadius: "999px",
    border: "1px solid rgba(72, 42, 22, 0.12)",
    padding: "9px 14px",
    background: "rgba(255, 253, 248, 0.84)",
    color: "#5f473b",
    fontSize: "0.9rem",
    textDecoration: "none",
  },
  card: {
    borderRadius: "22px",
    border: "1px solid rgba(72, 42, 22, 0.08)",
    background: "rgba(255, 252, 247, 0.88)",
    boxShadow: "0 14px 34px rgba(93, 70, 51, 0.08)",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  bodyText: {
    margin: 0,
    color: "#4b392f",
    lineHeight: 1.6,
  },
  progressRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    color: "#6a5447",
    fontSize: "0.88rem",
  },
  progressText: {
    color: "#6a5447",
  },
  questionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  questionKind: {
    margin: 0,
    color: "#8a3715",
    fontSize: "0.82rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  questionPrompt: {
    margin: 0,
    color: "#2c1c14",
    fontSize: "1.2rem",
    lineHeight: 1.35,
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
    textAlign: "left",
    borderRadius: "14px",
    border: "1px solid rgba(72, 42, 22, 0.1)",
    padding: "12px 14px",
    background: "rgba(255, 253, 248, 0.84)",
    cursor: "pointer",
    color: "#2c1c14",
  },
  optionButtonSelected: {
    borderColor: "rgba(191, 91, 44, 0.24)",
    background: "rgba(255, 247, 239, 0.86)",
  },
  textArea: {
    width: "100%",
    borderRadius: "14px",
    border: "1px solid rgba(72, 42, 22, 0.12)",
    padding: "12px 14px",
    background: "rgba(255, 253, 248, 0.84)",
    resize: "vertical",
    font: "inherit",
    color: "#2c1c14",
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
  },
  navButton: {
    borderRadius: "999px",
    border: "1px solid rgba(72, 42, 22, 0.12)",
    padding: "10px 16px",
    background: "rgba(255, 253, 248, 0.84)",
    color: "#2c1c14",
    cursor: "pointer",
  },
  submitButton: {
    borderRadius: "999px",
    border: "none",
    padding: "10px 16px",
    background: "#8a3715",
    color: "#fff8f1",
    cursor: "pointer",
  },
  scoreText: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 600,
    color: "#2c1c14",
  },
  answerReview: {
    display: "grid",
    gap: "12px",
  },
  reviewCard: {
    borderRadius: "16px",
    border: "1px solid rgba(72, 42, 22, 0.08)",
    background: "rgba(255, 253, 248, 0.74)",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  reviewPrompt: {
    margin: 0,
    color: "#2c1c14",
    fontSize: "1rem",
  },
};
