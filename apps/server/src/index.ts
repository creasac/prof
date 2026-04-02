import express from "express";
import cors from "cors";
import {
  attachUrlRequestSchema,
  flashcardSchema,
  appConfigSchema,
  courseSummaryListSchema,
  courseVisibilitySchema,
  createPublicId,
  lessonQuizRequestSchema,
  lessonQuizResponseSchema,
  learnSessionSnapshotSchema,
  learnSessionSummaryListSchema,
  plannedTopicBlockRequestSchema,
  plannedTopicBlockResponseSchema,
  sourceMaterialResponseSchema,
  persistedCourseSchema,
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
  forkCourseForUser,
  listPublicCourses,
  readCourseCoverForViewer,
  readCourseForViewer,
  readProfileForViewer,
  updateCourseCoverForOwner,
  updateCourseVisibilityForOwner,
} from "./courses.js";
import { buildCourseCoverStorageKey, generateCourseCover } from "./course-cover.js";
import {
  listLearnSessionsForUser,
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
import { importUrl } from "./providers/search/url-import.js";
import { deleteR2Object, getR2Object, isR2Configured, putR2Object } from "./providers/storage/r2.js";
import { extractPdfText, parseUploadedPdf } from "./source-material-upload.js";
import {
  buildPdfStoragePrefix,
  buildPdfStorageKey,
  createPdfSourceMaterial,
  createUrlSourceMaterial,
  findSourceMaterial,
} from "./source-materials.js";
import { normalizeReasoningChatResponse } from "./reasoning-chat.js";
import { normalizeTutorBlock } from "./tutor.js";
import { createVoiceSession, isVoiceEnabled } from "./providers/voice/index.js";
import { enforceUsageLimit, getRequestUsageChannel } from "./usage-limits.js";

const app = express();

const allowedOrigins = env.WEB_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = env.NODE_ENV === "development" ? true : allowedOrigins.length > 0 ? allowedOrigins : true;
const reasoningChatModelSchema = zodToJsonSchema(reasoningChatResponseSchema.omit({ sources: true }), {
  $refStrategy: "none",
});

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

app.get("/api/learn/sessions", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const sessions = await listLearnSessionsForUser(authSession.user.id);
    res.json(learnSessionSummaryListSchema.parse(sessions));
  } catch (error) {
    next(error);
  }
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

app.get("/api/courses/:username/:courseSlug", async (req, res, next) => {
  try {
    const authSession = await getAuthSession(req.headers);
    const courseRecord = await readCourseForViewer({
      viewerUserId: authSession?.user?.id ?? null,
      ownerUsername: req.params.username,
      courseSlug: req.params.courseSlug,
    });

    if (!courseRecord) {
      res.status(404).json({
        error: `Course @${req.params.username}/${req.params.courseSlug} was not found.`,
      });
      return;
    }

    res.json(persistedCourseSchema.parse(courseRecord));
  } catch (error) {
    next(error);
  }
});

app.get("/api/courses/:username/:courseSlug/cover", async (req, res, next) => {
  try {
    const authSession = await getAuthSession(req.headers);
    const courseCover = await readCourseCoverForViewer({
      viewerUserId: authSession?.user?.id ?? null,
      ownerUsername: req.params.username,
      courseSlug: req.params.courseSlug,
    });

    if (!courseCover) {
      res.status(404).json({
        error: "Course cover not found.",
      });
      return;
    }

    res.setHeader(
      "Cache-Control",
      courseCover.course.visibility === "public"
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "private, max-age=300",
    );
    await sendStoredFile(res, courseCover.storageKey, {
      contentType: courseCover.mimeType,
      fileName: `${courseCover.course.courseSlug}-cover`,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/courses/public", async (_req, res, next) => {
  try {
    const courses = await listPublicCourses();
    res.json(courseSummaryListSchema.parse(courses));
  } catch (error) {
    next(error);
  }
});

app.post("/api/courses/:username/:courseSlug/cover", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    if (!isReasoningEnabled()) {
      res.status(503).json({
        error: "Course cover generation is not configured. Set the Gemini configuration first.",
      });
      return;
    }

    if (!isR2Configured()) {
      res.status(503).json({
        error: "Course cover storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.",
      });
      return;
    }

    const courseRecord = await readCourseForViewer({
      viewerUserId: authSession.user.id,
      ownerUsername: req.params.username,
      courseSlug: req.params.courseSlug,
    });

    if (!courseRecord) {
      res.status(404).json({
        error: "Course not found.",
      });
      return;
    }

    if (!courseRecord.isOwner) {
      res.status(403).json({
        error: "Only the course owner can generate a course cover.",
      });
      return;
    }

    const generatedCover = await generateCourseCover({
      course: courseRecord,
    });
    const storageKey = buildCourseCoverStorageKey(courseRecord.courseId);

    await putR2Object({
      key: storageKey,
      body: generatedCover.body,
      contentType: generatedCover.mimeType,
      contentDisposition: `inline; filename="${escapeContentDispositionFilename(`${courseRecord.courseSlug}-cover`)}"`,
    });

    const updatedCourse = await updateCourseCoverForOwner({
      userId: authSession.user.id,
      username: getSessionUsername(authSession),
      courseSlug: req.params.courseSlug,
      coverImage: {
        storageKey,
        mimeType: generatedCover.mimeType,
        prompt: generatedCover.prompt,
        altText: generatedCover.altText,
        updatedAt: new Date(),
      },
    });

    if (!updatedCourse) {
      res.status(404).json({
        error: "Course not found.",
      });
      return;
    }

    res.json(persistedCourseSchema.parse(updatedCourse));
  } catch (error) {
    next(error);
  }
});

app.get("/api/courses/:username/:courseSlug/materials/:materialId/file", async (req, res, next) => {
  try {
    const authSession = await getAuthSession(req.headers);
    const courseRecord = await readCourseForViewer({
      viewerUserId: authSession?.user?.id ?? null,
      ownerUsername: req.params.username,
      courseSlug: req.params.courseSlug,
    });

    if (!courseRecord) {
      res.status(404).json({
        error: `Course @${req.params.username}/${req.params.courseSlug} was not found.`,
      });
      return;
    }

    const material = findSourceMaterial(courseRecord.snapshot.sourceMaterials ?? [], req.params.materialId);
    if (!material || material.kind !== "pdf" || !material.storageKey) {
      res.status(404).json({
        error: "Attached PDF not found.",
      });
      return;
    }

    await sendStoredPdfFile(res, material.storageKey, material.fileName);
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
    const persistedSession = await saveLearnSessionForUser(
      authSession.user.id,
      getSessionUsername(authSession),
      req.params.sessionId,
      snapshot,
    );
    res.json(persistedSession);
  } catch (error) {
    next(error);
  }
});

app.post("/api/learn/sessions/:sessionId/materials/url", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const input = attachUrlRequestSchema.parse(req.body);
    const imported = await importUrl(input.url);
    const material = createUrlSourceMaterial(imported);

    res.json(
      sourceMaterialResponseSchema.parse({
        material,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/learn/sessions/:sessionId/materials/pdf", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    if (!isR2Configured()) {
      res.status(503).json({
        error: "PDF uploads are not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.",
      });
      return;
    }

    const uploadedPdf = await parseUploadedPdf(req);
    const materialId = createPublicId(12);
    const storageKey = buildPdfStorageKey({
      userId: authSession.user.id,
      sessionId: req.params.sessionId,
      materialId,
      fileName: uploadedPdf.fileName,
    });

    await putR2Object({
      key: storageKey,
      body: uploadedPdf.buffer,
      contentType: "application/pdf",
      contentDisposition: `inline; filename="${escapeContentDispositionFilename(uploadedPdf.fileName)}"`,
    });

    const extractedText = await extractPdfText(uploadedPdf.buffer);
    const material = createPdfSourceMaterial({
      id: materialId,
      title: derivePdfTitle(uploadedPdf.fileName, extractedText),
      fileName: uploadedPdf.fileName,
      mimeType: uploadedPdf.mimeType,
      sizeBytes: uploadedPdf.sizeBytes,
      storageKey,
      textExcerpt: extractedText,
    });

    res.json(
      sourceMaterialResponseSchema.parse({
        material,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.delete("/api/learn/sessions/:sessionId/materials/:materialId", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const input = z
      .object({
        storageKey: z.string().min(1).max(400).optional(),
      })
      .parse(req.body ?? {});
    const sessionRecord = await readLearnSessionForUser(authSession.user.id, req.params.sessionId);
    const material = sessionRecord
      ? findSourceMaterial(sessionRecord.snapshot.sourceMaterials ?? [], req.params.materialId)
      : null;
    const expectedStoragePrefix = `${buildPdfStoragePrefix({
      userId: authSession.user.id,
      sessionId: req.params.sessionId,
    })}/`;
    const fallbackStorageKey =
      input.storageKey && input.storageKey.startsWith(expectedStoragePrefix) ? input.storageKey : null;

    if (!sessionRecord && !fallbackStorageKey) {
      res.status(404).json({
        error: `Learn session ${req.params.sessionId} was not found.`,
      });
      return;
    }

    if (!material && !fallbackStorageKey) {
      res.status(404).json({
        error: "Attached material not found.",
      });
      return;
    }

    const storageKeyToDelete =
      material?.kind === "pdf" && material.storageKey ? material.storageKey : fallbackStorageKey;

    if (storageKeyToDelete && isR2Configured()) {
      await deleteR2Object(storageKeyToDelete);
    }

    if (sessionRecord) {
      const nextSnapshot = learnSessionSnapshotSchema.parse({
        ...sessionRecord.snapshot,
        sourceMaterials: (sessionRecord.snapshot.sourceMaterials ?? []).filter((entry) => entry.id !== req.params.materialId),
      });

      await saveLearnSessionForUser(
        authSession.user.id,
        getSessionUsername(authSession),
        req.params.sessionId,
        nextSnapshot,
      );
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/learn/sessions/:sessionId/materials/:materialId/file", async (req, res, next) => {
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

    const material = findSourceMaterial(sessionRecord.snapshot.sourceMaterials ?? [], req.params.materialId);
    if (!material || material.kind !== "pdf" || !material.storageKey) {
      res.status(404).json({
        error: "Attached PDF not found.",
      });
      return;
    }

    await sendStoredPdfFile(res, material.storageKey, material.fileName);
  } catch (error) {
    next(error);
  }
});

app.get("/api/profile/:username", async (req, res, next) => {
  try {
    const authSession = await getAuthSession(req.headers);
    const profile = await readProfileForViewer({
      viewerUserId: authSession?.user?.id ?? null,
      username: req.params.username,
    });

    if (!profile) {
      res.status(404).json({
        error: "Profile not found.",
      });
      return;
    }

    res.json(privateProfileSchema.parse(profile));
  } catch (error) {
    next(error);
  }
});

app.post("/api/courses/:username/:courseSlug/fork", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const username = getSessionUsername(authSession);
    const forkedCourse = await forkCourseForUser({
      userId: authSession.user.id,
      username,
      ownerUsername: req.params.username,
      courseSlug: req.params.courseSlug,
    });

    if (!forkedCourse) {
      res.status(404).json({
        error: "Course not found.",
      });
      return;
    }

    res.json(persistedCourseSchema.parse(forkedCourse));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/courses/:username/:courseSlug", async (req, res, next) => {
  try {
    const authSession = await requireUserSession(req, res);
    if (!authSession) {
      return;
    }

    const username = getSessionUsername(authSession);
    const requestedUsername = req.params.username.trim().toLowerCase();

    if (!username || username !== requestedUsername) {
      res.status(404).json({
        error: "Course not found.",
      });
      return;
    }

    const body = z
      .object({
        visibility: courseVisibilitySchema,
      })
      .parse(req.body);

    const updatedCourse = await updateCourseVisibilityForOwner({
      userId: authSession.user.id,
      username,
      courseSlug: req.params.courseSlug,
      visibility: body.visibility,
    });

    if (!updatedCourse) {
      res.status(404).json({
        error: "Course not found.",
      });
      return;
    }

    res.json(persistedCourseSchema.parse(updatedCourse));
  } catch (error) {
    next(error);
  }
});

app.post("/api/voice/session", async (_req, res, next) => {
  try {
    if (!(await enforceUsageLimit(_req, res, "live"))) {
      return;
    }

    const session = await createVoiceSession();
    res.json(voiceSessionResponseSchema.parse(session));
  } catch (error) {
    next(error);
  }
});

app.post("/api/reasoning/block", async (req, res, next) => {
  try {
    const requestParse = reasoningBlockRequestSchema.safeParse(req.body);
    if (!requestParse.success) {
      res.status(400).json({
        error: "Invalid request",
        details: requestParse.error.flatten(),
      });
      return;
    }

    if (!(await enforceUsageLimit(req, res, "text"))) {
      return;
    }

    const input = requestParse.data;
    const schema = zodToJsonSchema(tutorBlockSchema, {
      $refStrategy: "none",
    });

    const response = await generateReasoningContent({
      prompt: buildTutorBlockPrompt(input),
      searchQuery: input.goal,
      useWebSearch: input.useWebSearch,
      groundingTexts: [input.goal, input.learnerContext],
      sourceMaterials: input.sourceMaterials,
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

    if (!(await enforceUsageLimit(req, res, "text"))) {
      return;
    }

    const input = requestParse.data;
    const { stream, model, sources } = await generateReasoningContentStream({
      prompt: buildStreamingPlanPrompt(input),
      searchQuery: input.userInput || input.goal,
      useWebSearch: input.useWebSearch,
      groundingTexts: [input.goal, input.userInput, input.learnerContext],
      sourceMaterials: input.sourceMaterials,
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

    if (!(await enforceUsageLimit(req, res, "text"))) {
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
      groundingTexts: [input.goal, input.userInput, input.learnerContext],
      sourceMaterials: input.sourceMaterials,
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
    const requestParse = plannedTopicBlockRequestSchema.safeParse(req.body);
    if (!requestParse.success) {
      res.status(400).json({
        error: "Invalid request",
        details: requestParse.error.flatten(),
      });
      return;
    }

    const input = requestParse.data;
    const topic = findPlanTopic(input.plan, input.topicId);

    if (!topic) {
      res.status(404).json({
        error: `Topic ${input.topicId} was not found in the supplied plan.`,
      });
      return;
    }

    if (!(await enforceUsageLimit(req, res, "text"))) {
      return;
    }

    const { stream, model, sources } = await generateReasoningContentStream({
      prompt: buildStreamingPlannedTopicPrompt(input, topic),
      searchQuery: `${input.goal}\nTopic: ${topic.title}\n${topic.summary}`,
      useWebSearch: input.useWebSearch,
      groundingTexts: [input.goal, input.learnerContext],
      sourceMaterials: input.sourceMaterials,
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
    const requestParse = plannedTopicBlockRequestSchema.safeParse(req.body);
    if (!requestParse.success) {
      res.status(400).json({
        error: "Invalid request",
        details: requestParse.error.flatten(),
      });
      return;
    }

    const input = requestParse.data;
    const topic = findPlanTopic(input.plan, input.topicId);

    if (!topic) {
      res.status(404).json({
        error: `Topic ${input.topicId} was not found in the supplied plan.`,
      });
      return;
    }

    if (!(await enforceUsageLimit(req, res, "text"))) {
      return;
    }

    const schema = zodToJsonSchema(tutorBlockSchema, {
      $refStrategy: "none",
    });

    const response = await generateReasoningContent({
      prompt: buildPlannedTopicPrompt(input, topic),
      searchQuery: `${input.goal}\nTopic: ${topic.title}\n${topic.summary}`,
      useWebSearch: input.useWebSearch,
      groundingTexts: [input.goal, input.learnerContext],
      sourceMaterials: input.sourceMaterials,
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
    const requestParse = lessonQuizRequestSchema.safeParse(req.body);
    if (!requestParse.success) {
      res.status(400).json({
        error: "Invalid request",
        details: requestParse.error.flatten(),
      });
      return;
    }

    if (!(await enforceUsageLimit(req, res, "text"))) {
      return;
    }

    const input = requestParse.data;
    const schema = zodToJsonSchema(quizBlockSchema, {
      $refStrategy: "none",
    });

    const response = await generateReasoningContent({
      prompt: buildLessonQuizPrompt(input),
      searchQuery: `${input.topicTitle}\n${input.lesson.title}`,
      useWebSearch: false,
      groundingTexts: [input.goal, input.learnerContext],
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

    if (getRequestUsageChannel(req) !== "live" && !(await enforceUsageLimit(req, res, "text"))) {
      return;
    }

    const input = requestParse.data;

    const response = await generateReasoningContent({
      prompt: buildChatPrompt(input),
      searchQuery: input.message,
      useWebSearch: input.useWebSearch,
      groundingTexts: [input.message, ...input.chatHistory.map((message) => message.content)],
      sourceMaterials: input.sourceMaterials,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: reasoningChatModelSchema,
      },
      emptyResponseError: "Reasoning model returned an empty response.",
    });

    const parsed = normalizeReasoningChatResponse(JSON.parse(response.text), {
      requestType: input.requestType,
      preferredBlockType: input.preferredBlockType,
    });

    res.json({
      ...parsed,
      sources: response.sources.length > 0 ? response.sources : undefined,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    console.error("Structured validation failed", {
      method: req.method,
      path: req.path,
      issues: error.issues,
    });
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
      error: "You must be signed in to access this resource.",
    });
    return null;
  }

  return authSession;
}

function getSessionUsername(authSession: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>) {
  const username = "username" in authSession.user ? authSession.user.username : null;
  return typeof username === "string" && username.trim() ? username.trim().toLowerCase() : null;
}

async function sendStoredPdfFile(res: express.Response, storageKey: string, fileName?: string) {
  await sendStoredFile(res, storageKey, {
    contentType: "application/pdf",
    fileName: fileName || "document.pdf",
  });
}

async function sendStoredFile(
  res: express.Response,
  storageKey: string,
  options: {
    contentType: string;
    fileName: string;
  },
) {
  const object = await getR2Object(storageKey);

  res.setHeader("Content-Type", object.contentType || options.contentType);
  if (object.contentLength !== undefined) {
    res.setHeader("Content-Length", String(object.contentLength));
  }
  res.setHeader(
    "Content-Disposition",
    object.contentDisposition ||
      `inline; filename="${escapeContentDispositionFilename(options.fileName)}"`,
  );
  res.end(object.body);
}

function derivePdfTitle(fileName: string, extractedText: string) {
  const firstLine = extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (firstLine) {
    return firstLine;
  }

  const withoutExtension = fileName.replace(/\.pdf$/i, "").trim();
  return withoutExtension || "PDF attachment";
}

function escapeContentDispositionFilename(fileName: string) {
  return fileName.replace(/["\\\r\n]+/g, "_");
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
