import type { QuizBlock, QuizQuestion } from "@prof/contracts";

export type QuizAnswerState = {
  selectedIndex: number | null;
  selectedIndexes: number[];
  text: string;
};

export type QuizProgress = {
  topicId: string | null;
  submitted: boolean;
  answers: QuizAnswerState[];
};

export type QuizQuestionResult = {
  question: QuizQuestion;
  correct: boolean;
  userAnswerLabel: string;
  correctAnswerLabel: string;
  explanation: string | null;
};

export type QuizResult = {
  answeredCount: number;
  correctCount: number;
  totalCount: number;
  percent: number;
  questions: QuizQuestionResult[];
};

export function createEmptyQuizProgress(quiz: QuizBlock, topicId: string | null): QuizProgress {
  return {
    topicId,
    submitted: false,
    answers: quiz.questions.map(() => ({
      selectedIndex: null,
      selectedIndexes: [],
      text: "",
    })),
  };
}

export function ensureQuizProgress(
  quiz: QuizBlock,
  progress: QuizProgress | null | undefined,
  topicId: string | null,
) {
  if (!progress || progress.topicId !== topicId || progress.answers.length !== quiz.questions.length) {
    return createEmptyQuizProgress(quiz, topicId);
  }

  return {
    ...progress,
    answers: quiz.questions.map((_, index) => ({
      selectedIndex: progress.answers[index]?.selectedIndex ?? null,
      selectedIndexes: Array.isArray(progress.answers[index]?.selectedIndexes)
        ? progress.answers[index]?.selectedIndexes ?? []
        : [],
      text: typeof progress.answers[index]?.text === "string" ? progress.answers[index]?.text ?? "" : "",
    })),
  };
}

export function questionHasAnswer(question: QuizQuestion, answer: QuizAnswerState | undefined) {
  if (!answer) {
    return false;
  }

  switch (question.kind) {
    case "multiple_choice":
      return answer.selectedIndex !== null;
    case "multiple_select":
      return answer.selectedIndexes.length > 0;
    case "short_answer":
      return answer.text.trim().length > 0;
  }
}

export function gradeQuiz(quiz: QuizBlock, progress: QuizProgress) {
  const questions = quiz.questions.map((question, index): QuizQuestionResult => {
    const answer = progress.answers[index];

    switch (question.kind) {
      case "multiple_choice": {
        const selectedIndex = answer?.selectedIndex ?? null;
        return {
          question,
          correct: selectedIndex === question.answerIndex,
          userAnswerLabel: selectedIndex === null ? "No answer" : question.choices[selectedIndex] ?? "No answer",
          correctAnswerLabel: question.choices[question.answerIndex] ?? "Unknown answer",
          explanation: question.explanation,
        };
      }
      case "multiple_select": {
        const selectedIndexes = normalizeIndexList(answer?.selectedIndexes ?? []);
        const correctIndexes = normalizeIndexList(question.answerIndexes);
        return {
          question,
          correct:
            selectedIndexes.length === correctIndexes.length &&
            selectedIndexes.every((value, answerIndex) => value === correctIndexes[answerIndex]),
          userAnswerLabel:
            selectedIndexes.length > 0
              ? selectedIndexes.map((value) => question.choices[value] ?? `Option ${value + 1}`).join(", ")
              : "No answer",
          correctAnswerLabel: correctIndexes
            .map((value) => question.choices[value] ?? `Option ${value + 1}`)
            .join(", "),
          explanation: question.explanation,
        };
      }
      case "short_answer": {
        const normalizedInput = normalizeShortAnswer(answer?.text ?? "");
        const acceptedAnswers = question.acceptableAnswers.map(normalizeShortAnswer);
        return {
          question,
          correct: normalizedInput.length > 0 && acceptedAnswers.includes(normalizedInput),
          userAnswerLabel: answer?.text.trim() ? answer.text.trim() : "No answer",
          correctAnswerLabel: question.expectedAnswer,
          explanation: question.rubric,
        };
      }
      default:
        return assertNever(question);
    }
  });

  const answeredCount = quiz.questions.filter((question, index) => questionHasAnswer(question, progress.answers[index])).length;
  const correctCount = questions.filter((entry) => entry.correct).length;
  const totalCount = questions.length;

  return {
    answeredCount,
    correctCount,
    totalCount,
    percent: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
    questions,
  } satisfies QuizResult;
}

export function getQuestionKindLabel(question: QuizQuestion) {
  switch (question.kind) {
    case "multiple_choice":
      return "Multiple choice";
    case "multiple_select":
      return "Select all";
    case "short_answer":
      return "Short answer";
    default:
      return assertNever(question);
  }
}

function normalizeIndexList(values: number[]) {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function normalizeShortAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function assertNever(value: never): never {
  throw new Error(`Unexpected quiz question kind: ${JSON.stringify(value)}`);
}
