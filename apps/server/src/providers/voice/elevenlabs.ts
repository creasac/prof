import { env } from "../../env.js";

const ELEVENLABS_CONVERSATION_ENDPOINT = "wss://api.elevenlabs.io/v1/convai/conversation";

export function isElevenLabsVoiceConfigured() {
  return Boolean(env.ELEVENLABS_AGENT_ID);
}

export async function createElevenLabsVoiceSession() {
  if (!env.ELEVENLABS_AGENT_ID) {
    throw new Error("ELEVENLABS_AGENT_ID is required for ElevenLabs voice sessions.");
  }

  if (!env.ELEVENLABS_API_KEY) {
    return {
      connectionUrl: buildPublicVoiceConnectionUrl(env.ELEVENLABS_AGENT_ID),
    };
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID)}`,
    {
      method: "GET",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
      },
    },
  );

  const body = (await response.json().catch(() => ({}))) as {
    signed_url?: unknown;
    detail?: unknown;
  };

  if (!response.ok) {
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : `ElevenLabs session creation failed with status ${response.status}.`;
    throw new Error(detail);
  }

  if (typeof body.signed_url !== "string" || !body.signed_url) {
    throw new Error("ElevenLabs did not return a signed_url.");
  }

  return {
    connectionUrl: body.signed_url,
  };
}

function buildPublicVoiceConnectionUrl(agentId: string) {
  return `${ELEVENLABS_CONVERSATION_ENDPOINT}?agent_id=${encodeURIComponent(agentId)}`;
}
