import { z } from "zod";

export const lessonBlockSchema = z.object({
  type: z.literal("lesson"),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(280),
  contentMarkdown: z.string().min(1),
  objectives: z.array(z.string().min(1).max(120)).min(1).max(5),
});

const quizChoiceSchema = z.string().min(1).max(160);

export const multipleChoiceQuestionSchema = z.object({
  kind: z.literal("multiple_choice"),
  prompt: z.string().min(1),
  choices: z.array(quizChoiceSchema).min(2).max(6),
  answerIndex: z.number().int().min(0).max(5),
  explanation: z.string().min(1),
});

export const multipleSelectQuestionSchema = z.object({
  kind: z.literal("multiple_select"),
  prompt: z.string().min(1),
  choices: z.array(quizChoiceSchema).min(3).max(6),
  answerIndexes: z.array(z.number().int().min(0).max(5)).min(1).max(4),
  explanation: z.string().min(1),
});

export const shortAnswerQuestionSchema = z.object({
  kind: z.literal("short_answer"),
  prompt: z.string().min(1),
  expectedAnswer: z.string().min(1),
  acceptableAnswers: z.array(z.string().min(1)).min(1).max(4),
  rubric: z.string().min(1),
});

export const quizQuestionSchema = z.discriminatedUnion("kind", [
  multipleChoiceQuestionSchema,
  multipleSelectQuestionSchema,
  shortAnswerQuestionSchema,
]);

export const quizBlockSchema = z.object({
  type: z.literal("quiz"),
  title: z.string().min(1).max(120),
  instructions: z.string().min(1).max(280),
  questions: z.array(quizQuestionSchema).min(1).max(5),
});

export const flashcardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

export const flashcardsBlockSchema = z.object({
  type: z.literal("flashcards"),
  title: z.string().min(1).max(120),
  cards: z.array(flashcardSchema).min(2).max(8),
});

export const essayPromptBlockSchema = z.object({
  type: z.literal("essay_prompt"),
  title: z.string().min(1).max(120),
  prompt: z.string().min(1),
  guidance: z.array(z.string().min(1)).min(1).max(5),
});

export const followUpQuestionBlockSchema = z.object({
  type: z.literal("follow_up_question"),
  prompt: z.string().min(1),
  reason: z.string().min(1).max(200),
});

export const tutorBlockSchema = z.discriminatedUnion("type", [
  lessonBlockSchema,
  quizBlockSchema,
  flashcardsBlockSchema,
  essayPromptBlockSchema,
  followUpQuestionBlockSchema,
]);

export const tutorBlockTypeSchema = z.enum([
  "lesson",
  "quiz",
  "flashcards",
  "essay_prompt",
  "follow_up_question",
]);

export const planRequestTypeSchema = z.enum(["lesson", "topic", "subject", "curriculum"]);

export const planningModeSchema = z.enum(["draft", "clarify", "refine"]);

export const planTopicSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(280),
});

export const planPhaseSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(280),
  topics: z.array(planTopicSchema).min(1).max(8),
});

export const lessonBlueprintSchema = z.object({
  summary: z.string().min(1).max(280),
  objectives: z.array(z.string().min(1).max(120)).min(1).max(5),
  sectionHeadings: z.array(z.string().min(1).max(120)).min(1).max(8),
});

const baseCoursePlanSchema = z.object({
  requestType: planRequestTypeSchema,
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(320),
  rationale: z.string().min(1).max(320),
  assumedLearnerLevel: z.string().min(1).max(120),
  assumedPace: z.string().min(1).max(120),
  lessonSizeGuidance: z.string().min(1).max(120),
  approvalChecklist: z.array(z.string().min(1).max(140)).min(1).max(6),
  recommendedStartingTopicId: z.string().min(1).max(80),
});

export const lessonPlanSchema = baseCoursePlanSchema.extend({
  layout: z.literal("lesson"),
  topics: z.array(planTopicSchema).length(1),
  lessonBlueprint: lessonBlueprintSchema,
});

