import { tutorBlockSchema, type TutorBlockType } from "@prof/contracts";
import { z } from "zod";
import { normalizeLessonMarkdown } from "./markdown.js";

type TutorBlock = z.infer<typeof tutorBlockSchema>;

export function normalizeTutorBlock(raw: unknown, preferredType?: TutorBlockType) {
  const source = asRecord(raw);
  const type = inferBlockType(source, preferredType);

  switch (type) {
    case "lesson":
      return tutorBlockSchema.parse(normalizeLessonBlock(source));
    case "quiz":
      return tutorBlockSchema.parse(normalizeQuizBlock(source));
    case "flashcards":
      return tutorBlockSchema.parse(normalizeFlashcardsBlock(source));
    case "essay_prompt":
      return tutorBlockSchema.parse(normalizeEssayPromptBlock(source));
    case "follow_up_question":
      return tutorBlockSchema.parse(normalizeFollowUpQuestionBlock(source));
  }
}

function normalizeLessonBlock(source: Record<string, unknown>): TutorBlock {
  const title = clampString(source.title, 120, "Focused lesson");
  const summary = clampString(source.summary, 280, `Learn the essentials of ${title.toLowerCase()}.`);
  const contentMarkdown = normalizeLessonMarkdown(
    clampMultilineString(
      source.contentMarkdown,
      [summary, stringifyMaybe(source.prompt), stringifyMaybe(source.reason)].filter(Boolean).join("\n\n"),
      "A focused explanation of the topic.",
    ),
  );

  return {
    type: "lesson",
    title,
    summary,
    contentMarkdown,
    objectives: ensureNonEmptyArray(
      sanitizeStringArray(source.objectives, 120, 5),
      `Understand ${title.toLowerCase()}.`,
    ),
  };
}

function normalizeQuizBlock(source: Record<string, unknown>): TutorBlock {
  const title = clampString(source.title, 120, "Quick quiz");
  const questions = ensureNonEmptyArray(
    sanitizeQuizQuestions(source.questions),
    buildFallbackShortAnswerQuestion(title),
  );

  return {
    type: "quiz",
    title,
    instructions: clampString(source.instructions, 280, `Answer the questions about ${title.toLowerCase()}.`),
    questions,
  };
}

function normalizeFlashcardsBlock(source: Record<string, unknown>): TutorBlock {
  const title = clampString(source.title, 120, "Flashcards");
  const cards = sanitizeFlashcards(source.cards);

  return {
    type: "flashcards",
    title,
    cards:
      cards.length >= 2
        ? cards
        : [
            {
              front: title,
              back: `Core idea: ${title.toLowerCase()}.`,
            },
            {
              front: `Use ${title}`,
              back: `Apply ${title.toLowerCase()} in one focused example.`,
            },
          ],
  };
}

function normalizeEssayPromptBlock(source: Record<string, unknown>): TutorBlock {
  const title = clampString(source.title, 120, "Writing prompt");
  const prompt = clampMultilineString(
    source.prompt,
    stringifyMaybe(source.summary),
    `Explain ${title.toLowerCase()} clearly and concisely.`,
  );

  return {
    type: "essay_prompt",
    title,
    prompt,
    guidance: ensureNonEmptyArray(
      sanitizeStringArray(source.guidance, 120, 5),
      "Support your answer with concrete examples.",
    ),
  };
}

function normalizeFollowUpQuestionBlock(source: Record<string, unknown>): TutorBlock {
  const prompt = clampMultilineString(
    source.prompt,
    stringifyMaybe(source.title),
    "What would you like Prof to focus on next?",
  );

  return {
    type: "follow_up_question",
    prompt,
    reason: clampString(source.reason, 200, "A small clarification will help tailor the next step."),
  };
}

function sanitizeQuizQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      const question = asRecord(entry);
      const kind = inferQuestionKind(question);
      const prompt = clampMultilineString(question.prompt, stringifyMaybe(question.question), `Question ${index + 1}`);

      if (kind === "multiple_choice") {
        const choices = ensureMinChoices(sanitizeStringArray(question.choices, 120, 6));

        return {
          kind: "multiple_choice" as const,
          prompt,
          choices,
          answerIndex: clampInteger(question.answerIndex, 0, choices.length - 1, 0),
          explanation: clampString(
            question.explanation,
            280,
            `The correct answer is the option that best matches ${prompt.toLowerCase()}.`,
          ),
        };
      }

      if (kind === "multiple_select") {
        const choices = ensureMinChoices(sanitizeStringArray(question.choices, 120, 6), 3);
        const answerIndexes = ensureAnswerIndexes(question, choices.length);

        return {
          kind: "multiple_select" as const,
          prompt,
          choices,
          answerIndexes,
          explanation: clampString(
            question.explanation,
            280,
            `The correct answers are the choices that best match ${prompt.toLowerCase()}.`,
          ),
        };
      }

      const expectedAnswer = clampMultilineString(
        question.expectedAnswer,
        stringifyMaybe(question.answer),
        "A concise correct explanation of the core idea.",
      );

      return {
        kind: "short_answer" as const,
        prompt,
        expectedAnswer,
        acceptableAnswers: ensureNonEmptyArray(
          sanitizeAcceptableAnswers(question.acceptableAnswers, expectedAnswer),
          expectedAnswer,
        ),
        rubric: clampString(
          question.rubric,
          280,
          "Check whether the answer is accurate, specific, and grounded in the topic.",
        ),
      };
    })
    .slice(0, 5);
}

