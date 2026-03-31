# prof architecture

This document describes the stable technical shape of `prof`.

## Product surfaces

`prof` has two core surfaces:
- structured learning material such as plans, lessons, quizzes, q&a, flashcards, prompts, and other study tools
- live tutoring that helps a learner navigate and update that material in real time

## Core principles

- The backend owns orchestration, persistence, provider boundaries, and business logic.
- The browser owns rendering, local interaction state, and audio UX.
- The application database is the source of truth for learner state.
- Shared contracts should describe product concepts, not vendor payloads.
- Voice, reasoning, and persistence are separate runtime concerns even when they share context.

## Runtime roles

### Client app
- Renders plans, artifacts, transcripts, and status.
- Collects learner input from text and voice.
- Maintains local UI state and sends product-shaped requests to the backend.

### App backend
- Owns auth, permissions, persistence, and orchestration.
- Creates or resumes live sessions.
- Runs or delegates reasoning requests.
- Stores users, sessions, plans, artifacts, progress, messages, and related metadata.

### Voice runtime
- Handles low-latency live conversation.
- Streams transcript and status events.
- Calls backend tools when structured content needs to be created or updated.
- Must not become the source of truth for learner state.

### Reasoning runtime
- Generates or updates plans and artifacts.
- Handles slower content generation and transformation tasks.
- Returns typed app-level outputs to the backend.

### Persistence layer
- Stores durable application state outside model context windows.
- Supports user accounts, saved learn sessions, artifacts, and progress.

## Learn workspace

- The Learn panel is the visible source of structured study material.
- The Chat panel is the visible source of conversational state, transcripts, and status.
- Artifact creation or updates flow back into the Learn panel.
- Conversational turns and live status stay in the Chat panel.
- Tool failures should surface clearly and remain recoverable.
- Live transport failure should not block text-based planning or artifact generation.

## Stable contracts

### Live session contract
The client should care about:
- whether live tutoring is available
- how to start or resume a live session
- transcript events
- audio playback events
- tool invocation and tool result events
- status and error events

The client should not care about provider-specific transport payloads.

### Reasoning contract
The reasoning boundary should accept:
- learner goal and context
- current plan and current topic
- current artifacts
- request intent such as `new_content`, `update_content`, or `general_query`
- optional preferred artifact type

The reasoning boundary should return:
- typed plan updates
- typed artifact updates
- normalized sources when external grounding is used

## Context flow

- Live tutoring should receive a compact context digest rather than raw application state.
- That digest should summarize the current plan, selected topic, and the latest relevant artifacts.
- When live tutoring triggers structured changes, the backend should handle the reasoning request, persist the result, and update the client state.

## Provider boundary

- Provider choice should stay behind backend-owned adapters.
- The current voice implementation uses ElevenLabs.
- Provider choice may change without changing product-level contracts.

## Non-goals

- client-owned orchestration
- provider payloads stored as product state
- treating model memory as the system of record
