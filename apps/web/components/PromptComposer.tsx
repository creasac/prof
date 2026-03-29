"use client";

import type { TutorBlockType } from "@prof/contracts";
import type { CSSProperties, KeyboardEvent } from "react";

import { IconText } from "./TutorUi";

type PromptComposerProps = {
  goal: string;
  onGoalChange: (value: string) => void;
  preferredBlockType: TutorBlockType | "";
  onPreferredBlockTypeChange: (value: TutorBlockType | "") => void;
  useWebSearch: boolean;
  onUseWebSearchChange: (value: boolean) => void;
  onGenerate: () => void;
  onLive: () => void;
  onMute?: () => void;
  generateLabel?: string;
  liveLabel?: string;
  muteLabel?: string;
  generateBusy?: boolean;
  generateIconOnly?: boolean;
  generateDisabled?: boolean;
  liveDisabled?: boolean;
  muteDisabled?: boolean;
  muteActive?: boolean;
  showMute?: boolean;
  placeholder?: string;
  rows?: number;
  variant?: "home" | "learn";
};

export function PromptComposer({
  goal,
  onGoalChange,
  preferredBlockType,
  onPreferredBlockTypeChange,
  useWebSearch,
  onUseWebSearchChange,
  onGenerate,
  onLive,
  onMute,
  generateLabel = "Generate",
  liveLabel = "Live",
  muteLabel = "Mute",
  generateBusy = false,
  generateIconOnly = false,
  generateDisabled = false,
  liveDisabled = false,
  muteDisabled = false,
  muteActive = false,
  showMute = false,
  placeholder = "What do you want to learn?",
  rows = 1,
  variant = "learn",
}: PromptComposerProps) {
  const isHome = variant === "home";
  const generateIcon = generateBusy ? "stop" : "send";

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    if (event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (!generateDisabled) {
      onGenerate();
    }
  }

  return (
    <section
      style={{
        ...styles.shell,
        ...(isHome ? styles.homeShell : styles.learnShell),
      }}
    >
      <label style={styles.textareaLabel}>
        <span style={styles.hiddenLabel}>Learning prompt</span>
        <textarea
          style={{
            ...styles.textarea,
            ...(isHome ? styles.homeTextarea : styles.learnTextarea),
          }}
          rows={rows}
          value={goal}
          onChange={(event) => onGoalChange(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder={placeholder}
        />
      </label>

      <div
        style={{
          ...styles.footer,
          ...(isHome ? styles.homeFooter : styles.learnFooter),
        }}
      >
        <div style={styles.optionsRow}>
          <label style={styles.field}>
            <span style={styles.hiddenLabel}>Output format</span>
            <select
              style={{
                ...styles.select,
                ...(isHome ? null : styles.learnSelect),
              }}
              value={preferredBlockType}
              onChange={(event) => onPreferredBlockTypeChange(event.target.value as TutorBlockType | "")}
            >
              <option value="">Auto</option>
              <option value="lesson">Lesson</option>
              <option value="quiz">Quiz</option>
              <option value="flashcards">Cards</option>
              <option value="essay_prompt">Essay</option>
              <option value="follow_up_question">Follow-up</option>
            </select>
          </label>

          <label
            style={{
              ...styles.checkboxLabel,
              ...(isHome ? null : styles.learnCheckboxLabel),
            }}
          >
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(event) => onUseWebSearchChange(event.target.checked)}
            />
            <IconText icon="search" size={15}>
              Search
            </IconText>
          </label>
        </div>

        <div style={styles.actionsRow}>
          {showMute ? (
            <button
              style={{
                ...styles.secondaryButton,
                ...(isHome ? null : styles.learnButton),
              }}
              type="button"
              onClick={onMute}
              disabled={muteDisabled}
              aria-pressed={muteActive}
            >
              <IconText icon="mic">{muteLabel}</IconText>
            </button>
          ) : null}
          <button
            style={{
              ...styles.secondaryButton,
              ...(isHome ? null : styles.learnButton),
            }}
            type="button"
            onClick={onLive}
            disabled={liveDisabled}
          >
            <IconText icon="live">{liveLabel}</IconText>
          </button>
          <button
            style={{
              ...styles.primaryButton,
              ...(isHome ? null : styles.learnButton),
            }}
            type="button"
            onClick={onGenerate}
            disabled={generateDisabled}
            aria-label={generateLabel}
            title={generateLabel}
          >
            <IconText icon={generateIcon}>{generateIconOnly ? null : generateLabel}</IconText>
          </button>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    width: "100%",
    borderRadius: "22px",
    boxShadow: "0 14px 30px rgba(73, 35, 14, 0.07)",
    overflow: "hidden",
  },
  homeShell: {
    background: "var(--composer-bg)",
  },
  learnShell: {
    background: "var(--composer-bg)",
    backdropFilter: "blur(18px)",
  },
  textareaLabel: {
    display: "block",
  },
  hiddenLabel: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  },
  textarea: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    resize: "none",
    color: "#1c120b",
    fontSize: "1rem",
    fontWeight: 450,
    letterSpacing: "0.01em",
    lineHeight: 1.55,
  },
  homeTextarea: {
    padding: "15px 18px 8px",
    minHeight: "52px",
    fontSize: "0.98rem",
  },
  learnTextarea: {
    padding: "12px 16px 6px",
    minHeight: "44px",
    fontSize: "0.93rem",
    lineHeight: 1.5,
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "12px",
  },
  homeFooter: {
    padding: "10px 14px 14px",
  },
  learnFooter: {
    padding: "8px 12px 12px",
  },
  optionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "flex-end",
  },
  field: {
    display: "flex",
  },
  select: {
    minWidth: "92px",
    borderRadius: "12px",
    border: "1px solid rgba(72, 42, 22, 0.14)",
    background: "var(--panel-strong)",
    padding: "6px 8px",
    fontSize: "0.84rem",
    color: "#4c392e",
  },
  learnSelect: {
    minWidth: "84px",
    padding: "5px 7px",
    fontSize: "0.8rem",
  },
  checkboxLabel: {
    display: "inline-flex",
    gap: "4px",
    alignItems: "center",
    color: "#4c392e",
    fontSize: "0.88rem",
    minHeight: "36px",
  },
  learnCheckboxLabel: {
    fontSize: "0.84rem",
    minHeight: "32px",
  },
  actionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginLeft: "auto",
  },
  primaryButton: {
    border: "none",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #bf5b2c, #8a3715)",
    color: "#fff7ef",
    padding: "9px 14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "0.9rem",
    minWidth: "92px",
  },
  secondaryButton: {
    border: "1px solid rgba(72, 42, 22, 0.2)",
    borderRadius: "999px",
    background: "var(--panel-strong)",
    color: "#21140d",
    padding: "9px 14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "0.9rem",
    minWidth: "92px",
  },
  learnButton: {
    padding: "8px 12px",
    fontSize: "0.86rem",
    minWidth: "84px",
  },
};