function sanitizeFlashcards(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      const card = asRecord(entry);
      const front = clampMultilineString(card.front, stringifyMaybe(card.term), `Card ${index + 1}`);
      const back = clampMultilineString(
        card.back,
        stringifyMaybe(card.definition),
        `Core explanation for ${front.toLowerCase()}.`,
      );

      return {
        front,
        back,
      };
    })
    .filter((card) => card.front && card.back)
    .slice(0, 8);
}

function buildFallbackShortAnswerQuestion(title: string) {
  return {
    kind: "short_answer" as const,
    prompt: `What is the core idea of ${title.toLowerCase()}?`,
    expectedAnswer: `A concise explanation of ${title.toLowerCase()}.`,
    acceptableAnswers: [`A concise explanation of ${title.toLowerCase()}.`],
    rubric: "Check whether the answer captures the main idea clearly and accurately.",
  };
}

function inferBlockType(source: Record<string, unknown>, preferredType?: TutorBlockType): TutorBlockType {
  if (isTutorBlockType(source.type)) {
    return source.type;
  }

  if (Array.isArray(source.questions)) {
    return "quiz";
  }

  if (Array.isArray(source.cards)) {
    return "flashcards";
  }

  if (Array.isArray(source.guidance)) {
    return "essay_prompt";
  }

  if (source.reason !== undefined) {
    return "follow_up_question";
  }

  if (source.contentMarkdown !== undefined || source.objectives !== undefined) {
    return "lesson";
  }

  return preferredType ?? "lesson";
}

function inferQuestionKind(source: Record<string, unknown>) {
  if (source.kind === "multiple_choice" || source.kind === "multiple_select" || source.kind === "short_answer") {
    return source.kind;
  }

  if (Array.isArray(source.answerIndexes)) {
    return "multiple_select";
  }

  return Array.isArray(source.choices) ? "multiple_choice" : "short_answer";
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function isTutorBlockType(value: unknown): value is TutorBlockType {
  return (
    value === "lesson" ||
    value === "quiz" ||
    value === "flashcards" ||
    value === "essay_prompt" ||
    value === "follow_up_question"
  );
}

function clampString(value: unknown, maxLength: number, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}

function clampMultilineString(value: unknown, secondaryFallback: string, fallback: string) {
  if (typeof value !== "string") {
    return secondaryFallback.trim() || fallback;
  }

  const normalized = value.trim();
  if (!normalized) {
    return secondaryFallback.trim() || fallback;
  }

  return normalized;
}

function sanitizeStringArray(value: unknown, maxItemLength: number, maxItems: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => clampString(entry, maxItemLength, ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

function ensureNonEmptyArray<T>(items: T[], fallback: T) {
  return items.length > 0 ? items : [fallback];
}

function ensureMinChoices(choices: string[], minimum = 2) {
  if (choices.length >= minimum) {
    return choices;
  }

  const nextChoices = [...choices];

  while (nextChoices.length < minimum) {
    nextChoices.push(`Option ${nextChoices.length + 1}`);
  }

  return nextChoices;
}

function ensureAnswerIndexes(question: Record<string, unknown>, choiceCount: number) {
  const rawValues = Array.isArray(question.answerIndexes)
    ? question.answerIndexes
    : typeof question.answerIndex === "number"
      ? [question.answerIndex]
      : [];

  const values = rawValues
    .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
    .map((entry) => clampInteger(entry, 0, choiceCount - 1, 0));

  const uniqueValues = Array.from(new Set(values)).slice(0, Math.min(4, choiceCount));
  return uniqueValues.length > 0 ? uniqueValues : [0];
}

function sanitizeAcceptableAnswers(value: unknown, expectedAnswer: string) {
  const nextAnswers = sanitizeStringArray(value, 160, 4);

  if (nextAnswers.length > 0) {
    return nextAnswers;
  }

  return expectedAnswer ? [expectedAnswer] : [];
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function stringifyMaybe(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