export const flatCoursePlanSchema = baseCoursePlanSchema.extend({
  layout: z.literal("flat"),
  topics: z.array(planTopicSchema).min(1).max(14),
});

export const phasedCoursePlanSchema = baseCoursePlanSchema.extend({
  layout: z.literal("phased"),
  phases: z.array(planPhaseSchema).min(1).max(6),
});

export const coursePlanSchema = z.discriminatedUnion("layout", [
  lessonPlanSchema,
  flatCoursePlanSchema,
  phasedCoursePlanSchema,
]);

export const planningClarificationSchema = z.object({
  prompt: z.string().min(1).max(280),
  reason: z.string().min(1).max(200),
  examples: z.array(z.string().min(1).max(120)).max(3).default([]),
});

export const groundingSourceSchema = z.object({
  title: z.string().min(1),
  uri: z.string().url(),
});

export const sourceMaterialKindSchema = z.enum(["url", "pdf"]);

export const sourceMaterialSchema = z.object({
  id: z.string().min(1).max(40),
  kind: sourceMaterialKindSchema,
  title: z.string().min(1).max(240),
  createdAt: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  resolvedUrl: z.string().url().optional(),
  capture: z.string().min(1).max(80).optional(),
  fileName: z.string().min(1).max(240).optional(),
  mimeType: z.string().min(1).max(120).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  storageKey: z.string().min(1).max(400).optional(),
  textExcerpt: z.string().max(20000).optional().default(""),
});

const learnSessionMessageChannelValues = ["chat", "live"] as const;
const learnSessionMessageKindValues = ["message", "status"] as const;
const reasoningResponseTypeValues = ["chat", "artifact_create", "artifact_update"] as const;
const reasoningRequestTypeValues = ["new_content", "update_content", "general_query"] as const;
const reasoningUpdateTargetValues = [
  "lesson",
  "topic_list",
  "topic",
  "quiz",
  "flashcards",
  "plan",
  "all",
  "unknown",
] as const;
const targetPanelValues = ["chat", "learn"] as const;

export const learnSessionMessageChannelSchema = z.enum(learnSessionMessageChannelValues);
export const learnSessionMessageKindSchema = z.enum(learnSessionMessageKindValues);
export const reasoningResponseTypeSchema = z.enum(reasoningResponseTypeValues);
export const reasoningRequestTypeSchema = z.enum(reasoningRequestTypeValues);
export const reasoningUpdateTargetSchema = z.enum(reasoningUpdateTargetValues);
export const targetPanelSchema = z.enum(targetPanelValues);

export const learnSessionMessageSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  createdAt: z.string().optional(),
  channel: learnSessionMessageChannelSchema.optional(),
  kind: learnSessionMessageKindSchema.optional(),
  sources: z.array(groundingSourceSchema).optional().default([]),
  requestType: reasoningRequestTypeSchema.optional(),
  updateTarget: reasoningUpdateTargetSchema.optional(),
  responseType: reasoningResponseTypeSchema.optional(),
  targetPanel: targetPanelSchema.optional(),
  topicId: z.string().nullable().optional().default(null),
});

export const quizAnswerStateSchema = z.object({
  selectedIndex: z.number().int().nullable(),
  selectedIndexes: z.array(z.number().int()).default([]),
  text: z.string(),
});

export const quizProgressSchema = z.object({
  topicId: z.string().nullable(),
  submitted: z.boolean(),
  answers: z.array(quizAnswerStateSchema),
});

export const learnTopicArtifactsSchema = z.object({
  block: tutorBlockSchema.nullable().default(null),
  quiz: quizBlockSchema.nullable().default(null),
});

export const courseVisibilitySchema = z.enum(["private", "public"]);

export const courseRefSchema = z.object({
  courseId: z.string().min(1),
  ownerUsername: z.string().min(1),
  courseSlug: z.string().min(1),
  title: z.string().min(1),
});

