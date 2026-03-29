import type { GroundingSource } from "@prof/contracts";

import { env } from "../../env.js";

export type NormalizedSearchResult = {
  title: string;
  url: string;
  snippet: string;
  domain: string;
};

type FirecrawlSearchItem = {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  snippet?: unknown;
};

type FirecrawlSearchResponse = {
  success?: unknown;
  data?: unknown;
};

const FIRECRAWL_SEARCH_ENDPOINT = "https://api.firecrawl.dev/v2/search";

export function isFirecrawlSearchConfigured() {
  return Boolean(env.FIRECRAWL_API_KEY);
}

export async function searchWithFirecrawl(query: string, options: { limit?: number } = {}) {
  if (!env.FIRECRAWL_API_KEY) {
    throw new Error("FIRECRAWL_API_KEY is required for Firecrawl search.");
  }

  const response = await fetch(FIRECRAWL_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      limit: options.limit ?? env.FIRECRAWL_SEARCH_LIMIT,
      sources: ["web"],
    }),
  });

  const body = (await response.json().catch(() => ({}))) as FirecrawlSearchResponse & {
    error?: unknown;
  };

  if (!response.ok) {
    const errorMessage =
      typeof body.error === "string"
        ? body.error
        : `Firecrawl search failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const results = normalizeFirecrawlResults(body.data).slice(0, options.limit ?? env.FIRECRAWL_SEARCH_LIMIT);

  return {
    results,
    sources: results.map(
      (result): GroundingSource => ({
        title: result.title,
        uri: result.url,
      }),
    ),
  };
}

export function formatFirecrawlSearchContext(results: NormalizedSearchResult[]) {
  if (results.length === 0) {
    return "";
  }

  return [
    "Grounded web context:",
    ...results.map((result, index) => {
      const parts = [`${index + 1}. ${result.title}`, `URL: ${result.url}`];

      if (result.snippet) {
        parts.push(`Summary: ${result.snippet}`);
      }

      return parts.join("\n");
    }),
    "",
    "Use this grounded web context when it is relevant. Prefer these sources over stale background knowledge when answering current or externally grounded questions.",
  ].join("\n");
}

function normalizeFirecrawlResults(input: unknown) {
  const rawItems = flattenFirecrawlItems(input);
  const seen = new Set<string>();

  return rawItems
    .map(normalizeFirecrawlItem)
    .filter((item): item is NormalizedSearchResult => item !== null)
    .filter((item) => {
      if (seen.has(item.url)) {
        return false;
      }

      seen.add(item.url);
      return true;
    });
}

function flattenFirecrawlItems(input: unknown): FirecrawlSearchItem[] {
  if (Array.isArray(input)) {
    return input as FirecrawlSearchItem[];
  }

  if (!input || typeof input !== "object") {
    return [];
  }

  const value = input as Record<string, unknown>;
  const collections = Object.values(value).filter(Array.isArray) as FirecrawlSearchItem[][];
  return collections.flat();
}

function normalizeFirecrawlItem(item: FirecrawlSearchItem): NormalizedSearchResult | null {
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const url = typeof item.url === "string" ? item.url.trim() : "";
  const snippetSource = typeof item.description === "string" ? item.description : item.snippet;
  const snippet = typeof snippetSource === "string" ? snippetSource.trim() : "";

  if (!title || !url) {
    return null;
  }

  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    return null;
  }

  return {
    title,
    url,
    snippet,
    domain,
  };
}
