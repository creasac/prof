import type { SourceMaterial, SourceMaterialFileKind } from "@prof/contracts";

const SUPPORTED_SOURCE_MATERIAL_CODE_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "graphql",
  "h",
  "hpp",
  "java",
  "js",
  "jsx",
  "kt",
  "mjs",
  "php",
  "pl",
  "py",
  "rb",
  "rs",
  "scala",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "yaml",
  "yml",
]);

export const SOURCE_MATERIAL_FILE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
export const SOURCE_MATERIAL_FILE_INPUT_ACCEPT = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".ndjson",
  ".bash",
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".graphql",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".pl",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/x-ndjson",
  "image/png",
  "image/jpeg",
  "image/webp",
].join(",");

export function upsertSourceMaterial(current: SourceMaterial[], nextMaterial: SourceMaterial) {
  const nextMaterialUrl = getMaterialPrimaryUrl(nextMaterial);

  const nextItems: SourceMaterial[] = [];
  let inserted = false;

  for (const material of current) {
    if (material.id === nextMaterial.id) {
      if (!inserted) {
        nextItems.push(nextMaterial);
        inserted = true;
      }
      continue;
    }

    if (
      nextMaterial.kind === "url" &&
      material.kind === "url" &&
      nextMaterialUrl &&
      normalizeUrl(material.resolvedUrl ?? material.sourceUrl ?? "") === nextMaterialUrl
    ) {
      if (!inserted) {
        nextItems.push(nextMaterial);
        inserted = true;
      }
      continue;
    }

    nextItems.push(material);
  }

  if (!inserted) {
    nextItems.push(nextMaterial);
  }

  return nextItems;
}

export function findAttachedUrlMaterial(materials: SourceMaterial[], url: string) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  return (
    materials.find((material) => {
      if (material.kind !== "url") {
        return false;
      }

      return normalizeUrl(material.resolvedUrl ?? material.sourceUrl ?? "") === normalizedUrl;
    }) ?? null
  );
}

export function buildLearnSessionMaterialFileHref(sessionId: string, materialId: string) {
  return `/api/learn/sessions/${encodeURIComponent(sessionId)}/materials/${encodeURIComponent(materialId)}/file`;
}

export function buildCourseMaterialFileHref(username: string, courseSlug: string, materialId: string) {
  return `/api/courses/${encodeURIComponent(username)}/${encodeURIComponent(courseSlug)}/materials/${encodeURIComponent(materialId)}/file`;
}

export function isSourceMaterialFile(material: SourceMaterial) {
  return material.kind === "file";
}

export function getSourceMaterialKindLabel(material: SourceMaterial) {
  if (material.kind === "url") {
    return "URL";
  }

  return getSourceMaterialFileKindLabel(material.fileKind);
}

export function getSourceMaterialFileKindLabel(fileKind?: SourceMaterialFileKind) {
  switch (fileKind) {
    case "pdf":
      return "PDF";
    case "markdown":
      return "Markdown";
    case "csv":
      return "CSV";
    case "json":
      return "JSON";
    case "code":
      return "Code";
    case "image":
      return "Image";
    case "document":
      return "Document";
    case "spreadsheet":
      return "Sheet";
    case "presentation":
      return "Slides";
    case "notebook":
      return "Notebook";
    case "text":
      return "Text";
    default:
      return "File";
  }
}

export function getSourceMaterialFileLabelForFile(file: Pick<File, "name" | "type">) {
  return getSourceMaterialFileKindLabel(guessSourceMaterialFileKind(file));
}

export function isSupportedSourceMaterialFile(file: File) {
  return Boolean(guessSourceMaterialFileKind(file));
}

export function formatFileSize(sizeBytes?: number) {
  if (sizeBytes === undefined || Number.isNaN(sizeBytes)) {
    return "";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMaterialPrimaryUrl(material: SourceMaterial) {
  return normalizeUrl(material.resolvedUrl ?? material.sourceUrl ?? "");
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString();
  } catch {
    return trimmed;
  }
}

function getFileExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  const lastDotIndex = normalized.lastIndexOf(".");
  if (lastDotIndex < 0 || lastDotIndex === normalized.length - 1) {
    return "";
  }

  return normalized.slice(lastDotIndex + 1);
}

function guessSourceMaterialFileKind(file: Pick<File, "name" | "type">): SourceMaterialFileKind | undefined {
  const mimeType = file.type.trim().toLowerCase();
  const extension = getFileExtension(file.name);

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp" ||
    extension === "png" ||
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "webp"
  ) {
    return "image";
  }

  if (mimeType === "text/markdown" || extension === "md" || extension === "markdown") {
    return "markdown";
  }

  if (
    mimeType === "text/csv" ||
    mimeType === "text/tab-separated-values" ||
    extension === "csv" ||
    extension === "tsv"
  ) {
    return "csv";
  }

  if (
    mimeType === "application/json" ||
    mimeType === "application/x-ndjson" ||
    extension === "json" ||
    extension === "jsonl" ||
    extension === "ndjson"
  ) {
    return "json";
  }

  if (mimeType.startsWith("text/")) {
    return "text";
  }

  if (extension === "txt" || extension === "text") {
    return "text";
  }

  if (SUPPORTED_SOURCE_MATERIAL_CODE_EXTENSIONS.has(extension)) {
    return "code";
  }

  return undefined;
}