export const courseSnapshotSchema = z.object({
  goal: z.string(),
  plan: coursePlanSchema.nullable(),
  planSources: z.array(groundingSourceSchema),
  sourceMaterials: z.array(sourceMaterialSchema).optional().default([]),
  selectedTopicId: z.string().nullable(),
  generatedBlock: tutorBlockSchema.nullable(),
  generatedTopicId: z.string().nullable(),
  generatedQuiz: quizBlockSchema.nullable(),
  generatedQuizTopicId: z.string().nullable(),
  topicArtifacts: z.record(z.string(), learnTopicArtifactsSchema).optional().default({}),
  blockSources: z.array(groundingSourceSchema),
});

export const learnSessionSnapshotSchema = z.object({
  courseId: z.string().nullable().default(null),
  course: courseRefSchema.nullable().default(null),
  courseSyncEnabled: z.boolean().optional(),
  goal: z.string(),
  plannerInput: z.string(),
  plan: coursePlanSchema.nullable(),
  planClarification: planningClarificationSchema.nullable(),
  planSources: z.array(groundingSourceSchema),
  sourceMaterials: z.array(sourceMaterialSchema).optional().default([]),
  selectedTopicId: z.string().nullable(),
  generatedBlock: tutorBlockSchema.nullable(),
  generatedTopicId: z.string().nullable(),
  generatedQuiz: quizBlockSchema.nullable(),
  generatedQuizTopicId: z.string().nullable(),
  generatedQuizError: z.string().nullable(),
  quizProgress: quizProgressSchema.nullable(),
  quizResultsByTopic: z.record(z.string(), z.number()).optional().default({}),
  topicArtifacts: z.record(z.string(), learnTopicArtifactsSchema).optional().default({}),
  blockSources: z.array(groundingSourceSchema),
  chatMessages: z.array(learnSessionMessageSchema).optional().default([]),
  liveMessages: z.array(learnSessionMessageSchema).optional().default([]),
  liveInputDraft: z.string().optional().default(""),
  liveOutputDraft: z.string().optional().default(""),
  inputTranscript: z.string().optional(),
  outputTranscript: z.string().optional(),
  leftPanePercent: z.number(),
  learnPanelCollapsed: z.boolean(),
  liveGoal: z.string().nullable(),
});

export const persistedLearnSessionSchema = z.object({
  sessionId: z.string().min(1),
  courseId: z.string().nullable().default(null),
  snapshot: learnSessionSnapshotSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const learnSessionSummarySchema = z.object({
  sessionId: z.string().min(1),
  courseId: z.string().nullable().default(null),
  title: z.string().min(1).max(140),
  preview: z.string().max(320),
  goal: z.string(),
  messageCount: z.number().int().min(0),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const learnSessionSummaryListSchema = z.array(learnSessionSummarySchema);

export const courseCoverImageSchema = z.object({
  prompt: z.string().min(1).max(2000),
  altText: z.string().min(1).max(280),
  updatedAt: z.string().min(1),
});

export const courseCoverAspectRatio = "21:9" as const;
export const courseCoverAspectRatioCss = "21 / 9" as const;

export const courseSummarySchema = z.object({
  courseId: z.string().min(1),
  ownerUsername: z.string().min(1),
  courseSlug: z.string().min(1),
  title: z.string().min(1),
  visibility: courseVisibilitySchema,
  artifactCount: z.number().int().min(0),
  coverImage: courseCoverImageSchema.nullable().default(null),
  updatedAt: z.string().min(1),
});

export const courseSummaryListSchema = z.array(courseSummarySchema);

export const persistedCourseSchema = z.object({
  courseId: z.string().min(1),
  ownerUsername: z.string().min(1),
  courseSlug: z.string().min(1),
  title: z.string().min(1),
  visibility: courseVisibilitySchema,
  artifactCount: z.number().int().min(0),
  snapshot: courseSnapshotSchema,
  coverImage: courseCoverImageSchema.nullable().default(null),
  isOwner: z.boolean(),
  updatedAt: z.string().min(1),
});

export const learnCourseSummarySchema = courseSummarySchema;
export const learnCourseSeedSchema = persistedCourseSchema;

export const privateProfileSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  courses: z.array(courseSummarySchema),
});

export const reasoningBlockRequestSchema = z.object({
  goal: z.string().min(1).max(1000),
  learnerContext: z.string().max(2000).optional().default(""),
  preferredBlockType: tutorBlockTypeSchema.optional(),
  useWebSearch: z.boolean().optional().default(false),
  sourceMaterials: z.array(sourceMaterialSchema).max(12).optional().default([]),
});

export const reasoningPlanRequestSchema = z
  .object({
    mode: planningModeSchema,
    goal: z.string().min(1).max(1000),
    learnerContext: z.string().max(2000).optional().default(""),
    userInput: z.string().max(2000).optional().default(""),
    currentPlan: coursePlanSchema.optional(),
    useWebSearch: z.boolean().optional().default(false),
    sourceMaterials: z.array(sourceMaterialSchema).max(12).optional().default([]),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== "draft" && !value.userInput.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "userInput is required when clarifying or refining a plan.",
        path: ["userInput"],
      });
    }

    if (value.mode === "refine" && !value.currentPlan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "currentPlan is required when refining a plan.",
        path: ["currentPlan"],
      });
    }
  });

const planningModelTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
});

const planningModelPhaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  topics: z.array(planningModelTopicSchema),
});

const planningModelLessonBlueprintSchema = z.object({
  summary: z.string().optional(),
  objectives: z.array(z.string()).optional(),
  sectionHeadings: z.array(z.string()).optional(),
});

const planningModelPlanSchema = z.object({
  requestType: planRequestTypeSchema.optional(),
  layout: z.enum(["lesson", "flat", "phased"]).optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  rationale: z.string().optional(),
  assumedLearnerLevel: z.string().optional(),
  assumedPace: z.string().optional(),
  lessonSizeGuidance: z.string().optional(),
  approvalChecklist: z.array(z.string()).optional(),
  recommendedStartingTopicId: z.string().optional(),
  topics: z.array(planningModelTopicSchema).optional(),
  phases: z.array(planningModelPhaseSchema).optional(),
  lessonBlueprint: planningModelLessonBlueprintSchema.optional(),
});

const planningModelClarificationSchema = z.object({
  prompt: z.string().optional(),
  reason: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

export const planningModelResultSchema = z.object({
  result: z.enum(["clarification", "plan"]),
  clarification: planningModelClarificationSchema.optional(),
  plan: planningModelPlanSchema.optional(),
});

export const reasoningBlockResponseSchema = z.object({
  block: tutorBlockSchema,
  sources: z.array(groundingSourceSchema).default([]),
  model: z.string().min(1),
});

export const planningResultClarificationSchema = z.object({
  result: z.literal("clarification"),
  clarification: planningClarificationSchema,
});

export const planningResultPlanSchema = z.object({
  result: z.literal("plan"),
  plan: coursePlanSchema,
});

export const planningResultSchema = z.discriminatedUnion("result", [
  planningResultClarificationSchema,
  planningResultPlanSchema,
]);

export const reasoningPlanClarificationResponseSchema = planningResultClarificationSchema.extend({
  sources: z.array(groundingSourceSchema).default([]),
  model: z.string().min(1),
});

export const reasoningPlanReadyResponseSchema = planningResultPlanSchema.extend({
  sources: z.array(groundingSourceSchema).default([]),
  model: z.string().min(1),
});

export const reasoningPlanResponseSchema = z.discriminatedUnion("result", [
  reasoningPlanClarificationResponseSchema,
  reasoningPlanReadyResponseSchema,
]);

export const reasoningPlanStreamMetaSchema = z.object({
  requestType: planRequestTypeSchema.optional(),
  title: z.string().min(1).max(140).optional(),
  recommendedStartingTopicId: z.string().min(1).max(80).optional(),
});

export const reasoningPlanStreamMetaEventSchema = z.object({
  type: z.literal("meta"),
  meta: reasoningPlanStreamMetaSchema,
});

export const reasoningPlanStreamTopicEventSchema = z.object({
  type: z.literal("topic"),
  topic: planTopicSchema,
});

export const reasoningPlanStreamClarificationEventSchema = z.object({
  type: z.literal("clarification"),
  clarification: planningClarificationSchema,
});

export const reasoningPlanStreamFinalEventSchema = z.object({
  type: z.literal("final"),
  payload: reasoningPlanResponseSchema,
});

export const reasoningPlanStreamErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.string().min(1),
});

