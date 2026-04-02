"use client";

import type {
  GroundingSource,
  TutorBlock,
  TutorBlockType,
} from "@prof/contracts";
import type { CSSProperties, ReactNode } from "react";

import { MarkdownRenderer } from "./MarkdownRenderer";

export type IconName =
  | "attach"
  | "chevronDown"
  | "chevronRight"
  | "chevronUp"
  | "check"
  | "file"
  | "live"
  | "logOut"
  | "menu"
  | "message"
  | "mic"
  | "micOff"
  | "plus"
  | "plug"
  | "search"
  | "send"
  | "stop"
  | "stopCircle"
  | "source"
  | "spark"
  | "stack"
  | "target"
  | "user"
  | "waveform"
  | "x";

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const svgProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": "true" as const,
  };

  switch (name) {
    case "attach":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M16.5 6V17.5a4 4 0 0 1-8 0v-12a2.5 2.5 0 1 1 5 0V15a1 1 0 1 1-2 0V6.25H10V15a2.5 2.5 0 1 0 5 0V5.5a4 4 0 1 0-8 0v12a5.5 5.5 0 1 0 11 0V6h-1.5Z" />
        </svg>
      );
    case "chevronDown":
      return (
        <svg {...svgProps}>
          <path d="m6.5 9.5 5.5 5 5.5-5" />
        </svg>
      );
    case "chevronRight":
      return (
        <svg {...svgProps}>
          <path d="m9.5 6.5 5 5.5-5 5.5" />
        </svg>
      );
    case "chevronUp":
      return (
        <svg {...svgProps}>
          <path d="m6.5 14.5 5.5-5 5.5 5" />
        </svg>
      );
    case "check":
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.2 2.2 2.3 4.8-5.2" />
        </svg>
      );
    case "file":
      return (
        <svg {...svgProps}>
          <path d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 20V5a1.5 1.5 0 0 1 1-1.4Z" />
          <path d="M14 3.5V8h4" />
          <path d="M9.5 12h5" />
          <path d="M9.5 15h5" />
        </svg>
      );
    case "live":
      return (
        <svg {...svgProps}>
          <path d="M5 8.8a9.5 9.5 0 0 0 0 6.4" />
          <path d="M19 8.8a9.5 9.5 0 0 1 0 6.4" />
          <path d="M8.3 10.2a4.7 4.7 0 0 0 0 3.6" />
          <path d="M15.7 10.2a4.7 4.7 0 0 1 0 3.6" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "logOut":
      return (
        <svg {...svgProps}>
          <path d="M10 4.5H7.8A2.3 2.3 0 0 0 5.5 6.8v10.4a2.3 2.3 0 0 0 2.3 2.3H10" />
          <path d="M13 8.2 17.5 12 13 15.8" />
          <path d="M9.5 12h8" />
        </svg>
      );
    case "menu":
      return (
        <svg {...svgProps}>
          <path d="M5 7.5h14" />
          <path d="M5 12h14" />
          <path d="M5 16.5h14" />
        </svg>
      );
    case "message":
      return (
        <svg {...svgProps}>
          <path d="M6 7.5h12a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3v-3H6A2.5 2.5 0 0 1 3.5 14v-4A2.5 2.5 0 0 1 6 7.5Z" />
        </svg>
      );
    case "mic":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 -960 960 960"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm0-240Zm-40 480v-83q-92-13-157.5-78T203-479q-2-17 9-29t28-12q17 0 28.5 11.5T284-480q14 70 69.5 115T480-320q72 0 127-45.5T676-480q4-17 15.5-28.5T720-520q17 0 28 12t9 29q-14 91-79 157t-158 79v83q0 17-11.5 28.5T480-120q-17 0-28.5-11.5T440-160Zm40-320q17 0 28.5-11.5T520-520v-240q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v240q0 17 11.5 28.5T480-480Z" />
        </svg>
      );
    case "micOff":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 -960 960 960"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M672-377q-14-8-18-24.5t4-30.5q7-11 11.5-23.5T676-481q4-17 15.5-28t28.5-11q17 0 28 12t9 29q-3 23-10.5 45T727-392q-8 14-24.5 18.5T672-377ZM480-594Zm0-286q50 0 85 35t35 85v190q0 20-12.5 30T560-530q-15 0-27.5-10.5T520-571v-189q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v30q0 20-12.5 30T400-690q-15 0-27.5-10.5T360-731v-29q0-50 35-85t85-35Zm-40 720v-83q-92-12-157.5-77.5T203-479q-2-17 9-29t28-12q17 0 29 11.5t15 28.5q14 71 69 115.5T480-320q34 0 64.5-10.5T600-360l57 57q-29 23-63.5 39T520-243v83q0 17-11.5 28.5T480-120q-17 0-28.5-11.5T440-160Zm324 76L84-764q-11-11-11-28t11-28q11-11 28-11t28 11l680 680q11 11 11 28t-11 28q-11 11-28 11t-28-11Z" />
        </svg>
      );
    case "plus":
      return (
        <svg {...svgProps}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "plug":
      return (
        <svg {...svgProps}>
          <path d="M9 5.5v4" />
          <path d="M15 5.5v4" />
          <path d="M8 9.5h8v1.2A3.8 3.8 0 0 1 12.2 14.5H11.8A3.8 3.8 0 0 1 8 10.7V9.5Z" />
          <path d="M12 14.5V19" />
          <path d="M9.5 19h5" />
        </svg>
      );
    case "search":
      return (
        <svg {...svgProps}>
          <circle cx="11" cy="11" r="5.5" />
          <path d="m16 16 3.5 3.5" />
        </svg>
      );
    case "send":
      return (
        <svg {...svgProps}>
          <path d="M5 12h12.5" />
          <path d="m13.5 6.5 5.5 5.5-5.5 5.5" />
        </svg>
      );
    case "stop":
      return (
        <svg {...svgProps}>
          <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
        </svg>
      );
    case "stopCircle":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 -960 960 960"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M360-320h240q17 0 28.5-11.5T640-360v-240q0-17-11.5-28.5T600-640H360q-17 0-28.5 11.5T320-600v240q0 17 11.5 28.5T360-320ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
        </svg>
      );
    case "source":
      return (
        <svg {...svgProps}>
          <path d="M10.2 13.8 8.1 16a3.1 3.1 0 0 1-4.4-4.4L5.9 9.4" />
          <path d="m13.8 10.2 2.1-2.2a3.1 3.1 0 1 1 4.4 4.4l-2.2 2.2" />
          <path d="m8.7 15.3 6.6-6.6" />
        </svg>
      );
    case "spark":
      return (
        <svg {...svgProps}>
          <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
        </svg>
      );
    case "stack":
      return (
        <svg {...svgProps}>
          <path d="m12 4 8 4-8 4-8-4 8-4Z" />
          <path d="m4 12 8 4 8-4" />
          <path d="m4 16 8 4 8-4" />
        </svg>
      );
    case "target":
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M12 2.5v2.4" />
          <path d="M12 19.1v2.4" />
          <path d="M21.5 12h-2.4" />
          <path d="M4.9 12H2.5" />
        </svg>
      );
    case "user":
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="8.5" r="3.2" />
          <path d="M5.5 18a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "waveform":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="3" y="9" width="2.2" height="6" rx="1.1" />
          <rect x="7" y="6.5" width="2.2" height="11" rx="1.1" />
          <rect x="11" y="4" width="2.2" height="16" rx="1.1" />
          <rect x="15" y="7.5" width="2.2" height="9" rx="1.1" />
          <rect x="19" y="10" width="2.2" height="4" rx="1.1" />
        </svg>
      );
    case "x":
      return (
        <svg {...svgProps}>
          <path d="m7 7 10 10" />
          <path d="M17 7 7 17" />
        </svg>
      );
  }
}

