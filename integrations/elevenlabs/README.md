# ElevenLabs Integration

This folder keeps the Prof-specific ElevenLabs agent configuration in the repo so the dashboard is not the only source of truth.

Files:

- `agent.remote.json`: latest snapshot pulled from the live ElevenLabs agent
- `agent.managed.json`: generated target config derived from the live agent plus Prof-specific changes
- `tools.remote.json`: latest snapshot of standalone ElevenLabs tools in the workspace
- `prof-live-agent.prompt.md`: repo-owned prompt for the Prof live tutor

Commands:

```bash
npm run elevenlabs:pull-agent
npm run elevenlabs:build-agent
npm run elevenlabs:push-agent
npm run elevenlabs:smoke-agent
```

Environment:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`

Notes:

- `push-agent` preserves the existing non-agent configuration by starting from the live agent and only replacing the Prof-owned fields.
- `push-agent` uses the supported standalone-tool flow and attaches the `request_reasoning` client tool through `prompt.tool_ids`.
- `smoke-agent` opens a real websocket session with the live agent in text-only mode and checks that a content-creation request produces a `request_reasoning` client tool call.
- On a fresh machine, copy `.env.example` to `.env`, set the same provider keys and `ELEVENLABS_AGENT_ID`, then run `npm run elevenlabs:push-agent` to re-apply the repo-managed prompt and tool wiring to the live agent before testing voice.
