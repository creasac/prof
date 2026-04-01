"use client";

import type { SourceMaterial } from "@prof/contracts";
import type { CSSProperties } from "react";

import { formatFileSize } from "../lib/source-materials";
import { IconText } from "./TutorUi";

type SourceMaterialsPanelProps = {
  title: string;
  materials: SourceMaterial[];
  emptyText?: string;
  errorText?: string | null;
  resolveFileHref?: (material: SourceMaterial) => string | null;
};

export function SourceMaterialsPanel({
  title,
  materials,
  emptyText = "No attached materials yet.",
  errorText,
  resolveFileHref,
}: SourceMaterialsPanelProps) {
  return (
    <section style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>{title}</h3>
      </div>

      {errorText ? <p style={styles.errorText}>{errorText}</p> : null}

      {materials.length === 0 ? (
        <p style={styles.emptyText}>{emptyText}</p>
      ) : (
        <div style={styles.list}>
          {materials.map((material) => {
            const href =
              material.kind === "url"
                ? material.resolvedUrl ?? material.sourceUrl ?? null
                : resolveFileHref?.(material) ?? null;

            return (
              <article key={material.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <span style={styles.kindPill}>
                    <IconText icon={material.kind === "pdf" ? "file" : "source"} size={13}>
                      {material.kind.toUpperCase()}
                    </IconText>
                  </span>
                  {href ? (
                    <a
                      href={href}
                      style={styles.link}
                      target={material.kind === "url" ? "_blank" : undefined}
                      rel={material.kind === "url" ? "noreferrer" : undefined}
                    >
                      Open
                    </a>
                  ) : null}
                </div>

                <h4 style={styles.cardTitle}>{material.title}</h4>
                <p style={styles.metaText}>{buildMetaLabel(material)}</p>
                {material.textExcerpt ? <p style={styles.excerpt}>{truncateExcerpt(material.textExcerpt)}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function buildMetaLabel(material: SourceMaterial) {
  if (material.kind === "url") {
    return material.resolvedUrl ?? material.sourceUrl ?? "Saved URL";
  }

  const parts = [material.fileName ?? "PDF"];
  const sizeLabel = formatFileSize(material.sizeBytes);
  if (sizeLabel) {
    parts.push(sizeLabel);
  }
  return parts.join(" · ");
}

function truncateExcerpt(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 217).trimEnd()}...`;
}

const styles: Record<string, CSSProperties> = {
  panel: {
    borderRadius: "18px",
    border: "1px solid rgba(72, 42, 22, 0.08)",
    background: "rgba(255, 252, 247, 0.88)",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  title: {
    margin: 0,
    color: "#2c1c14",
    fontSize: "0.98rem",
  },
  emptyText: {
    margin: 0,
    color: "#6a5447",
    fontSize: "0.9rem",
  },
  errorText: {
    margin: 0,
    color: "#8a3715",
    fontSize: "0.86rem",
  },
  list: {
    display: "grid",
    gap: "10px",
  },
  card: {
    borderRadius: "14px",
    border: "1px solid rgba(72, 42, 22, 0.08)",
    background: "rgba(255, 255, 255, 0.78)",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  kindPill: {
    borderRadius: "999px",
    border: "1px solid rgba(138, 55, 21, 0.12)",
    background: "rgba(255, 247, 240, 0.92)",
    color: "#8a3715",
    padding: "4px 8px",
    fontSize: "0.72rem",
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  link: {
    color: "#8a3715",
    fontSize: "0.86rem",
    textDecoration: "none",
  },
  cardTitle: {
    margin: 0,
    color: "#2c1c14",
    fontSize: "0.96rem",
  },
  metaText: {
    margin: 0,
    color: "#6a5447",
    fontSize: "0.82rem",
    wordBreak: "break-word",
  },
  excerpt: {
    margin: 0,
    color: "#4a3529",
    fontSize: "0.86rem",
    lineHeight: 1.5,
  },
};
