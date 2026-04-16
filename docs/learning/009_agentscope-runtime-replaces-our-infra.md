---
title: "AgentScope Runtime Replaces Our Infrastructure"
type: learning
date: 2026-04-05
updated: 2026-04-16
tags: [agentscope, runtime, architecture, infrastructure]
---

> **Updated 2026-04-16 (A020 Phase 1):** We did not adopt AgentScope Runtime (agentscope-runtime) as described here. Instead, the intelligence layer was delivered via QwenPaw extraction into `plugins/orchestrator/intelligence/` — a custom Python package with its own CLI entry point (`orchestrator app`), not an AgentApp server. `snapfzz-agent-supervisor` was removed; process management now goes through the generic `PluginProcessFactory` in `src-tauri/src/factories/plugin_runtime.rs`. The core insight (don't rebuild what frameworks provide) still applies.

# AgentScope Runtime Replaces Our Infrastructure

## Context

We were building custom infrastructure: Rust process supervisor with health checks + backoff + memory monitoring (~130 LOC), custom FastAPI server (server.py), custom UserInput bridge, custom session management, and planned a BoxLite sandbox crate.

Then we found AgentScope Runtime (agentscope-runtime) — a separate product from the agentscope library, built by the same Alibaba team.

## What AgentScope Runtime Provides

| What We Were Building | Runtime Already Has |
|---|---|
| Rust process supervisor | Deployer — health checks, monitoring, lifecycle, graceful shutdown |
| FastAPI server (server.py) | AgentApp — inherits from FastAPI, SSE streaming, session management |
| BoxLite sandbox | Sandbox Service — browser, filesystem, GUI, cloud, mobile sandboxes |
| Custom UserInput bridge | Built-in query routing from HTTP to agent |
| Session management | Session Service — Redis, JSON, Tablestore backends |
| Memory management | Memory Service — InMemory, Redis, SQLAlchemy |
| Health endpoint | Built-in |
| OpenAI SDK compatibility | Built-in — clients can call via openai.OpenAI(base_url=...) |
| A2A protocol | Built-in |
| Tracing | OpenTelemetry integration |

## What Changed

### Deleted
- `intelligence/server.py` — AgentApp replaces it
- `intelligence/input/snapfzz_input.py` — AgentApp handles input routing
- `intelligence/agents/orchestrator.py` — replaced by AgentApp query handler
- Complex Rust supervisor (health loop, backoff, memory monitoring) — Deployer handles this

### Simplified
- `snapfzz-agent-supervisor` — from ~130 LOC to ~50 LOC (just spawn + PID file + RunEvent cleanup)
- `intelligence/app.py` — ~50 lines configuring AgentApp

### Kept
- Rust SSE consumer + 16ms batcher — still needed to parse Runtime's SSE format
- Plugin system — our frontend architecture
- Chat plugin — our UI layer
- Templates — our config layer

## The SSE Format

AgentScope Runtime outputs structured, sequence-numbered SSE events:
```
data: {"sequence_number":0,"object":"response","status":"created"}
data: {"sequence_number":3,"object":"content","status":"in_progress","text":"Hello"}
data: {"sequence_number":6,"object":"response","status":"completed"}
```

## Rule

Before building infrastructure, check if your framework has a runtime/deployment product. Libraries and runtimes are different products — the library (agentscope) had zero process management, but the runtime (agentscope-runtime) had everything we needed.
