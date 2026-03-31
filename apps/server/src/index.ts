import express from "express";
import cors from "cors";
import {
  flashcardSchema,
  appConfigSchema,
  learnCourseSeedSchema,
  lessonQuizRequestSchema,
  lessonQuizResponseSchema,
  learnSessionSnapshotSchema,
  plannedTopicBlockRequestSchema,
  plannedTopicBlockResponseSchema,
  privateProfileSchema,
  quizBlockSchema,
  reasoningTopicBlockStreamEventSchema,
  planningModelResultSchema,
  quizQuestionSchema,
  reasoningBlockRequestSchema,
  reasoningBlockResponseSchema,
  reasoningPlanRequestSchema,
  reasoningPlanStreamEventSchema,
  reasoningPlanResponseSchema,
  reasoningChatRequestSchema,
  reasoningChatResponseSchema,
  tutorBlockSchema,
  tutorBlockTypeSchema,
  voiceSessionResponseSchema,
  type Flashcard,
  type QuizQuestion,
  type TutorBlockType,
} from "@prof/contracts";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ZodError, z } from "zod";

import { authHandler, getAuthSession, isAuthEnabled } from "./auth.js";
import { isDatabaseEnabled } from "./db/client.js";
import { env } from "./env.js";
import {
  listLearnCoursesForUser,
  readLearnCourseForUser,
  readLearnSessionForUser,
  saveLearnSessionForUser,
} from "./learn-sessions.js";
import {
  normalizePlanningResult,
  normalizeStreamedClarification,
  normalizeStreamedPlanMeta,
  normalizeStreamedTopic,
} from "./planning.js";
import {
  buildLessonQuizPrompt,
  buildPlannedTopicPrompt,
  buildReasoningPlanPrompt,
  buildStreamingPlannedTopicPrompt,
  buildStreamingPlanPrompt,
  buildTutorBlockPrompt,
  buildChatPrompt,
  findPlanTopic,
} from "./prompts.js";
import { generateReasoningContent, generateReasoningContentStream } from "./reasoning-runtime.js";
import { isReasoningEnabled } from "./providers/reasoning/index.js";
import { isSearchEnabled } from "./providers/search/index.js";
import { normalizeTutorBlock } from "./tutor.js";
import { createVoiceSession, isVoiceEnabled } from "./providers/voice/index.js";

const app = express();

const allowedOrigins = env.WEB_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = env.NODE_ENV === "development" ? true : allowedOrigins.length > 0 ? allowedOrigins : true;

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);

app.all("/api/auth/*", async (req, res) => {
  if (!authHandler) {
    res.status(503).json({
      error: "Authentication is not configured. Set DATABASE_URL and AUTH_SECRET to enable auth.",
    });
    return;
  }

  await authHandler(req, res);
});

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    capabilities: {
      auth: isAuthEnabled,
      persistence: isDatabaseEnabled,
      voice: isVoiceEnabled(),
      reasoning: isReasoningEnabled(),
      search: isSearchEnabled(),
    },
  });
});

app.get("/api/config", (_req, res) => {
  res.json(
    appConfigSchema.parse({
      voice: {
        enabled: isVoiceEnabled(),
      },
      reasoning: {
        enabled: isReasoningEnabled(),
      },
      search: {
        enabled: isSearchEnabled(),
      },
    }),
  );
});

app.get("/api/learn/sessions/:sessionId", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const sessionRecord = await readLearnSessionForUser(authSession.user.id, req.params.sessionId);

    if (!sessionRecord) {
      res.status(404).json({
        error: `Learn session ${req.params.sessionId} was not found.`,
      });
      return;
    }

    res.json(sessionRecord);
  } catch (error) {
    next(error);
  }
});

