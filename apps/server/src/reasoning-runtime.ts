import type { GroundingSource } from "@prof/contracts";

import { getReasoningClient, getReasoningModelName } from "./providers/reasoning/index.js";
import { searchWeb } from "./providers/search/index.js";

export async function generateReasoningContent(options: {
  prompt: string;
  searchQuery?: string;
  useWebSearch?: boolean;
  config: Record<string, unknown>;
  emptyResponseError: string;
}) {
  const groundedPrompt = await buildGroundedPrompt(options.prompt, {
    searchQuery: options.searchQuery,
    useWebSearch: options.useWebSearch,
  });

  const client = getReasoningClient();
  const response = await client.models.generateContent({
    model: getReasoningModelName(),
    contents: groundedPrompt.prompt,
    config: options.config,
  });

  if (!response.text) {
    throw new Error(options.emptyResponseError);
  }

  return {
    text: response.text,
    model: getReasoningModelName(),
    sources: groundedPrompt.sources,
  };
}

export async function generateReasoningContentStream(options: {
  prompt: string;
  searchQuery?: string;
  useWebSearch?: boolean;
  config: Record<string, unknown>;
}) {
  const groundedPrompt = await buildGroundedPrompt(options.prompt, {
    searchQuery: options.searchQuery,
    useWebSearch: options.useWebSearch,
  });

  const client = getReasoningClient();
  const stream = await client.models.generateContentStream({
    model: getReasoningModelName(),
    contents: groundedPrompt.prompt,
    config: options.config,
  });

  return {
    stream,
    model: getReasoningModelName(),
    sources: groundedPrompt.sources,
  };
}

async function buildGroundedPrompt(
  basePrompt: string,
  options: {
    searchQuery?: string;
    useWebSearch?: boolean;
  },
) {
  if (!options.useWebSearch) {
    return {
      prompt: basePrompt,
      sources: [] as GroundingSource[],
    };
  }

  const grounding = await searchWeb(options.searchQuery ?? "");

  if (!grounding.promptContext) {
    return {
      prompt: basePrompt,
      sources: grounding.sources,
    };
  }

  return {
    prompt: [basePrompt, "", grounding.promptContext].join("\n"),
    sources: grounding.sources,
  };
}
