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
  | "plus"
  | "plug"
  | "search"
  | "send"
  | "stop"
  | "source"
  | "spark"
  | "stack"
  | "target"
  | "user"
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
        <svg {...svgProps}>
          <path d="M8.8 12.8 14.9 6.7a3.5 3.5 0 1 1 5 5l-8.3 8.3a5 5 0 1 1-7.1-7.1l8.4-8.4" />
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
        <svg {...svgProps}>
          <path d="M12 4.5a2.5 2.5 0 0 1 2.5 2.5v4.5a2.5 2.5 0 0 1-5 0V7a2.5 2.5 0 0 1 2.5-2.5Z" />
          <path d="M7.5 11.5a4.5 4.5 0 0 0 9 0" />
          <path d="M12 16v3.5" />
          <path d="M9.2 19.5h5.6" />
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
          <path d="M4 12 20 5l-3.4 14-5.2-4.2L4 12Z" />
          <path d="m11.4 14.8 2.2 3.9" />
        </svg>
      );
    case "stop":
      return (
        <svg {...svgProps}>
          <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
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
    background: "rgba(255, 251, 246, 0.78)",
    border: "1px solid rgba(191, 91, 44, 0.14)",
    color: "#8a3715",
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
    color: "#3f3028",
  },
  markdownBox: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.7,
    padding: "12px",
    borderRadius: "12px",
    background: "rgba(255, 251, 246, 0.62)",
    border: "1px solid rgba(72, 42, 22, 0.08)",
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
    background: "rgba(255, 251, 246, 0.58)",
    border: "1px solid rgba(72, 42, 22, 0.08)",
    fontSize: "0.92rem",
  },
  infoText: {
    color: "#6a5447",
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
