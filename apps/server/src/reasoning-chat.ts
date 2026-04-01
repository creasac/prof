import {
  planningModelResultSchema,
  reasoningChatResponseSchema,
  type ReasoningRequestType,
  type ReasoningResponseType,
  type TargetPanel,
  type TutorBlockType,
} from "@prof/contracts";
import { z } from "zod";

import { normalizePlanningResult } from "./planning.js";
import { normalizeTutorBlock } from "./tutor.js";

type ReasoningChatResponse = z.infer<typeof reasoningChatResponseSchema>;

export function normalizeReasoningChatResponse(
  raw: unknown,
  options: {
    requestType?: ReasoningRequestType;
    preferredBlockType?: TutorBlockType;
  } = {},
) {
  const source = asRecord(raw);
  const artifact =
    source.artifact == null || !hasArtifactSignal(source.artifact)
      ? undefined
      : normalizeTutorBlock(source.artifact, options.preferredBlockType);
  const plan =
    source.plan == null || !hasPlanSignal(source.plan) ? undefined : normalizeReasoningChatPlan(source.plan);
  const responseType = inferReasoningResponseType(source.responseType, {
    requestType: options.requestType,
    hasArtifact: Boolean(artifact),
    hasPlan: Boolean(plan),
  });
  const targetPanel = inferTargetPanel(source.targetPanel, {
    responseType,
    hasArtifact: Boolean(artifact),
    hasPlan: Boolean(plan),
  });
  const content = normalizeContent(source.content, {
    responseType,
    hasArtifact: Boolean(artifact),
    hasPlan: Boolean(plan),
  });

  return reasoningChatResponseSchema.parse({
    responseType,
    targetPanel,
    content: content || undefined,
    artifact,
    plan,
  });
}

function normalizeReasoningChatPlan(raw: unknown): ReasoningChatResponse["plan"] {
  const normalized = normalizePlanningResult(
    planningModelResultSchema.parse({
      result: "plan",
      plan: asRecord(raw),
    }),
  );

  if (normalized.result !== "plan") {
    throw new Error("Expected a normalized plan result.");
  }

  return normalized.plan;
}

function inferReasoningResponseType(
  value: unknown,
  options: {
    requestType?: ReasoningRequestType;
    hasArtifact: boolean;
    hasPlan: boolean;
  },
): ReasoningResponseType {
  if (options.hasArtifact || options.hasPlan) {
    if (value === "artifact_create" || value === "artifact_update") {
      return value;
    }

    return options.requestType === "update_content" ? "artifact_update" : "artifact_create";
  }

  if (value === "chat" || value === "artifact_create" || value === "artifact_update") {
    return value;
  }

  return "chat";
}

function inferTargetPanel(
  value: unknown,
  options: {
    responseType: ReasoningResponseType;
    hasArtifact: boolean;
    hasPlan: boolean;
  },
): TargetPanel {
  if (options.hasArtifact || options.hasPlan) {
    return "learn";
  }

  if (value === "chat" || value === "learn") {
    return value;
  }

  return options.responseType === "chat" ? "chat" : "learn";
}

function normalizeContent(
  value: unknown,
  options: {
    responseType: ReasoningResponseType;
    hasArtifact: boolean;
    hasPlan: boolean;
  },
) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (options.hasArtifact && options.hasPlan) {
    return "Updated the course plan and learning content.";
  }

  if (options.hasPlan) {
    return "Updated the course plan.";
  }

  if (options.hasArtifact) {
    return options.responseType === "artifact_update"
      ? "Updated the requested learning content."
      : "Created new learning content.";
  }

  return options.responseType === "chat" ? "I'm ready to help with the current course." : "Processed your request.";
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function hasArtifactSignal(value: unknown) {
  const source = asRecord(value);

  return (
    source.type !== undefined ||
    source.title !== undefined ||
    source.summary !== undefined ||
    source.contentMarkdown !== undefined ||
    source.objectives !== undefined ||
    source.instructions !== undefined ||
    source.questions !== undefined ||
    source.cards !== undefined ||
    source.prompt !== undefined ||
    source.guidance !== undefined ||
    source.reason !== undefined
  );
}

function hasPlanSignal(value: unknown) {
  const source = asRecord(value);

  return (
    source.requestType !== undefined ||
    source.layout !== undefined ||
    source.title !== undefined ||
    source.summary !== undefined ||
    source.rationale !== undefined ||
    source.assumedLearnerLevel !== undefined ||
    source.assumedPace !== undefined ||
    source.lessonSizeGuidance !== undefined ||
    source.approvalChecklist !== undefined ||
    source.recommendedStartingTopicId !== undefined ||
    source.topics !== undefined ||
    source.phases !== undefined ||
    source.lessonBlueprint !== undefined
  );
}
