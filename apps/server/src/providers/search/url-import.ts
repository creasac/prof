import type { GroundingSource } from "@prof/contracts";

import { env } from "../../env.js";

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type ImportedUrlDocument = {
  title: string;
  sourceUrl: string;
  resolvedUrl: string;
  markdown: string;
  capture: string;
};

type CachedDocument = {
  expiresAt: number;
  value: ImportedUrlDocument | null;
};

type UrlImportResponse = {
  markdown?: unknown;
  title?: unknown;
  sourceUrl?: unknown;
  resolvedUrl?: unknown;
  capture?: unknown;
  error?: unknown;
};

export type UrlImportGroundingPayload = {
  documents: ImportedUrlDocument[];
  sources: GroundingSource[];
  promptContext: string;
};

const documentCache = new Map<string, CachedDocument>();

export function isUrlImportEnabled() {
  return Boolean(env.URL2MD_API_BASE_URL);
}

export function findImportableUrls(
  texts: Array<string | null | undefined>,
  options: {
    ignoreUrls?: string[];
  } = {},
) {
  const maxUrls = env.URL_IMPORT_MAX_URLS;
  if (maxUrls <= 0) {
    return [];
  }

  const urls: string[] = [];
  const seen = new Set((options.ignoreUrls ?? []).map((url) => normalizeCandidateUrl(url)).filter(Boolean));

  for (const text of texts) {
    if (!text) {
      continue;
    }

    const matches = text.match(URL_PATTERN) ?? [];
    for (const match of matches) {
      const normalized = normalizeCandidateUrl(match);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      urls.push(normalized);

      if (urls.length >= maxUrls) {
        return urls;
      }
    }
  }

  return urls;
}

export async function importUrls(
  texts: Array<string | null | undefined>,
  options: {
    ignoreUrls?: string[];
  } = {},
): Promise<UrlImportGroundingPayload> {
  if (!isUrlImportEnabled()) {
    return {
      documents: [],
      sources: [],
      promptContext: "",
    };
  }

  const urls = findImportableUrls(texts, options);
  if (urls.length === 0) {
    return {
      documents: [],
      sources: [],
      promptContext: "",
    };
  }

  const documents = (
    await Promise.all(
      urls.map(async (url) => {
        try {
          return await importSingleUrl(url);
        } catch (error) {
          console.warn(`URL import failed for ${url}:`, error instanceof Error ? error.message : String(error));
          return null;
        }
      }),
    )
  ).filter((document): document is ImportedUrlDocument => document !== null);

  return {
    documents,
    sources: documents.map(
      (document): GroundingSource => ({
        title: document.title,
        uri: document.resolvedUrl,
      }),
    ),
    promptContext: formatImportedUrlPromptContext(documents),
  };
}

export async function importUrl(url: string) {
  const normalizedUrl = normalizeCandidateUrl(url);
  if (!normalizedUrl) {
    throw new Error("Enter a valid http/https URL.");
  }

  const document = await importSingleUrl(normalizedUrl);
  if (!document) {
    throw new Error("URL import did not return any content.");
  }

  return document;
}

async function importSingleUrl(url: string) {
  const cached = documentCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const nextValue = await fetchImportedUrl(url);
  documentCache.set(url, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: nextValue,
  });

  return nextValue;
}

async function fetchImportedUrl(url: string) {
  if (!env.URL2MD_API_BASE_URL) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.URL_IMPORT_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.URL2MD_API_BASE_URL.replace(/\/$/, "")}/api/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => ({}))) as UrlImportResponse;
    if (!response.ok) {
      const message =
        typeof body.error === "string" && body.error.trim()
          ? body.error.trim()
          : `URL import failed with status ${response.status}.`;
      throw new Error(message);
    }

    const markdown = typeof body.markdown === "string" ? body.markdown.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : url;
    const resolvedUrl = typeof body.resolvedUrl === "string" ? body.resolvedUrl.trim() : sourceUrl;
    const capture = typeof body.capture === "string" ? body.capture.trim() : "";

    if (!markdown || !title) {
      throw new Error("URL import did not return markdown and title.");
    }

    return {
      title,
      sourceUrl,
      resolvedUrl,
      markdown: clampString(markdown, env.URL_IMPORT_MAX_CHARS_PER_URL),
      capture,
    } satisfies ImportedUrlDocument;
  } finally {
    clearTimeout(timeout);
  }
}

function formatImportedUrlPromptContext(documents: ImportedUrlDocument[]) {
  if (documents.length === 0) {
    return "";
  }

  let remainingChars = env.URL_IMPORT_MAX_TOTAL_CHARS;

  const entries = documents
    .map((document, index) => {
      if (remainingChars <= 0) {
        return "";
      }

      const markdown = clampString(document.markdown, remainingChars);
      remainingChars -= markdown.length;

      const lines = [
        `${index + 1}. ${document.title}`,
        `Source URL: ${document.sourceUrl}`,
      ];

      if (document.resolvedUrl !== document.sourceUrl) {
        lines.push(`Resolved URL: ${document.resolvedUrl}`);
      }

      if (document.capture) {
        lines.push(`Capture: ${document.capture}`);
      }

      lines.push("Imported markdown:");
      lines.push(markdown);
      return lines.join("\n");
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return "";
  }

  return [
    "Imported URL context:",
    "The learner provided one or more URLs. Use the imported page content when it is relevant to the request.",
    ...entries,
  ].join("\n\n");
}

export function normalizeCandidateUrl(rawValue: string) {
  const trimmed = trimTrailingUrlPunctuation(rawValue.trim());
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function clampString(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 16)).trimEnd()}\n\n[truncated]`;
}

function trimTrailingUrlPunctuation(value: string) {
  let nextValue = value;

  while (nextValue.length > 0) {
    const lastChar = nextValue.at(-1);
    if (!lastChar) {
      break;
    }

    if (lastChar === ")" && countCharacter(nextValue, "(") >= countCharacter(nextValue, ")")) {
      break;
    }

    if (![")", ",", ".", ";", ":", "!", "?", "'", "\"", "`"].includes(lastChar)) {
      break;
    }

    nextValue = nextValue.slice(0, -1);
  }

  return nextValue;
}

function countCharacter(value: string, target: string) {
  let count = 0;

  for (const character of value) {
    if (character === target) {
      count += 1;
    }
  }

  return count;
}
