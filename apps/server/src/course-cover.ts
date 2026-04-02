import type { GenerateContentResponse } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import { courseCoverAspectRatio, type CoursePlan, type PersistedCourse, type PlanTopic } from "@prof/contracts";

import { env } from "./env.js";
import { getReasoningClient } from "./providers/reasoning/index.js";

const courseCoverBriefSchema = z.object({
  prompt: z.string().min(1).max(2000),
  altText: z.string().min(1).max(280),
});

const rawCourseCoverBriefSchema = z.object({
  prompt: z.string().optional(),
  altText: z.string().optional(),
});

export async function generateCourseCover(options: { course: PersistedCourse }) {
  const client = getReasoningClient();
  const briefSchema = zodToJsonSchema(courseCoverBriefSchema, {
    $refStrategy: "none",
  });
  const briefResponse = await client.models.generateContent({
    model: env.COURSE_COVER_PROMPT_MODEL,
    contents: buildCourseCoverBriefPrompt(options.course),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: briefSchema,
    },
  });

  if (!briefResponse.text) {
    throw new Error("Course cover prompt model returned an empty response.");
  }

  const brief = normalizeCourseCoverBrief(JSON.parse(briefResponse.text), options.course);
  const imageResponse = await client.models.generateContent({
    model: env.COURSE_COVER_IMAGE_MODEL,
    contents: brief.prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: courseCoverAspectRatio,
      },
    },
  });
  const imagePart = extractImagePart(imageResponse);

  if (!imagePart?.data) {
    throw new Error("Course cover image model returned no image data.");
  }

  return {
    prompt: brief.prompt,
    altText: brief.altText,
    mimeType: imagePart.mimeType?.trim() || "image/png",
    body: Buffer.from(imagePart.data, "base64"),
  };
}

export function buildCourseCoverStorageKey(courseId: string) {
  return `courses/${courseId}/cover/current`;
}

function normalizeCourseCoverBrief(raw: unknown, course: PersistedCourse) {
  const parsed = rawCourseCoverBriefSchema.parse(asRecord(raw));
  const fallbackAltText = buildFallbackAltText(course);
  const brief = courseCoverBriefSchema.parse({
    prompt: clampString(parsed.prompt, 2000, buildFallbackImagePrompt(course)),
    altText: clampString(parsed.altText, 280, fallbackAltText),
  });

  return brief;
}

function buildCourseCoverBriefPrompt(course: PersistedCourse) {
  return [
    "You create concise image briefs for course cover art.",
    "Return only JSON matching the provided schema.",
    "Write one polished prompt for a minimal, premium, modern course cover image.",
    "The image will sit behind the course title in the UI, so the image itself must contain no text.",
    "altText must be a single sentence under 280 characters.",
    "Do not include letters, words, numbers, logos, screenshots, diagrams, browser chrome, or UI panels.",
    "Favor abstraction, symbolism, clean geometry, restrained palettes, and generous negative space.",
    "Prefer 1 to 3 visual motifs implied by the course topics instead of a literal collage.",
    `Compose for an ultrawide ${courseCoverAspectRatio} landscape banner with a calm focal structure.`,
    "Keep the result visually specific enough to generate a strong image, but stylistically minimal.",
    "",
    buildCourseCoverContext(course),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCourseCoverContext(course: PersistedCourse) {
  const snapshot = course.snapshot;
  const plan = snapshot.plan;
  const topics = flattenPlanTopics(plan).slice(0, 8);
  const topicLines = topics.map((topic) => `- ${topic.title}: ${topic.summary}`);
  const sourceMaterialTitles = (snapshot.sourceMaterials ?? [])
    .map((material) => material.title.trim())
    .filter(Boolean)
    .slice(0, 3);

  return [
    "Course context:",
    `Title: ${course.title}`,
    snapshot.goal.trim() ? `Goal: ${snapshot.goal.trim()}` : "",
    plan?.title?.trim() ? `Plan title: ${plan.title.trim()}` : "",
    plan?.summary?.trim() ? `Plan summary: ${plan.summary.trim()}` : "",
    plan?.rationale?.trim() ? `Rationale: ${plan.rationale.trim()}` : "",
    plan?.assumedLearnerLevel?.trim() ? `Learner level: ${plan.assumedLearnerLevel.trim()}` : "",
    plan?.assumedPace?.trim() ? `Pace: ${plan.assumedPace.trim()}` : "",
    topicLines.length > 0 ? `Topics:\n${topicLines.join("\n")}` : "",
    sourceMaterialTitles.length > 0 ? `Reference material titles: ${sourceMaterialTitles.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function flattenPlanTopics(plan: CoursePlan | null): PlanTopic[] {
  if (!plan) {
    return [];
  }

  if ("topics" in plan) {
    return plan.topics;
  }

  return plan.phases.flatMap((phase) => phase.topics);
}

function extractImagePart(response: GenerateContentResponse) {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return part.inlineData;
      }
    }
  }

  return null;
}

function buildFallbackAltText(course: PersistedCourse) {
  return clampString(
    `${course.title} course cover with abstract premium illustration and no text.`,
    280,
    "Course cover with abstract premium illustration and no text.",
  );
}

function buildFallbackImagePrompt(course: PersistedCourse) {
  return clampString(
    [
      `Minimal premium abstract course cover for ${course.title}.`,
      "No text, no logos, no UI.",
      `Ultrawide ${courseCoverAspectRatio} banner, restrained palette, clean geometry, generous negative space.`,
    ].join(" "),
    2000,
    "Minimal premium abstract ultrawide course cover, no text, restrained palette, clean geometry.",
  );
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
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
