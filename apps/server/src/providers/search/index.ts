import type { GroundingSource } from "@prof/contracts";

import { env } from "../../env.js";
import {
  formatFirecrawlSearchContext,
  isFirecrawlSearchConfigured,
  searchWithFirecrawl,
  type NormalizedSearchResult,
} from "./firecrawl.js";

export type SearchGroundingPayload = {
  results: NormalizedSearchResult[];
  sources: GroundingSource[];
  promptContext: string;
};

export function isSearchEnabled() {
  switch (env.SEARCH_PROVIDER) {
    case "firecrawl":
      return isFirecrawlSearchConfigured();
    default:
      return false;
  }
}

export async function searchWeb(query: string, options: { limit?: number } = {}): Promise<SearchGroundingPayload> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return {
      results: [],
      sources: [],
      promptContext: "",
    };
  }

  switch (env.SEARCH_PROVIDER) {
    case "firecrawl": {
      const { results, sources } = await searchWithFirecrawl(normalizedQuery, options);
      return {
        results,
        sources,
        promptContext: formatFirecrawlSearchContext(results),
      };
    }
    case "none":
      throw new Error("Web search is not configured on the server.");
    default:
      throw new Error(`Unsupported search provider: ${env.SEARCH_PROVIDER}`);
  }
}
