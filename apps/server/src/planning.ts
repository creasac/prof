import {
  flatCoursePlanSchema,
  lessonPlanSchema,
  type PlanRequestType,
  phasedCoursePlanSchema,
  planningModelResultSchema,
  planningResultSchema,
} from "@prof/contracts";
import { z } from "zod";

type PlanningModelResult = z.infer<typeof planningModelResultSchema>;

export function normalizePlanningResult(raw: PlanningModelResult) {
  if (raw.result === "clarification") {
    return planningResultSchema.parse({
      result: "clarification",
      clarification: {
        prompt: clampString(raw.clarification?.prompt, 280, "What should Prof optimize for in this plan?"),
        reason: clampString(raw.clarification?.reason, 200, "The request needs one detail before planning."),
        examples: sanitizeStringArray(raw.clarification?.examples, 120, 3),
      },
    });
  }

  const plan = raw.plan;
  if (!plan) {
    throw new Error("Planner returned result=plan without a plan payload.");
  }

  const common = {
    requestType: inferRequestType(plan),
    title: clampString(plan.title, 140, "Learning plan"),
    summary: clampString(plan.summary, 320, "A roadmap tailored to the learner's request."),
    rationale: clampString(plan.rationale, 320, "This sequence is ordered to build understanding progressively."),
    assumedLearnerLevel: clampString(plan.assumedLearnerLevel, 120, "Adaptive"),
    assumedPace: clampString(plan.assumedPace, 120, "Steady"),
    lessonSizeGuidance: clampString(plan.lessonSizeGuidance, 120, "One focused study session"),
    approvalChecklist: ensureNonEmptyArray(
      sanitizeStringArray(plan.approvalChecklist, 140, 6),
      "The scope matches what I want to learn.",
    ),
  };

  const layout = inferLayout(plan);

  if (layout === "lesson") {
    const topics = ensureNonEmptyArray(sanitizeTopics(plan.topics), buildFallbackTopic(common.title, 1)).slice(0, 1);
    const topic = topics[0];

    return planningResultSchema.parse({
      result: "plan",
      plan: lessonPlanSchema.parse({
        ...common,
        requestType: "lesson",
        layout: "lesson",
        topics,
        lessonBlueprint: {
          summary: clampString(plan.lessonBlueprint?.summary, 280, topic.summary),
          objectives: ensureNonEmptyArray(
            sanitizeStringArray(plan.lessonBlueprint?.objectives, 120, 5),
            `Understand ${topic.title.toLowerCase()}.`,
          ),
          sectionHeadings: ensureNonEmptyArray(
            sanitizeStringArray(plan.lessonBlueprint?.sectionHeadings, 120, 8),
            topic.title,
          ),
        },
        recommendedStartingTopicId: topic.id,
      }),
    });
  }

  if (layout === "flat") {
    const topics = ensureNonEmptyArray(sanitizeTopics(plan.topics), buildFallbackTopic(common.title, 1));

    return planningResultSchema.parse({
      result: "plan",
      plan: flatCoursePlanSchema.parse({
        ...common,
        layout: "flat",
        topics,
        recommendedStartingTopicId: pickStartingTopicId(plan.recommendedStartingTopicId, topics),
      }),
    });
  }

  const phases = ensureNonEmptyArray(sanitizePhases(plan.phases), buildFallbackPhase(common.title));

  return planningResultSchema.parse({
    result: "plan",
    plan: phasedCoursePlanSchema.parse({
      ...common,
      layout: "phased",
      phases,
      recommendedStartingTopicId: pickStartingTopicId(
        plan.recommendedStartingTopicId,
        phases.flatMap((phase) => phase.topics),
      ),
    }),
  });
}

