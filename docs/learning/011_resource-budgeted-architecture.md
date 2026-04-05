---
title: "Resource-Budgeted Architecture"
type: philosophy
date: 2026-04-05
tags: [philosophy, architecture, budgeting, core]
---

# Resource-Budgeted Architecture

Snapfzz is a resource-budgeted desktop environment.

Every resource the app touches has an owner, a limit, and enforcement. The user's machine is borrowed, not owned. We budget what we take.

## Why

A desktop app runs on someone else's machine. Their CPU, their RAM, their disk, their battery, their attention. Every cycle we waste is a cycle they can't use. Every MB we leak is a MB they lose. Every frame we drop is a stutter they feel.

Most apps treat the user's machine as infinite. We treat it as finite. The difference is architectural — budgets are structural constraints, not performance optimizations applied after the fact.

P1 says right from the beginning. Budgets are the mechanism. The architecture exists to enforce them.

## Nine Budgets

### 1. Frame Budget

What it protects: the user's visual fluency.

The user perceives motion at 60 frames per second. Each frame has 16ms. If we exceed 16ms, they see jank. Jank erodes trust.

The frame budget governs: what runs on the main thread (rendering only), how layout is computed (arithmetic, not DOM measurement), how animations behave (GPU compositing, not layout recalculation), how reflow is scoped (CSS containment boundaries).

### 2. CPU Budget

What it protects: the user's processing power.

The CPU is shared between our app, their other apps, and the OS. We divide our work across three zones so that no single zone monopolizes the CPU at the wrong time.

Zone 1 (Rust): heavy computation — SSE parsing, token batching, process supervision, file watching. Runs natively, never touches the UI thread.

Zone 2 (Worker): state mutations — plugin lifecycle, syntax highlighting, diff computation. Runs in Web Workers, off the main thread.

Zone 3 (Main thread): rendering only. React components compose already-computed state into pixels. No parsing, no sorting, no diffing. If it computes, it doesn't belong here.

### 3. Memory Budget

What it protects: the user's RAM.

Every process we spawn, every session we accumulate, every plugin we load consumes memory. Without limits, a long-running app slowly devours available RAM until the OS starts swapping.

The memory budget governs: process RSS limits for the intelligence layer, plugin crash-and-disable for memory-leaking plugins, session and cache pruning on schedule, no orphan processes surviving app exit.

### 4. Startup Budget

What it protects: the user's attention.

The moment between "I clicked the icon" and "I can type" is the most fragile moment in the user relationship. Every millisecond of blank screen says "I'm not ready for you."

The startup budget governs: visible shell within 200ms (HTML skeleton, not React), interactive input within 500ms (critical plugins only), background preload during idle time (requestIdleCallback), measured on every boot (LCP, TTI, long tasks).

### 5. Network Budget

What it protects: the user's bandwidth and the render pipeline.

The intelligence layer streams tokens over SSE. Without batching, each token would trigger a separate render — flooding the main thread with work that could be coalesced.

The network budget governs: 16ms frame-aligned batching in Rust before emitting to the frontend, offline-first architecture (no external font loads, no CDN dependencies), SSE parsing in Rust (Zone 1) so the main thread never touches raw network data.

### 6. Reliability Budget

What it protects: the user's trust.

A single plugin crash should not kill the app. A single API timeout should not freeze the UI. A single bad response should not corrupt the session.

The reliability budget governs: plugin crash isolation (ErrorBoundary catches, host.reportCrash tracks), 3-strike auto-disable for repeatedly crashing plugins, retry button for user-initiated recovery, anti-corruption layers at runtime boundaries (our types, not theirs).

### 7. Window Budget

What it protects: the user's multitasking.

When the user has preferences open while chatting, one window's render cost must not degrade the other. Each window is a separate context with its own frame budget.

The window budget governs: separate Tauri WebviewWindows per layout (launcher, project, preferences), independent React trees with independent requestAnimationFrame loops, independent PluginHost instances with independent ContributionStores, no shared mutable state between windows (communication via Tauri events only).

### 8. Storage Budget

What it protects: the user's disk.

Agent conversations accumulate. Sessions grow. Logs expand. Without governance, the app silently fills the user's disk over weeks of use.

The storage budget governs: append-only log format (predictable growth rate), human-readable files (JSON, Markdown — the user can inspect and delete), session pruning on schedule, API keys in global config only (never leaked into project folders), workspace structure (.snapfzz/) with clear ownership per file.

