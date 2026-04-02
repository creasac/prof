"use client";
import {
  appConfigSchema,
  lessonQuizResponseSchema,
  reasoningPlanStreamEventSchema,
  reasoningTopicBlockStreamEventSchema,
  voiceSessionResponseSchema,
  type AppConfig,
  type CourseRef,
  type CourseSnapshot,
  type CoursePlan,
  type Flashcard,
  type GroundingSource,
  type LearnSessionMessage,
  type LearnSessionMessageChannel,
  type LearnSessionMessageKind,
  type LearnSessionSnapshot,
  type LearnSessionSummary,
  type LearnTopicArtifacts,
  type LessonBlock,
  type PlanRequestType,
  type PlanTopic,
  type PlanningClarification,
  type QuizBlock,
  type QuizQuestion,
  type ReasoningRequestType,
  type ReasoningChatResponse,
  type ReasoningUpdateTarget,
  type SourceMaterial,
  type TutorBlock,
  type TutorBlockType,
} from "@prof/contracts";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { authClient } from "../lib/auth-client";
import { fetchApi } from "../lib/api";
import { notifyCourseLibraryUpdated } from "../lib/app-shell-events";
import { buildCourseHref } from "../lib/course-route";
import { loadRemoteCourse } from "../lib/course-api";
import {
  listLocalLearnSessionSummaries,
  readLocalLearnSessionTimestamps,
  readLearnSessionSnapshot,
  serializeLearnSessionActivity,
  serializeLearnSessionSnapshot,
  writeLearnSessionSnapshot,
} from "../lib/learn-session";
import {
  loadRemoteLearnSession,
  loadRemoteLearnSessionSummaries,
  saveRemoteLearnSession,
} from "../lib/learn-session-api";
import { buildLearnHref, buildLearnQuizHref, createLearnSessionId, parseLearnRouteState } from "../lib/learn-route";
import {
  attachUrlMaterial,
  deleteSourceMaterial,
  uploadPdfMaterial,
} from "../lib/source-materials-api";
import {
  createPendingPdfAttachmentDrafts,
  readPendingPdfAttachments,
  writePendingPdfAttachments,
  type PendingPdfAttachmentDraft,
} from "../lib/pending-pdf-attachments";
import {
  buildLearnSessionMaterialFileHref,
  findAttachedUrlMaterial,
  upsertSourceMaterial,
} from "../lib/source-materials";
import { createElevenLabsVoiceSession, type VoiceSessionHandle, type VoiceToolCallPayload } from "../lib/voice/elevenlabs";
import type { QuizProgress } from "../lib/quiz";
import Link from "next/link";
import { PlannerView } from "./PlannerUi";
import { PromptComposer } from "./PromptComposer";
import { SourceMaterialsPanel } from "./SourceMaterialsPanel";
import { BlockView, Icon, IconText } from "./TutorUi";

type ChatMessage = LearnSessionMessage;
type SessionHistoryEntry = LearnSessionSummary;

const DESKTOP_MEDIA_QUERY = "(min-width: 960px)";
const DEFAULT_LEFT_PANE_PERCENT = 56;
const MIN_LEFT_PANE_PERCENT = 42;
const MAX_LEFT_PANE_PERCENT = 78;
const SPLITTER_WIDTH = 16;
const CHAT_SCROLL_BOTTOM_THRESHOLD = 24;
const LIVE_CONTEXT_MAX_CHARS = 1200;
const LIVE_STATUS_PREFIX = "Status:";
const PDF_FILE_MAX_BYTES = 15 * 1024 * 1024;
const LIVE_ARTIFACT_KEYWORDS = [
  "create a lesson",
  "create lesson",
  "generate a lesson",
  "generate lesson",
  "make a lesson",
  "make lesson",
  "create a quiz",
  "create quiz",
  "generate a quiz",
  "generate quiz",
  "make a quiz",
  "make quiz",
  "create flashcards",
  "generate flashcards",
  "make flashcards",
  "add a topic",
  "add topic",
  "create topic",
  "generate topic",
  "new lesson",
  "new quiz",
  "write a lesson",
  "write lesson",
];
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;

const LIVE_REASONING_TOOL_NAME = "request_reasoning";
const REASONING_REQUEST_TYPES = ["new_content", "update_content", "general_query"] as const;
const REASONING_UPDATE_TARGETS = ["lesson", "topic_list", "topic", "quiz", "flashcards", "plan", "all", "unknown"] as const;
const REASONING_BLOCK_TYPES = ["lesson", "quiz", "flashcards", "essay_prompt", "follow_up_question"] as const;

type LiveStatus = "Connected" | "Connecting" | "Disconnected" | "Error";

type LiveReasoningIntent = {
  requestType: ReasoningRequestType;
  updateTarget?: ReasoningUpdateTarget;
  preferredBlockType?: TutorBlockType;
};

type MicrophoneSession = {
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  muteGain: GainNode;
};

