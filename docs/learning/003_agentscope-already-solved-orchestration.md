---
title: "AgentScope Already Solved Orchestration"
type: learning
date: 2026-04-04
tags: [agentscope, agent-orchestrator, architecture, dont-rebuild]
---

# AgentScope Already Solved Orchestration

## Context

We planned a `snapfzz-agent-orchestrator` Rust crate to handle: agent registry, MsgHub message routing, session management, and multi-agent coordination. Then we actually read AgentScope's source code.

## What We Found

AgentScope (Alibaba, 23K GitHub stars) already provides every capability we planned to build:

| Our Planned Feature | AgentScope Built-in |
|---|---|
| Agent session management | `AgentBase` — unique ID, message queue, reply/observe lifecycle, hooks |
| MsgHub message routing | `MsgHub` — context manager, auto-broadcasts among participants |
| Sequential orchestration | `SequentialPipeline` — chains agents, output A → input B |
| Parallel fan-out | `FanoutPipeline` — `asyncio.gather()` for concurrent execution |
| Distributed scaling | `to_dist()` — transparently moves agent to separate process via gRPC |
| Agent state persistence | `StateModule` base class — save/load agent state |
| Eval framework | Built-in eval module with MetricBase + OpenJudge |
| Tool/MCP support | Built-in tool + MCP modules |
| Memory | Built-in memory module |
| RAG | Built-in RAG module |

Alibaba's research paper (arxiv 2407.17789) demonstrated **1 million agents on 4 machines** using the actor-based distributed mechanism.

## The Key Insight

100 agents on a desktop doesn't need 100 processes. It needs 1 Python process. The bottleneck is LLM API latency (~1-5s per call), not CPU or RAM. Each agent is ~5MB memory. 100 agents = ~500MB. AgentScope's async architecture handles the concurrency internally.

When you DO need to scale beyond one machine, `agent.to_dist()` moves any agent to a remote process via gRPC — no application code change.

## What Changed

- Renamed `snapfzz-agent-orchestrator` → `snapfzz-agent-supervisor`
- The Rust crate does 3 things only: start AgentScope, health check, restart on crash
- All agent logic (orchestration, MsgHub, pipelines, eval, tools, memory) stays in Python/AgentScope
- Updated A005, A006, MILESTONES.md, Cargo workspace

> **Updated 2026-04-16 (A020 Phase 1):** `snapfzz-agent-supervisor` was subsequently removed. Plugin process management is now handled by the generic `PluginProcessFactory` (`src-tauri/src/factories/plugin_runtime.rs`) created from manifest declarations. The intelligence layer (QwenPaw extraction) is a custom Python package, not a bare AgentScope setup. The crate codebase no longer contains an agentscope-specific supervisor crate.

## Rule

Before building an orchestration layer, audit your runtime framework's built-in capabilities. Re-implementing what your framework already provides is the most expensive form of waste — you build it worse, maintain it forever, and it fights the framework at every upgrade.