export function normalizeStreamedPlanMeta(raw: unknown) {
  const recommendedStartingTopicId = clampString(
    (raw as { recommendedStartingTopicId?: unknown })?.recommendedStartingTopicId,
    80,
    "",
  );
  const requestType = (raw as { requestType?: unknown })?.requestType;

  return {
    requestType: (
      requestType === "lesson" ||
      requestType === "topic" ||
      requestType === "subject" ||
      requestType === "curriculum"
        ? requestType
        : undefined
    ) as PlanRequestType | undefined,
    title: clampString((raw as { title?: unknown })?.title, 140, "Learning plan"),
    recommendedStartingTopicId: recommendedStartingTopicId || undefined,
  };
}

export function normalizeStreamedTopic(raw: unknown, index: number) {
  const topic = sanitizeTopics([raw])[0];

  return topic ?? buildFallbackTopic("Topic", index);
}

export function normalizeStreamedClarification(raw: unknown) {
  return {
    prompt: clampString((raw as { prompt?: unknown })?.prompt, 280, "What should Prof optimize for in these topics?"),
    reason: clampString(
      (raw as { reason?: unknown })?.reason,
      200,
      "The request needs one detail before topic generation.",
    ),
    examples: sanitizeStringArray((raw as { examples?: unknown })?.examples, 120, 3),
  };
}

function sanitizePhases(phases: unknown) {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases
    .map((phase, index) => {
      const title = clampString(phase?.title, 120, `Phase ${index + 1}`);
      const topics = ensureNonEmptyArray(sanitizeTopics(phase?.topics), buildFallbackTopic(title, 1));

      return {
        id: sanitizeId(phase?.id, `phase-${index + 1}`),
        title,
        summary: clampString(phase?.summary, 280, `Build through ${title.toLowerCase()}.`),
        topics,
      };
    })
    .slice(0, 6);
}

function sanitizeTopics(topics: unknown) {
  if (!Array.isArray(topics)) {
    return [];
  }

  return topics
    .map((topic, index) => {
      const title = clampString(topic?.title, 120, `Topic ${index + 1}`);

      return {
        id: sanitizeId(topic?.id, `topic-${index + 1}`, title),
        title,
        summary: clampString(topic?.summary, 280, `Learn the essentials of ${title.toLowerCase()}.`),
      };
    })
    .slice(0, 14);
}

function buildFallbackPhase(title: string) {
  return {
    id: "phase-1",
    title: "Phase 1",
    summary: `Start with the foundations of ${title.toLowerCase()}.`,
    topics: [buildFallbackTopic(title, 1)],
  };
}

function buildFallbackTopic(title: string, index: number) {
  const fallbackTitle = index === 1 ? title : `${title} ${index}`;

  return {
    id: sanitizeId("", `topic-${index}`, fallbackTitle),
    title: clampString(fallbackTitle, 120, `Topic ${index}`),
    summary: clampString(`Learn the essentials of ${fallbackTitle.toLowerCase()}.`, 280, "Focused topic study."),
  };
}

function pickStartingTopicId(
  requestedTopicId: string | undefined,
  topics: Array<{
    id: string;
  }>,
) {
  if (requestedTopicId && topics.some((topic) => topic.id === requestedTopicId)) {
    return requestedTopicId;
  }

  return topics[0]?.id ?? "topic-1";
}

function sanitizeId(value: unknown, fallback: string, title?: string) {
  const source = typeof value === "string" && value.trim() ? value : title ?? fallback;
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || fallback;
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

function inferLayout(plan: NonNullable<PlanningModelResult["plan"]>) {
  if (plan.layout) {
    return plan.layout;
  }

  if (plan.lessonBlueprint) {
    return "lesson" as const;
  }

  if (Array.isArray(plan.phases) && plan.phases.length > 0) {
    return "phased" as const;
  }

  return "flat" as const;
}

function inferRequestType(plan: NonNullable<PlanningModelResult["plan"]>) {
  if (plan.requestType) {
    return plan.requestType;
  }

  const layout = inferLayout(plan);
  if (layout === "lesson") {
    return "lesson" as const;
  }

  if (layout === "phased") {
    return "curriculum" as const;
  }

  return "subject" as const;
}