export function IconText({
  icon,
  children,
  size = 16,
}: {
  icon: IconName;
  children: ReactNode;
  size?: number;
}) {
  return (
    <span style={styles.inlineIconText}>
      <Icon name={icon} size={size} />
      {children}
    </span>
  );
}

function getBlockMeta(type: TutorBlockType) {
  switch (type) {
    case "lesson":
      return { icon: "spark", label: "Lesson" } as const;
    case "quiz":
      return { icon: "check", label: "Quiz" } as const;
    case "flashcards":
      return { icon: "stack", label: "Cards" } as const;
    case "essay_prompt":
      return { icon: "message", label: "Essay" } as const;
    case "follow_up_question":
      return { icon: "message", label: "Follow-up" } as const;
  }
}

export function BlockView({ block, sources }: { block: TutorBlock; sources: GroundingSource[] }) {
  const meta = getBlockMeta(block.type);

  return (
    <section style={styles.blockPanel}>
      <div style={styles.blockHeader}>
        <span style={styles.blockType}>
          <IconText icon={meta.icon} size={14}>
            {meta.label}
          </IconText>
        </span>
        {"title" in block ? <h3 style={styles.blockTitle}>{block.title}</h3> : null}
      </div>

      {block.type === "lesson" ? (
        <>
          <p style={styles.blockText}>{block.summary}</p>
          <MarkdownRenderer markdown={block.contentMarkdown} style={styles.markdownBox} variant="compact" />
          <ul style={styles.list}>
            {block.objectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </>
      ) : null}

      {block.type === "quiz" ? (
        <>
          <p style={styles.blockText}>{block.instructions}</p>
          <p style={styles.infoText}>
            {block.questions.length} question{block.questions.length === 1 ? "" : "s"} ready.
          </p>
        </>
      ) : null}

      {block.type === "flashcards" ? (
        <div style={styles.cardGrid}>
          {block.cards.map((card) => (
            <article key={card.front} style={styles.flashcard}>
              <strong>{card.front}</strong>
              <p style={styles.blockText}>{card.back}</p>
            </article>
          ))}
        </div>
      ) : null}

      {block.type === "essay_prompt" ? (
        <>
          <p style={styles.blockText}>{block.prompt}</p>
          <ul style={styles.list}>
            {block.guidance.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </>
      ) : null}

      {block.type === "follow_up_question" ? (
        <>
          <p style={styles.blockText}>{block.prompt}</p>
          <p style={styles.infoText}>{block.reason}</p>
        </>
      ) : null}

      {sources.length > 0 ? (
        <div>
          <h4 style={styles.subsectionTitle}>
            <IconText icon="source" size={15}>
              Sources
            </IconText>
          </h4>
          <ul style={styles.list}>
            {sources.map((source) => (
              <li key={source.uri}>
                <a href={source.uri} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  blockPanel: {
    paddingBottom: "18px",
    borderBottom: "1px solid var(--border)",
  },
  blockHeader: {
    display: "flex",
    gap: "10px",
    alignItems: "baseline",
    flexWrap: "wrap",
    marginBottom: "10px",
  },
  blockType: {
    padding: "5px 8px",
    borderRadius: "999px",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--muted-strong)",
    fontSize: "0.74rem",
    display: "inline-flex",
    alignItems: "center",
  },
  blockTitle: {
    margin: 0,
    fontSize: "1.04rem",
  },
  blockText: {
    fontSize: "1rem",
    lineHeight: 1.7,
    color: "var(--text-soft)",
  },
  markdownBox: {
    lineHeight: 1.7,
    padding: "12px",
    borderRadius: "12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
  },
  list: {
    paddingLeft: "20px",
    fontSize: "1rem",
    lineHeight: 1.7,
  },
  cardGrid: {
    display: "grid",
    gap: "10px",
  },
  flashcard: {
    borderRadius: "14px",
    padding: "12px",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    fontSize: "0.92rem",
  },
  infoText: {
    color: "var(--warm-muted)",
    fontSize: "0.96rem",
    lineHeight: 1.6,
  },
  subsectionTitle: {
    margin: "0 0 8px",
    fontSize: "0.88rem",
  },
  inlineIconText: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
};
