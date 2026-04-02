"use client";

import { useRef, type CSSProperties, type KeyboardEvent } from "react";

import { IconText } from "./TutorUi";

type PromptComposerProps = {
  goal: string;
  onGoalChange: (value: string) => void;
  onGenerate: () => void;
  onLive: () => void;
  onAttachPdfFiles?: (files: File[]) => void;
  onMute?: () => void;
  generateLabel?: string;
  liveLabel?: string;
  attachLabel?: string;
  muteLabel?: string;
  attachBusy?: boolean;
  generateBusy?: boolean;
  generateIconOnly?: boolean;
  showAttach?: boolean;
  attachDisabled?: boolean;
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
  onGenerate,
  onLive,
  onAttachPdfFiles,
  onMute,
  generateLabel = "Generate",
  liveLabel = "Live",
  attachLabel = "PDF",
  muteLabel = "Mute",
  attachBusy = false,
  generateBusy = false,
  generateIconOnly = false,
  showAttach = false,
  attachDisabled = false,
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  function handleAttachClick() {
    fileInputRef.current?.click();
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
        <div style={styles.actionsRow}>
          {showAttach ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                style={styles.hiddenInput}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length > 0) {
                    onAttachPdfFiles?.(files);
                  }
                  event.currentTarget.value = "";
                }}
              />
              <button
                style={{
                  ...styles.secondaryButton,
                  ...(isHome ? null : styles.learnButton),
                }}
                type="button"
                onClick={handleAttachClick}
                disabled={attachDisabled}
              >
                <IconText icon="attach">{attachBusy ? "Uploading..." : attachLabel}</IconText>
              </button>
            </>
          ) : null}
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
    borderRadius: "18px",
    boxShadow: "0 10px 24px rgba(73, 35, 14, 0.06)",
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
  hiddenInput: {
    display: "none",
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
    padding: "12px 14px 6px",
    minHeight: "46px",
    fontSize: "0.94rem",
  },
  learnTextarea: {
    padding: "10px 14px 5px",
    minHeight: "38px",
    fontSize: "0.9rem",
    lineHeight: 1.5,
  },
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "10px",
  },
  homeFooter: {
    padding: "8px 12px 10px",
  },
  learnFooter: {
    padding: "6px 10px 10px",
  },
  actionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginLeft: "auto",
  },
  primaryButton: {
    border: "none",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #bf5b2c, #8a3715)",
    color: "#fff7ef",
    padding: "8px 12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "0.86rem",
    minWidth: "82px",
  },
  secondaryButton: {
    border: "1px solid rgba(72, 42, 22, 0.2)",
    borderRadius: "999px",
    background: "var(--panel-strong)",
    color: "#21140d",
    padding: "8px 12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "0.86rem",
    minWidth: "82px",
  },
  learnButton: {
    padding: "7px 10px",
    fontSize: "0.82rem",
    minWidth: "76px",
  },
};
