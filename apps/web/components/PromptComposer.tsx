"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { Icon, IconText, type IconName } from "./TutorUi";

export type PromptComposerAttachment = {
  id: string;
  title: string;
  removable?: boolean;
  uploading?: boolean;
  invalid?: boolean;
};

type PromptComposerProps = {
  goal: string;
  onGoalChange: (value: string) => void;
  onGenerate: () => void;
  onLive: () => void;
  onAttachPdfFiles?: (files: File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onMute?: () => void;
  generateLabel?: string;
  liveLabel?: string;
  attachTitle?: string;
  muteLabel?: string;
  attachments?: PromptComposerAttachment[];
  attachBusy?: boolean;
  generateBusy?: boolean;
  generateIconOnly?: boolean;
  showAttach?: boolean;
  attachDisabled?: boolean;
  generateDisabled?: boolean;
  liveDisabled?: boolean;
  muteDisabled?: boolean;
  muteActive?: boolean;
  liveActive?: boolean;
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
  onRemoveAttachment,
  onMute,
  generateLabel = "Generate",
  liveLabel = "Live",
  attachTitle = "pdf upload only",
  muteLabel = "Mute",
  attachments = [],
  attachBusy = false,
  generateBusy = false,
  generateIconOnly = false,
  showAttach = false,
  attachDisabled = false,
  generateDisabled = false,
  liveDisabled = false,
  muteDisabled = false,
  muteActive = false,
  liveActive = false,
  showMute = false,
  placeholder = "What do you want to learn?",
  rows = 1,
  variant = "learn",
}: PromptComposerProps) {
  const isHome = variant === "home";
  const hasText = goal.trim().length > 0;
  const showGenerateAction = generateBusy || hasText;
  const generateIcon: IconName = generateBusy ? "stop" : "send";
  const actionIconName: IconName = showGenerateAction ? generateIcon : liveActive ? "stopCircle" : "waveform";
  const muteIconName: IconName = muteActive ? "mic" : "micOff";
  const actionIconSize = isHome ? 21 : 20;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computedStyle.borderBottomWidth) || 0;
    const minHeight = lineHeight * rows + paddingTop + paddingBottom + borderTop + borderBottom;
    const maxHeight = lineHeight * 3 + paddingTop + paddingBottom + borderTop + borderBottom;
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [goal, rows, variant]);

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
      {attachments.length > 0 ? (
        <div
          style={{
            ...styles.attachmentsTray,
            ...(isHome ? styles.homeAttachmentsTray : styles.learnAttachmentsTray),
          }}
        >
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={onRemoveAttachment}
            />
          ))}
        </div>
      ) : null}

      <div
        style={{
          ...styles.inputRow,
          ...(isHome ? styles.homeInputRow : styles.learnInputRow),
        }}
      >
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
                ...styles.iconOnlyButton,
                ...(attachBusy ? styles.busyButton : null),
                ...(isHome ? null : styles.learnIconOnlyButton),
              }}
              type="button"
              onClick={handleAttachClick}
              disabled={attachDisabled}
              aria-label={attachTitle}
              title={attachTitle}
            >
              <Icon name="attach" size={19} />
            </button>
          </>
        ) : null}

        <label style={styles.textareaLabel}>
          <span style={styles.hiddenLabel}>Learning prompt</span>
          <textarea
            ref={textareaRef}
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

        {showMute ? (
          <button
            style={{
              ...styles.secondaryButton,
              ...styles.iconOnlyButton,
              ...(isHome ? null : styles.learnIconOnlyButton),
            }}
            type="button"
            onClick={onMute}
            disabled={muteDisabled}
            aria-pressed={muteActive}
            aria-label={muteLabel}
            title={muteLabel}
          >
            <Icon name={muteIconName} size={19} />
          </button>
        ) : null}

        <button
          style={{
            ...styles.secondaryButton,
            ...styles.iconOnlyButton,
            ...(isHome ? null : styles.learnIconOnlyButton),
          }}
          type="button"
          onClick={showGenerateAction ? onGenerate : onLive}
          disabled={showGenerateAction ? generateDisabled : liveDisabled}
          aria-label={showGenerateAction ? generateLabel : liveLabel}
          title={showGenerateAction ? generateLabel : liveLabel}
        >
          {generateIconOnly ? (
            <Icon name={actionIconName} size={actionIconSize} />
          ) : (
            <IconText icon={actionIconName} size={actionIconSize}>
              {showGenerateAction ? generateLabel : liveLabel}
            </IconText>
          )}
        </button>
      </div>
    </section>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PromptComposerAttachment;
  onRemove?: (attachmentId: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const canRemove = Boolean(onRemove) && attachment.removable !== false && !attachment.uploading;

  return (
    <div
      style={{
        ...styles.attachmentChip,
        ...(attachment.uploading ? styles.attachmentChipBusy : null),
        ...(attachment.invalid ? styles.attachmentChipInvalid : null),
      }}
      title={attachment.title}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={styles.attachmentChipContent}>
        <Icon name="file" size={15} />
        <span style={styles.attachmentChipLabel}>PDF</span>
      </span>
      {canRemove ? (
        <button
          type="button"
          onClick={() => onRemove?.(attachment.id)}
          style={{
            ...styles.attachmentRemoveButton,
            ...(isHovered ? styles.attachmentRemoveButtonVisible : styles.attachmentRemoveButtonHidden),
          }}
          aria-label={`Remove ${attachment.title}`}
          title={`Remove ${attachment.title}`}
        >
          <Icon name="x" size={11} />
        </button>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    width: "100%",
    borderRadius: "32px",
    boxShadow: "0 10px 24px rgba(73, 35, 14, 0.06)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    border: "0.5px solid rgba(72, 42, 22, 0.12)",
  },
  homeShell: {
    background: "var(--composer-bg)",
  },
  learnShell: {
    background: "var(--composer-bg)",
    backdropFilter: "blur(18px)",
  },
  textareaLabel: {
    display: "flex",
    flex: "1 1 auto",
    minWidth: "120px",
    alignItems: "center",
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
    display: "block",
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    resize: "none",
    overflowY: "hidden",
    color: "#1c120b",
    fontSize: "1.08rem",
    fontWeight: 450,
    letterSpacing: "0.01em",
    lineHeight: 1.6,
  },
  homeTextarea: {
    padding: "0",
    minHeight: "30px",
    fontSize: "1.05rem",
  },
  learnTextarea: {
    padding: "0",
    minHeight: "28px",
    fontSize: "1rem",
    lineHeight: 1.55,
  },
  attachmentsTray: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  homeAttachmentsTray: {
    padding: "10px 12px 8px",
  },
  learnAttachmentsTray: {
    padding: "8px 10px 7px",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "40px",
  },
  homeInputRow: {
    padding: "10px 12px 12px",
  },
  learnInputRow: {
    padding: "8px 10px 10px",
  },
  attachmentChip: {
    position: "relative",
    minHeight: "34px",
    padding: "7px 12px",
    paddingRight: "30px",
    borderRadius: "12px",
    border: "1px solid rgba(72, 42, 22, 0.12)",
    background: "rgba(255, 255, 255, 0.76)",
    color: "#2c1c14",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentChipBusy: {
    opacity: 0.7,
  },
  attachmentChipInvalid: {
    border: "1px solid rgba(138, 55, 21, 0.3)",
    color: "#8a3715",
  },
  attachmentChipContent: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  attachmentChipLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
  },
  attachmentRemoveButton: {
    position: "absolute",
    top: "50%",
    right: "6px",
    transform: "translateY(-50%)",
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    border: "none",
    background: "rgba(33, 20, 13, 0.88)",
    color: "#fff7ef",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "opacity 120ms ease",
  },
  attachmentRemoveButtonHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  attachmentRemoveButtonVisible: {
    opacity: 1,
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
    lineHeight: 1,
    minWidth: "82px",
  },
  iconOnlyButton: {
    minWidth: "38px",
    width: "38px",
    padding: "8px",
    flexShrink: 0,
    alignSelf: "center",
  },
  busyButton: {
    opacity: 0.7,
  },
  learnIconOnlyButton: {
    minWidth: "34px",
    width: "34px",
    padding: "7px",
  },
};
