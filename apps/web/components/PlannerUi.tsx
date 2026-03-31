"use client";

import type { CoursePlan, PlanTopic, PlanningClarification } from "@prof/contracts";
import type { CSSProperties } from "react";

import { Icon } from "./TutorUi";

type PlannerViewProps = {
  plan: CoursePlan | null;
  clarification: PlanningClarification | null;
  streamedPlanTitle: string;
  streamedTopics: PlanTopic[];
  selectedTopicId: string | null;
  generatedTopicId: string | null;
  quizResultsByTopic?: Record<string, number>;
  isPlanning: boolean;
  isGeneratingTopic: boolean;
  onSelectTopic: (topicId: string) => void;
  onGenerateTopic: () => void;
  actionLabel?: string;
  actionHint?: string;
  showAction?: boolean;
};

export function PlannerView({
  plan,
  clarification,
  streamedPlanTitle,
  streamedTopics,
  selectedTopicId,
  generatedTopicId,
  quizResultsByTopic = {},
  isPlanning,
  isGeneratingTopic,
  onSelectTopic,
  onGenerateTopic,
  actionLabel = "Generate",
  actionHint,
  showAction = true,
}: PlannerViewProps) {
  const showStream = streamedTopics.length > 0 || Boolean(streamedPlanTitle);
  const topics = showStream ? streamedTopics : plan ? flattenPlanTopics(plan) : [];

  if (!clarification && !plan && streamedTopics.length === 0) {
    return (
      <div style={styles.emptyState}>
        <p style={styles.emptyTitle}>{isPlanning ? "Generating..." : "Start with a learning request."}</p>
        <p style={styles.emptyText}>
          {isPlanning
            ? "Items will appear here as they are generated."
            : "Prof will build a short ordered outline you can generate one item at a time."}
        </p>
      </div>
    );
  }

  return (
    <div style={styles.stack}>
      {clarification ? (
        <section style={styles.noticeCard}>
          <p style={styles.noticePrompt}>{clarification.prompt}</p>
          <p style={styles.noticeReason}>{clarification.reason}</p>
          {clarification.examples.length > 0 ? (
            <ul style={styles.exampleList}>
              {clarification.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {topics.length > 0 ? (
        <div style={styles.topicStack}>
          {topics.map((topic) => (
            <TopicButton
              key={topic.id}
              topic={topic}
              selected={selectedTopicId === topic.id}
              generated={generatedTopicId === topic.id}
              quizResultPercent={quizResultsByTopic[topic.id]}
              onSelectTopic={onSelectTopic}
            />
          ))}
        </div>
      ) : (
        <div style={styles.loadingState}>
          <p style={styles.loadingText}>{isPlanning ? "Waiting for the first item..." : "No items yet."}</p>
        </div>
      )}

      {showAction ? (
        <div style={styles.topicActions}>
          <p style={styles.topicHint}>
            {actionHint ??
              (plan
                ? selectedTopicId
                  ? "Generate the selected item into the lesson area below."
                  : "Select an item to generate it."
                : "Finish generating the outline before creating a lesson.")}
          </p>
          <button
            style={styles.primaryButton}
            type="button"
            onClick={onGenerateTopic}
            disabled={!plan || !selectedTopicId || isGeneratingTopic || isPlanning}
          >
            {isGeneratingTopic ? "Generating..." : actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TopicButton({
  topic,
  selected,
  generated,
  quizResultPercent,
  onSelectTopic,
}: {
  topic: PlanTopic;
  selected: boolean;
  generated: boolean;
  quizResultPercent: number | undefined;
  onSelectTopic: (topicId: string) => void;
}) {
  const hasQuizResult = typeof quizResultPercent === "number";
  const quizResultStyle =
    hasQuizResult && quizResultPercent >= QUIZ_SCORE_THRESHOLD ? styles.topicScorePass : styles.topicScoreFail;

  return (
    <button
      style={{
        ...styles.topicButton,
        ...(selected ? styles.topicButtonSelected : null),
      }}
      type="button"
      onClick={() => onSelectTopic(topic.id)}
    >
      <div style={styles.topicRow}>
        <div style={styles.topicLabelWrap}>
          <Icon name={selected ? "chevronDown" : "chevronRight"} size={16} />
          <strong
            style={{
              ...styles.topicTitle,
              ...(generated ? styles.topicTitleGenerated : null),
            }}
          >
            {topic.title}
          </strong>
        </div>

        {hasQuizResult ? (
          <span
            style={{
              ...styles.topicScore,
              ...quizResultStyle,
            }}
          >
            {quizResultPercent}%
          </span>
        ) : null}
      </div>

      {selected ? <p style={styles.topicSummary}>{topic.summary}</p> : null}
    </button>
  );
}

function flattenPlanTopics(plan: CoursePlan) {
  if ("topics" in plan) {
    return plan.topics;
  }

  return plan.phases.flatMap((phase) => phase.topics);
}

const QUIZ_SCORE_THRESHOLD = 80;

const styles: Record<string, CSSProperties> = {
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  emptyState: {
    padding: "10px 12px 2px",
    borderRadius: "16px",
    background: "rgba(255, 253, 248, 0.8)",
    border: "1px solid rgba(72, 42, 22, 0.08)",
  },
  emptyTitle: {
    margin: 0,
    fontSize: "0.94rem",
    fontWeight: 600,
    color: "#3f3028",
  },
  emptyText: {
    margin: "8px 0 0",
    color: "#6a5447",
    fontSize: "0.88rem",
    lineHeight: 1.6,
  },
  noticeCard: {
    padding: "12px 14px",
    borderRadius: "16px",
    border: "1px solid rgba(191, 91, 44, 0.16)",
    background: "rgba(255, 248, 242, 0.84)",
  },
  noticePrompt: {
    margin: 0,
    fontSize: "0.96rem",
    fontWeight: 600,
    color: "#2c1c14",
    lineHeight: 1.5,
  },
  noticeReason: {
    margin: "8px 0 0",
    color: "#6a5447",
    fontSize: "0.88rem",
    lineHeight: 1.6,
  },
  exampleList: {
    margin: "10px 0 0",
    paddingLeft: "20px",
    fontSize: "0.88rem",
    lineHeight: 1.6,
    color: "#4b392f",
  },
  loadingState: {
    borderRadius: "14px",
    border: "1px dashed rgba(72, 42, 22, 0.14)",
    padding: "12px 14px",
    background: "rgba(255, 253, 248, 0.5)",
  },
  loadingText: {
    margin: 0,
    color: "#6a5447",
    fontSize: "0.88rem",
  },
  topicStack: {
    display: "grid",
    gap: "6px",
  },
  topicButton: {
    width: "100%",
    textAlign: "left",
    borderRadius: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(72, 42, 22, 0.08)",
    background: "rgba(255, 253, 248, 0.72)",
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: "0.92rem",
  },
  topicButtonSelected: {
    borderColor: "rgba(191, 91, 44, 0.32)",
    background: "rgba(255, 247, 239, 0.76)",
  },
  topicRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
  },
  topicLabelWrap: {
    display: "inline-flex",
    gap: "8px",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  topicTitle: {
    color: "#2c1c14",
    lineHeight: 1.4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  topicTitleGenerated: {
    color: "#2f6a3b",
  },
  topicSummary: {
    margin: "8px 0 0 24px",
    color: "#6a5447",
    fontSize: "0.88rem",
    lineHeight: 1.6,
  },
  topicScore: {
    borderRadius: "999px",
    padding: "4px 10px",
    fontSize: "0.82rem",
    fontWeight: 600,
    letterSpacing: "0.01em",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  },
  topicScorePass: {
    color: "#2f6a3b",
    background: "rgba(47, 106, 59, 0.12)",
    borderColor: "rgba(47, 106, 59, 0.25)",
  },
  topicScoreFail: {
    color: "#b8402a",
    background: "rgba(184, 64, 42, 0.12)",
    borderColor: "rgba(184, 64, 42, 0.25)",
  },
  topicActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 0,
  },
  topicHint: {
    margin: 0,
    color: "#6a5447",
    fontSize: "0.88rem",
    lineHeight: 1.6,
    maxWidth: "460px",
  },
  primaryButton: {
    border: "none",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #bf5b2c, #8a3715)",
    color: "#fff7ef",
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.88rem",
  },
};