### 9. Engineering Budget

What it protects: our maintenance cost.

Every line of code we write is a line we maintain for 10 years (P4). Every dependency we add is a dependency we update, audit, and potentially replace. The cheapest code is code we don't write.

The engineering budget governs: delegate to AgentScope Runtime what it already provides (orchestration, sandbox, session, memory, eval), thin boundaries (~50 LOC supervisor, not ~400 LOC reimplementation), templates as YAML config (switching purpose doesn't cost engineering time), anti-corruption layers at runtime boundaries (their API changes don't cascade into our codebase), plugin SDK as a stable contract (additive extensions only).

## The Chain

The nine budgets are not independent. They form a dependency chain:

```
P1 (right from the beginning)
  → budgets are structural, not optimizations
    → frame budget → zone model → render sovereignty
    → memory budget → process limits → crash isolation
    → startup budget → skeleton → lazy activation
    → engineering budget → delegate → thin boundaries
```

P2 (build from conviction) tells us which budgets matter most — we use the app daily, so we feel every dropped frame, every slow startup, every leaked process.

P3 (sell infrastructure) tells us the engineering budget is a moat — the less custom code we maintain, the more we can invest in the context accumulation that locks users in.

P4 (10 years) tells us the budgets must be structural, not behavioral — a behavioral budget (a code review rule saying "don't compute on main thread") erodes over time. A structural budget (Zone 2 Worker, Zone 3 render-only) is enforced by the architecture itself.

## Three Axes of Resource Distribution

Budget, Zones, and Users are orthogonal views of the same resources:

**Budget** = HOW MUCH of each resource. The limits. Governed by presets (Performance/Balanced/Battery) and enforced by the registry.

**Zone** = WHERE the work runs. The placement. A zone is a physical execution context — Rust native thread, Web Worker, main thread, external process. Zones are enforced by architecture, not by policy. You can't render from Rust. You can't access the DOM from a Worker. The structure prevents the violation.

**User** = WHO is consuming. The accounting identity. stream-pipeline, plugin.chat, agentscope. The registry tracks usage per user, enforces limits per user, and reports per user.

```
Budget (how much)  ×  Zone (where)  ×  User (who)  =  allocation

"plugin.chat gets 1 CPU permit in Zone 2 for state mutations"
"stream-pipeline gets 1 CPU permit in Zone 1 for SSE parsing"
"agentscope gets 512MB in External zone for agent execution"
```

| Zone | Placement Rule | Why This Zone Exists |
|---|---|---|
| Zone 1 (Rust) | Heavy compute, I/O, parsing | Native speed, never touches UI thread |
| Zone 2 (Worker) | State mutations, highlighting | Off main thread, but needs JS APIs |
| Zone 3 (Main) | React render only | Only zone with DOM access |
| External | AgentScope, sandboxes | Separate process, separate memory space |

The registry allocates budgets. Zones determine placement. Users get billed.

## Scripted Plugin Architecture — Full Control

Plugins are scripted through our SDK. Every capability is granted, not assumed. The SDK is the permission boundary:

```
Plugin CAN (via SDK):           Plugin CANNOT (structurally):
  ctx.rust.invoke(command)        Access window/document directly
  ctx.rust.listen(event)          Import from other plugins
  ctx.bus.emit(topic)             Import from core (except SDK)
  ctx.commands.register(id, fn)   Access filesystem or network
  ctx.settings.get/set(key)       Spawn processes
  ctx.storage.get/set(key)        Read other plugins' storage
  ctx.logger.info/warn/error      Bypass the budget registry
  Declare manifest contributions  Modify the plugin-sdk
  Return lazy component loaders   Allocate resources without a permit
```

Every `ctx.rust.invoke()` call is tagged with the caller's plugin ID. The Rust side checks the budget registry before executing. If the plugin's budget is exhausted, the call returns an error. The plugin never knows the registry exists — it just experiences "this call failed, handle gracefully."

This means: system plugins and third-party plugins follow the same rules. No shortcuts. The app is fully controlled because every plugin capability flows through our SDK, and every SDK operation flows through the budget registry.

## Evaluating Compliance

For each budget, ask three questions:

1. Is the limit defined? (spec exists)
2. Is the limit enforced? (code prevents violation)
3. Is the limit measured? (telemetry detects drift)

A budget that is defined but not enforced is a wish. A budget that is enforced but not measured is a guess. All three must be present for the budget to be real.