export const reasoningPlanStreamEventSchema = z.discriminatedUnion("type", [
  reasoningPlanStreamMetaEventSchema,
  reasoningPlanStreamTopicEventSchema,
  reasoningPlanStreamClarificationEventSchema,
  reasoningPlanStreamFinalEventSchema,
  reasoningPlanStreamErrorEventSchema,
]);

export const reasoningTopicBlockStreamMetaSchema = z.object({
  blockType: tutorBlockTypeSchema,
  title: z.string().min(1).max(120).optional(),
});

export const reasoningTopicBlockStreamMetaEventSchema = z.object({
  type: z.literal("meta"),
  meta: reasoningTopicBlockStreamMetaSchema,
});

export const reasoningTopicBlockStreamLessonEventSchema = z.object({
  type: z.literal("lesson"),
  lesson: z.object({
    summary: z.string().min(1).max(280).optional(),
    objectives: z.array(z.string().min(1).max(120)).max(5).optional(),
  }),
});

export const reasoningTopicBlockStreamMarkdownEventSchema = z.object({
  type: z.literal("markdown"),
  markdown: z.string(),
});

export const reasoningTopicBlockStreamQuizEventSchema = z.object({
  type: z.literal("quiz"),
  quiz: z.object({
    instructions: z.string().min(1).max(280).optional(),
  }),
});

export const reasoningTopicBlockStreamQuestionEventSchema = z.object({
  type: z.literal("question"),
  question: quizQuestionSchema,
});

export const reasoningTopicBlockStreamCardEventSchema = z.object({
  type: z.literal("card"),
  card: flashcardSchema,
});

export const reasoningTopicBlockStreamEssayEventSchema = z.object({
  type: z.literal("essay"),
  essay: z.object({
    prompt: z.string().min(1).optional(),
    guidance: z.array(z.string().min(1).max(120)).max(5).optional(),
  }),
});

export const reasoningTopicBlockStreamFollowUpEventSchema = z.object({
  type: z.literal("follow_up"),
  followUp: z.object({
    prompt: z.string().min(1).optional(),
    reason: z.string().min(1).max(200).optional(),
  }),
});

export const reasoningTopicBlockStreamFinalEventSchema = z.object({
  type: z.literal("final"),
  payload: z.lazy(() => plannedTopicBlockResponseSchema),
});

export const reasoningTopicBlockStreamErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.string().min(1),
});

export const reasoningTopicBlockStreamEventSchema = z.discriminatedUnion("type", [
  reasoningTopicBlockStreamMetaEventSchema,
  reasoningTopicBlockStreamLessonEventSchema,
  reasoningTopicBlockStreamMarkdownEventSchema,
  reasoningTopicBlockStreamQuizEventSchema,
  reasoningTopicBlockStreamQuestionEventSchema,
  reasoningTopicBlockStreamCardEventSchema,
  reasoningTopicBlockStreamEssayEventSchema,
  reasoningTopicBlockStreamFollowUpEventSchema,
  reasoningTopicBlockStreamFinalEventSchema,
  reasoningTopicBlockStreamErrorEventSchema,
]);

