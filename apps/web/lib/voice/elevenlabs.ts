export type VoiceSessionHandle = {
  close: () => void;
  sendUserMessage: (text: string) => void;
  sendAudioChunk: (base64Pcm16: string) => void;
  sendContextUpdate: (text: string) => void;
  sendToolResponses: (payload: {
    functionResponses: Array<{
      id?: string;
      name?: string;
      response: Record<string, unknown>;
    }>;
  }) => void;
  sendUserActivity: () => void;
};

type VoiceToolFunctionCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

export type VoiceToolCallPayload = {
  functionCalls?: VoiceToolFunctionCall[];
};

type VoiceServerMessage = {
  toolCall?: VoiceToolCallPayload;
  serverContent?: {
    interrupted?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: {
      parts?: Array<{ inlineData?: { data?: string } }>;
    };
    turnComplete?: boolean;
  };
};

type VoiceSessionMetadata = {
  conversationId?: string;
  agentOutputAudioFormat?: string;
  userInputAudioFormat?: string;
};

type ElevenLabsSocketMessage = {
  type?: string;
  ping_event?: { event_id?: number; ping_ms?: number };
  conversation_initiation_metadata_event?: {
    conversation_id?: string;
    agent_output_audio_format?: string;
    user_input_audio_format?: string;
  };
  user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string };
  agent_response_correction_event?: { corrected_agent_response?: string };
  audio_event?: { audio_base_64?: string };
  client_tool_call?: {
    tool_name?: string;
    tool_call_id?: string;
    parameters?: Record<string, unknown>;
  };
};

type VoiceSessionCallbacks = {
  onOpen: () => void;
  onSetupComplete: (metadata?: VoiceSessionMetadata) => void;
  onMessage: (message: VoiceServerMessage) => void;
  onError: (error: Error) => void;
  onClose: (details?: { code?: number; reason?: string; wasClean?: boolean }) => void;
};

const DEFAULT_PING_DELAY_MS = 25;

export function createElevenLabsVoiceSession(options: {
  connectionUrl: string;
  callbacks: VoiceSessionCallbacks;
}): VoiceSessionHandle {
  const ws = new WebSocket(options.connectionUrl);
  let setupComplete = false;

  const sendMessage = (payload: Record<string, unknown>) => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(JSON.stringify(payload));
  };

  ws.addEventListener("open", () => {
    const payload: Record<string, unknown> = {
      type: "conversation_initiation_client_data",
    };

    sendMessage(payload);
    options.callbacks.onOpen();
  });

  ws.addEventListener("message", (event) => {
    const parseMessage = async () => {
      const rawPayload =
        typeof event.data === "string"
          ? event.data
          : event.data instanceof Blob
            ? await event.data.text()
            : "";

      if (!rawPayload) {
        return;
      }

      const message = JSON.parse(rawPayload) as ElevenLabsSocketMessage;

      switch (message.type) {
        case "ping": {
          const pingEvent = message.ping_event;
          if (pingEvent?.event_id === undefined) {
            return;
          }

          window.setTimeout(() => {
            sendMessage({
              type: "pong",
              event_id: pingEvent.event_id,
            });
          }, pingEvent.ping_ms ?? DEFAULT_PING_DELAY_MS);
          return;
        }
        case "conversation_initiation_metadata": {
          setupComplete = true;
          options.callbacks.onSetupComplete({
            conversationId: message.conversation_initiation_metadata_event?.conversation_id,
            agentOutputAudioFormat: message.conversation_initiation_metadata_event?.agent_output_audio_format,
            userInputAudioFormat: message.conversation_initiation_metadata_event?.user_input_audio_format,
          });
          return;
        }
        case "user_transcript": {
          options.callbacks.onMessage({
            serverContent: {
              inputTranscription: {
                text: message.user_transcription_event?.user_transcript,
              },
              turnComplete: true,
            },
          });
          return;
        }
        case "agent_response":
        case "agent_response_correction": {
          const text =
            message.type === "agent_response"
              ? message.agent_response_event?.agent_response
              : message.agent_response_correction_event?.corrected_agent_response;

          options.callbacks.onMessage({
            serverContent: {
              outputTranscription: {
                text,
              },
              turnComplete: true,
            },
          });
          return;
        }
        case "audio": {
          options.callbacks.onMessage({
            serverContent: {
              modelTurn: {
                parts: [
                  {
                    inlineData: {
                      data: message.audio_event?.audio_base_64,
                    },
                  },
                ],
              },
            },
          });
          return;
        }
        case "interruption": {
          options.callbacks.onMessage({
            serverContent: {
              interrupted: true,
              turnComplete: true,
            },
          });
          return;
        }
        case "client_tool_call": {
          options.callbacks.onMessage({
            toolCall: {
              functionCalls: [
                {
                  id: message.client_tool_call?.tool_call_id,
                  name: message.client_tool_call?.tool_name,
                  args: message.client_tool_call?.parameters,
                },
              ],
            },
          });
          return;
        }
        default:
          return;
      }
    };

    parseMessage().catch((error) => {
      options.callbacks.onError(error instanceof Error ? error : new Error("Failed to parse voice session message."));
    });
  });

  ws.addEventListener("error", () => {
    options.callbacks.onError(new Error("Voice session WebSocket error."));
  });

  ws.addEventListener("close", (event) => {
    options.callbacks.onClose({
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
  });

  return {
    close: () => ws.close(),
    sendUserMessage: (text) => {
      if (!setupComplete || !text.trim()) {
        return;
      }

      sendMessage({
        type: "user_message",
        text,
      });
    },
    sendAudioChunk: (base64Pcm16) => {
      if (!setupComplete || !base64Pcm16) {
        return;
      }

      sendMessage({
        user_audio_chunk: base64Pcm16,
      });
    },
    sendContextUpdate: (text) => {
      if (!setupComplete || !text.trim()) {
        return;
      }

      sendMessage({
        type: "contextual_update",
        text,
      });
    },
    sendToolResponses: (payload) => {
      if (!setupComplete) {
        return;
      }

      for (const response of payload.functionResponses) {
        if (!response.id) {
          continue;
        }

        const result = serializeToolResult(response.response);
        sendMessage({
          type: "client_tool_result",
          tool_call_id: response.id,
          result,
          is_error: Object.hasOwn(response.response, "error"),
        });
      }
    },
    sendUserActivity: () => {
      if (!setupComplete) {
        return;
      }

      sendMessage({
        type: "user_activity",
      });
    },
  };
}

function serializeToolResult(value: Record<string, unknown>) {
  if (typeof value.output === "string") {
    return value.output;
  }

  if (typeof value.error === "string") {
    return value.error;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Tool result received.";
  }
}
