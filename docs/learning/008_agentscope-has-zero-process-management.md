---
title: "AgentScope Has Zero Process Management"
type: learning
date: 2026-04-05
tags: [agentscope, supervisor, process-management, production]
---

# AgentScope Has Zero Process Management

## Context

We assumed AgentScope had built-in process supervision, health checks, memory management, and the `to_dist()` distributed mode from the Alibaba paper. We audited the actual source code at `agentscope-ai/agentscope` commit `035de1`.

## What We Found

The `to_dist()` / gRPC distributed mode does NOT exist in the current codebase. No multiprocessing, no process supervisor, no watchdog, no health endpoints, no log rotation, no memory cleanup.

AgentScope is a library, not a server. It runs inside whatever process you put it in. Everything about keeping that process alive, healthy, and within resource limits is the host's responsibility.

Known production issues confirm this:
- #1094: OpenAI model calls hang indefinitely — no timeout enforcement
- #1360: Task gets stuck on malformed tool output — parser hangs
- #1310: Agent silently stops mid-execution — no error, no log

## What We Build

A ~130 LOC Rust supervisor on top of `tauri-plugin-shell` + `sysinfo`:

- Health loop (HTTP poll every 2s, 3 failures → restart)
- Auto-restart with exponential backoff (500ms → 10s)
- Crash loop detection (N restarts in 5min → stop)
- Memory monitoring (sysinfo RSS check, kill if > limit)
- PID file for orphan cleanup across app restarts
- Status emission to frontend via Tauri events

## Rule

Audit your runtime framework's actual source code before designing your supervision layer. Marketing claims ("1M agents on 4 machines") may reference a different codebase or branch than what you're shipping.