export const plannedTopicBlockRequestSchema = z.object({
  goal: z.string().min(1).max(1000),
  learnerContext: z.string().max(2000).optional().default(""),
  plan: coursePlanSchema,
  topicId: z.string().min(1).max(80),
  preferredBlockType: tutorBlockTypeSchema.optional(),
  useWebSearch: z.boolean().optional().default(false),
  sourceMaterials: z.array(sourceMaterialSchema).max(12).optional().default([]),
});

export const plannedTopicBlockResponseSchema = reasoningBlockResponseSchema.extend({
  topicId: z.string().min(1).max(80),
});

export const lessonQuizRequestSchema = z.object({
  goal: z.string().min(1).max(1000),
  learnerContext: z.string().max(2000).optional().default(""),
  topicId: z.string().min(1).max(80),
  topicTitle: z.string().min(1).max(120),
  topicSummary: z.string().max(280).optional().default(""),
  lesson: lessonBlockSchema,
});

export const lessonQuizResponseSchema = z.object({
  topicId: z.string().min(1).max(80),
  quiz: quizBlockSchema,
  model: z.string().min(1),
});

export const accountUnlimitedAccessStatusSchema = z.object({
  hasUnlimitedAccess: z.boolean(),
  canRedeem: z.boolean(),
  campaignIsActive: z.boolean(),
  campaignStartsAt: z.string().min(1),
  campaignEndsAt: z.string().min(1),
  accessStartsAt: z.string().min(1).nullable(),
  accessExpiresAt: z.string().min(1).nullable(),
  redeemedAt: z.string().min(1).nullable(),
});

export const redeemUnlimitedAccessCodeRequestSchema = z.object({
  code: z.string().min(1).max(200),
});

export const redeemUnlimitedAccessCodeResponseSchema = z.object({
  status: accountUnlimitedAccessStatusSchema,
  message: z.string().min(1).max(200),
});

export const appConfigSchema = z.object({
  voice: z.object({
    enabled: z.boolean(),
  }),
  reasoning: z.object({
    enabled: z.boolean(),
  }),
  search: z.object({
    enabled: z.boolean(),
  }),
});

export const voiceSessionResponseSchema = z.object({
  connectionUrl: z.string().url(),
  expiresAt: z.string().optional(),
});

