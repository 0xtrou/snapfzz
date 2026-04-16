---
title: "Snapfzz Is a Desktop Environment for AgentScope"
type: learning
date: 2026-04-04
updated: 2026-04-16
tags: [architecture, agentscope, domain-model, identity]
---

> **Updated 2026-04-16 (A020 Phase 1):** The `intelligence/` directory no longer exists at repo root — it moved inside the plugin as `plugins/orchestrator/intelligence/`. The `plugins/chat/` plugin was renamed to `plugins/orchestrator/` (ID `snapfzz.orchestrator`). The "four layers" model below still holds conceptually, but the Intelligence layer is now self-contained inside the plugin rather than a separate top-level directory.

# Snapfzz Is a Desktop Environment for AgentScope + Templates

## Context

While defining the chat plugin, we kept gravitating toward building our own agent orchestration — custom LLM gateway, custom session management, custom message routing. Then we read AgentScope's actual source code and found they already have everything: Msg with rich ContentBlocks (text, thinking, tool_use, tool_result, image, audio, video), UserAgent with pluggable UserInputBase, Session persistence, Memory (working + long-term), Pipelines (sequential, fanout, MsgHub), distributed scaling via to_dist(), and a full eval framework.

The question became: what are we actually building?

## The Realization

**Snapfzz = Desktop environment for AgentScope + Templates.**

Two things, nothing more:

1. **Desktop environment** — the native shell that makes AgentScope usable as a desktop app (window management, plugin system, sandbox, 60fps streaming pipeline, theme). This is `frontend/` + `src-tauri/`.

2. **Templates** — preconfigured AgentScope agent/tool/pipeline configurations for different purposes. A "build a SaaS" template is just YAML. The intelligence layer doesn't change — only the configuration does.

## What This Means Architecturally

### Four layers, strict dependency direction

```
Plugins → Rust bridge → AgentScope. Never skip a layer.
```

| Layer | Directory | Owns | Language |
|---|---|---|---|
| Features | `plugins/` | All user-facing UI via plugin SDK | TypeScript/React |
| Rendering | `frontend/` | Shell, plugin host, theme, hooks | TypeScript/React |
| Native | `src-tauri/` | IPC, streaming, supervision, sandbox | Rust |
| Intelligence | `intelligence/` | AgentScope agents, tools, memory, eval, sessions | Python |

### Intelligence layer exposes full AgentScope API

Not a wrapper around one `/chat` endpoint. Full API surface:

- `/chat` — UserAgent input → pipeline → SSE stream
- `/agents` — list/configure active agents
- `/session/{id}` — session state management
- `/memory` — agent memory read/write
- `/tool` — execute tools
- `/eval` — run evaluations
- `/health` — supervisor health check

### Templates are YAML, not code

```yaml
# templates/saas-builder.yaml
name: "SaaS Builder"
agents:
  - type: orchestrator
    model: gpt-4o
    tools: [filesystem, shell, preview, search]
  - type: build
    model: gpt-4o
    tools: [filesystem, shell]
pipeline: sequential
```

Switching purpose = switching config file. Same intelligence layer, different behavior.

### Chat is one channel among many

`plugins/orchestrator/` (formerly `plugins/chat/`, renamed A020 Phase 1) renders the text conversation channel. Future channels plug in the same way:

- `plugins/voice/` — voice channel (AgentScope has RealtimeAgent)
- `plugins/video/` — video channel
- `plugins/a2a/` — Agent-to-Agent protocol channel

Same AgentScope backend. Different frontend rendering.

### SnapfzzUserInput bridges our UI to AgentScope's native interface

AgentScope has `UserAgent` with a pluggable `UserInputBase`. Their `StudioUserInput` connects their web UI via WebSocket. We build `SnapfzzUserInput` that connects our Tauri frontend via HTTP. The agent doesn't know or care where the input comes from.

## The Moat (P3)

The moat is context accumulation:
- Every project generates eval data, memory, and refined templates
- Templates get smarter with usage
- Memory accumulates across projects
- Leaving Snapfzz = losing your accumulated intelligence

The desktop environment is the vehicle. AgentScope is the engine. Templates are the fuel. The accumulated intelligence is the moat.

## Rule

Before building domain logic, identify whether your runtime framework already provides it. Then ask: "What is my product actually?" If the answer is "a native shell for an existing framework + configuration," build the shell well and configure the framework correctly. Don't rebuild the framework inside your shell.