app.get("/api/learn/courses/:courseId", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const courseRecord = await readLearnCourseForUser(authSession.user.id, req.params.courseId);

    if (!courseRecord) {
      res.status(404).json({
        error: `Course ${req.params.courseId} was not found.`,
      });
      return;
    }

    res.json(learnCourseSeedSchema.parse(courseRecord));
  } catch (error) {
    next(error);
  }
});

app.put("/api/learn/sessions/:sessionId", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const snapshot = learnSessionSnapshotSchema.parse(req.body);
    const persistedSession = await saveLearnSessionForUser(authSession.user.id, req.params.sessionId, snapshot);
    res.json(persistedSession);
  } catch (error) {
    next(error);
  }
});

app.get("/api/profile/:username", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const sessionUsername = getSessionUsername(authSession);
    const requestedUsername = req.params.username.trim().toLowerCase();

    if (!sessionUsername || sessionUsername !== requestedUsername) {
      res.status(404).json({
        error: "Profile not found.",
      });
      return;
    }

    const courses = await listLearnCoursesForUser(authSession.user.id);

    res.json(
      privateProfileSchema.parse({
        username: sessionUsername,
        courses,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/voice/session", async (_req, res, next) => {
  try {
    const session = await createVoiceSession();
    res.json(voiceSessionResponseSchema.parse(session));
  } catch (error) {
    next(error);
  }
});

app.post("/api/reasoning/block", async (req, res, next) => {
  try {
    const input = reasoningBlockRequestSchema.parse(req.body);
    const schema = zodToJsonSchema(tutorBlockSchema, {
      $refStrategy: "none",
    });

    const response = await generateReasoningContent({
      prompt: buildTutorBlockPrompt(input),
      searchQuery: input.goal,
      useWebSearch: input.useWebSearch,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
      emptyResponseError: "Reasoning model returned an empty response.",
    });

    const rawBlock = JSON.parse(response.text);
    const block = normalizeTutorBlock(rawBlock, input.preferredBlockType);

    res.json(
      reasoningBlockResponseSchema.parse({
        block,
        sources: response.sources,
        model: response.model,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/reasoning/plan/stream", async (req, res, next) => {
  try {
    const requestParse = reasoningPlanRequestSchema.safeParse(req.body);
    if (!requestParse.success) {
      res.status(400).json({
        error: "Invalid request",
        details: requestParse.error.flatten(),
      });
      return;
    }

    const input = requestParse.data;
    const { stream, model, sources } = await generateReasoningContentStream({
      prompt: buildStreamingPlanPrompt(input),
      searchQuery: input.userInput || input.goal,
      useWebSearch: input.useWebSearch,
      config: {},
    });

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let buffer = "";
    let streamedMeta: ReturnType<typeof normalizeStreamedPlanMeta> | null = null;
    let streamedClarification: ReturnType<typeof normalizeStreamedClarification> | null = null;
    const streamedTopics: Array<ReturnType<typeof normalizeStreamedTopic>> = [];

    for await (const chunk of stream) {
      if (!chunk.text) {
        continue;
      }

      buffer += chunk.text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const parsedLine = parseStreamingPlanLine(line);
        if (!parsedLine) {
          continue;
        }

        switch (parsedLine.type) {
          case "meta": {
            streamedMeta = normalizeStreamedPlanMeta(parsedLine.meta);
            writeNdjson(
              res,
              reasoningPlanStreamEventSchema.parse({
                type: "meta",
                meta: streamedMeta,
              }),
            );
            break;
          }
          case "topic": {
            const topic = normalizeStreamedTopic(parsedLine.topic, streamedTopics.length + 1);
            streamedTopics.push(topic);
            writeNdjson(
              res,
              reasoningPlanStreamEventSchema.parse({
                type: "topic",
                topic,
              }),
            );
            break;
          }
          case "clarification": {
            streamedClarification = normalizeStreamedClarification(parsedLine.clarification);
            writeNdjson(
              res,
              reasoningPlanStreamEventSchema.parse({
                type: "clarification",
                clarification: streamedClarification,
              }),
            );
            break;
          }
          default:
            break;
        }
      }
    }

    const trailingLine = parseStreamingPlanLine(buffer);
    if (trailingLine?.type === "meta") {
      streamedMeta = normalizeStreamedPlanMeta(trailingLine.meta);
      writeNdjson(
        res,
        reasoningPlanStreamEventSchema.parse({
          type: "meta",
          meta: streamedMeta,
        }),
      );
    } else if (trailingLine?.type === "topic") {
      const topic = normalizeStreamedTopic(trailingLine.topic, streamedTopics.length + 1);
      streamedTopics.push(topic);
      writeNdjson(
        res,
        reasoningPlanStreamEventSchema.parse({
          type: "topic",
          topic,
        }),
      );
    } else if (trailingLine?.type === "clarification") {
      streamedClarification = normalizeStreamedClarification(trailingLine.clarification);
      writeNdjson(
        res,
        reasoningPlanStreamEventSchema.parse({
          type: "clarification",
          clarification: streamedClarification,
        }),
      );
    }

    const payload = streamedClarification
      ? reasoningPlanResponseSchema.parse({
          result: "clarification",
          clarification: streamedClarification,
          sources,
          model,
        })
      : reasoningPlanResponseSchema.parse({
          ...normalizePlanningResult({
            result: "plan",
            plan: {
              requestType: streamedMeta?.requestType,
              layout: "flat",
              title: streamedMeta?.title,
              recommendedStartingTopicId: streamedMeta?.recommendedStartingTopicId,
              topics: streamedTopics,
            },
          }),
          sources,
          model,
        });

    writeNdjson(
      res,
      reasoningPlanStreamEventSchema.parse({
        type: "final",
        payload,
      }),
    );
    res.end();
  } catch (error) {
    if (res.headersSent) {
      writeNdjson(
        res,
        reasoningPlanStreamEventSchema.parse({
          type: "error",
          error: error instanceof Error ? error.message : "Planning request failed.",
        }),
      );
      res.end();
      return;
    }

    next(error);
  }
});

app.post("/api/reasoning/plan", async (req, res, next) => {
  try {
    const requestParse = reasoningPlanRequestSchema.safeParse(req.body);
    if (!requestParse.success) {
      res.status(400).json({
        error: "Invalid request",
        details: requestParse.error.flatten(),
      });
      return;
    }

    const input = requestParse.data;
    const schema = zodToJsonSchema(planningModelResultSchema, {
      $refStrategy: "none",
    });

    const response = await generateReasoningContent({
      prompt: buildReasoningPlanPrompt(input),
      searchQuery: input.userInput || input.goal,
      useWebSearch: input.useWebSearch,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
      emptyResponseError: "Reasoning model returned an empty response.",
    });

    const responseParse = planningModelResultSchema.safeParse(JSON.parse(response.text));
    if (!responseParse.success) {
      throw new Error("Planner returned invalid structured output.");
    }

    const result = normalizePlanningResult(responseParse.data);

    res.json(
      reasoningPlanResponseSchema.parse({
        ...result,
        sources: response.sources,
        model: response.model,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/reasoning/topic-block/stream", async (req, res, next) => {
  try {
    const input = plannedTopicBlockRequestSchema.parse(req.body);
    const topic = findPlanTopic(input.plan, input.topicId);

    if (!topic) {
      res.status(404).json({
        error: `Topic ${input.topicId} was not found in the supplied plan.`,
      });
      return;
    }

    const { stream, model, sources } = await generateReasoningContentStream({
      prompt: buildStreamingPlannedTopicPrompt(input, topic),
      searchQuery: `${input.goal}\nTopic: ${topic.title}\n${topic.summary}`,
      useWebSearch: input.useWebSearch,
      config: {},
    });

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let buffer = "";
    const draft = createStreamingTopicBlockDraft(topic.title);

    for await (const chunk of stream) {
      if (!chunk.text) {
        continue;
      }

      buffer += chunk.text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseStreamingTopicBlockLine(line);
        if (!event) {
          continue;
        }

        if (event.type === "done") {
          continue;
        }

        applyStreamingTopicBlockEvent(draft, event);
        writeNdjson(res, event);
      }
    }

    const trailingEvent = parseStreamingTopicBlockLine(buffer);
    if (trailingEvent && trailingEvent.type !== "done") {
      applyStreamingTopicBlockEvent(draft, trailingEvent);
      writeNdjson(res, trailingEvent);
    }

    const block = normalizeTutorBlock(buildStreamingTopicBlockPayload(draft), input.preferredBlockType);

    writeNdjson(
      res,
      reasoningTopicBlockStreamEventSchema.parse({
        type: "final",
        payload: plannedTopicBlockResponseSchema.parse({
          block,
          topicId: input.topicId,
          sources,
          model,
        }),
      }),
    );
    res.end();
  } catch (error) {
    if (res.headersSent) {
      writeNdjson(
        res,
        reasoningTopicBlockStreamEventSchema.parse({
          type: "error",
          error: error instanceof Error ? error.message : "Topic generation failed.",
        }),
      );
      res.end();
      return;
    }

    next(error);
  }
});

app.post("/api/reasoning/topic-block", async (req, res, next) => {
  try {
    const input = plannedTopicBlockRequestSchema.parse(req.body);
    const topic = findPlanTopic(input.plan, input.topicId);

    if (!topic) {
      res.status(404).json({
        error: `Topic ${input.topicId} was not found in the supplied plan.`,
      });
      return;
    }

    const schema = zodToJsonSchema(tutorBlockSchema, {
      $refStrategy: "none",
    });

    const response = await generateReasoningContent({
      prompt: buildPlannedTopicPrompt(input, topic),
      searchQuery: `${input.goal}\nTopic: ${topic.title}\n${topic.summary}`,
      useWebSearch: input.useWebSearch,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
      emptyResponseError: "Reasoning model returned an empty response.",
    });

    const rawBlock = JSON.parse(response.text);
    const block = normalizeTutorBlock(rawBlock, input.preferredBlockType);

    res.json(
      plannedTopicBlockResponseSchema.parse({
        block,
        topicId: input.topicId,
        sources: response.sources,
        model: response.model,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/reasoning/topic-quiz", async (req, res, next) => {
  try {
    const input = lessonQuizRequestSchema.parse(req.body);
    const schema = zodToJsonSchema(quizBlockSchema, {
      $refStrategy: "none",
    });

    const response = await generateReasoningContent({
      prompt: buildLessonQuizPrompt(input),
      searchQuery: `${input.topicTitle}\n${input.lesson.title}`,
      useWebSearch: false,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
      emptyResponseError: "Reasoning model returned an empty quiz response.",
    });

    const rawQuiz = JSON.parse(response.text);
    const block = normalizeTutorBlock(rawQuiz, "quiz");

    if (block.type !== "quiz") {
      throw new Error("Reasoning model returned a non-quiz block.");
    }

    res.json(
      lessonQuizResponseSchema.parse({
        topicId: input.topicId,
        quiz: block,
        model: response.model,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/reasoning/chat", async (req, res, next) => {
  try {
    const requestParse = reasoningChatRequestSchema.safeParse(req.body);
    if (!requestParse.success) {
      res.status(400).json({
        error: "Invalid request",
        details: requestParse.error.flatten(),
      });
      return;
    }

    const input = requestParse.data;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        responseType: {
          type: "STRING",
          enum: ["chat", "artifact_create", "artifact_update"],
        },
        targetPanel: {
          type: "STRING",
          enum: ["chat", "learn"],
        },
        content: {
          type: "STRING",
        },
        artifact: {
          type: "OBJECT",
        },
        plan: {
          type: "OBJECT",
        },
      },
      required: ["responseType", "targetPanel"],
    };

    const response = await generateReasoningContent({
      prompt: buildChatPrompt(input),
      searchQuery: input.message,
      useWebSearch: input.useWebSearch,
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
      emptyResponseError: "Reasoning model returned an empty response.",
    });

    const parsed = reasoningChatResponseSchema.parse(JSON.parse(response.text));

    res.json({
      ...parsed,
      sources: response.sources.length > 0 ? response.sources : undefined,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(500).json({
      error: "Structured output validation failed",
      details: error.flatten(),
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(500).json({ error: message });
});

app.listen(env.PORT, () => {
  console.log(`prof server listening on http://localhost:${env.PORT}`);
});

async function requireUserSession(req: express.Request, res: express.Response) {
  if (!isAuthEnabled) {
    res.status(503).json({
      error: "Authentication is not configured. Set DATABASE_URL and AUTH_SECRET to enable auth.",
    });
    return null;
  }

  const authSession = await getAuthSession(req.headers);

  if (!authSession?.user?.id) {
    res.status(401).json({
      error: "You must be signed in to access saved learn sessions.",
    });
    return null;
  }

  return authSession;
}

function getSessionUsername(authSession: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>) {
  const username = "username" in authSession.user ? authSession.user.username : null;
  return typeof username === "string" && username.trim() ? username.trim().toLowerCase() : null;
}

function writeNdjson(res: express.Response, value: unknown) {
  res.write(`${JSON.stringify(value)}\n`);
}

function parseStreamingPlanLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
    return null;
  }

  const event = parsed as {
    type?: unknown;
    meta?: unknown;
    topic?: unknown;
    clarification?: unknown;
  };

  switch (event.type) {
    case "meta":
      return {
        type: "meta" as const,
        meta: event.meta,
      };
    case "topic":
      return {
        type: "topic" as const,
        topic: event.topic,
      };
    case "clarification":
      return {
        type: "clarification" as const,
        clarification: event.clarification,
      };
    case "done":
      return {
        type: "done" as const,
      };
    default:
      return null;
  }
}

const streamingTopicBlockModelMetaEventSchema = z.object({
  type: z.literal("meta"),
  meta: z.object({
    blockType: tutorBlockTypeSchema,
    title: z.string().min(1).max(120).optional(),
  }),
});

const streamingTopicBlockModelLessonEventSchema = z.object({
  type: z.literal("lesson"),
  lesson: z.object({
    summary: z.string().min(1).max(280).optional(),
    objectives: z.array(z.string().min(1).max(120)).max(5).optional(),
  }),
});

const streamingTopicBlockModelMarkdownEventSchema = z.object({
  type: z.literal("markdown"),
  markdown: z.string(),
});

const streamingTopicBlockModelQuizEventSchema = z.object({
  type: z.literal("quiz"),
  quiz: z.object({
    instructions: z.string().min(1).max(280).optional(),
  }),
});

const streamingTopicBlockModelQuestionEventSchema = z.object({
  type: z.literal("question"),
  question: quizQuestionSchema,
});

const streamingTopicBlockModelCardEventSchema = z.object({
  type: z.literal("card"),
  card: flashcardSchema,
});

const streamingTopicBlockModelEssayEventSchema = z.object({
  type: z.literal("essay"),
  essay: z.object({
    prompt: z.string().min(1).optional(),
    guidance: z.array(z.string().min(1).max(120)).max(5).optional(),
  }),
});

const streamingTopicBlockModelFollowUpEventSchema = z.object({
  type: z.literal("follow_up"),
  followUp: z.object({
    prompt: z.string().min(1).optional(),
    reason: z.string().min(1).max(200).optional(),
  }),
});

const streamingTopicBlockModelDoneEventSchema = z.object({
  type: z.literal("done"),
});

const streamingTopicBlockModelEventSchema = z.discriminatedUnion("type", [
  streamingTopicBlockModelMetaEventSchema,
  streamingTopicBlockModelLessonEventSchema,
  streamingTopicBlockModelMarkdownEventSchema,
  streamingTopicBlockModelQuizEventSchema,
  streamingTopicBlockModelQuestionEventSchema,
  streamingTopicBlockModelCardEventSchema,
  streamingTopicBlockModelEssayEventSchema,
  streamingTopicBlockModelFollowUpEventSchema,
  streamingTopicBlockModelDoneEventSchema,
]);

type StreamingTopicBlockModelEvent = z.infer<typeof streamingTopicBlockModelEventSchema>;

type StreamingTopicBlockDraft = {
  type: TutorBlockType;
  title: string;
  summary: string;
  contentMarkdown: string;
  objectives: string[];
  instructions: string;
  questions: QuizQuestion[];
  cards: Flashcard[];
  prompt: string;
  guidance: string[];
  reason: string;
};

function createStreamingTopicBlockDraft(topicTitle: string): StreamingTopicBlockDraft {
  return {
    type: "lesson",
    title: topicTitle,
    summary: "",
    contentMarkdown: "",
    objectives: [],
    instructions: "",
    questions: [],
    cards: [],
    prompt: "",
    guidance: [],
    reason: "",
  };
}

function parseStreamingTopicBlockLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const event = streamingTopicBlockModelEventSchema.safeParse(parsed);
  return event.success ? event.data : null;
}

function applyStreamingTopicBlockEvent(draft: StreamingTopicBlockDraft, event: StreamingTopicBlockModelEvent) {
  switch (event.type) {
    case "meta":
      draft.type = event.meta.blockType;
      if (event.meta.title?.trim()) {
        draft.title = event.meta.title.trim();
      }
      return;
    case "lesson":
      if (event.lesson.summary?.trim()) {
        draft.summary = event.lesson.summary.trim();
      }
      if (event.lesson.objectives) {
        draft.objectives = event.lesson.objectives;
      }
      return;
    case "markdown":
      draft.contentMarkdown += event.markdown;
      return;
    case "quiz":
      if (event.quiz.instructions?.trim()) {
        draft.instructions = event.quiz.instructions.trim();
      }
      return;
    case "question":
      draft.questions = [...draft.questions, event.question].slice(0, 5);
      return;
    case "card":
      draft.cards = [...draft.cards, event.card].slice(0, 8);
      return;
    case "essay":
      if (event.essay.prompt?.trim()) {
        draft.prompt = event.essay.prompt.trim();
      }
      if (event.essay.guidance) {
        draft.guidance = event.essay.guidance;
      }
      return;
    case "follow_up":
      if (event.followUp.prompt?.trim()) {
        draft.prompt = event.followUp.prompt.trim();
      }
      if (event.followUp.reason?.trim()) {
        draft.reason = event.followUp.reason.trim();
      }
      return;
    case "done":
      return;
  }
}

function buildStreamingTopicBlockPayload(draft: StreamingTopicBlockDraft) {
  switch (draft.type) {
    case "lesson":
      return {
        type: "lesson" as const,
        title: draft.title,
        summary: draft.summary,
        contentMarkdown: draft.contentMarkdown,
        objectives: draft.objectives,
      };
    case "quiz":
      return {
        type: "quiz" as const,
        title: draft.title,
        instructions: draft.instructions,
        questions: draft.questions,
      };
    case "flashcards":
      return {
        type: "flashcards" as const,
        title: draft.title,
        cards: draft.cards,
      };
    case "essay_prompt":
      return {
        type: "essay_prompt" as const,
        title: draft.title,
        prompt: draft.prompt,
        guidance: draft.guidance,
      };
    case "follow_up_question":
      return {
        type: "follow_up_question" as const,
        prompt: draft.prompt,
        reason: draft.reason,
      };
  }
}
