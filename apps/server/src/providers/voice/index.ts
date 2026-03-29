import { env } from "../../env.js";
import { createElevenLabsVoiceSession, isElevenLabsVoiceConfigured } from "./elevenlabs.js";

export function isVoiceEnabled() {
  switch (env.VOICE_PROVIDER) {
    case "elevenlabs":
      return isElevenLabsVoiceConfigured();
    default:
      return false;
  }
}

export async function createVoiceSession() {
  switch (env.VOICE_PROVIDER) {
    case "elevenlabs":
      return createElevenLabsVoiceSession();
    case "none":
      throw new Error("Voice is not configured on the server.");
    default:
      throw new Error(`Unsupported voice provider: ${env.VOICE_PROVIDER}`);
  }
}
