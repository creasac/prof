import type { GenerateContentResponse } from "@google/genai";
import type { GroundingSource } from "@prof/contracts";

import { env } from "../../env.js";
import { isGoogleReasoningConfigured } from "../reasoning/google.js";

export type SearchGroundingPayload = {
  sources: GroundingSource[];
  promptContext: string;
};

export function isSearchEnabled() {
  switch (env.SEARCH_PROVIDER) {
    case "google-genai":
      return isGoogleReasoningConfigured();
    default:
      return false;
  }
}

export async function searchWeb(query: string): Promise<SearchGroundingPayload> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return {
      sources: [],
      promptContext: "",
    };
  }

  switch (env.SEARCH_PROVIDER) {
    case "google-genai":
      return {
        sources: [],
        promptContext: "",
      };
    case "none":
      throw new Error("Web search is not configured on the server.");
    default:
      throw new Error(`Unsupported search provider: ${env.SEARCH_PROVIDER}`);
  }
}

export function buildSearchConfig(
  config: Record<string, unknown>,
  options: {
    useWebSearch?: boolean;
  } = {},
) {
  if (!options.useWebSearch) {
    return config;
  }

  switch (env.SEARCH_PROVIDER) {
    case "google-genai":
      if (!isGoogleReasoningConfigured()) {
        throw new Error("Google Search grounding requires the Google reasoning provider to be configured.");
      }

      return {
        ...config,
        tools: [...readConfigTools(config.tools), { googleSearch: {} }],
      };
    case "none":
      throw new Error("Web search is not configured on the server.");
    default:
      throw new Error(`Unsupported search provider: ${env.SEARCH_PROVIDER}`);
  }
}

export function extractResponseSearchSources(response: GenerateContentResponse): GroundingSource[] {
  switch (env.SEARCH_PROVIDER) {
    case "google-genai":
      return extractGoogleGroundingSources(response);
    case "none":
      return [];
    default:
      throw new Error(`Unsupported search provider: ${env.SEARCH_PROVIDER}`);
  }
}

function readConfigTools(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function extractGoogleGroundingSources(response: GenerateContentResponse) {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: GroundingSource[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const webUri = chunk.web?.uri?.trim();
    const webTitle = chunk.web?.title?.trim();
    if (webUri && webTitle) {
      const key = `${webUri}::${webTitle}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({
          title: webTitle,
          uri: webUri,
        });
      }
    }

    const mapsUri = chunk.maps?.uri?.trim();
    const mapsTitle = chunk.maps?.title?.trim();
    if (mapsUri && mapsTitle) {
      const key = `${mapsUri}::${mapsTitle}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({
          title: mapsTitle,
          uri: mapsUri,
        });
      }
    }
  }

  return sources;
}
