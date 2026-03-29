import type {
  CoursePlan,
  GroundingSource,
  PlanningClarification,
  QuizBlock,
  TutorBlock,
  TutorBlockType,
} from "@prof/contracts";
import type { QuizProgress } from "./quiz";

const LEARN_SESSION_STORAGE_PREFIX = "prof.learn.session.v1:";

export type LearnSessionSnapshot = {
  goal: string;
  plannerInput: string;
  preferredBlockType: TutorBlockType | "";
  useWebSearch: boolean;
  plan: CoursePlan | null;
  planClarification: PlanningClarification | null;
  planSources: GroundingSource[];
  selectedTopicId: string | null;
  generatedBlock: TutorBlock | null;
  generatedTopicId: string | null;
  generatedQuiz: QuizBlock | null;
  generatedQuizTopicId: string | null;
  generatedQuizError: string | null;
  quizProgress: QuizProgress | null;
  quizResultsByTopic?: Record<string, number>;
  blockSources: GroundingSource[];
  liveMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  liveInputDraft?: string;
  liveOutputDraft?: string;
  inputTranscript?: string;
  outputTranscript?: string;
  leftPanePercent: number;
  learnPanelCollapsed: boolean;
  liveGoal: string | null;
};

function getLearnSessionStorageKey(sessionId: string) {
  return `${LEARN_SESSION_STORAGE_PREFIX}${sessionId}`;
}

export function readLearnSessionSnapshot(sessionId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const snapshot = window.sessionStorage.getItem(getLearnSessionStorageKey(sessionId));
    return snapshot ? (JSON.parse(snapshot) as LearnSessionSnapshot) : null;
  } catch {
    return null;
  }
}

export function writeLearnSessionSnapshot(sessionId: string, snapshot: LearnSessionSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(getLearnSessionStorageKey(sessionId), JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures and keep the live in-memory state working.
  }
}
