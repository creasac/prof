import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const INTEGRATION_DIR = path.join(ROOT, "integrations", "elevenlabs");
const REMOTE_PATH = path.join(INTEGRATION_DIR, "agent.remote.json");
const MANAGED_PATH = path.join(INTEGRATION_DIR, "agent.managed.json");
const TOOLS_PATH = path.join(INTEGRATION_DIR, "tools.remote.json");
const PROMPT_PATH = path.join(INTEGRATION_DIR, "prof-live-agent.prompt.md");
const DEFAULT_SMOKE_MESSAGE = "Create a short quiz on binary search trees for the current course.";
const TOOL_NAME = "request_reasoning";

const command = process.argv[2];

if (!command) {
  usage(1);
}

const env = await loadEnv();
const agentId = requireEnv(env, "ELEVENLABS_AGENT_ID");
const apiKey = requireEnv(env, "ELEVENLABS_API_KEY");

switch (command) {
  case "pull":
    await pullAgent({ agentId, apiKey });
    break;
  case "build":
    await buildManagedFromRemote();
    break;
  case "push":
    await pushManagedAgent({ agentId, apiKey });
    break;
  case "smoke":
    await smokeTestAgent({ agentId, apiKey, userMessage: process.argv.slice(3).join(" ").trim() || DEFAULT_SMOKE_MESSAGE });
    break;
  default:
    usage(1);
}

async function pullAgent({ agentId, apiKey }) {
  const remote = await fetchAgent({ agentId, apiKey });
  const tools = await fetchTools({ apiKey });
  await writeJson(REMOTE_PATH, remote);
  await writeJson(TOOLS_PATH, tools);
  console.log(`Pulled agent to ${REMOTE_PATH}`);
}

async function buildManagedFromRemote() {
  const remote = await readJson(REMOTE_PATH);
  const tools = existsSync(TOOLS_PATH) ? await readJson(TOOLS_PATH) : { tools: [] };
  const managed = await buildManagedAgent(remote, tools);
  await writeJson(MANAGED_PATH, managed);
  console.log(`Built managed agent config at ${MANAGED_PATH}`);
}

async function pushManagedAgent({ agentId, apiKey }) {
  const remote = await fetchAgent({ agentId, apiKey });
  const tools = await fetchTools({ apiKey });
  const reasoningToolId = await ensureReasoningTool({ apiKey, tools });
  const nextTools = await fetchTools({ apiKey });
  await writeJson(REMOTE_PATH, remote);
  await writeJson(TOOLS_PATH, nextTools);

  const managed = await buildManagedAgent(remote, nextTools, { reasoningToolId });
  await writeJson(MANAGED_PATH, managed);

  const patchBody = {
    name: managed.name,
    conversation_config: {
      conversation: managed.conversation_config.conversation,
      agent: managed.conversation_config.agent,
    },
  };

  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(patchBody),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to push managed agent config: ${response.status} ${JSON.stringify(body)}`);
  }

  await writeJson(REMOTE_PATH, body);
  console.log(`Pushed managed agent config to ElevenLabs and refreshed ${REMOTE_PATH}`);
}

async function smokeTestAgent({ agentId, apiKey, userMessage }) {
  const signedUrl = await fetchSignedUrl({ agentId, apiKey });

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(signedUrl);
    let settled = false;
    let toolSeen = false;
    let initialAgentResponseSeen = false;
    let timeoutId = null;

    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      try {
        ws.close();
      } catch {
        // Ignore close errors during shutdown.
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(undefined);
    };

    const startTimeout = () => {
      timeoutId = setTimeout(() => {
        finish(new Error("Smoke test timed out before receiving request_reasoning client tool call."));
      }, 25000);
    };

    ws.addEventListener("open", () => {
      startTimeout();
      ws.send(
        JSON.stringify({
          type: "conversation_initiation_client_data",
          conversation_config_override: {
            conversation: {
              text_only: true,
            },
          },
        }),
      );
    });

    ws.addEventListener("message", async (event) => {
      const raw =
        typeof event.data === "string"
          ? event.data
          : event.data instanceof Blob
            ? await event.data.text()
            : "";

      if (!raw) {
        return;
      }

      const message = JSON.parse(raw);

      if (message.type === "ping" && message.ping_event?.event_id !== undefined) {
        ws.send(JSON.stringify({ type: "pong", event_id: message.ping_event.event_id }));
        return;
      }

      if (message.type === "conversation_initiation_metadata") {
        return;
      }

      if (!initialAgentResponseSeen && message.type === "agent_response") {
        initialAgentResponseSeen = true;
        setTimeout(() => {
          ws.send(
            JSON.stringify({
              type: "user_message",
              text: userMessage,
            }),
          );
        }, 300);
        return;
      }

      if (message.type === "client_tool_call" && message.client_tool_call?.tool_name === TOOL_NAME) {
        toolSeen = true;
        const toolCallId = message.client_tool_call.tool_call_id;
        console.log(`Received ${TOOL_NAME} tool call with parameters:`);
        console.log(JSON.stringify(message.client_tool_call.parameters ?? {}, null, 2));

        if (toolCallId) {
          ws.send(
            JSON.stringify({
              type: "client_tool_result",
              tool_call_id: toolCallId,
              result: JSON.stringify({ ok: true, smoke_test: true }),
              is_error: false,
            }),
          );
        }

        finish();
        return;
      }

      if (message.type === "user_transcript" || message.type === "agent_response" || message.type === "agent_response_correction") {
        return;
      }
    });

    ws.addEventListener("error", () => {
      finish(new Error("WebSocket error during smoke test."));
    });

    ws.addEventListener("close", (event) => {
      if (settled) {
        return;
      }
      const reason = event.reason ? `: ${event.reason}` : "";
      const base = `Smoke test socket closed (${event.code})${reason}`;
      finish(new Error(toolSeen ? base : `${base} before request_reasoning tool call.`));
    });
  });

  console.log("Smoke test passed.");
}

async function buildManagedAgent(remote, toolsSnapshot = { tools: [] }, options = {}) {
  const prompt = (await readFile(PROMPT_PATH, "utf8")).trim();
  const managed = structuredClone(remote);
  const currentAgent = managed.conversation_config?.agent ?? {};
  const currentPrompt = currentAgent.prompt ?? {};
  const currentConversation = managed.conversation_config?.conversation ?? {};
  const currentClientEvents = Array.isArray(currentConversation.client_events) ? currentConversation.client_events : [];
  const nextClientEvents = Array.from(new Set([...currentClientEvents, "client_tool_call"]));
  const currentToolIds = Array.isArray(currentPrompt.tool_ids) ? currentPrompt.tool_ids.filter((value) => typeof value === "string" && value) : [];
  const reasoningToolId = options.reasoningToolId ?? findToolIdByName(toolsSnapshot, TOOL_NAME);
  const nextToolIds = reasoningToolId ? Array.from(new Set([...currentToolIds, reasoningToolId])) : currentToolIds;
  const nextPrompt = {
    ...currentPrompt,
    prompt,
    tool_ids: nextToolIds,
    enable_parallel_tool_calls: false,
  };

  delete nextPrompt.tools;

  managed.name = "Prof Live Tutor";
  managed.conversation_config.conversation = {
    ...currentConversation,
    client_events: nextClientEvents,
  };
  managed.conversation_config.agent = {
    ...currentAgent,
    first_message: "Hi, I'm Prof. I can explain the current material or update the Learn panel. What do you want to learn or change?",
    dynamic_variables: currentAgent.dynamic_variables ?? {
      dynamic_variable_placeholders: {},
    },
    prompt: nextPrompt,
  };

  return managed;
}

async function fetchAgent({ agentId, apiKey }) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    headers: {
      "xi-api-key": apiKey,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to fetch ElevenLabs agent: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function fetchSignedUrl({ agentId, apiKey }) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    {
      headers: {
        "xi-api-key": apiKey,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.signed_url !== "string" || !body.signed_url) {
    throw new Error(`Failed to fetch signed URL: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.signed_url;
}

