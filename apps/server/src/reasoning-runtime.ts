import type { GenerateContentResponse } from "@google/genai";
import type { GroundingSource, SourceMaterial } from "@prof/contracts";

import { getReasoningClient, getReasoningModelName } from "./providers/reasoning/index.js";
import {
  buildSearchConfig,
  extractResponseSearchSources,
  searchWeb,
} from "./providers/search/index.js";
import { importUrls } from "./providers/search/url-import.js";
import {
  buildSourceMaterialsPromptContext,
  getAttachedMaterialUrls,
  getSourceMaterialGroundingSources,
} from "./source-materials.js";

export async function generateReasoningContent(options: {
  prompt: string;
  searchQuery?: string;
  useWebSearch?: boolean;
  groundingTexts?: Array<string | null | undefined>;
  sourceMaterials?: SourceMaterial[];
  config: Record<string, unknown>;
  emptyResponseError: string;
}) {
  const groundedPrompt = await buildGroundedPrompt(options.prompt, {
    searchQuery: options.searchQuery,
    useWebSearch: options.useWebSearch,
    groundingTexts: options.groundingTexts,
    sourceMaterials: options.sourceMaterials,
  });
  const config = buildSearchConfig(options.config, {
    useWebSearch: options.useWebSearch,
  });

  const client = getReasoningClient();
  const response = await client.models.generateContent({
    model: getReasoningModelName(),
    contents: groundedPrompt.prompt,
    config,
  });

  if (!response.text) {
    throw new Error(options.emptyResponseError);
  }

  return {
    text: response.text,
    model: getReasoningModelName(),
    sources: mergeGroundingSources(groundedPrompt.sources, extractResponseSearchSources(response)),
  };
}

export async function generateReasoningContentStream(options: {
  prompt: string;
  searchQuery?: string;
  useWebSearch?: boolean;
  groundingTexts?: Array<string | null | undefined>;
  sourceMaterials?: SourceMaterial[];
  config: Record<string, unknown>;
}) {
  const groundedPrompt = await buildGroundedPrompt(options.prompt, {
    searchQuery: options.searchQuery,
    useWebSearch: options.useWebSearch,
    groundingTexts: options.groundingTexts,
    sourceMaterials: options.sourceMaterials,
  });
  const config = buildSearchConfig(options.config, {
    useWebSearch: options.useWebSearch,
  });

  const client = getReasoningClient();
  const responseSources = [...groundedPrompt.sources];
  const rawStream = await client.models.generateContentStream({
    model: getReasoningModelName(),
    contents: groundedPrompt.prompt,
    config,
  });

  return {
    stream: trackSearchGrounding(rawStream, responseSources),
    model: getReasoningModelName(),
    sources: responseSources,
  };
}

async function buildGroundedPrompt(
  basePrompt: string,
  options: {
    searchQuery?: string;
    useWebSearch?: boolean;
    groundingTexts?: Array<string | null | undefined>;
    sourceMaterials?: SourceMaterial[];
  },
) {
  const sourceMaterials = options.sourceMaterials ?? [];
  const knownUrls = getAttachedMaterialUrls(sourceMaterials);
  const [importedUrlGrounding, webGrounding] = await Promise.all([
    importUrls(options.groundingTexts ?? [], {
      ignoreUrls: knownUrls,
    }),
    options.useWebSearch
      ? searchWeb(options.searchQuery ?? "")
      : Promise.resolve({
          results: [],
          sources: [] as GroundingSource[],
          promptContext: "",
        }),
  ]);

  const promptSections = [basePrompt];
  const sourceMaterialsPromptContext = buildSourceMaterialsPromptContext(sourceMaterials);

  if (sourceMaterialsPromptContext) {
    promptSections.push(sourceMaterialsPromptContext);
  }

  if (importedUrlGrounding.promptContext) {
    promptSections.push(importedUrlGrounding.promptContext);
  }

  if (webGrounding.promptContext) {
    promptSections.push(webGrounding.promptContext);
  }

  return {
    prompt: promptSections.join("\n\n"),
    sources: mergeGroundingSources(
      getSourceMaterialGroundingSources(sourceMaterials),
      importedUrlGrounding.sources,
      webGrounding.sources,
    ),
  };
}

function mergeGroundingSources(...sourceLists: GroundingSource[][]) {
  const merged: GroundingSource[] = [];
  const seen = new Set<string>();

  for (const sourceList of sourceLists) {
    for (const source of sourceList) {
      const key = `${source.uri}::${source.title}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(source);
    }
  }

  return merged;
}

async function* trackSearchGrounding(
  stream: AsyncGenerator<GenerateContentResponse>,
  sources: GroundingSource[],
) {
  for await (const chunk of stream) {
    const nextSources = extractResponseSearchSources(chunk);
    if (nextSources.length > 0) {
      const merged = mergeGroundingSources(sources, nextSources);
      sources.splice(0, sources.length, ...merged);
    }

    yield chunk;
  }
}