type StreamedTopicBlockPreview = {
  blockType: TutorBlockType;
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

type PendingPdfDraft = PendingPdfAttachmentDraft & {
  status: "staged" | "uploading" | "error";
};

class PcmPlayer {
  private context = new AudioContext({ sampleRate: 16000 });
  private nextStartTime = 0;
  private sources: AudioBufferSourceNode[] = [];

  async play(base64Data: string) {
    await this.context.resume();

    const bytes = base64ToBytes(base64Data);
    const pcm = new Int16Array(bytes.buffer);
    const audio = new Float32Array(pcm.length);

    for (let index = 0; index < pcm.length; index += 1) {
      audio[index] = pcm[index] / 32768;
    }

    const buffer = this.context.createBuffer(1, audio.length, 16000);
    buffer.copyToChannel(audio, 0);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    this.sources.push(source);

    const startAt = Math.max(this.context.currentTime + 0.04, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
  }

  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    this.sources = [];
    this.nextStartTime = 0;
  }

  async close() {
    this.stop();
    await this.context.close();
  }
}

function getLiveStatusLabel(status: string) {
  switch (status) {
    case "Connected":
      return "Live";
    case "Connecting":
      return "...";
    case "Disconnected":
      return "Offline";
    case "Error":
      return "Issue";
    default:
      return status;
  }
}

function getLiveStatusIcon(status: string) {
  switch (status) {
    case "Connected":
      return "plug" as const;
    case "Connecting":
      return "live" as const;
    default:
      return "x" as const;
  }
}

function getLiveActionLabel(status: LiveStatus) {
  switch (status) {
    case "Connected":
      return "Close";
    case "Connecting":
      return "...";
    case "Error":
      return "Reconnect";
    default:
      return "Live";
  }
}

function clampPanePercent(value: number) {
  return Math.min(MAX_LEFT_PANE_PERCENT, Math.max(MIN_LEFT_PANE_PERCENT, value));
}

function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[]) {
  if (typeof value !== "string") {
    return undefined;
  }

  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function toSingleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function summarizePlan(plan: CoursePlan) {
  const topicTitles: string[] = [];
  if ("topics" in plan) {
    for (const topic of plan.topics) {
      topicTitles.push(topic.title);
    }
  } else {
    for (const phase of plan.phases) {
      for (const topic of phase.topics) {
        topicTitles.push(topic.title);
      }
    }
  }

  const topicPreview = topicTitles.slice(0, 6).join("; ");
  const extraCount = Math.max(0, topicTitles.length - 6);
  const extraSuffix = extraCount > 0 ? ` (+${extraCount} more)` : "";

  return toSingleLine(
    [
      `Plan "${plan.title}": ${plan.summary}`,
      topicPreview ? `Topics: ${topicPreview}${extraSuffix}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function summarizeTutorBlock(block: TutorBlock) {
  switch (block.type) {
    case "lesson":
      const lessonExcerpt = truncateText(toSingleLine(block.contentMarkdown), 360);
      return toSingleLine(
        [
          `Lesson "${block.title}": ${block.summary}.`,
          block.objectives?.length ? `Objectives: ${block.objectives.slice(0, 4).join("; ")}.` : "",
          lessonExcerpt ? `Excerpt: ${lessonExcerpt}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    case "quiz":
      return toSingleLine(
        `Quiz "${block.title}": ${block.questions.length} questions. ${block.questions
          .slice(0, 3)
          .map((question) => question.prompt)
          .join(" | ")}`,
      );
    case "flashcards":
      return toSingleLine(
        `Flashcards "${block.title}": ${block.cards.length} cards. ${block.cards
          .slice(0, 3)
          .map((card) => card.front)
          .join(" | ")}`,
      );
    case "essay_prompt":
      return toSingleLine(`Essay "${block.title}": ${block.prompt}`);
    case "follow_up_question":
      return toSingleLine(`Clarification needed: ${block.prompt}`);
    default:
      return "";
  }
}

function buildLiveContextDigest(options: {
  goal: string | null;
  plan: CoursePlan | null;
  currentTopic: PlanTopic | null;
  artifacts: TutorBlock[];
}) {
  const lines: string[] = [];
  if (options.goal) {
    lines.push(`Goal: ${options.goal}`);
  }
  if (options.plan) {
    lines.push(summarizePlan(options.plan));
  }
  if (options.currentTopic) {
    lines.push(`Current topic: ${options.currentTopic.title}. ${options.currentTopic.summary}`);
  }
  if (options.artifacts.length > 0) {
    const summaries = options.artifacts.map((artifact) => summarizeTutorBlock(artifact)).filter(Boolean);
    if (summaries.length > 0) {
      lines.push(`Artifacts: ${summaries.join(" | ")}`);
    }
  }

  return truncateText(toSingleLine(lines.join(" ")), LIVE_CONTEXT_MAX_CHARS);
}

function createSessionMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function inferMessageKind(message: Pick<ChatMessage, "content" | "kind">, channel: LearnSessionMessageChannel) {
  if (message.kind) {
    return message.kind;
  }

  if (channel === "live" && message.content.startsWith(LIVE_STATUS_PREFIX)) {
    return "status" as const;
  }

  return "message" as const;
}

function ensureSessionMessage(
  message: ChatMessage,
  channel: LearnSessionMessageChannel,
  fallbackCreatedAt?: string,
): ChatMessage {
  return {
    id: message.id ?? createSessionMessageId(),
    role: message.role,
    content: message.content,
    createdAt: message.createdAt ?? fallbackCreatedAt ?? new Date().toISOString(),
    channel: message.channel ?? channel,
    kind: inferMessageKind(message, message.channel ?? channel),
    sources: message.sources ?? [],
    requestType: message.requestType,
    updateTarget: message.updateTarget,
    responseType: message.responseType,
    targetPanel: message.targetPanel,
    topicId: message.topicId ?? null,
  };
}

function createSessionMessage(options: {
  role: ChatMessage["role"];
  content: string;
  channel: LearnSessionMessageChannel;
  kind?: LearnSessionMessageKind;
  createdAt?: string;
  sources?: GroundingSource[];
  requestType?: ReasoningRequestType;
  updateTarget?: ReasoningUpdateTarget;
  responseType?: ReasoningChatResponse["responseType"];
  targetPanel?: ReasoningChatResponse["targetPanel"];
  topicId?: string | null;
}): ChatMessage {
  return ensureSessionMessage(
    {
      role: options.role,
      content: options.content,
      channel: options.channel,
      kind: options.kind,
      createdAt: options.createdAt,
      sources: options.sources ?? [],
      requestType: options.requestType,
      updateTarget: options.updateTarget,
      responseType: options.responseType,
      targetPanel: options.targetPanel,
      topicId: options.topicId ?? null,
    },
    options.channel,
    options.createdAt,
  );
}

function compareIsoDatesDesc(left: string, right: string) {
  return Date.parse(right) - Date.parse(left);
}

function mergeSessionHistory(entries: SessionHistoryEntry[]) {
  const merged = new Map<string, SessionHistoryEntry>();

  for (const entry of entries) {
    const current = merged.get(entry.sessionId);
    if (!current || compareIsoDatesDesc(current.updatedAt, entry.updatedAt) > 0) {
      merged.set(entry.sessionId, entry);
    }
  }

  return Array.from(merged.values()).sort((left, right) => compareIsoDatesDesc(left.updatedAt, right.updatedAt));
}

function formatHistoryTimestamp(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isLightweightAcknowledgement(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [
    "hi",
    "hello",
    "hey",
    "yo",
    "sup",
    "good morning",
    "good afternoon",
    "good evening",
    "ok",
    "okay",
    "thanks",
    "thank you",
    "cool",
    "great",
    "got it",
    "nice",
    "sounds good",
  ].includes(normalized);
}

function createStreamedTopicBlockPreview(topicTitle: string, preferredBlockType: TutorBlockType | ""): StreamedTopicBlockPreview {
  return {
    blockType: preferredBlockType || "lesson",
    title: topicTitle || "Generated topic",
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

function buildStreamedTopicBlock(preview: StreamedTopicBlockPreview): TutorBlock {
  switch (preview.blockType) {
    case "lesson":
      return {
        type: "lesson",
        title: preview.title || "Generating lesson",
        summary: preview.summary || "Generating lesson...",
        contentMarkdown: preview.contentMarkdown || "Writing lesson...",
        objectives: preview.objectives.length > 0 ? preview.objectives : ["Generating objectives..."],
      };
    case "quiz":
      return {
        type: "quiz",
        title: preview.title || "Generating quiz",
        instructions: preview.instructions || "Writing quiz...",
        questions:
          preview.questions.length > 0
            ? preview.questions
            : [
                {
                  kind: "short_answer",
                  prompt: "Generating question...",
                  expectedAnswer: "The answer will appear as generation continues.",
                  acceptableAnswers: ["The answer will appear as generation continues."],
                  rubric: "Wait for the full streamed quiz content.",
                },
              ],
      };
    case "flashcards":
      return {
        type: "flashcards",
        title: preview.title || "Generating flashcards",
        cards:
          preview.cards.length > 0
            ? preview.cards
            : [
                {
                  front: "Generating card...",
                  back: "More flashcards will appear as generation continues.",
                },
                {
                  front: "Continuing stream...",
                  back: "Waiting for the next card.",
                },
              ],
      };
    case "essay_prompt":
      return {
        type: "essay_prompt",
        title: preview.title || "Generating prompt",
        prompt: preview.prompt || "Writing essay prompt...",
        guidance: preview.guidance.length > 0 ? preview.guidance : ["Generating guidance..."],
      };
    case "follow_up_question":
      return {
        type: "follow_up_question",
        prompt: preview.prompt || "Writing follow-up question...",
        reason: preview.reason || "Generating the reason for the follow-up question.",
      };
  }
}

function getTopicArtifactsEntry(
  topicArtifacts: Record<string, LearnTopicArtifacts>,
  topicId: string | null | undefined,
) {
  if (!topicId) {
    return null;
  }

  return topicArtifacts[topicId] ?? null;
}

function updateTopicArtifacts(
  current: Record<string, LearnTopicArtifacts>,
  topicId: string,
  nextValue: Partial<LearnTopicArtifacts>,
) {
  const previous = current[topicId] ?? { block: null, quiz: null };

  return {
    ...current,
    [topicId]: {
      ...previous,
      ...nextValue,
    },
  };
}

function createCourseRef(input: {
  courseId: string;
  ownerUsername: string;
  courseSlug: string;
  title: string;
}): CourseRef {
  return {
    courseId: input.courseId,
    ownerUsername: input.ownerUsername,
    courseSlug: input.courseSlug,
    title: input.title,
  };
}

function normalizeGoalText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function buildGoalFallback(plan: CoursePlan | null | undefined, course?: CourseRef | null) {
  if (plan) {
    const title = normalizeGoalText(plan.title);
    const summary = normalizeGoalText(plan.summary);
    return [title, summary].filter(Boolean).join("\n");
  }

  const courseTitle = normalizeGoalText(course?.title);
  return courseTitle ? `Study ${courseTitle}` : "";
}

function resolveStoredGoalValue(rawGoal: string | null | undefined, plan: CoursePlan | null | undefined, course?: CourseRef | null) {
  return normalizeGoalText(rawGoal) || buildGoalFallback(plan, course);
}

function createSeededSessionSnapshot(snapshot: CourseSnapshot, course: CourseRef): LearnSessionSnapshot {
  return {
    courseId: course.courseId,
    course,
    goal: resolveStoredGoalValue(snapshot.goal, snapshot.plan, course),
    plannerInput: "",
    plan: snapshot.plan,
    planClarification: null,
    planSources: snapshot.planSources,
    sourceMaterials: snapshot.sourceMaterials ?? [],
    selectedTopicId: snapshot.selectedTopicId,
    generatedBlock: snapshot.generatedBlock,
    generatedTopicId: snapshot.generatedTopicId,
    generatedQuiz: snapshot.generatedQuiz,
    generatedQuizTopicId: snapshot.generatedQuizTopicId,
    generatedQuizError: null,
    quizProgress: null,
    quizResultsByTopic: {},
    topicArtifacts: snapshot.topicArtifacts ?? {},
    blockSources: snapshot.blockSources,
    chatMessages: [],
    liveMessages: [],
    liveInputDraft: "",
    liveOutputDraft: "",
    inputTranscript: "",
    outputTranscript: "",
    leftPanePercent: DEFAULT_LEFT_PANE_PERCENT,
    learnPanelCollapsed: false,
    liveGoal: null,
  };
}

function extractUrls(value: string) {
  return value.match(URL_PATTERN) ?? [];
}

function normalizeTranscriptForCompare(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function findTranscriptOverlap(current: string, next: string) {
  const max = Math.min(current.length, next.length);
  for (let i = max; i > 0; i -= 1) {
    if (current.slice(-i) === next.slice(0, i)) {
      return i;
    }
  }
  return 0;
}

function mergeTranscriptText(current: string, next: string) {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  if (next.startsWith(current)) {
    return next;
  }

  if (current.startsWith(next)) {
    return current;
  }

  const overlap = findTranscriptOverlap(current, next);
  if (overlap > 0) {
    return `${current}${next.slice(overlap)}`;
  }

  return `${current}${next}`;
}

function shouldMergeTranscript(current: string, next: string) {
  const normalizedCurrent = normalizeTranscriptForCompare(current);
  const normalizedNext = normalizeTranscriptForCompare(next);
  if (!normalizedCurrent || !normalizedNext) {
    return false;
  }

  return normalizedNext.startsWith(normalizedCurrent) || normalizedCurrent.startsWith(normalizedNext);
}

type LearnWorkspaceProps = {
  sessionId?: string;
};

export function LearnWorkspace({ sessionId }: LearnWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: authSession, isPending: isAuthPending } = authClient.useSession();
  const routeState = parseLearnRouteState(searchParams);
  const shouldPrefillPlannerInput = !routeState.autoStartAction;
  const autoStartKey = routeState.autoStartAction ? [routeState.autoStartAction, routeState.goal].join("|") : null;

  const [course, setCourse] = useState<CourseRef | null>(null);
  const [goal, setGoal] = useState(() => routeState.goal);
  const [plannerInput, setPlannerInput] = useState(() => (shouldPrefillPlannerInput ? routeState.goal : ""));
  const [isPlanning, setIsPlanning] = useState(false);
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [planClarification, setPlanClarification] = useState<PlanningClarification | null>(null);
  const [planSources, setPlanSources] = useState<GroundingSource[]>([]);
  const [sourceMaterials, setSourceMaterials] = useState<SourceMaterial[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [streamedRequestType, setStreamedRequestType] = useState<PlanRequestType | null>(null);
  const [streamedPlanTitle, setStreamedPlanTitle] = useState("");
  const [streamedTopics, setStreamedTopics] = useState<PlanTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [isGeneratingTopic, setIsGeneratingTopic] = useState(false);
  const [streamedGeneratedBlock, setStreamedGeneratedBlock] = useState<StreamedTopicBlockPreview | null>(null);
  const [generatedBlock, setGeneratedBlock] = useState<TutorBlock | null>(null);
  const [generatedTopicId, setGeneratedTopicId] = useState<string | null>(null);
  const [generatedQuiz, setGeneratedQuiz] = useState<QuizBlock | null>(null);
  const [generatedQuizTopicId, setGeneratedQuizTopicId] = useState<string | null>(null);
  const [generatedQuizError, setGeneratedQuizError] = useState<string | null>(null);
  const [quizProgress, setQuizProgress] = useState<QuizProgress | null>(null);
  const [quizResultsByTopic, setQuizResultsByTopic] = useState<Record<string, number>>({});
  const [topicArtifacts, setTopicArtifacts] = useState<Record<string, LearnTopicArtifacts>>({});
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [blockSources, setBlockSources] = useState<GroundingSource[]>([]);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("Disconnected");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [liveInputDraft, setLiveInputDraft] = useState("");
  const [liveOutputDraft, setLiveOutputDraft] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryEntry[]>([]);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [leftPanePercent, setLeftPanePercent] = useState(DEFAULT_LEFT_PANE_PERCENT);
  const [isLearnPanelCollapsed, setIsLearnPanelCollapsed] = useState(false);
  const [isResizingPane, setIsResizingPane] = useState(false);
  const [isSessionHydrated, setIsSessionHydrated] = useState(() => !sessionId);
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
  const [pendingPdfDrafts, setPendingPdfDrafts] = useState<PendingPdfDraft[]>([]);
  const [isPendingPdfDraftsHydrated, setIsPendingPdfDraftsHydrated] = useState(() => !sessionId);
  const [removingMaterialIds, setRemovingMaterialIds] = useState<string[]>([]);

  const configRef = useRef<AppConfig | null>(null);
  const planClarificationRef = useRef<PlanningClarification | null>(null);
  const configPromiseRef = useRef<Promise<AppConfig> | null>(null);
  const autoStartConsumedRef = useRef<string | null>(null);
  const routeGoalSeedRef = useRef<{
    sessionId: string | null;
    goal: string;
  }>({
    sessionId: sessionId ?? null,
    goal: normalizeGoalText(routeState.goal),
  });
  const liveSessionRef = useRef<VoiceSessionHandle | null>(null);
  const microphoneRef = useRef<MicrophoneSession | null>(null);
  const liveInputDraftRef = useRef("");
  const liveOutputDraftRef = useRef("");
  const lastLiveUserMessageRef = useRef<string | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const planRef = useRef<CoursePlan | null>(null);
  const goalRef = useRef<string | null>(null);
  const selectedTopicIdRef = useRef<string | null>(null);
  const generatedTopicIdRef = useRef<string | null>(null);
  const generatedBlockRef = useRef<TutorBlock | null>(null);
  const generatedQuizRef = useRef<QuizBlock | null>(null);
  const topicArtifactsRef = useRef<Record<string, LearnTopicArtifacts>>({});
  const sourceMaterialsRef = useRef<SourceMaterial[]>([]);
  const pendingPdfDraftsRef = useRef<PendingPdfDraft[]>([]);
  const liveMessagesRef = useRef<ChatMessage[]>([]);
  const lastLiveStatusRef = useRef<{ text: string; at: number } | null>(null);
  const liveAudioStatusRef = useRef(false);
  const liveToolInFlightRef = useRef(false);
  const liveContextDigestRef = useRef<string>("");
  const lastLiveContextSentRef = useRef<string>("");
  const disconnectRequestedRef = useRef(false);
  const liveGoalRef = useRef<string | null>(null);
  const courseRef = useRef<CourseRef | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const chatAutoScrollLockedRef = useRef(false);
  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const historyPanelRef = useRef<HTMLDivElement | null>(null);
  const planningAbortRef = useRef<AbortController | null>(null);
  const splitterPointerIdRef = useRef<number | null>(null);
  const generatedSectionRef = useRef<HTMLElement | null>(null);
  const companionQuizRequestRef = useRef<string | null>(null);
  const remoteSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCachedSnapshotKeyRef = useRef<string | null>(null);
  const lastTrackedActivityKeyRef = useRef<string | null>(null);
  const sessionTimestampsRef = useRef<{ createdAt: string; updatedAt: string } | null>(null);

  function commitPendingPdfDrafts(nextDrafts: PendingPdfDraft[]) {
    pendingPdfDraftsRef.current = nextDrafts;
    setPendingPdfDrafts(nextDrafts);

    if (sessionId) {
      writePendingPdfAttachments(
        sessionId,
        nextDrafts.map((draft) => ({
          id: draft.id,
          file: draft.file,
        })),
      );
    }
  }

  function updatePendingPdfDrafts(updater: (current: PendingPdfDraft[]) => PendingPdfDraft[]) {
    commitPendingPdfDrafts(updater(pendingPdfDraftsRef.current));
  }

  useEffect(() => {
    void loadConfig();

    return () => {
      void disconnectLiveSession();
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      void disconnectLiveSession();
    };

    const handlePageHide = () => {
      void disconnectLiveSession();
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  useEffect(() => {
    liveInputDraftRef.current = liveInputDraft;
  }, [liveInputDraft]);

  useEffect(() => {
    liveOutputDraftRef.current = liveOutputDraft;
  }, [liveOutputDraft]);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  useEffect(() => {
    planClarificationRef.current = planClarification;
  }, [planClarification]);

  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);

  useEffect(() => {
    courseRef.current = course;
  }, [course]);

  useEffect(() => {
    const nextGoal = normalizeGoalText(routeState.goal);

    if (sessionId && nextGoal) {
      routeGoalSeedRef.current = {
        sessionId,
        goal: nextGoal,
      };
      return;
    }

    if (!sessionId) {
      routeGoalSeedRef.current = {
        sessionId: null,
        goal: nextGoal,
      };
      return;
    }

    if (routeGoalSeedRef.current.sessionId !== sessionId) {
      routeGoalSeedRef.current = {
        sessionId,
        goal: nextGoal,
      };
    }
  }, [sessionId, routeState.goal]);

  useEffect(() => {
    selectedTopicIdRef.current = selectedTopicId;
  }, [selectedTopicId]);

  useEffect(() => {
    generatedTopicIdRef.current = generatedTopicId;
  }, [generatedTopicId]);

  useEffect(() => {
    generatedBlockRef.current = generatedBlock;
  }, [generatedBlock]);

  useEffect(() => {
    generatedQuizRef.current = generatedQuiz;
  }, [generatedQuiz]);

  useEffect(() => {
    topicArtifactsRef.current = topicArtifacts;
  }, [topicArtifacts]);

  useEffect(() => {
    sourceMaterialsRef.current = sourceMaterials;
  }, [sourceMaterials]);

  useEffect(() => {
    setIsPendingPdfDraftsHydrated(false);

    if (!sessionId) {
      commitPendingPdfDrafts([]);
      setIsPendingPdfDraftsHydrated(true);
      return;
    }

    commitPendingPdfDrafts(readPendingPdfAttachments(sessionId).map(createPendingPdfDraft));
    setIsPendingPdfDraftsHydrated(true);
  }, [sessionId]);

  useEffect(() => {
    setIsUploadingMaterial(pendingPdfDrafts.some((draft) => draft.status === "uploading"));
  }, [pendingPdfDrafts]);

  useEffect(() => {
    liveMessagesRef.current = liveMessages;
  }, [liveMessages]);

  useEffect(() => {
    const digest = refreshLiveContextDigest();
    if (liveSessionRef.current && liveStatus === "Connected") {
      sendLiveContextUpdate(liveSessionRef.current, digest);
    }
  }, [plan, generatedBlock, generatedQuiz, selectedTopicId, goal, liveStatus]);

  useEffect(() => {
    if (!sessionId || !isSessionHydrated) {
      return;
    }

    if (isAuthPending) {
      return;
    }

    if (!authSession?.user?.id) {
      if (pendingPdfDrafts.length > 0) {
        setMaterialError((current) => current ?? "Sign in to attach PDFs to a course.");
      }
      return;
    }

    if (pendingPdfDrafts.some((draft) => draft.status === "uploading")) {
      return;
    }

    const nextDraft = pendingPdfDrafts.find((draft) => draft.status === "staged");
    if (!nextDraft) {
      return;
    }

    updatePendingPdfDrafts((current) =>
      current.map((draft) => (draft.id === nextDraft.id ? { ...draft, status: "uploading" } : draft)),
    );
    setMaterialError(null);

    let cancelled = false;

    void (async () => {
      try {
        if (nextDraft.file.size > PDF_FILE_MAX_BYTES) {
          throw new Error("PDF exceeds the 15 MB limit.");
        }

        const material = await uploadPdfMaterial(sessionId, nextDraft.file);
        if (cancelled) {
          return;
        }

        setSourceMaterials((current) => upsertSourceMaterial(current, material));
        updatePendingPdfDrafts((current) => current.filter((draft) => draft.id !== nextDraft.id));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setMaterialError(error instanceof Error ? error.message : "Failed to upload PDF.");
        updatePendingPdfDrafts((current) =>
          current.map((draft) => (draft.id === nextDraft.id ? { ...draft, status: "error" } : draft)),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authSession?.user?.id, isAuthPending, isSessionHydrated, pendingPdfDrafts, sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      setIsSessionHydrated(false);
      setPlannerError(null);
      setTopicError(null);
      setLiveError(null);
      setLiveStatus("Disconnected");
      setIsMicActive(false);

      if (!sessionId) {
        if (!cancelled) {
          setCourse(null);
          setIsSessionHydrated(true);
        }
        return;
      }

      if (isAuthPending) {
        return;
      }

      const localSnapshot = readLearnSessionSnapshot(sessionId);
      const localTimestamps = readLocalLearnSessionTimestamps(sessionId);
      let snapshot: LearnSessionSnapshot | null = localSnapshot;
      let nextTimestamps = localTimestamps;

      if (authSession?.user?.id && !snapshot) {
        try {
          const remoteSession = await loadRemoteLearnSession(sessionId, {
            cacheKey: authSession.user.id,
          });
          if (!cancelled && remoteSession) {
            snapshot = remoteSession.snapshot;
            nextTimestamps = {
              createdAt: remoteSession.createdAt,
              updatedAt: remoteSession.updatedAt,
            };
          }
        } catch (error) {
          console.error(error);
        }
      }

      if (!snapshot && routeState.courseOwnerUsername && routeState.courseSlug) {
        try {
          const remoteCourse = await loadRemoteCourse(routeState.courseOwnerUsername, routeState.courseSlug);
          if (!cancelled && remoteCourse) {
            snapshot = createSeededSessionSnapshot(
              remoteCourse.snapshot,
              createCourseRef({
                courseId: remoteCourse.courseId,
                ownerUsername: remoteCourse.ownerUsername,
                courseSlug: remoteCourse.courseSlug,
                title: remoteCourse.title,
              }),
            );
          }
        } catch (error) {
          console.error(error);
        }
      }

      if (cancelled) {
        return;
      }

      const routeGoalSeed =
        normalizeGoalText(routeState.goal) ||
        (routeGoalSeedRef.current.sessionId === sessionId ? routeGoalSeedRef.current.goal : "");

      const nextChatMessages = (snapshot?.chatMessages ?? []).map((message) => ensureSessionMessage(message, "chat"));
      const nextLiveMessages = (snapshot?.liveMessages ?? []).map((message) => ensureSessionMessage(message, "live"));
      const nextSnapshot: LearnSessionSnapshot = snapshot
        ? {
            ...snapshot,
            sourceMaterials: snapshot.sourceMaterials ?? [],
            planSources: snapshot.planSources,
            generatedQuiz:
              snapshot.generatedQuiz ?? (snapshot.generatedBlock?.type === "quiz" ? snapshot.generatedBlock : null),
            generatedQuizTopicId:
              snapshot.generatedQuizTopicId ?? (snapshot.generatedBlock?.type === "quiz" ? snapshot.generatedTopicId : null),
            quizResultsByTopic: snapshot.quizResultsByTopic ?? {},
            topicArtifacts: snapshot.topicArtifacts ?? {},
            blockSources: snapshot.blockSources,
            chatMessages: nextChatMessages,
            liveMessages: nextLiveMessages,
            liveInputDraft: snapshot.liveInputDraft ?? snapshot.inputTranscript ?? "",
            liveOutputDraft: snapshot.liveOutputDraft ?? snapshot.outputTranscript ?? "",
            leftPanePercent: clampPanePercent(snapshot.leftPanePercent),
            learnPanelCollapsed: snapshot.learnPanelCollapsed ?? false,
            liveGoal: snapshot.liveGoal,
          }
        : {
            courseId: null,
            course: null,
            goal: routeGoalSeed,
            plannerInput: shouldPrefillPlannerInput ? routeGoalSeed : "",
            plan: null,
            planClarification: null,
            planSources: [],
            sourceMaterials: [],
            selectedTopicId: null,
            generatedBlock: null,
            generatedTopicId: null,
            generatedQuiz: null,
            generatedQuizTopicId: null,
            generatedQuizError: null,
            quizProgress: null,
            quizResultsByTopic: {},
            topicArtifacts: {},
            blockSources: [],
            chatMessages: [],
            liveMessages: [],
            liveInputDraft: "",
            liveOutputDraft: "",
            leftPanePercent: DEFAULT_LEFT_PANE_PERCENT,
            learnPanelCollapsed: false,
            liveGoal: null,
          };

      sessionTimestampsRef.current = nextTimestamps;
      lastCachedSnapshotKeyRef.current = serializeLearnSessionSnapshot(nextSnapshot);
      lastTrackedActivityKeyRef.current = serializeLearnSessionActivity(nextSnapshot);

      if (nextTimestamps) {
        writeLearnSessionSnapshot(sessionId, nextSnapshot, {
          createdAt: nextTimestamps.createdAt,
          updatedAt: nextTimestamps.updatedAt,
          notifyHistoryUpdate: false,
        });
      }

      setCourse(nextSnapshot.course ?? null);
      setGoal(resolveStoredGoalValue(nextSnapshot.goal, nextSnapshot.plan, nextSnapshot.course ?? null));
      setPlannerInput(nextSnapshot.plannerInput);
      setPlan(nextSnapshot.plan);
      setPlanClarification(nextSnapshot.planClarification);
      setPlanSources(nextSnapshot.planSources);
      setSourceMaterials(nextSnapshot.sourceMaterials ?? []);
      setStreamedRequestType(null);
      setStreamedPlanTitle("");
      setStreamedTopics([]);
      setSelectedTopicId(nextSnapshot.selectedTopicId);
      setStreamedGeneratedBlock(null);
      setGeneratedBlock(nextSnapshot.generatedBlock);
      setGeneratedTopicId(nextSnapshot.generatedTopicId);
      setGeneratedQuiz(nextSnapshot.generatedQuiz);
      setGeneratedQuizTopicId(nextSnapshot.generatedQuizTopicId);
      setGeneratedQuizError(nextSnapshot.generatedQuizError);
      setQuizProgress(nextSnapshot.quizProgress);
      setQuizResultsByTopic(nextSnapshot.quizResultsByTopic ?? {});
      setTopicArtifacts(nextSnapshot.topicArtifacts ?? {});
      setIsGeneratingQuiz(false);
      companionQuizRequestRef.current = null;
      setBlockSources(nextSnapshot.blockSources);
      setChatMessages(nextChatMessages);
      setLiveMessages(nextLiveMessages);
      lastLiveUserMessageRef.current =
        [...nextLiveMessages].reverse().find((message) => message.role === "user")?.content ?? null;
      setLiveInputDraft(nextSnapshot.liveInputDraft ?? "");
      setLiveOutputDraft(nextSnapshot.liveOutputDraft ?? "");
      setLeftPanePercent(nextSnapshot.leftPanePercent);
      setIsLearnPanelCollapsed(nextSnapshot.learnPanelCollapsed ?? false);
      liveGoalRef.current = nextSnapshot.liveGoal;

      setIsSessionHydrated(true);
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [
    authSession?.user?.id,
    isAuthPending,
    routeState.courseOwnerUsername,
    routeState.courseSlug,
    routeState.goal,
    sessionId,
    shouldPrefillPlannerInput,
  ]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);

    const syncDesktopMode = () => {
      setIsDesktop(mediaQuery.matches);
    };

    syncDesktopMode();
    mediaQuery.addEventListener("change", syncDesktopMode);

    return () => {
      mediaQuery.removeEventListener("change", syncDesktopMode);
    };
  }, []);

  useEffect(() => {
    if (!routeState.autoStartAction || !autoStartKey || autoStartConsumedRef.current === autoStartKey) {
      return;
    }

    if (!isPendingPdfDraftsHydrated) {
      return;
    }

    if (pendingPdfDrafts.some((draft) => draft.status === "uploading")) {
      return;
    }

    if (pendingPdfDrafts.some((draft) => draft.status === "staged")) {
      if (isAuthPending) {
        return;
      }

      if (authSession?.user?.id) {
        return;
      }
    }

    autoStartConsumedRef.current = autoStartKey;
    setGoal(routeState.goal);
    setPlannerInput("");

    router.replace(
      buildLearnHref({
        sessionId,
        courseOwnerUsername: course?.ownerUsername ?? routeState.courseOwnerUsername,
        courseSlug: course?.courseSlug ?? routeState.courseSlug,
        goal: "",
        autoStartAction: null,
      }),
      { scroll: false },
    );

    if (routeState.autoStartAction === "generate") {
      void submitPlannerRequest({
        goalOverride: routeState.goal,
        inputOverride: routeState.goal,
      });
      return;
    }

    void startLiveSession({
      goalOverride: routeState.goal,
    });
  }, [
    authSession?.user?.id,
    autoStartKey,
    routeState.autoStartAction,
    routeState.goal,
    router,
    course,
    isAuthPending,
    isPendingPdfDraftsHydrated,
    pendingPdfDrafts,
    routeState.courseOwnerUsername,
    routeState.courseSlug,
    sessionId,
  ]);

  useEffect(() => {
    if (!sessionId || !isSessionHydrated) {
      return;
    }

    const storedGoal = resolveStoredGoalValue(goal, plan, course);
    const snapshot: LearnSessionSnapshot = {
      courseId: course?.courseId ?? null,
      course,
      goal: storedGoal,
      plannerInput,
      plan,
      planClarification,
      planSources,
      sourceMaterials,
      selectedTopicId,
      generatedBlock,
      generatedTopicId,
      generatedQuiz,
      generatedQuizTopicId,
      generatedQuizError,
      quizProgress,
      quizResultsByTopic,
      topicArtifacts,
      blockSources,
      chatMessages,
      liveMessages,
      liveInputDraft,
      liveOutputDraft,
      leftPanePercent,
      learnPanelCollapsed: isLearnPanelCollapsed,
      liveGoal: liveGoalRef.current,
    };
    const snapshotKey = serializeLearnSessionSnapshot(snapshot);
    if (snapshotKey === lastCachedSnapshotKeyRef.current) {
      return;
    }

    const activityKey = serializeLearnSessionActivity(snapshot);
    const hasTrackedActivityChange = activityKey !== lastTrackedActivityKeyRef.current;

    writeLearnSessionSnapshot(sessionId, snapshot, {
      createdAt: sessionTimestampsRef.current?.createdAt,
      trackInHistory: hasTrackedActivityChange,
    });
    lastCachedSnapshotKeyRef.current = snapshotKey;

    if (!hasTrackedActivityChange) {
      return;
    }

    lastTrackedActivityKeyRef.current = activityKey;
    sessionTimestampsRef.current = {
      createdAt: sessionTimestampsRef.current?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (remoteSaveTimeoutRef.current) {
      clearTimeout(remoteSaveTimeoutRef.current);
      remoteSaveTimeoutRef.current = null;
    }

    if (!authSession?.user?.id) {
      return;
    }

    remoteSaveTimeoutRef.current = setTimeout(() => {
      void saveRemoteLearnSession(sessionId, snapshot, {
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
          const nextCourse = persistedSession.snapshot.course ?? null;
          const currentCourse = courseRef.current;
          const currentCourseKey = currentCourse
            ? `${currentCourse.courseId}:${currentCourse.ownerUsername}:${currentCourse.courseSlug}:${currentCourse.title}`
            : "";
          const nextCourseKey = nextCourse
            ? `${nextCourse.courseId}:${nextCourse.ownerUsername}:${nextCourse.courseSlug}:${nextCourse.title}`
            : "";

          if (currentCourseKey !== nextCourseKey) {
            notifyCourseLibraryUpdated();
          }

          setCourse((current) => {
            const currentKey = current
              ? `${current.courseId}:${current.ownerUsername}:${current.courseSlug}:${current.title}`
              : "";
            const nextKey = nextCourse
              ? `${nextCourse.courseId}:${nextCourse.ownerUsername}:${nextCourse.courseSlug}:${nextCourse.title}`
              : "";

            return currentKey === nextKey ? current : nextCourse;
          });
        })
        .catch((error) => {
          console.error(error);
        });
    }, 500);

    return () => {
      if (remoteSaveTimeoutRef.current) {
        clearTimeout(remoteSaveTimeoutRef.current);
        remoteSaveTimeoutRef.current = null;
      }
    };
  }, [
    authSession?.user?.id,
    blockSources,
    chatMessages,
    course,
    generatedBlock,
    generatedTopicId,
    generatedQuiz,
    generatedQuizError,
    generatedQuizTopicId,
    goal,
    isLearnPanelCollapsed,
    leftPanePercent,
    liveStatus,
    liveInputDraft,
    liveMessages,
    liveOutputDraft,
    plan,
    planClarification,
    planSources,
    plannerInput,
    quizProgress,
    quizResultsByTopic,
    selectedTopicId,
    sessionId,
    isSessionHydrated,
    sourceMaterials,
    topicArtifacts,
  ]);

  useEffect(() => {
    if (!isHistoryOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (historyPanelRef.current?.contains(target) || historyButtonRef.current?.contains(target)) {
        return;
      }

      setIsHistoryOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsHistoryOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isHistoryOpen]);

  useEffect(() => {
    setIsHistoryOpen(false);
  }, [sessionId]);

  useEffect(() => {
    if (!isHistoryOpen) {
      return;
    }

    void loadSessionHistory();
  }, [authSession?.user?.id, isAuthPending, isHistoryOpen]);

  useEffect(() => {
    if (chatAutoScrollLockedRef.current) {
      return;
    }

    const element = chatBodyRef.current;
    if (!element) {
      return;
    }

    requestAnimationFrame(() => {
      if (!chatAutoScrollLockedRef.current) {
        scrollChatToBottom();
      }
    });
  }, [chatMessages, liveMessages, liveInputDraft, liveOutputDraft, liveError, goal]);

  async function loadSessionHistory() {
    setIsHistoryLoading(true);
    setHistoryError(null);

    const localEntries = listLocalLearnSessionSummaries();
    let remoteEntries: SessionHistoryEntry[] = [];
    let nextError: string | null = null;

    if (authSession?.user?.id) {
      try {
        remoteEntries = await loadRemoteLearnSessionSummaries({
          cacheKey: authSession.user.id,
        });
      } catch (error) {
        nextError = error instanceof Error ? error.message : "Failed to load saved learn sessions.";
      }
    }

    setSessionHistory(mergeSessionHistory([...remoteEntries, ...localEntries]));
    setHistoryError(nextError);
    setIsHistoryLoading(false);
  }

  function handleHistoryToggle() {
    setIsHistoryOpen((current) => !current);
  }

  function handleHistorySelect(entry: SessionHistoryEntry) {
    setIsHistoryOpen(false);

    if (entry.sessionId === sessionId) {
      return;
    }

    router.push(
      buildLearnHref({
        sessionId: entry.sessionId,
        courseOwnerUsername: null,
        courseSlug: null,
        goal: "",
        autoStartAction: null,
      }),
      { scroll: false },
    );
  }

  useEffect(() => {
    if (!isSessionHydrated || isGeneratingTopic || isGeneratingQuiz) {
      return;
    }

    if (!generatedBlock || generatedBlock.type !== "lesson" || !generatedTopicId) {
      return;
    }

    if (generatedQuiz && generatedQuizTopicId === generatedTopicId) {
      return;
    }

    if (generatedQuizError) {
      return;
    }

    const topic = plan ? findTopicInPlan(plan, generatedTopicId) : null;
    void requestLessonQuiz({
      topicId: generatedTopicId,
      topicTitle: topic?.title ?? generatedBlock.title,
      topicSummary: topic?.summary ?? "",
      lesson: generatedBlock,
    });
  }, [
    generatedBlock,
    generatedQuiz,
    generatedQuizError,
    generatedQuizTopicId,
    generatedTopicId,
    isGeneratingQuiz,
    isGeneratingTopic,
    isSessionHydrated,
    plan,
  ]);

  async function loadConfig() {
    if (configRef.current) {
      return configRef.current;
    }

    if (configPromiseRef.current) {
      return configPromiseRef.current;
    }

    const request = fetchApi("/api/config")
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to load app config.");
        }

        return appConfigSchema.parse(await response.json());
      })
      .then((data) => {
        configRef.current = data;
        return data;
      })
      .finally(() => {
        configPromiseRef.current = null;
      });

    configPromiseRef.current = request;
    return request;
  }

  async function getAutomaticSearchEnabled() {
    try {
      const config = configRef.current ?? (await loadConfig());
      return config.search.enabled;
    } catch {
      return false;
    }
  }

  function showTopicArtifacts(topicId: string | null) {
    setSelectedTopicId(topicId);

    const storedArtifacts = getTopicArtifactsEntry(topicArtifactsRef.current, topicId);
    const storedQuiz = storedArtifacts?.quiz ?? (storedArtifacts?.block?.type === "quiz" ? storedArtifacts.block : null);

    setGeneratedBlock(storedArtifacts?.block ?? null);
    setGeneratedTopicId(storedArtifacts?.block || storedQuiz ? topicId : null);
    setGeneratedQuiz(storedQuiz);
    setGeneratedQuizTopicId(storedQuiz ? topicId : null);
    setGeneratedQuizError(null);
    setQuizProgress(null);
    setBlockSources([]);
    setTopicError(null);
  }

  async function requestLessonQuiz(options: {
    topicId: string;
    topicTitle: string;
    topicSummary: string;
    lesson: LessonBlock;
  }) {
    const quizGoal = getActiveGoalValue();
    if (!quizGoal) {
      setGeneratedQuizError("Describe what you want to learn first.");
      return null;
    }

    const requestId = `${options.topicId}:${Date.now().toString(36)}`;
    companionQuizRequestRef.current = requestId;
    setIsGeneratingQuiz(true);
    setGeneratedQuiz(null);
    setGeneratedQuizTopicId(null);
    setGeneratedQuizError(null);
    setQuizProgress(null);
    setTopicArtifacts((current) => updateTopicArtifacts(current, options.topicId, { quiz: null }));

    try {
      const response = await fetchApi("/api/reasoning/topic-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal: quizGoal,
          topicId: options.topicId,
          topicTitle: options.topicTitle,
          topicSummary: options.topicSummary,
          lesson: options.lesson,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Quiz generation failed.");
      }

      const payload = lessonQuizResponseSchema.parse(await response.json());

      if (companionQuizRequestRef.current !== requestId) {
        return null;
      }

      setGeneratedQuiz(payload.quiz);
      setGeneratedQuizTopicId(payload.topicId);
      setTopicArtifacts((current) => updateTopicArtifacts(current, payload.topicId, { quiz: payload.quiz }));
      return payload.quiz;
    } catch (error) {
      if (companionQuizRequestRef.current === requestId) {
        setGeneratedQuizError(error instanceof Error ? error.message : "Quiz generation failed.");
      }

      return null;
    } finally {
      if (companionQuizRequestRef.current === requestId) {
        setIsGeneratingQuiz(false);
      }
    }
  }

  async function submitPlannerRequest(options: {
    goalOverride?: string;
    inputOverride?: string;
  } = {}) {
    if (planningAbortRef.current) {
      planningAbortRef.current.abort();
    }
    const controller = new AbortController();
    planningAbortRef.current = controller;

    const mode = getPlanningMode({
      clarification: planClarification,
      plan,
    });
    const nextGoalSource = options.goalOverride ?? goal;
    const nextInput = normalizeValue(options.inputOverride ?? plannerInput);
    const requestGoal = mode === "draft" ? normalizeValue(options.goalOverride ?? nextInput) : nextGoalSource;

    if (!requestGoal) {
      setPlannerError("Describe what you want to learn first.");
      return;
    }

    if (mode !== "draft" && !nextInput) {
      setPlannerError(
        mode === "clarify"
          ? "Answer the follow-up question before updating the plan."
          : "Describe how you want the plan to change.",
      );
      return;
    }

    setPlannerInput("");
    setGoal(requestGoal);
    setIsPlanning(true);
    setPlannerError(null);
    setTopicError(null);
    setPlanSources([]);
    setStreamedRequestType(null);
    setStreamedPlanTitle("");
    setStreamedTopics([]);
    setGeneratedBlock(null);
    setGeneratedTopicId(null);
    setBlockSources([]);
    setQuizResultsByTopic({});
    setTopicArtifacts({});
    setIsLearnPanelCollapsed(false);

    try {
      const useWebSearch = await getAutomaticSearchEnabled();
      const requestSourceMaterials = await ensureUrlMaterialsAttached([requestGoal, nextInput].filter(Boolean).join("\n"));
      const response = await fetchApi("/api/reasoning/plan/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          goal: requestGoal,
          currentPlan: mode === "refine" ? plan : undefined,
          userInput: mode === "draft" ? undefined : nextInput,
          useWebSearch,
          sourceMaterials: requestSourceMaterials,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Planning request failed.");
      }

      if (!response.body) {
        throw new Error("Planning stream failed to start.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedFinalEvent = false;

      const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }

        const event = reasoningPlanStreamEventSchema.parse(JSON.parse(trimmed));

        switch (event.type) {
          case "meta":
            setStreamedRequestType(event.meta.requestType ?? null);
            setStreamedPlanTitle(event.meta.title ?? "");
            if (event.meta.recommendedStartingTopicId) {
              setSelectedTopicId((current) => current ?? event.meta.recommendedStartingTopicId ?? null);
            }
            break;
          case "topic":
            setStreamedTopics((current) => {
              if (current.some((topic) => topic.id === event.topic.id)) {
                return current;
              }

              return [...current, event.topic];
            });
            setSelectedTopicId((current) => current ?? event.topic.id);
            break;
          case "clarification":
            setPlanClarification(event.clarification);
            setPlannerInput("");
            break;
          case "final":
            receivedFinalEvent = true;
            setPlanSources(event.payload.sources);

            if (event.payload.result === "clarification") {
              setPlanClarification(event.payload.clarification);
              setPlannerInput("");
              setStreamedRequestType(null);
              setStreamedPlanTitle("");
              setStreamedTopics([]);
              return;
            }

            const finalPlan = event.payload.plan;
            setPlan(finalPlan);
            setPlanClarification(null);
            setSelectedTopicId((current) => pickSelectedTopicId(finalPlan, current));
            setPlannerInput("");
            setStreamedRequestType(null);
            setStreamedPlanTitle("");
            setStreamedTopics([]);
            break;
          case "error":
            throw new Error(event.error);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          consumeLine(line);
        }

        if (controller.signal.aborted) {
          return;
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        consumeLine(buffer);
      }

      if (!receivedFinalEvent && !controller.signal.aborted) {
        throw new Error("Planning stream ended before the final result arrived.");
      }
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        return;
      }
      setStreamedRequestType(null);
      setStreamedPlanTitle("");
      setStreamedTopics([]);
      setPlannerError(error instanceof Error ? error.message : "Planning request failed.");
    } finally {
      if (planningAbortRef.current === controller) {
        planningAbortRef.current = null;
      }
      setIsPlanning(false);
    }
  }

  function stopPlannerRequest() {
    if (!planningAbortRef.current) {
      return;
    }

    planningAbortRef.current.abort();
    setIsPlanning(false);
  }

  async function ensureUrlMaterialsAttached(input: string) {
    const trimmed = input.trim();
    let nextMaterials = sourceMaterialsRef.current;

    if (!trimmed || !sessionId || !authSession?.user?.id) {
      return nextMaterials;
    }

    const urls = extractUrls(trimmed);
    if (urls.length === 0) {
      return nextMaterials;
    }

    let changed = false;

    for (const rawUrl of urls) {
      if (findAttachedUrlMaterial(nextMaterials, rawUrl)) {
        continue;
      }

      try {
        const material = await attachUrlMaterial(sessionId, rawUrl);
        nextMaterials = upsertSourceMaterial(nextMaterials, material);
        changed = true;
      } catch (error) {
        setMaterialError(error instanceof Error ? error.message : "Failed to attach URL.");
      }
    }

    if (changed) {
      setSourceMaterials(nextMaterials);
    }

    return nextMaterials;
  }

  function seedLearnGoal(nextValue: string) {
    const trimmed = normalizeValue(nextValue);
    if (!trimmed) {
      return;
    }

    if (normalizeValue(goalRef.current ?? "")) {
      return;
    }

    setGoal(trimmed);
  }

  async function handleAttachPdfFiles(files: File[]) {
    if (!sessionId) {
      setMaterialError("Start a learn session before attaching PDFs.");
      return;
    }

    const pdfFiles = files.filter(isPdfFile);
    if (pdfFiles.length === 0) {
      setMaterialError("Only PDF files are supported.");
      return;
    }

    setMaterialError(null);
    updatePendingPdfDrafts((current) => [...current, ...createPendingPdfAttachmentDrafts(pdfFiles).map(createPendingPdfDraft)]);
  }

  async function handleRemoveAttachedMaterial(materialId: string) {
    if (!sessionId) {
      return;
    }

    const material = sourceMaterialsRef.current.find((entry) => entry.id === materialId) ?? null;
    setRemovingMaterialIds((current) => (current.includes(materialId) ? current : [...current, materialId]));
    setMaterialError(null);

    try {
      await deleteSourceMaterial(sessionId, materialId, material?.storageKey);
      setSourceMaterials((current) => current.filter((material) => material.id !== materialId));
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Failed to remove PDF.");
    } finally {
      setRemovingMaterialIds((current) => current.filter((id) => id !== materialId));
    }
  }

  function handleRemovePendingPdfDraft(draftId: string) {
    updatePendingPdfDrafts((current) => current.filter((draft) => draft.id !== draftId));
  }

  function handleRemoveComposerAttachment(attachmentId: string) {
    if (attachmentId.startsWith("material:")) {
      void handleRemoveAttachedMaterial(attachmentId.slice("material:".length));
      return;
    }

    if (attachmentId.startsWith("draft:")) {
      handleRemovePendingPdfDraft(attachmentId.slice("draft:".length));
    }
  }

  async function submitChatRequest(input: string) {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      return;
    }

    const currentArtifacts = collectCurrentArtifacts(generatedBlock, generatedQuiz);
    const currentTopic = resolveCurrentTopic(plan);
    const clarificationIntent: TextReasoningIntent | null = planClarification
      ? {
          requestType: "update_content",
          updateTarget: "plan",
        }
      : null;
    const intent = classifyTextIntent(input) ?? clarificationIntent;
    const requestType = intent?.requestType ?? "general_query";
    const shouldApplyLearnUpdates = requestType !== "general_query";
    const preferredType = intent?.preferredBlockType;
    const currentTopicId = currentTopic?.id ?? selectedTopicId ?? generatedTopicId;
    const userMessage = createSessionMessage({
      role: "user",
      content: trimmedInput,
      channel: "chat",
      requestType,
      updateTarget: intent?.updateTarget,
      topicId: currentTopicId ?? null,
    });

    setChatMessages((prev) => [...prev, userMessage]);
    setPlannerInput("");
    setPlannerError(null);

    try {
      const useWebSearch = await getAutomaticSearchEnabled();
      const requestSourceMaterials = await ensureUrlMaterialsAttached(trimmedInput);
      const response = await fetchApi("/api/reasoning/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmedInput,
          requestType,
          updateTarget: intent?.updateTarget,
          preferredBlockType: preferredType,
          chatHistory: chatMessages,
          currentPlan: plan ?? undefined,
          currentTopic: currentTopic ?? undefined,
          currentArtifacts: currentArtifacts.length > 0 ? currentArtifacts : undefined,
          useWebSearch,
          sourceMaterials: requestSourceMaterials,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Chat request failed.");
      }

      const data = (await response.json()) as ReasoningChatResponse;

      if (data.content) {
        const content = data.content;
        setChatMessages((prev) => [
          ...prev,
          createSessionMessage({
            role: "assistant",
            content,
            channel: "chat",
            sources: data.sources ?? [],
            responseType: data.responseType,
            targetPanel: data.targetPanel,
            topicId: currentTopicId ?? null,
          }),
        ]);
      }

      if (shouldApplyLearnUpdates && (data.artifact || data.plan)) {
        seedLearnGoal(trimmedInput);
      }

      if (shouldApplyLearnUpdates && data.targetPanel === "learn" && data.artifact) {
        const nextTopicId = currentTopicId ?? null;
        setGeneratedBlock(data.artifact);
        setGeneratedTopicId(nextTopicId);
        setBlockSources(data.sources ?? []);
        setIsLearnPanelCollapsed(false);

        if (nextTopicId) {
          setTopicArtifacts((current) => updateTopicArtifacts(current, nextTopicId, { block: data.artifact, quiz: null }));
        }
      }

      if (shouldApplyLearnUpdates && data.targetPanel === "learn" && data.plan) {
        setPlan(data.plan);
        setPlanSources(data.sources ?? []);
      }
    } catch (error) {
      setPlannerError(error instanceof Error ? error.message : "Chat request failed.");
    }
  }

  function scrollGeneratedSectionIntoView() {
    if (!generatedSectionRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        generatedSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  function isChatScrolledToBottom(element: HTMLDivElement) {
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceFromBottom <= CHAT_SCROLL_BOTTOM_THRESHOLD;
  }

  function scrollChatToBottom() {
    const element = chatBodyRef.current;
    if (!element) {
      return;
    }

    chatAutoScrollLockedRef.current = false;
    element.scrollTop = element.scrollHeight;
  }

  function handleChatScroll() {
    const element = chatBodyRef.current;
    if (!element) {
      return;
    }

    chatAutoScrollLockedRef.current = !isChatScrolledToBottom(element);
  }

  async function generateSelectedTopic() {
    const studyGoal = getActiveGoalValue();
    const preferredBlockType: TutorBlockType = "lesson";

    if (!studyGoal) {
      setTopicError("Describe what you want to learn first.");
      return;
    }

    if (!plan) {
      setTopicError("Generate topics first.");
      return;
    }

    const topicId = pickSelectedTopicId(plan, selectedTopicId);
    if (!topicId) {
      setTopicError("Select a topic first.");
      return;
    }

    const topic = findTopicInPlan(plan, topicId);
    if (!topic) {
      setTopicError("The selected topic could not be found.");
      return;
    }

    const previousGeneratedTopicId = generatedTopicId;
    const previousGeneratedQuiz = generatedQuiz;
    const previousGeneratedQuizTopicId = generatedQuizTopicId;
    const previousGeneratedQuizError = generatedQuizError;
    const previousQuizProgress = quizProgress;
    const previousBlockSources = blockSources;

    setSelectedTopicId(topicId);
    setIsGeneratingTopic(true);
    setTopicError(null);
    setGeneratedTopicId(topicId);
    setGeneratedQuiz(null);
    setGeneratedQuizTopicId(null);
    setGeneratedQuizError(null);
    setQuizProgress(null);
    setIsGeneratingQuiz(false);
    companionQuizRequestRef.current = null;
    setBlockSources([]);
    setStreamedGeneratedBlock(createStreamedTopicBlockPreview(topic.title, preferredBlockType));
    setIsLearnPanelCollapsed(true);
    scrollGeneratedSectionIntoView();

    try {
      const useWebSearch = await getAutomaticSearchEnabled();
      const response = await fetchApi("/api/reasoning/topic-block/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal: studyGoal,
          plan,
          topicId,
          preferredBlockType,
          useWebSearch,
          sourceMaterials,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Topic generation failed.");
      }

      if (!response.body) {
        throw new Error("Topic generation stream failed to start.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedFinalEvent = false;
      let finalLessonBlock: LessonBlock | null = null;
      let finalQuizBlock: QuizBlock | null = null;
      let finalTopicId: string | null = null;

      const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }

        const event = reasoningTopicBlockStreamEventSchema.parse(JSON.parse(trimmed));

        switch (event.type) {
          case "meta":
            setStreamedGeneratedBlock((current) => ({
              ...(current ?? createStreamedTopicBlockPreview(topic.title, preferredBlockType)),
              blockType: event.meta.blockType,
              title: event.meta.title ?? current?.title ?? topic.title,
            }));
            break;
          case "lesson":
            setStreamedGeneratedBlock((current) => {
              const preview = current ?? createStreamedTopicBlockPreview(topic.title, preferredBlockType);

              return {
                ...preview,
                blockType: "lesson",
                summary: event.lesson.summary ?? preview.summary,
                objectives: event.lesson.objectives ?? preview.objectives,
              };
            });
            break;
          case "markdown":
            setStreamedGeneratedBlock((current) => {
              const preview = current ?? createStreamedTopicBlockPreview(topic.title, preferredBlockType);

              return {
                ...preview,
                contentMarkdown: `${preview.contentMarkdown}${event.markdown}`,
              };
            });
            break;
          case "quiz":
            setStreamedGeneratedBlock((current) => {
              const preview = current ?? createStreamedTopicBlockPreview(topic.title, preferredBlockType);

              return {
                ...preview,
                blockType: "quiz",
                instructions: event.quiz.instructions ?? preview.instructions,
              };
            });
            break;
          case "question":
            setStreamedGeneratedBlock((current) => {
              const preview = current ?? createStreamedTopicBlockPreview(topic.title, preferredBlockType);

              return {
                ...preview,
                blockType: "quiz",
                questions: [...preview.questions, event.question].slice(0, 5),
              };
            });
            break;
          case "card":
            setStreamedGeneratedBlock((current) => {
              const preview = current ?? createStreamedTopicBlockPreview(topic.title, preferredBlockType);

              return {
                ...preview,
                blockType: "flashcards",
                cards: [...preview.cards, event.card].slice(0, 8),
              };
            });
            break;
          case "essay":
            setStreamedGeneratedBlock((current) => {
              const preview = current ?? createStreamedTopicBlockPreview(topic.title, preferredBlockType);

              return {
                ...preview,
                blockType: "essay_prompt",
                prompt: event.essay.prompt ?? preview.prompt,
                guidance: event.essay.guidance ?? preview.guidance,
              };
            });
            break;
          case "follow_up":
            setStreamedGeneratedBlock((current) => {
              const preview = current ?? createStreamedTopicBlockPreview(topic.title, preferredBlockType);

              return {
                ...preview,
                blockType: "follow_up_question",
                prompt: event.followUp.prompt ?? preview.prompt,
                reason: event.followUp.reason ?? preview.reason,
              };
            });
            break;
          case "final":
            receivedFinalEvent = true;
            finalTopicId = event.payload.topicId;
            if (event.payload.block.type === "lesson") {
              finalLessonBlock = event.payload.block;
              finalQuizBlock = null;
            } else if (event.payload.block.type === "quiz") {
              finalQuizBlock = event.payload.block;
              finalLessonBlock = null;
            } else {
              finalLessonBlock = null;
              finalQuizBlock = null;
            }
            setGeneratedBlock(event.payload.block);
            setGeneratedTopicId(event.payload.topicId);
            setBlockSources(event.payload.sources);
            setTopicArtifacts((current) =>
              updateTopicArtifacts(current, event.payload.topicId, {
                block: event.payload.block,
                quiz: null,
              }),
            );
            setStreamedGeneratedBlock(null);
            break;
          case "error":
            throw new Error(event.error);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          consumeLine(line);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        consumeLine(buffer);
      }

      if (!receivedFinalEvent) {
        throw new Error("Topic generation stream ended before the final result arrived.");
      }

      if (finalLessonBlock && finalTopicId) {
        void requestLessonQuiz({
          topicId: finalTopicId,
          topicTitle: topic.title,
          topicSummary: topic.summary,
          lesson: finalLessonBlock,
        });
      } else if (finalQuizBlock && finalTopicId) {
        setGeneratedQuiz(finalQuizBlock);
        setGeneratedQuizTopicId(finalTopicId);
        setGeneratedQuizError(null);
        setQuizProgress(null);
      }
    } catch (error) {
      setStreamedGeneratedBlock(null);
      setGeneratedTopicId(previousGeneratedTopicId);
      setGeneratedQuiz(previousGeneratedQuiz);
      setGeneratedQuizTopicId(previousGeneratedQuizTopicId);
      setGeneratedQuizError(previousGeneratedQuizError);
      setQuizProgress(previousQuizProgress);
      setBlockSources(previousBlockSources);
      setTopicError(error instanceof Error ? error.message : "Topic generation failed.");
    } finally {
      setIsGeneratingTopic(false);
    }
  }

  function normalizeValue(value: string) {
    return value.trim();
  }

  function getActiveGoalValue(goalOverride?: string) {
    const explicitGoal = normalizeGoalText(goalOverride ?? goal);
    if (explicitGoal) {
      return explicitGoal;
    }

    const derivedGoal = buildGoalFallback(plan, course);
    if (derivedGoal) {
      return derivedGoal;
    }

    return normalizeValue(plannerInput);
  }

  function buildLiveStudyGoal(goalOverride?: string) {
    const baseGoal = getActiveGoalValue(goalOverride);
    const activeTopic = plan
      ? findTopicInPlan(plan, selectedTopicId ?? generatedTopicId ?? pickSelectedTopicId(plan, null))
      : null;

    if (!activeTopic) {
      return baseGoal;
    }

    return [baseGoal, `Current focus: ${activeTopic.title}`, activeTopic.summary].filter(Boolean).join("\n");
  }

  function isLiveStatusMessage(message: ChatMessage) {
    return (
      message.role === "assistant" &&
      (message.kind === "status" || message.content.startsWith(LIVE_STATUS_PREFIX))
    );
  }

  function getLiveChatHistory(limit = 20) {
    return liveMessagesRef.current.filter((message) => !isLiveStatusMessage(message)).slice(-limit);
  }

  function pushLiveStatus(status: string) {
    const trimmed = status.trim();
    if (!trimmed) {
      return;
    }

    const text = trimmed.startsWith(LIVE_STATUS_PREFIX) ? trimmed : `${LIVE_STATUS_PREFIX} ${trimmed}`;
    const last = lastLiveStatusRef.current;
    const now = Date.now();
    if (last && last.text === text && now - last.at < 2500) {
      return;
    }

    lastLiveStatusRef.current = { text, at: now };
    setLiveMessages((prev) => [
      ...prev,
      createSessionMessage({
        role: "assistant",
        content: text,
        channel: "live",
        kind: "status",
      }),
    ]);
  }

  function derivePreferredBlockType(message: string): TutorBlockType | undefined {
    const lower = message.toLowerCase();
    if (lower.includes("quiz")) {
      return "quiz";
    }
    if (lower.includes("flashcard")) {
      return "flashcards";
    }
    if (lower.includes("essay") || lower.includes("prompt")) {
      return "essay_prompt";
    }
    if (lower.includes("lesson") || lower.includes("teach")) {
      return "lesson";
    }
    return undefined;
  }

  function deriveUpdateTarget(message: string): ReasoningUpdateTarget | undefined {
    const lower = message.toLowerCase();
    if (lower.includes("topic list") || lower.includes("topics list") || lower.includes("curriculum")) {
      return "topic_list";
    }
    if (lower.includes("plan")) {
      return "plan";
    }
    if (lower.includes("quiz")) {
      return "quiz";
    }
    if (lower.includes("flashcard")) {
      return "flashcards";
    }
    if (lower.includes("lesson")) {
      return "lesson";
    }
    if (lower.includes("topic")) {
      return "topic";
    }
    return "unknown";
  }

  type TextReasoningIntent = {
    requestType: ReasoningRequestType;
    updateTarget?: ReasoningUpdateTarget;
    preferredBlockType?: TutorBlockType;
  };

  function classifyTextIntent(message: string): TextReasoningIntent | null {
    const trimmed = message.trim();
    if (!trimmed) {
      return null;
    }

    const lower = trimmed.toLowerCase();
    const hasWord = (word: string) => new RegExp(`\\b${word}\\b`).test(lower);
    const preferredBlockType = derivePreferredBlockType(trimmed);

    const updateVerbs = ["update", "change", "edit", "revise", "modify", "regenerate", "replace", "remove", "add"];
    const createVerbs = ["create", "generate", "make", "build", "design", "draft", "write", "outline"];
    const explicitPlanPhrases = [
      "topic list",
      "topics list",
      "curriculum",
      "syllabus",
      "course plan",
      "learning plan",
      "study plan",
      "outline",
    ];

    const wantsUpdate = updateVerbs.some((verb) => hasWord(verb));
    if (wantsUpdate) {
      return {
        requestType: "update_content",
        updateTarget: deriveUpdateTarget(trimmed),
        preferredBlockType,
      };
    }

    const hasExplicitCreatePhrase = LIVE_ARTIFACT_KEYWORDS.some((keyword) => lower.includes(keyword));
    const hasCreateVerb = createVerbs.some((verb) => hasWord(verb));
    const mentionsArtifact =
      Boolean(preferredBlockType) ||
      lower.includes("lesson") ||
      lower.includes("quiz") ||
      lower.includes("flashcard") ||
      lower.includes("topic");
    const mentionsPlan = explicitPlanPhrases.some((phrase) => lower.includes(phrase));
    const wantsCreate = hasExplicitCreatePhrase || mentionsPlan || (hasCreateVerb && mentionsArtifact);

    if (wantsCreate) {
      return {
        requestType: "new_content",
        preferredBlockType,
      };
    }

    return null;
  }

  function shouldHandlePlan(intent: LiveReasoningIntent) {
    return intent.updateTarget === "plan" || intent.updateTarget === "topic_list";
  }

  function collectCurrentArtifacts(block: TutorBlock | null, quiz: QuizBlock | null) {
    const artifacts: TutorBlock[] = [];
    if (block) {
      artifacts.push(block);
    }
    if (quiz) {
      artifacts.push(quiz as TutorBlock);
    }
    return artifacts.slice(-3);
  }

  function resolveCurrentTopic(planOverride?: CoursePlan | null) {
    const resolvedPlan = planOverride ?? planRef.current;
    if (!resolvedPlan) {
      return null;
    }

    const topicId =
      selectedTopicIdRef.current ??
      generatedTopicIdRef.current ??
      pickSelectedTopicId(resolvedPlan, selectedTopicIdRef.current ?? null);

    return findTopicInPlan(resolvedPlan, topicId);
  }

  function buildCurrentArtifactsSnapshot() {
    return collectCurrentArtifacts(generatedBlockRef.current, generatedQuizRef.current);
  }

  function refreshLiveContextDigest() {
    const digest = buildLiveContextDigest({
      goal: goalRef.current ?? null,
      plan: planRef.current ?? null,
      currentTopic: resolveCurrentTopic(planRef.current ?? null),
      artifacts: buildCurrentArtifactsSnapshot(),
    });
    liveContextDigestRef.current = digest;
    return digest;
  }

  function sendLiveContextUpdate(session: VoiceSessionHandle, digest: string) {
    if (!digest) {
      return;
    }

    if (lastLiveContextSentRef.current === digest) {
      return;
    }

    sendLiveBackgroundUpdate(session, digest);

    lastLiveContextSentRef.current = digest;
  }

  function sendLiveBackgroundUpdate(session: VoiceSessionHandle, text: string) {
    const trimmed = normalizeValue(text);
    if (!trimmed) {
      return;
    }

    session.sendContextUpdate(`Context update (not a request): ${trimmed}`);
  }

  async function performReasoningRequest(options: {
    message: string;
    requestType?: ReasoningRequestType;
    updateTarget?: ReasoningUpdateTarget;
    preferredBlockType?: TutorBlockType;
    chatHistory?: ChatMessage[];
    appendToLiveMessages?: boolean;
  }) {
    const planSnapshot = planRef.current ?? undefined;
    const currentTopic = resolveCurrentTopic(planSnapshot);
    const currentTopicId = currentTopic?.id ?? selectedTopicIdRef.current ?? generatedTopicIdRef.current ?? null;
    const currentArtifacts = buildCurrentArtifactsSnapshot();
    const chatHistory = options.chatHistory ?? getLiveChatHistory();
    const useWebSearch = await getAutomaticSearchEnabled();
    const requestSourceMaterials = await ensureUrlMaterialsAttached(options.message);

    const response = await fetchApi("/api/reasoning/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: options.message,
        requestType: options.requestType,
        updateTarget: options.updateTarget,
        preferredBlockType: options.preferredBlockType,
        chatHistory,
        currentPlan: planSnapshot,
        currentTopic: currentTopic ?? undefined,
        currentArtifacts: currentArtifacts.length > 0 ? currentArtifacts : undefined,
        useWebSearch,
        sourceMaterials: requestSourceMaterials,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Reasoning request failed.");
    }

    const data = (await response.json()) as ReasoningChatResponse;

    if (data.content && options.appendToLiveMessages) {
      const content = data.content;
      setLiveMessages((prev) => [
        ...prev,
        createSessionMessage({
          role: "assistant",
          content,
          channel: "live",
          sources: data.sources ?? [],
          responseType: data.responseType,
          targetPanel: data.targetPanel,
          topicId: currentTopicId,
        }),
      ]);
    }

    const shouldTargetLearn = data.targetPanel === "learn" || data.responseType !== "chat";

    if (shouldTargetLearn && (data.artifact || data.plan)) {
      seedLearnGoal(options.message);
    }

    if (shouldTargetLearn && data.artifact) {
      const nextTopicId = currentTopicId;
      setGeneratedBlock(data.artifact);
      setGeneratedTopicId(nextTopicId);
      setBlockSources(data.sources ?? []);
      setIsLearnPanelCollapsed(false);

      if (nextTopicId) {
        setTopicArtifacts((current) => updateTopicArtifacts(current, nextTopicId, { block: data.artifact, quiz: null }));
      }
    }

    if (shouldTargetLearn && data.plan) {
      setPlan(data.plan);
      setPlanSources(data.sources ?? []);
    }

    return data;
  }

  async function performLiveAction(options: {
    message: string;
    intent: LiveReasoningIntent;
    appendToLiveMessages?: boolean;
  }): Promise<{ kind: "plan" } | { kind: "reasoning"; data: ReasoningChatResponse }> {
    const trimmed = options.message.trim();
    if (shouldHandlePlan(options.intent)) {
      const fallbackGoal = goalRef.current || trimmed;
      await submitPlannerRequest({
        goalOverride: fallbackGoal,
        inputOverride: trimmed,
      });
      return { kind: "plan" };
    }

    const data = await performReasoningRequest({
      message: trimmed,
      requestType: options.intent.requestType,
      updateTarget: options.intent.updateTarget,
      preferredBlockType: options.intent.preferredBlockType,
      chatHistory: getLiveChatHistory(),
      appendToLiveMessages: options.appendToLiveMessages,
    });

    return { kind: "reasoning", data };
  }

  async function sendLiveTextMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    finalizeLiveDrafts();

    if (!goalRef.current) {
      setGoal(trimmed);
    }

    let appConfig: AppConfig | null = null;
    try {
      appConfig = configRef.current ?? (await loadConfig());
    } catch (error) {
      setPlannerError(error instanceof Error ? error.message : "Failed to load app config.");
      return;
    }

    if (!appConfig.voice.enabled) {
      await submitChatRequest(trimmed);
      return;
    }

    if (!liveSessionRef.current) {
      const connected = await connectLiveSession({
        goalOverride: trimmed,
        preserveTranscript: true,
        skipSeed: true,
      });
      if (!connected) {
        await submitChatRequest(trimmed);
        return;
      }
    }

    const session = liveSessionRef.current;
    if (!session) {
      setLiveError("Voice session is not connected.");
      return;
    }

    lastLiveUserMessageRef.current = trimmed;
    setLiveMessages((prev) => [
      ...prev,
      createSessionMessage({
        role: "user",
        content: trimmed,
        channel: "live",
      }),
    ]);

    session.sendUserMessage(trimmed);
  }

  function commitLiveInputDraft() {
    const draft = liveInputDraftRef.current.trim();
    if (!draft) {
      return;
    }

    lastLiveUserMessageRef.current = draft;
    setLiveMessages((prev) => [
      ...prev,
      createSessionMessage({
        role: "user",
        content: draft,
        channel: "live",
      }),
    ]);
    liveInputDraftRef.current = "";
    setLiveInputDraft("");
  }

  function commitLiveOutputDraft() {
    const draft = liveOutputDraftRef.current.trim();
    if (!draft) {
      return;
    }

    if (draft.startsWith(LIVE_STATUS_PREFIX)) {
      pushLiveStatus(draft);
      liveOutputDraftRef.current = "";
      setLiveOutputDraft("");
      return;
    }

    setLiveMessages((prev) => [
      ...prev,
      createSessionMessage({
        role: "assistant",
        content: draft,
        channel: "live",
      }),
    ]);
    liveOutputDraftRef.current = "";
    setLiveOutputDraft("");
  }

  function finalizeLiveDrafts() {
    if (liveInputDraftRef.current.trim()) {
      commitLiveInputDraft();
    }
    if (liveOutputDraftRef.current.trim()) {
      commitLiveOutputDraft();
    }
  }

  function formatUpdateTarget(target?: ReasoningUpdateTarget) {
    switch (target) {
      case "topic_list":
        return "the topic list";
      case "topic":
        return "the current topic";
      case "lesson":
        return "the lesson";
      case "quiz":
        return "the quiz";
      case "flashcards":
        return "the flashcards";
      case "plan":
        return "the course plan";
      case "all":
        return "the full course";
      default:
        return "the course content";
    }
  }

  function formatPreferredBlockType(type?: TutorBlockType) {
    switch (type) {
      case "lesson":
        return "lesson";
      case "quiz":
        return "quiz";
      case "flashcards":
        return "flashcards";
      case "essay_prompt":
        return "essay prompt";
      case "follow_up_question":
        return "follow-up question";
      default:
        return "content";
    }
  }

  function buildToolStartStatus(intent: LiveReasoningIntent, preferredType?: TutorBlockType) {
    if (shouldHandlePlan(intent)) {
      if (intent.requestType === "update_content") {
        return "Updating your course plan now.";
      }
      return "Designing your course plan now.";
    }

    if (intent.requestType === "update_content") {
      return `Updating ${formatUpdateTarget(intent.updateTarget)} now.`;
    }
    if (intent.requestType === "general_query") {
      return "Answering based on the current course materials.";
    }
    if (intent.requestType === "new_content") {
      const label = formatPreferredBlockType(preferredType ?? intent.preferredBlockType);
      return `Designing your ${label} now.`;
    }
    return "Routing your request to the course designer.";
  }

  function describeReasoningOutcome(data: { responseType?: string; plan?: unknown; artifact?: unknown }) {
    const hasPlan = Boolean(data.plan);
    const hasArtifact = Boolean(data.artifact);
    if (data.responseType === "chat") {
      return "Answer ready.";
    }
    if (hasPlan && hasArtifact) {
      return "Updated the plan and course content in the Learn panel.";
    }
    if (hasPlan) {
      return "Updated the course plan in the Learn panel.";
    }
    if (hasArtifact) {
      if (data.responseType === "artifact_update") {
        return "Updated course content in the Learn panel.";
      }
      return "New course content is ready in the Learn panel.";
    }
    return "Reasoning response received.";
  }

  async function handleLiveToolCall(toolCall: VoiceToolCallPayload, session: VoiceSessionHandle) {
    const functionCalls = toolCall.functionCalls ?? [];
    if (functionCalls.length === 0) {
      return;
    }

    liveToolInFlightRef.current = true;
    if (playerRef.current) {
      playerRef.current.stop();
    }
    liveAudioStatusRef.current = false;

    const responses: Array<{
      id?: string;
      name?: string;
      response: Record<string, unknown>;
    }> = [];

    try {
      for (const call of functionCalls) {
        if (call.name !== LIVE_REASONING_TOOL_NAME) {
          responses.push({
            id: call.id,
            name: call.name,
            response: {
              error: `Unknown tool ${call.name ?? "unknown"}.`,
            },
          });
          continue;
        }

        const args = call.args ?? {};
        const message = typeof args.message === "string" ? args.message.trim() : "";
        const requestType: ReasoningRequestType | undefined = parseEnumValue(
          args.requestType,
          REASONING_REQUEST_TYPES,
        );
        const updateTarget: ReasoningUpdateTarget | undefined = parseEnumValue(
          args.updateTarget,
          REASONING_UPDATE_TARGETS,
        );
        const requestedBlockType = parseEnumValue(args.preferredBlockType, REASONING_BLOCK_TYPES);
        const preferredTypeHint = requestedBlockType ?? derivePreferredBlockType(message);
        const intent: LiveReasoningIntent = {
          requestType: requestType ?? "general_query",
          updateTarget,
          preferredBlockType: preferredTypeHint,
        };

        if (!message) {
          responses.push({
            id: call.id,
            name: call.name,
            response: {
              error: "Tool call missing required message.",
            },
          });
          continue;
        }

        pushLiveStatus(buildToolStartStatus(intent, preferredTypeHint));

        try {
          const result = await performLiveAction({
            message,
            intent,
            appendToLiveMessages: true,
          });

          if (result.kind === "reasoning") {
            pushLiveStatus(describeReasoningOutcome(result.data));
          } else {
            const needsClarification = Boolean(planClarificationRef.current);
            pushLiveStatus(
              needsClarification
                ? "Need one clarification in the Learn panel."
                : "Updated the course plan in the Learn panel.",
            );
          }

          responses.push({
            id: call.id,
            name: call.name,
            response: {
              output: result.kind === "reasoning" ? result.data : { result: "plan_updated" },
            },
          });
        } catch (error) {
          setLiveError(error instanceof Error ? error.message : "Reasoning tool request failed.");
          pushLiveStatus("Course designer failed to respond. Please try again.");
          responses.push({
            id: call.id,
            name: call.name,
            response: {
              error: error instanceof Error ? error.message : "Reasoning tool request failed.",
            },
          });
        }
      }

      if (responses.length === 0) {
        return;
      }

      if (liveSessionRef.current && liveSessionRef.current !== session) {
        return;
      }

      session.sendToolResponses({
        functionResponses: responses,
      });
    } finally {
      liveToolInFlightRef.current = false;
    }
  }

  function seedLiveSession(session: VoiceSessionHandle, studyGoal: string) {
    session.sendUserMessage(`I want to learn: ${studyGoal}`);
  }

  async function connectLiveSession(options: {
    goalOverride?: string;
    preserveTranscript?: boolean;
    skipSeed?: boolean;
  } = {}) {
    let appConfig: AppConfig;

    try {
      appConfig = configRef.current ?? (await loadConfig());
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Failed to load app config.");
      return false;
    }

    if (!appConfig.voice.enabled) {
      setLiveError("Voice tutoring is not configured on the server yet.");
      return false;
    }

    const studyGoal = normalizeValue(options.goalOverride ?? buildLiveStudyGoal());
    setLiveStatus("Connecting");
    setLiveError(null);
    disconnectRequestedRef.current = false;
    lastLiveContextSentRef.current = "";

    if (options.preserveTranscript === false) {
      setLiveInputDraft("");
      setLiveOutputDraft("");
      setLiveMessages([]);
      liveInputDraftRef.current = "";
      liveOutputDraftRef.current = "";
      lastLiveUserMessageRef.current = null;
    } else {
      finalizeLiveDrafts();
    }

    try {
      const sessionResponse = await fetchApi("/api/voice/session", {
        method: "POST",
      });
      const sessionBody = await sessionResponse.json().catch(() => ({}));

      if (!sessionResponse.ok) {
        throw new Error((sessionBody as { error?: string }).error ?? "Failed to create a voice session.");
      }

      const sessionConfig = voiceSessionResponseSchema.parse(sessionBody);

      playerRef.current = playerRef.current ?? new PcmPlayer();
      let sessionHandle: VoiceSessionHandle | null = null;
      let readySettled = false;
      let resolveReady: (() => void) | null = null;
      let rejectReady: ((error: Error) => void) | null = null;
      const readyPromise = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });

      const session = createElevenLabsVoiceSession({
        connectionUrl: sessionConfig.connectionUrl,
        callbacks: {
          onOpen: () => {
            if (sessionHandle && liveSessionRef.current !== sessionHandle) {
              return;
            }
            setLiveStatus("Connecting");
          },
          onSetupComplete: () => {
            if (sessionHandle && liveSessionRef.current !== sessionHandle) {
              return;
            }
            setLiveStatus("Connected");
            if (!readySettled) {
              readySettled = true;
              resolveReady?.();
            }
          },
          onMessage: (message) => {
            if (sessionHandle && liveSessionRef.current !== sessionHandle) {
              return;
            }

            const serverMessage = message as {
              toolCall?: VoiceToolCallPayload;
              serverContent?: {
                interrupted?: boolean;
                inputTranscription?: { text?: string };
                outputTranscription?: { text?: string };
                modelTurn?: {
                  parts?: Array<{ inlineData?: { data?: string } }>;
                };
                turnComplete?: boolean;
              };
            };

            if (serverMessage.toolCall && sessionHandle) {
              void handleLiveToolCall(serverMessage.toolCall, sessionHandle);
            }
            setLiveStatus("Connected");

            const serverContent = serverMessage.serverContent;
            const suppressLiveOutput = liveToolInFlightRef.current;

            if (serverContent?.interrupted && playerRef.current) {
              playerRef.current.stop();
            }

            // Transcriptions can arrive out of order, so we merge incrementally.
            if (serverContent?.inputTranscription?.text) {
              const incoming = serverContent.inputTranscription.text;
              if (liveInputDraftRef.current.trim()) {
                const merged = mergeTranscriptText(liveInputDraftRef.current, incoming);
                liveInputDraftRef.current = merged;
                setLiveInputDraft(merged);
              } else {
                const lastUser = lastLiveUserMessageRef.current;
                if (lastUser && shouldMergeTranscript(lastUser, incoming)) {
                  const merged = mergeTranscriptText(lastUser, incoming);
                  lastLiveUserMessageRef.current = merged;
                  setLiveMessages((prev) => {
                    const next = [...prev];
                    for (let i = next.length - 1; i >= 0; i -= 1) {
                      if (next[i]?.role === "user") {
                        next[i] = { ...next[i], content: merged };
                        break;
                      }
                    }
                    return next;
                  });
                } else {
                  const merged = mergeTranscriptText("", incoming);
                  liveInputDraftRef.current = merged;
                  setLiveInputDraft(merged);
                }
              }
            }

            if (!suppressLiveOutput && serverContent?.outputTranscription?.text) {
              if (liveInputDraftRef.current.trim()) {
                commitLiveInputDraft();
              }
              const merged = mergeTranscriptText(liveOutputDraftRef.current, serverContent.outputTranscription.text);
              liveOutputDraftRef.current = merged;
              setLiveOutputDraft(merged);
            }

            if (!suppressLiveOutput) {
              const parts = serverContent?.modelTurn?.parts ?? [];
              for (const part of parts) {
                if (part.inlineData?.data) {
                  if (liveInputDraftRef.current.trim()) {
                    commitLiveInputDraft();
                  }
                  if (!liveAudioStatusRef.current && !liveOutputDraftRef.current.trim()) {
                    liveAudioStatusRef.current = true;
                    pushLiveStatus("Speaking response.");
                  }
                  if (playerRef.current) {
                    void playerRef.current.play(part.inlineData.data);
                  }
                }
              }
            }

            if (serverContent?.interrupted || serverContent?.turnComplete) {
              if (serverContent?.turnComplete && liveInputDraftRef.current.trim()) {
                commitLiveInputDraft();
              }
              commitLiveOutputDraft();
              liveAudioStatusRef.current = false;
            }
          },
          onError: (error) => {
            if (sessionHandle && liveSessionRef.current !== sessionHandle) {
              return;
            }
            setLiveStatus("Error");
            setLiveError(error.message);
            if (!readySettled) {
              readySettled = true;
              rejectReady?.(error);
            }
          },
          onClose: (details) => {
            if (sessionHandle && liveSessionRef.current && liveSessionRef.current !== sessionHandle) {
              return;
            }

            liveSessionRef.current = null;
            void stopMicrophone();

            setLiveStatus("Disconnected");
            if (!disconnectRequestedRef.current) {
              const rawCloseMessage = details
                ? `Voice session closed (${details.code ?? "unknown"})${details.reason ? `: ${details.reason}` : ""}`
                : "Voice session closed before ready.";
              const closeMessage =
                details?.code === 1008 && details.reason?.includes("Override for field 'prompt'")
                  ? `${rawCloseMessage}. This page is likely running an older voice client bundle. Reload the page once and try again.`
                  : rawCloseMessage;
              setLiveError(closeMessage);
              if (!readySettled) {
                readySettled = true;
                rejectReady?.(new Error(closeMessage));
              }
              return;
            }

            setLiveError(null);
            if (!readySettled) {
              readySettled = true;
              resolveReady?.();
            }
          },
        },
      });

      sessionHandle = session as VoiceSessionHandle;
      liveSessionRef.current = sessionHandle;
      liveGoalRef.current = studyGoal || null;

      await readyPromise;

      const digest = refreshLiveContextDigest();
      if (digest) {
        sendLiveContextUpdate(sessionHandle, digest);
      }

      if (studyGoal && !options.skipSeed) {
        seedLiveSession(sessionHandle, studyGoal);
      }

      return true;
    } catch (error) {
      setLiveStatus("Disconnected");
      setLiveError(error instanceof Error ? error.message : "Failed to connect live session.");
      return false;
    }
  }

  async function disconnectLiveSession(options: { clearTranscripts?: boolean } = {}) {
    disconnectRequestedRef.current = true;
    liveGoalRef.current = null;
    lastLiveContextSentRef.current = "";

    await stopMicrophone();

    if (!options.clearTranscripts) {
      finalizeLiveDrafts();
    }

    liveSessionRef.current?.close();
    liveSessionRef.current = null;

    if (playerRef.current) {
      await playerRef.current.close();
      playerRef.current = null;
    }

    if (options.clearTranscripts) {
      setLiveInputDraft("");
      setLiveOutputDraft("");
      setLiveMessages([]);
      liveInputDraftRef.current = "";
      liveOutputDraftRef.current = "";
      lastLiveUserMessageRef.current = null;
    }

    setLiveError(null);
    setLiveStatus("Disconnected");
  }

  async function startMicrophone() {
    if (microphoneRef.current) {
      return;
    }

    if (!liveSessionRef.current) {
      setLiveError("The tutor is not connected right now.");
      return;
    }

    setLiveError(null);
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Microphone access failed.");
      return;
    }

    const context = new AudioContext();
    await context.resume();

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const muteGain = context.createGain();
    muteGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);

      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * input[i];
      }
      const rms = Math.sqrt(sum / input.length);

      if (rms > 0.01 && playerRef.current) {
        playerRef.current.stop();
      }

      const audio = float32ToBase64Pcm16(input, context.sampleRate, 16000);

      liveSessionRef.current?.sendAudioChunk(audio);
    };

    source.connect(processor);
    processor.connect(muteGain);
    muteGain.connect(context.destination);

    microphoneRef.current = {
      context,
      processor,
      source,
      stream,
      muteGain,
    };
    setIsMicActive(true);
  }

  async function stopMicrophone() {
    const microphone = microphoneRef.current;
    if (!microphone) {
      return;
    }

    microphone.processor.disconnect();
    microphone.source.disconnect();
    microphone.muteGain.disconnect();
    microphone.stream.getTracks().forEach((track) => track.stop());
    await microphone.context.close();

    microphoneRef.current = null;
    setIsMicActive(false);
  }

  async function startLiveSession(options: {
    goalOverride?: string;
  } = {}) {
    if (options.goalOverride !== undefined) {
      setGoal(options.goalOverride);
    }

    const studyGoal = normalizeValue(options.goalOverride ?? buildLiveStudyGoal());

    if (!goal && plannerInput.trim()) {
      setGoal(plannerInput.trim());
    }

    if (liveSessionRef.current && liveGoalRef.current && studyGoal && liveGoalRef.current !== studyGoal) {
      await disconnectLiveSession({ clearTranscripts: true });
    }

    if (!liveSessionRef.current) {
      const connected = await connectLiveSession({
        goalOverride: studyGoal,
        preserveTranscript: true,
      });

      if (!connected) {
        return false;
      }
    }

    await startMicrophone();
    return true;
  }

  async function toggleLiveConnection(options: {
    goalOverride?: string;
  } = {}) {
    if (liveStatus === "Connecting") {
      return;
    }

    if (liveStatus === "Error") {
      await disconnectLiveSession();
      await startLiveSession(options);
      return;
    }

    if (liveSessionRef.current) {
      await disconnectLiveSession();
      return;
    }

    await startLiveSession(options);
  }

  async function toggleMicrophone() {
    if (liveStatus !== "Connected") {
      return;
    }

    if (isMicActive) {
      await stopMicrophone();
      return;
    }

    await startMicrophone();
  }

  function launchSessionRoute(action: "generate" | "live") {
    if (sessionId) {
      return false;
    }

    const nextSessionId = createLearnSessionId();
    const nextGoal = normalizeValue(plannerInput || goal);

    router.replace(
      buildLearnHref({
        sessionId: nextSessionId,
        courseOwnerUsername: course?.ownerUsername ?? routeState.courseOwnerUsername,
        courseSlug: course?.courseSlug ?? routeState.courseSlug,
        goal: nextGoal,
        autoStartAction: action,
      }),
      { scroll: false },
    );

    return true;
  }

  function updatePaneFromClientX(clientX: number) {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    const rect = workspace.getBoundingClientRect();
    if (rect.width <= SPLITTER_WIDTH) {
      return;
    }

    const adjustedClientX = clientX - rect.left - SPLITTER_WIDTH / 2;
    const nextPercent = (adjustedClientX / (rect.width - SPLITTER_WIDTH)) * 100;
    setLeftPanePercent(clampPanePercent(nextPercent));
  }

  function stopResizingPane(target: HTMLDivElement, pointerId: number) {
    if (splitterPointerIdRef.current !== pointerId) {
      return;
    }

    splitterPointerIdRef.current = null;
    setIsResizingPane(false);

    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  }

  function handleSplitterPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isDesktop) {
      return;
    }

    splitterPointerIdRef.current = event.pointerId;
    setIsResizingPane(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePaneFromClientX(event.clientX);
  }

  function handleSplitterPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (splitterPointerIdRef.current !== event.pointerId) {
      return;
    }

    updatePaneFromClientX(event.clientX);
  }

  function handleSplitterPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    stopResizingPane(event.currentTarget, event.pointerId);
  }

  function handleSplitterLostPointerCapture() {
    splitterPointerIdRef.current = null;
    setIsResizingPane(false);
  }

  function handleSplitterKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        setLeftPanePercent((current) => clampPanePercent(current - 4));
        break;
      case "ArrowRight":
        event.preventDefault();
        setLeftPanePercent((current) => clampPanePercent(current + 4));
        break;
      case "Home":
        event.preventDefault();
        setLeftPanePercent(MIN_LEFT_PANE_PERCENT);
        break;
      case "End":
        event.preventDefault();
        setLeftPanePercent(MAX_LEFT_PANE_PERCENT);
        break;
      default:
        break;
    }
  }

  async function openGeneratedQuiz() {
    if (!sessionId) {
      return;
    }

    await disconnectLiveSession();
    router.push(buildLearnQuizHref(sessionId));
  }

  function retryGeneratedQuiz() {
    if (!generatedBlock || generatedBlock.type !== "lesson" || !generatedTopicId) {
      return;
    }

    const topic = plan ? findTopicInPlan(plan, generatedTopicId) : null;
    void requestLessonQuiz({
      topicId: generatedTopicId,
      topicTitle: topic?.title ?? generatedBlock.title,
      topicSummary: topic?.summary ?? "",
      lesson: generatedBlock,
    });
  }

  const hasStreamingPlan = streamedTopics.length > 0 || Boolean(streamedPlanTitle) || Boolean(streamedRequestType);
  const selectedTopic = hasStreamingPlan
    ? findTopicInTopicList(streamedTopics, selectedTopicId ?? generatedTopicId)
    : plan
      ? findTopicInPlan(plan, selectedTopicId ?? generatedTopicId ?? pickSelectedTopicId(plan, null))
      : null;
  const collectionLabel = getPlanCollectionLabel(plan?.requestType ?? streamedRequestType);
  const learnTopicCount = streamedTopics.length > 0 ? streamedTopics.length : getPlanTopicCount(plan);
  const showMuteControl = liveStatus === "Connected";
  const renderedGeneratedBlock = streamedGeneratedBlock ? buildStreamedTopicBlock(streamedGeneratedBlock) : generatedBlock;
  const renderedBlockSources = streamedGeneratedBlock ? [] : blockSources;
  const showGeneratedTopicHeader = !renderedGeneratedBlock || !("title" in renderedGeneratedBlock);
  const hasCurrentQuiz = Boolean(
    !streamedGeneratedBlock && generatedQuiz && generatedQuizTopicId && generatedQuizTopicId === generatedTopicId,
  );
  const showQuizLauncher =
    Boolean(sessionId) &&
    !streamedGeneratedBlock &&
    (renderedGeneratedBlock?.type === "lesson" || renderedGeneratedBlock?.type === "quiz");
  const pdfSourceMaterials = sourceMaterials.filter((material) => material.kind === "pdf");
  const urlSourceMaterials = sourceMaterials.filter((material) => material.kind === "url");
  const composerAttachments = [
    ...pdfSourceMaterials.map((material) => ({
      id: `material:${material.id}`,
      title: material.fileName ?? material.title,
      removable: !removingMaterialIds.includes(material.id),
      uploading: removingMaterialIds.includes(material.id),
    })),
    ...pendingPdfDrafts.map((draft) => ({
      id: `draft:${draft.id}`,
      title: draft.file.name,
      removable: draft.status !== "uploading",
      uploading: draft.status === "uploading",
      invalid: draft.status === "error",
    })),
  ];
  const workspaceStyle = isDesktop
    ? {
        ...styles.workspace,
        gridTemplateColumns: `minmax(0, calc(${leftPanePercent}% - ${SPLITTER_WIDTH / 2}px)) ${SPLITTER_WIDTH}px minmax(320px, calc(${100 - leftPanePercent}% - ${SPLITTER_WIDTH / 2}px))`,
      }
    : styles.workspace;
  const pageStyle = isResizingPane
    ? {
        ...styles.page,
        ...styles.pageResizing,
      }
    : styles.page;

  return (
    <main className="learn-page" style={pageStyle}>
      <section className="learn-workspace" style={workspaceStyle} ref={workspaceRef}>
        <article className="learn-pane" id="learn-roadmap-pane" style={styles.panel}>
          <div style={styles.panelHeader}>
            <h1 style={styles.sectionTitle}>Learn</h1>
            {course ? (
              <Link
                href={buildCourseHref({
                  username: course.ownerUsername,
                  courseSlug: course.courseSlug,
                })}
                style={styles.headerLink}
              >
                @{course.ownerUsername}/{course.courseSlug}
              </Link>
            ) : null}
          </div>

          <div className="learn-scroll" style={styles.panelBody}>
            <section style={styles.learnPanelShell}>
              <button
                aria-expanded={!isLearnPanelCollapsed}
                style={styles.learnPanelHeader}
                type="button"
                onClick={() => setIsLearnPanelCollapsed((current) => !current)}
              >
                <span style={styles.learnPanelToggle}>
                  <Icon name={isLearnPanelCollapsed ? "chevronDown" : "chevronUp"} size={18} />
                  <span>{collectionLabel}</span>
                </span>

                {isPlanning || learnTopicCount > 0 ? (
                  <span style={styles.learnPanelMeta}>
                    {isPlanning
                      ? learnTopicCount > 0
                        ? `${learnTopicCount} streaming`
                        : "Generating..."
                      : `${learnTopicCount}`}
                  </span>
                ) : null}
              </button>

              {!isLearnPanelCollapsed ? (
                <div style={styles.learnPanelContent}>
                  {plannerError ? <p style={styles.errorText}>{plannerError}</p> : null}

                  <PlannerView
                    plan={plan}
                    clarification={planClarification}
                    streamedPlanTitle={streamedPlanTitle}
                    streamedTopics={streamedTopics}
                    selectedTopicId={selectedTopicId}
                    generatedTopicId={generatedTopicId}
                    quizResultsByTopic={quizResultsByTopic}
                    isPlanning={isPlanning}
                    isGeneratingTopic={isGeneratingTopic}
                    onSelectTopic={showTopicArtifacts}
                    onGenerateTopic={() => void generateSelectedTopic()}
                  />
                </div>
              ) : null}
            </section>

            <section ref={generatedSectionRef} style={styles.generatedSection}>
              {showGeneratedTopicHeader ? (
                <div style={styles.generatedHeader}>
                  <h2 style={styles.generatedTitle}>{selectedTopic ? selectedTopic.title : "Generated topic"}</h2>
                </div>
              ) : null}

              {topicError ? <p style={styles.errorText}>{topicError}</p> : null}

              {renderedGeneratedBlock ? (
                <>
                  <BlockView block={renderedGeneratedBlock} sources={renderedBlockSources} />

                  {showQuizLauncher ? (
                    <div style={styles.quizLauncherCard}>
                      <div style={styles.quizLauncherCopy}>
                        <p style={styles.quizLauncherTitle}>Quiz</p>
                        <p style={styles.quizLauncherText}>
                          {renderedGeneratedBlock.type === "lesson"
                            ? isGeneratingQuiz
                              ? "Preparing quiz..."
                              : hasCurrentQuiz
                                ? `${generatedQuiz?.questions.length ?? 0} questions ready.`
                                : generatedQuizError ?? "Quiz is not ready yet."
                            : hasCurrentQuiz
                              ? `${generatedQuiz?.questions.length ?? 0} questions ready.`
                              : "Open the quiz to start."}
                        </p>
                      </div>

                      <div style={styles.quizLauncherActions}>
                        {renderedGeneratedBlock.type === "lesson" && generatedQuizError ? (
                          <button type="button" style={styles.controlButton} onClick={retryGeneratedQuiz}>
                            Retry
                          </button>
                        ) : null}

                        <button
                          type="button"
                          style={{
                            ...styles.controlButton,
                            ...styles.controlButtonActive,
                            ...(hasCurrentQuiz ? null : styles.controlButtonDisabled),
                          }}
                          onClick={openGeneratedQuiz}
                          disabled={!hasCurrentQuiz}
                        >
                          {renderedGeneratedBlock.type === "lesson" ? "Quiz" : "Start quiz"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={styles.emptyState}>
                  <p style={styles.emptyTitle}>{selectedTopic ? "The selected topic is ready." : "No topic generated yet."}</p>
                  <p style={styles.emptyText}>
                      {selectedTopic
                        ? "Use Generate to materialize just this topic."
                        : isPlanning
                          ? "Wait for topics to finish streaming, then select one."
                          : "Generate topics, select one, and then generate the lesson here."}
                  </p>
                </div>
              )}
            </section>
          </div>
        </article>

        {isDesktop ? (
          <div
            aria-controls="learn-roadmap-pane learn-chat-pane"
            aria-label="Resize learning workspace"
            aria-orientation="vertical"
            aria-valuemax={MAX_LEFT_PANE_PERCENT}
            aria-valuemin={MIN_LEFT_PANE_PERCENT}
            aria-valuenow={Math.round(leftPanePercent)}
            className="learn-splitter"
            onKeyDown={handleSplitterKeyDown}
            onLostPointerCapture={handleSplitterLostPointerCapture}
            onPointerDown={handleSplitterPointerDown}
            onPointerMove={handleSplitterPointerMove}
            onPointerUp={handleSplitterPointerUp}
            onPointerCancel={handleSplitterPointerUp}
            role="separator"
            style={{
              ...styles.splitter,
              ...(isResizingPane ? styles.splitterActive : null),
            }}
            tabIndex={0}
          >
            <span aria-hidden="true" style={styles.splitterRail} />
            <span aria-hidden="true" style={styles.splitterThumb} />
          </div>
        ) : null}

        <article
          className="learn-pane learn-pane--secondary"
          id="learn-chat-pane"
          style={{ ...styles.panel, ...styles.chatPanel }}
        >
          <div style={styles.panelHeader}>
            <h2 style={styles.sectionTitle}>Chat</h2>
            <div style={styles.panelHeaderActions}>
              <div style={styles.historyMenuWrap}>
                <button
                  ref={historyButtonRef}
                  type="button"
                  style={{
                    ...styles.historyButton,
                    ...(isHistoryOpen ? styles.historyButtonActive : null),
                  }}
                  onClick={handleHistoryToggle}
                  aria-expanded={isHistoryOpen}
                  aria-haspopup="dialog"
                >
                  <IconText icon="stack" size={14}>
                    History
                  </IconText>
                </button>

                {isHistoryOpen ? (
                  <div ref={historyPanelRef} style={styles.historyMenu}>
                    <div style={styles.historyMenuHeader}>
                      <p style={styles.historyMenuTitle}>Recent sessions</p>
                      <span style={styles.historyMenuMeta}>{sessionHistory.length}</span>
                    </div>

                    {historyError ? <p style={styles.historyMenuError}>{historyError}</p> : null}

                    {isHistoryLoading ? (
                      <p style={styles.historyMenuEmpty}>Loading sessions...</p>
                    ) : sessionHistory.length === 0 ? (
                      <p style={styles.historyMenuEmpty}>Start a chat and it will appear here.</p>
                    ) : (
                      <div style={styles.historyMenuList}>
                        {sessionHistory.map((entry) => (
                          <button
                            key={entry.sessionId}
                            type="button"
                            onClick={() => handleHistorySelect(entry)}
                            style={{
                              ...styles.historyItem,
                              ...(entry.sessionId === sessionId ? styles.historyItemActive : null),
                            }}
                          >
                            <div style={styles.historyItemTopRow}>
                              <p style={styles.historyItemTitle}>{entry.title}</p>
                              <span style={styles.historyItemTime}>{formatHistoryTimestamp(entry.updatedAt)}</span>
                            </div>
                            <p style={styles.historyItemPreview}>{entry.preview}</p>
                            <div style={styles.historyItemMetaRow}>
                              <span>{entry.messageCount} msgs</span>
                              {entry.sessionId === sessionId ? <span>Current</span> : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <span style={styles.badge}>
                <IconText icon={getLiveStatusIcon(liveStatus)} size={14}>
                  {getLiveStatusLabel(liveStatus)}
                </IconText>
              </span>
            </div>
          </div>

          <div className="learn-scroll" style={styles.chatBody} ref={chatBodyRef} onScroll={handleChatScroll}>
            {liveError ? <p style={styles.errorText}>{liveError}</p> : null}

            {goal ? (
              <div style={{ ...styles.messageBubble, ...styles.userBubble }}>
                <p style={styles.messageText}>{goal}</p>
              </div>
            ) : null}

            {chatMessages.map((msg, idx) => (
              <div
                key={msg.id ?? `chat-${idx}`}
                style={{
                  ...styles.messageBubble,
                  ...(msg.role === "user" ? styles.userBubble : styles.assistantBubble),
                }}
              >
                <p style={styles.messageText}>{msg.content.replace(/\n/g, " ")}</p>
              </div>
            ))}

            {liveMessages.map((msg, idx) => (
              <div
                key={msg.id ?? `live-${idx}`}
                style={{
                  ...styles.messageBubble,
                  ...(msg.role === "user" ? styles.userBubble : styles.assistantBubble),
                }}
              >
                <p style={styles.messageText}>{msg.content.replace(/\n/g, " ")}</p>
              </div>
            ))}

            {liveInputDraft ? (
              <div style={{ ...styles.messageBubble, ...styles.userBubble }}>
                <p style={styles.messageText}>{liveInputDraft}</p>
              </div>
            ) : null}

            {liveOutputDraft ? (
              <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
                <p style={styles.messageText}>{liveOutputDraft.replace(/\n/g, " ")}</p>
              </div>
            ) : null}

            {!goal &&
            chatMessages.length === 0 &&
            liveMessages.length === 0 &&
            !liveInputDraft &&
            !liveOutputDraft ? (
              <div style={styles.emptyState}>
                <p style={styles.emptyTitle}>Chat messages will appear here.</p>
                <p style={styles.emptyText}>
                  Start live mode to speak with Prof, or ask a question to start chatting.
                </p>
              </div>
            ) : null}
	          </div>

          {urlSourceMaterials.length > 0 || materialError ? (
            <div style={styles.materialsPanelWrap}>
              <SourceMaterialsPanel
                title="Course Materials"
                materials={urlSourceMaterials}
                emptyText="No attached links yet."
                errorText={materialError}
                resolveFileHref={(material) =>
                  sessionId && material.kind === "pdf"
                    ? buildLearnSessionMaterialFileHref(sessionId, material.id)
                    : null
                }
              />
            </div>
          ) : null}

          <div style={styles.chatComposer}>
            <PromptComposer
              goal={plannerInput}
              onGoalChange={setPlannerInput}
              onGenerate={() => {
                if (isPlanning) {
                  stopPlannerRequest();
                  return;
                }
                const inputSnapshot = plannerInput;
                if (inputSnapshot.trim()) {
                  setPlannerInput("");
                }
                if (launchSessionRoute("generate")) {
                  return;
                }

                if (liveSessionRef.current || liveStatus === "Connected") {
                  void sendLiveTextMessage(inputSnapshot);
                  return;
                }

                void submitChatRequest(inputSnapshot);
              }}
              onLive={() => {
                if (launchSessionRoute("live")) {
                  return;
                }

                void toggleLiveConnection();
              }}
              generateLabel={isPlanning ? "Stop" : "Send"}
              showAttach={Boolean(sessionId)}
              onAttachPdfFiles={(files) => {
                void handleAttachPdfFiles(files);
              }}
              onRemoveAttachment={handleRemoveComposerAttachment}
              attachments={composerAttachments}
              attachBusy={isUploadingMaterial}
              attachDisabled={!sessionId}
              generateBusy={isPlanning}
              generateIconOnly
              liveLabel={getLiveActionLabel(liveStatus)}
              showMute={showMuteControl}
              muteLabel={isMicActive ? "Mute" : "Unmute"}
              muteActive={isMicActive}
              muteDisabled={!showMuteControl}
              onMute={() => void toggleMicrophone()}
              generateDisabled={!plannerInput.trim() && !isPlanning}
              liveDisabled={liveStatus === "Connecting"}
              placeholder={getPlannerPlaceholder(planClarification, plan)}
              rows={1}
              variant="learn"
            />
          </div>
        </article>
      </section>
    </main>
  );
}

function getPlanningMode({
  clarification,
  plan,
}: {
  clarification: PlanningClarification | null;
  plan: CoursePlan | null;
}) {
  if (clarification) {
    return "clarify" as const;
  }

  if (plan) {
    return "refine" as const;
  }

  return "draft" as const;
}

function getPlannerPlaceholder(clarification: PlanningClarification | null, plan: CoursePlan | null) {
  if (clarification) {
    return clarification.prompt;
  }

  if (plan) {
    return "Refine the topics.";
  }

  return "What do you want to learn?";
}

function findTopicInPlan(plan: CoursePlan, topicId: string | null | undefined) {
  if (!topicId) {
    return null;
  }

  if ("topics" in plan) {
    return plan.topics.find((topic) => topic.id === topicId) ?? null;
  }

  for (const phase of plan.phases) {
    const topic = phase.topics.find((entry) => entry.id === topicId);
    if (topic) {
      return topic;
    }
  }

  return null;
}

function pickSelectedTopicId(plan: CoursePlan, currentTopicId: string | null) {
  if (currentTopicId && findTopicInPlan(plan, currentTopicId)) {
    return currentTopicId;
  }

  if (findTopicInPlan(plan, plan.recommendedStartingTopicId)) {
    return plan.recommendedStartingTopicId;
  }

  return getFirstTopicId(plan);
}

function getFirstTopicId(plan: CoursePlan) {
  if ("topics" in plan) {
    return plan.topics[0]?.id ?? null;
  }

  return plan.phases[0]?.topics[0]?.id ?? null;
}

function findTopicInTopicList(topics: PlanTopic[], topicId: string | null | undefined) {
  if (!topicId) {
    return null;
  }

  return topics.find((topic) => topic.id === topicId) ?? null;
}

function getPlanTopicCount(plan: CoursePlan | null) {
  if (!plan) {
    return 0;
  }

  if ("topics" in plan) {
    return plan.topics.length;
  }

  return plan.phases.reduce((count, phase) => count + phase.topics.length, 0);
}

function getPlanCollectionLabel(requestType: PlanRequestType | null | undefined) {
  switch (requestType) {
    case "curriculum":
      return "Subjects";
    case "subject":
      return "Topics";
    case "topic":
      return "Lessons";
    case "lesson":
      return "Headings";
    default:
      return "Topics";
  }
}

function float32ToBase64Pcm16(input: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  const downsampled = downsampleBuffer(input, inputSampleRate, outputSampleRate);
  const pcm = new Int16Array(downsampled.length);

  for (let index = 0; index < downsampled.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, downsampled[index]));
    pcm[index] = sample < 0 ? sample * 32768 : sample * 32767;
  }

  return bytesToBase64(new Uint8Array(pcm.buffer));
}

function downsampleBuffer(input: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (inputSampleRate === outputSampleRate) {
    return input;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  let outputIndex = 0;
  let inputIndex = 0;

  while (outputIndex < output.length) {
    const nextInputIndex = Math.round((outputIndex + 1) * ratio);
    let accumulator = 0;
    let count = 0;

    for (let index = inputIndex; index < nextInputIndex && index < input.length; index += 1) {
      accumulator += input[index];
      count += 1;
    }

    output[outputIndex] = count > 0 ? accumulator / count : 0;
    outputIndex += 1;
    inputIndex = nextInputIndex;
  }

  return output;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function createPendingPdfDraft(draft: PendingPdfAttachmentDraft): PendingPdfDraft {
  return {
    ...draft,
    status: "staged",
  };
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontSize: "0.94rem",
  },
  pageResizing: {
    cursor: "col-resize",
    userSelect: "none",
  },
  workspace: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.18fr) minmax(320px, 0.82fr)",
    alignItems: "stretch",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  splitter: {
    position: "relative",
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
    cursor: "col-resize",
    touchAction: "none",
    outlineOffset: "-2px",
  },
  splitterActive: {
    background: "var(--surface-subtle)",
  },
  splitterRail: {
    width: "1px",
    background: "var(--border)",
  },
  splitterThumb: {
    position: "absolute",
    top: "50%",
    width: "7px",
    height: "56px",
    borderRadius: "999px",
    background: "var(--surface-subtle-strong)",
    border: "1px solid var(--border)",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
    transform: "translateY(-50%)",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    padding: "16px 0px 18px 12px",
    overflow: "hidden",
  },
  chatPanel: {
    padding: "16px 10px 18px",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    marginBottom: "4px",
    paddingLeft: "6px",
  },
  panelBody: {
    minHeight: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    overscrollBehavior: "contain",
  },
  chatBody: {
    minHeight: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    overscrollBehavior: "contain",
  },
  chatComposer: {
    marginTop: "8px",
  },
  materialsPanelWrap: {
    marginTop: "8px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "clamp(1rem, 1.1vw, 1.12rem)",
    lineHeight: 1.1,
    fontWeight: 500,
    letterSpacing: "-0.02em",
  },
  headerLink: {
    color: "var(--text-soft)",
    fontSize: "0.78rem",
    textDecoration: "none",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    padding: "5px 8px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
  },
  panelHeaderActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "6px",
    flexWrap: "wrap",
  },
  historyMenuWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  historyButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "5px 8px",
    borderRadius: "999px",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    cursor: "pointer",
    font: "inherit",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
  },
  historyButtonActive: {
    background: "var(--surface-subtle)",
    borderColor: "var(--border-strong)",
    color: "var(--accent-strong)",
  },
  historyMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    zIndex: 20,
    width: "min(336px, 76vw)",
    maxHeight: "360px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px",
    borderRadius: "16px",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
    backdropFilter: "blur(18px)",
  },
  historyMenuHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  historyMenuTitle: {
    margin: 0,
    fontSize: "0.86rem",
    fontWeight: 600,
    color: "var(--text-soft)",
  },
  historyMenuMeta: {
    fontSize: "0.75rem",
    color: "var(--muted)",
  },
  historyMenuList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minHeight: 0,
    overflowY: "auto",
    paddingRight: "2px",
  },
  historyMenuEmpty: {
    margin: 0,
    color: "var(--muted)",
    fontSize: "0.82rem",
    lineHeight: 1.5,
  },
  historyMenuError: {
    margin: 0,
    color: "var(--danger)",
    fontSize: "0.78rem",
    lineHeight: 1.45,
  },
  historyItem: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    padding: "8px 10px",
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "var(--surface-1)",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
    color: "var(--text-soft)",
  },
  historyItemActive: {
    borderColor: "var(--border-strong)",
    background: "var(--surface-subtle)",
  },
  historyItemTopRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "8px",
  },
  historyItemTitle: {
    margin: 0,
    fontSize: "0.82rem",
    fontWeight: 600,
    lineHeight: 1.35,
    color: "var(--text-soft)",
  },
  historyItemTime: {
    flexShrink: 0,
    fontSize: "0.72rem",
    color: "var(--muted)",
  },
  historyItemPreview: {
    margin: 0,
    fontSize: "0.77rem",
    color: "var(--muted-strong)",
    lineHeight: 1.45,
  },
  historyItemMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "0.71rem",
    color: "var(--muted)",
  },
  badge: {
    padding: "4px 7px",
    borderRadius: "999px",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--muted-strong)",
    fontSize: "0.74rem",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    backdropFilter: "blur(12px)",
  },
  learnPanelShell: {
    display: "flex",
    flexDirection: "column",
    gap: "0",
    borderRadius: "18px",
    background: "var(--surface-muted)",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.04)",
    backdropFilter: "blur(12px)",
  },
  learnPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    width: "100%",
    padding: "10px 12px 8px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  },
  learnPanelMeta: {
    color: "var(--muted)",
    lineHeight: 1.5,
    fontSize: "0.76rem",
    whiteSpace: "nowrap",
  },
  learnPanelContent: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "10px 12px 12px",
  },
  learnPanelToggle: {
    color: "var(--text-soft)",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "clamp(1.04rem, 1.2vw, 1.18rem)",
    lineHeight: 1.1,
    fontWeight: 500,
    letterSpacing: "-0.02em",
  },
  emptyState: {
    padding: "8px 0 0 10px",
    borderLeft: "1px solid var(--border-strong)",
  },
  emptyTitle: {
    margin: 0,
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "var(--text-soft)",
  },
  emptyText: {
    margin: "6px 0 0",
    color: "var(--warm-muted)",
    fontSize: "0.94rem",
    lineHeight: 1.6,
  },
  generatedSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    paddingTop: "6px",
    borderTop: "1px solid var(--border)",
  },
  generatedHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  generatedTitle: {
    margin: 0,
    fontSize: "1rem",
    lineHeight: 1.2,
    color: "var(--text-soft)",
  },
  errorText: {
    color: "var(--danger)",
    margin: 0,
    fontSize: "0.98rem",
    lineHeight: 1.5,
  },
  controlButton: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: "999px",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    padding: "6px 9px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.8rem",
  },
  controlButtonActive: {
    background: "var(--surface-subtle)",
    borderColor: "var(--border-strong)",
    color: "var(--accent-strong)",
  },
  controlButtonDisabled: {
    opacity: 0.52,
    cursor: "not-allowed",
  },
  quizLauncherCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    marginTop: "-2px",
    padding: "10px 12px",
    borderRadius: "12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
  },
  quizLauncherCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  quizLauncherTitle: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.2,
    fontWeight: 600,
    color: "var(--text-soft)",
  },
  quizLauncherText: {
    margin: 0,
    fontSize: "0.94rem",
    lineHeight: 1.55,
    color: "var(--warm-muted)",
  },
  quizLauncherActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  messageBubble: {
    maxWidth: "88%",
    borderRadius: "14px",
    padding: "9px 11px",
    border: "1px solid var(--border)",
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "var(--surface-subtle)",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    background: "var(--surface-2)",
  },
  messageText: {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    fontSize: "0.92rem",
    lineHeight: 1.65,
    color: "var(--text-soft)",
  },
};