async function fetchTools({ apiKey }) {
  const response = await fetch("https://api.elevenlabs.io/v1/convai/tools", {
    headers: {
      "xi-api-key": apiKey,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Failed to fetch ElevenLabs tools: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function ensureReasoningTool({ apiKey, tools }) {
  const existing = findToolByName(tools, TOOL_NAME);
  if (existing?.id) {
    return existing.id;
  }

  const response = await fetch("https://api.elevenlabs.io/v1/convai/tools", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      tool_config: {
        type: "client",
        name: TOOL_NAME,
        description:
          "Create or update Prof Learn workspace content when the learner asks for new material or revisions.",
        expects_response: true,
        response_timeout_secs: 60,
        disable_interruptions: true,
        force_pre_tool_speech: false,
        tool_error_handling_mode: "auto",
        parameters: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "A concise restatement of the learner request for Prof to execute.",
            },
            requestType: {
              type: "string",
              enum: ["new_content", "update_content", "general_query"],
              description: "Whether Prof should create new content, update content, or answer using current materials.",
            },
            updateTarget: {
              type: "string",
              enum: ["lesson", "topic_list", "topic", "quiz", "flashcards", "plan", "all", "unknown"],
              description: "The Learn panel object to update when known.",
            },
            preferredBlockType: {
              type: "string",
              enum: ["lesson", "quiz", "flashcards", "essay_prompt", "follow_up_question"],
              description: "Preferred block type when explicitly requested.",
            },
          },
          required: ["message", "requestType"],
        },
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.id !== "string" || !body.id) {
    throw new Error(`Failed to create ${TOOL_NAME} tool: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.id;
}

function findToolByName(toolsSnapshot, name) {
  const tools = Array.isArray(toolsSnapshot?.tools) ? toolsSnapshot.tools : [];
  return tools.find((tool) => tool?.tool_config?.name === name) ?? null;
}

function findToolIdByName(toolsSnapshot, name) {
  const tool = findToolByName(toolsSnapshot, name);
  return typeof tool?.id === "string" ? tool.id : null;
}

async function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  const env = { ...process.env };

  if (!existsSync(envPath)) {
    return env;
  }

  const text = await readFile(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in env)) {
      env[key] = value;
    }
  }

  return env;
}

function requireEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function usage(exitCode) {
  console.error("Usage: node scripts/elevenlabs-agent.mjs <pull|build|push|smoke> [smoke message]");
  process.exit(exitCode);
}
