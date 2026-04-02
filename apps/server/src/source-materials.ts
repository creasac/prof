import {
  createPublicId,
  sourceMaterialSchema,
  type GroundingSource,
  type SourceMaterial,
} from "@prof/contracts";

import { env } from "./env.js";
import type { ImportedUrlDocument } from "./providers/search/url-import.js";

export function buildSourceMaterialsPromptContext(materials: SourceMaterial[]) {
  const normalizedMaterials = normalizeSourceMaterials(materials).slice(0, env.SOURCE_MATERIAL_MAX_COUNT);
  if (normalizedMaterials.length === 0) {
    return "";
  }

  let remainingChars = env.SOURCE_MATERIAL_MAX_PROMPT_CHARS;

  const entries = normalizedMaterials
    .map((material, index) => {
      if (remainingChars <= 0) {
        return "";
      }

      const excerpt = clampText(material.textExcerpt, remainingChars);
      remainingChars -= excerpt.length;

      const lines = [`${index + 1}. ${material.title}`, `Type: ${material.kind}`];

      if (material.kind === "url") {
        if (material.sourceUrl) {
          lines.push(`Source URL: ${material.sourceUrl}`);
        }
        if (material.resolvedUrl && material.resolvedUrl !== material.sourceUrl) {
          lines.push(`Resolved URL: ${material.resolvedUrl}`);
        }
        if (material.capture) {
          lines.push(`Capture: ${material.capture}`);
        }
      } else {
        if (material.fileName) {
          lines.push(`File name: ${material.fileName}`);
        }
        if (material.sizeBytes !== undefined) {
          lines.push(`Size bytes: ${material.sizeBytes}`);
        }
      }

      if (excerpt) {
        lines.push("Excerpt:");
        lines.push(excerpt);
      }

      return lines.join("\n");
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return "";
  }

  return [
    "Attached course materials:",
    "These materials are part of the learner's saved course context. Use them when they are relevant to the request.",
    ...entries,
  ].join("\n\n");
}

export function getSourceMaterialGroundingSources(materials: SourceMaterial[]) {
  return normalizeSourceMaterials(materials)
    .filter((material) => material.kind === "url")
    .map((material): GroundingSource | null => {
      const uri = material.resolvedUrl ?? material.sourceUrl;
      if (!uri) {
        return null;
      }

      return {
        title: material.title,
        uri,
      };
    })
    .filter((source): source is GroundingSource => source !== null);
}

export function getAttachedMaterialUrls(materials: SourceMaterial[]) {
  return normalizeSourceMaterials(materials)
    .filter((material) => material.kind === "url")
    .flatMap((material) => [material.sourceUrl, material.resolvedUrl])
    .filter((value): value is string => Boolean(value));
}

export function findSourceMaterial(materials: SourceMaterial[], materialId: string) {
  return normalizeSourceMaterials(materials).find((material) => material.id === materialId) ?? null;
}

export function createUrlSourceMaterial(document: ImportedUrlDocument): SourceMaterial {
  return sourceMaterialSchema.parse({
    id: createPublicId(12),
    kind: "url",
    title: clampTitle(document.title),
    createdAt: new Date().toISOString(),
    sourceUrl: document.sourceUrl,
    resolvedUrl: document.resolvedUrl,
    capture: document.capture || undefined,
    textExcerpt: clampText(document.markdown, env.SOURCE_MATERIAL_MAX_EXCERPT_CHARS),
  });
}

export function createPdfSourceMaterial(input: {
  id?: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  textExcerpt: string;
}) {
  return sourceMaterialSchema.parse({
    id: input.id ?? createPublicId(12),
    kind: "pdf",
    title: clampTitle(input.title),
    createdAt: new Date().toISOString(),
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    storageKey: input.storageKey,
    textExcerpt: clampText(input.textExcerpt, env.SOURCE_MATERIAL_MAX_EXCERPT_CHARS),
  });
}

export function buildPdfStorageKey(options: {
  userId: string;
  sessionId: string;
  materialId: string;
  fileName: string;
}) {
  const safeName = sanitizePathSegment(options.fileName || "document.pdf");
  return `${buildPdfStoragePrefix(options)}/${sanitizePathSegment(options.materialId)}/${safeName}`;
}

export function buildPdfStoragePrefix(options: {
  userId: string;
  sessionId: string;
}) {
  return `users/${sanitizePathSegment(options.userId)}/sessions/${sanitizePathSegment(options.sessionId)}/materials`;
}

function normalizeSourceMaterials(materials: SourceMaterial[]) {
  const seen = new Set<string>();
  const nextMaterials: SourceMaterial[] = [];

  for (const material of materials) {
    const parsed = sourceMaterialSchema.parse(material);
    if (seen.has(parsed.id)) {
      continue;
    }

    seen.add(parsed.id);
    nextMaterials.push(parsed);
  }

  return nextMaterials;
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "file";
}

function clampTitle(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 240) {
    return trimmed;
  }

  return trimmed.slice(0, 237).trimEnd() + "...";
}

function clampText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 16)).trimEnd()}\n\n[truncated]`;
}