export type AccountUnlimitedAccessStatus = z.infer<typeof accountUnlimitedAccessStatusSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type FlashcardsBlock = z.infer<typeof flashcardsBlockSchema>;
export type FollowUpQuestionBlock = z.infer<typeof followUpQuestionBlockSchema>;
export type GroundingSource = z.infer<typeof groundingSourceSchema>;
export type SourceMaterial = z.infer<typeof sourceMaterialSchema>;
export type SourceMaterialKind = z.infer<typeof sourceMaterialKindSchema>;
export type LessonBlock = z.infer<typeof lessonBlockSchema>;
export type LessonBlueprint = z.infer<typeof lessonBlueprintSchema>;
export type LessonPlan = z.infer<typeof lessonPlanSchema>;
export type LessonQuizRequest = z.infer<typeof lessonQuizRequestSchema>;
export type LessonQuizResponse = z.infer<typeof lessonQuizResponseSchema>;
export type RedeemUnlimitedAccessCodeRequest = z.infer<typeof redeemUnlimitedAccessCodeRequestSchema>;
export type RedeemUnlimitedAccessCodeResponse = z.infer<typeof redeemUnlimitedAccessCodeResponseSchema>;
export type CourseRef = z.infer<typeof courseRefSchema>;
export type CourseSnapshot = z.infer<typeof courseSnapshotSchema>;
export type CourseCoverImage = z.infer<typeof courseCoverImageSchema>;
export type CourseSummary = z.infer<typeof courseSummarySchema>;
export type PersistedCourse = z.infer<typeof persistedCourseSchema>;
export type CourseVisibility = z.infer<typeof courseVisibilitySchema>;
export type LearnSessionMessage = z.infer<typeof learnSessionMessageSchema>;
export type LearnSessionMessageChannel = z.infer<typeof learnSessionMessageChannelSchema>;
export type LearnSessionMessageKind = z.infer<typeof learnSessionMessageKindSchema>;
export type LearnTopicArtifacts = z.infer<typeof learnTopicArtifactsSchema>;
export type LearnSessionSnapshot = z.infer<typeof learnSessionSnapshotSchema>;
export type LearnCourseSeed = z.infer<typeof learnCourseSeedSchema>;
export type LearnCourseSummary = z.infer<typeof learnCourseSummarySchema>;
export type PersistedLearnSession = z.infer<typeof persistedLearnSessionSchema>;
export type LearnSessionSummary = z.infer<typeof learnSessionSummarySchema>;
export type PrivateProfile = z.infer<typeof privateProfileSchema>;
export type VoiceSessionResponse = z.infer<typeof voiceSessionResponseSchema>;
export type CoursePlan = z.infer<typeof coursePlanSchema>;
export type FlatCoursePlan = z.infer<typeof flatCoursePlanSchema>;
export type PhasedCoursePlan = z.infer<typeof phasedCoursePlanSchema>;
export type PlanPhase = z.infer<typeof planPhaseSchema>;
export type PlanRequestType = z.infer<typeof planRequestTypeSchema>;
export type PlanTopic = z.infer<typeof planTopicSchema>;
export type PlannedTopicBlockRequest = z.infer<typeof plannedTopicBlockRequestSchema>;
export type PlannedTopicBlockResponse = z.infer<typeof plannedTopicBlockResponseSchema>;
export type PlanningClarification = z.infer<typeof planningClarificationSchema>;
export type PlanningMode = z.infer<typeof planningModeSchema>;
export type PlanningResult = z.infer<typeof planningResultSchema>;
export type QuizAnswerState = z.infer<typeof quizAnswerStateSchema>;
export type QuizProgress = z.infer<typeof quizProgressSchema>;
export type QuizBlock = z.infer<typeof quizBlockSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type ReasoningBlockRequest = z.infer<typeof reasoningBlockRequestSchema>;
export type ReasoningBlockResponse = z.infer<typeof reasoningBlockResponseSchema>;
export type ReasoningPlanRequest = z.infer<typeof reasoningPlanRequestSchema>;
export type ReasoningPlanResponse = z.infer<typeof reasoningPlanResponseSchema>;
export type ReasoningPlanStreamEvent = z.infer<typeof reasoningPlanStreamEventSchema>;
export type ReasoningTopicBlockStreamEvent = z.infer<typeof reasoningTopicBlockStreamEventSchema>;
export const reasoningChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  requestType: reasoningRequestTypeSchema.optional(),
  updateTarget: reasoningUpdateTargetSchema.optional(),
  preferredBlockType: tutorBlockTypeSchema.optional(),
  chatHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  currentPlan: coursePlanSchema.optional(),
  currentTopic: planTopicSchema.optional(),
  currentArtifacts: z.array(tutorBlockSchema).max(3).optional().default([]),
  useWebSearch: z.boolean().optional().default(false),
  sourceMaterials: z.array(sourceMaterialSchema).max(12).optional().default([]),
});

export const reasoningChatResponseSchema = z.object({
  responseType: reasoningResponseTypeSchema,
  targetPanel: targetPanelSchema,
  content: z.string().optional(),
  artifact: tutorBlockSchema.optional(),
  plan: coursePlanSchema.optional(),
  sources: groundingSourceSchema.array().optional(),
});

export const attachUrlRequestSchema = z.object({
  url: z.string().url(),
});

export const sourceMaterialResponseSchema = z.object({
  material: sourceMaterialSchema,
});

