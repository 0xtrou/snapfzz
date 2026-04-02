---
title: "Backend Module Architecture — 6-Layer Separation"
type: feat
status: active
date: 2026-04-02
---

# Backend Module Architecture

Clean separation. Each layer has one job. No circular dependencies.

## The 6 Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│ L1: TAURI SHELL — App lifecycle, windows, IPC, config              │
├─────────────────────────────────────────────────────────────────────┤
│ L2: BOX MANAGER — BoxLite micro-VM CRUD, health, ports, resources  │
├─────────────────────────────────────────────────────────────────────┤
│ L3: AGENT ORCHESTRATOR — Agent registry, pipeline, routing, session│
├─────────────────────────────────────────────────────────────────────┤
│ L4: STREAM PIPELINE — SSE consume, batch, multiplex, Channel emit  │
├─────────────────────────────────────────────────────────────────────┤
│ L5: PREVIEW MANAGER — Dev server lifecycle, port forward, HMR, console│
├─────────────────────────────────────────────────────────────────────┤
│ L6: EVAL ENGINE — Benchmark runner, score store, regression detect  │
└─────────────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

| Layer | Module | Knows About | Does NOT Know About |
|---|---|---|---|
| **L1** Tauri Shell | `app`, `ipc`, `window`, `config` | Window management, IPC, user preferences | Agents, boxes, pipelines |
| **L2** Box Manager | `box_manager` | BoxLite API, VM lifecycle, ports, resources, images | What runs inside the boxes |
| **L3** Orchestrator | `orchestrator` | Agent specs, pipeline stages, session state, routing | How boxes are created (delegates to L2) |
| **L4** Stream Pipeline | `stream` | SSE parsing, batching, Tauri Channels | Which agent produced the data |
| **L5** Preview Manager | `preview` | Dev server lifecycle, port forwarding, HMR, console capture | Agent logic, user's app code |
| **L6** Eval Engine | `eval` | Benchmarks, scores, regression detection | How agents run (just calls their endpoints) |

## Box Inventory

Each agent runs in its own BoxLite micro-VM (< 50ms boot). One box per agent for crash isolation.

| Box | Image | Ports | Lifetime |
|---|---|---|---|
| ClarifyAgent | `python:slim` + agentscope-runtime | :8091 | App lifetime |
| DiscoverAgent | `python:slim` + agentscope-runtime | :8092 | App lifetime |
| RateAgent | `python:slim` + agentscope-runtime | :8093 | App lifetime |
| BuildAgent | `python:slim` + agentscope-runtime | :8094 | App lifetime |
| ShipAgent | `python:slim` + agentscope-runtime | :8095 | App lifetime |
| Preview | `node:alpine` (user's app) | :3000 → host | Per-project |
| Browser | `agentscope/runtime-sandbox-browser` | :6080 VNC | On-demand |

## Dependency Graph

```
L1 Tauri Shell
  ├── calls L2 Box Manager (create/start/stop boxes)
  ├── calls L3 Orchestrator (route user messages to agents)
  ├── calls L5 Preview Manager (manage preview box)
  └── reads L4 Stream Pipeline (deliver data to frontend)

L3 Orchestrator
  ├── calls L2 Box Manager (ensure agent box is running)
  ├── calls L4 Stream Pipeline (connect SSE from agent box)
  └── calls L6 Eval Engine (trigger benchmarks)

L5 Preview Manager
  └── calls L2 Box Manager (create/manage preview box)

L6 Eval Engine
  └── calls L2 Box Manager (run eval in isolated box)
```

## Crate Structure

```
src-tauri/
├── Cargo.toml                    # Workspace root
├── crates/
│   ├── snapfzz-app/              # L1: Tauri Shell
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   ├── commands/
│   │   │   ├── ipc.rs
│   │   │   ├── window.rs
│   │   │   └── config.rs
│   │   └── Cargo.toml
│   │
│   ├── snapfzz-box/              # L2: Box Manager
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── registry.rs
│   │   │   ├── lifecycle.rs
│   │   │   ├── health.rs
│   │   │   ├── port_map.rs
│   │   │   ├── resources.rs
│   │   │   └── image_cache.rs
│   │   └── Cargo.toml            # depends on: boxlite
│   │
│   ├── snapfzz-orchestrator/     # L3: Agent Orchestrator
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── agent_registry.rs
│   │   │   ├── pipeline.rs
│   │   │   ├── router.rs
│   │   │   └── session.rs
│   │   └── Cargo.toml            # depends on: snapfzz-box
│   │
│   ├── snapfzz-stream/           # L4: Stream Pipeline
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── sse_consumer.rs
│   │   │   ├── batcher.rs
│   │   │   ├── channel_emitter.rs
│   │   │   └── multiplexer.rs
│   │   └── Cargo.toml            # depends on: reqwest-eventsource, tauri
│   │
│   ├── snapfzz-preview/          # L5: Preview Manager
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── box_control.rs
│   │   │   ├── port_forward.rs
│   │   │   ├── console_capture.rs
│   │   │   └── hmr_relay.rs
│   │   └── Cargo.toml            # depends on: snapfzz-box
│   │
│   └── snapfzz-eval/             # L6: Eval Engine
│       ├── src/
│       │   ├── lib.rs
│       │   ├── benchmark_runner.rs
│       │   ├── score_store.rs
│       │   └── regression_detector.rs
│       └── Cargo.toml            # depends on: snapfzz-box
│
└── tauri.conf.json
```

## Design Rules

1. **L2 is the only layer that talks to BoxLite.** No other layer creates or manages VMs.
2. **L3 is the only layer that knows about agents.** L2 doesn't know what's inside boxes.
3. **L4 is stateless.** Parses and routes. No business logic.
4. **L5 treats the preview box as a black box.** Manages lifecycle and ports. Doesn't know the user's framework.
5. **L6 is independent.** Can run in CI, in the app, or standalone.
6. **No circular dependencies.** Each layer calls only layers below it.
