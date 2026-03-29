import { env } from "../../env.js";
import { getGoogleReasoningClient, isGoogleReasoningConfigured } from "./google.js";

export function isReasoningEnabled() {
  switch (env.REASONING_PROVIDER) {
    case "google-genai":
      return isGoogleReasoningConfigured();
    default:
      return false;
  }
}

export function getReasoningClient() {
  switch (env.REASONING_PROVIDER) {
    case "google-genai":
      return getGoogleReasoningClient();
    default:
      throw new Error(`Unsupported reasoning provider: ${env.REASONING_PROVIDER}`);
  }
}

export function getReasoningModelName() {
  return env.REASONING_MODEL;
}