export const PROF_GUEST_USAGE_HEADER = "x-prof-guest-id";
export const PROF_USAGE_CHANNEL_HEADER = "x-prof-usage-channel";

const GUEST_USAGE_ID_PATTERN = /^[A-Za-z0-9_-]{12,120}$/;

export type ReasoningResponseType = z.infer<typeof reasoningResponseTypeSchema>;
export type ReasoningRequestType = z.infer<typeof reasoningRequestTypeSchema>;
export type ReasoningUpdateTarget = z.infer<typeof reasoningUpdateTargetSchema>;
export type TargetPanel = z.infer<typeof targetPanelSchema>;
export type TutorBlock = z.infer<typeof tutorBlockSchema>;
export type TutorBlockType = z.infer<typeof tutorBlockTypeSchema>;
export type ReasoningChatRequest = z.infer<typeof reasoningChatRequestSchema>;
export type ReasoningChatResponse = z.infer<typeof reasoningChatResponseSchema>;
export type AttachUrlRequest = z.infer<typeof attachUrlRequestSchema>;
export type SourceMaterialResponse = z.infer<typeof sourceMaterialResponseSchema>;

const PUBLIC_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function normalizeGuestUsageId(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return GUEST_USAGE_ID_PATTERN.test(normalized) ? normalized : null;
}

export function createPublicId(length = 10) {
  const nextLength = Math.max(4, Math.floor(length));
  const bytes = new Uint8Array(nextLength);

  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  let value = "";

  for (const byte of bytes) {
    value += PUBLIC_ID_ALPHABET[byte % PUBLIC_ID_ALPHABET.length];
  }

  return value;
}

function normalizeSummaryText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateSummaryText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function isSummaryStatusMessage(message: LearnSessionMessage) {
  return message.kind === "status" || normalizeSummaryText(message.content).startsWith("Status:");
}

function getSummaryConversationMessages(snapshot: LearnSessionSnapshot) {
  return [...(snapshot.chatMessages ?? []), ...(snapshot.liveMessages ?? [])].filter((message) => {
    const content = normalizeSummaryText(message.content);
    return Boolean(content) && !isSummaryStatusMessage(message);
  });
}

function getSummaryTimestampMs(value: string | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getLatestSummaryMessage(snapshot: LearnSessionSnapshot) {
  const messages = getSummaryConversationMessages(snapshot);

  if (messages.length === 0) {
    return null;
  }

  let latest = messages[messages.length - 1] ?? null;
  let latestTimestamp = getSummaryTimestampMs(latest?.createdAt);

  for (const message of messages) {
    const timestamp = getSummaryTimestampMs(message.createdAt);
    if (timestamp >= latestTimestamp) {
      latest = message;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}

export function createLearnSessionSummary(input: {
  sessionId: string;
  snapshot: LearnSessionSnapshot;
  createdAt: string;
  updatedAt: string;
}) {
  const goal = normalizeSummaryText(input.snapshot.goal);
  const latestMessage = getLatestSummaryMessage(input.snapshot);
  const latestText = latestMessage ? normalizeSummaryText(latestMessage.content) : "";
  const title = truncateSummaryText(
    normalizeSummaryText(input.snapshot.plan?.title) ||
      normalizeSummaryText(input.snapshot.course?.title) ||
      goal.split("\n")[0] ||
      latestText ||
      "Untitled session",
    140,
  );
  const preview = truncateSummaryText(
    latestMessage
      ? `${latestMessage.role === "user" ? "You" : "Prof"}: ${latestText}`
      : normalizeSummaryText(input.snapshot.plan?.summary) || goal || "No messages yet.",
    320,
  );

  return learnSessionSummarySchema.parse({
    sessionId: input.sessionId,
    courseId: input.snapshot.course?.courseId ?? input.snapshot.courseId ?? null,
    title,
    preview,
    goal,
    messageCount: getSummaryConversationMessages(input.snapshot).length,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
}
