import { GoogleGenAI } from "@google/genai";

import { env } from "../../env.js";

let reasoningClient: GoogleGenAI | null = null;

export function isGoogleReasoningConfigured() {
  if (env.GOOGLE_GENAI_USE_VERTEXAI) {
    return Boolean(env.GOOGLE_CLOUD_PROJECT);
  }

  return Boolean(env.GEMINI_API_KEY);
}

export function getGoogleReasoningClient() {
  if (reasoningClient) {
    return reasoningClient;
  }

  if (env.GOOGLE_GENAI_USE_VERTEXAI) {
    if (!env.GOOGLE_CLOUD_PROJECT) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=true.");
    }

    reasoningClient = new GoogleGenAI({
      vertexai: true,
      project: env.GOOGLE_CLOUD_PROJECT,
      location: env.GOOGLE_CLOUD_LOCATION,
      apiVersion: "v1",
    });
    return reasoningClient;
  }

  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for the Google reasoning provider.");
  }

  reasoningClient = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
  });

  return reasoningClient;
}
