---
title: "Eight States Is a Smell"
type: learning
date: 2026-04-04
tags: [plugin-host, state-machine, lifecycle, simplification]
---

# Eight States Is a Smell

## Context

The plugin-host lifecycle had 8 states: `registered`, `resolved`, `loading`, `activated`, `running`, `deactivating`, `deactivated`, `disabled`, `error`. Code review found that most intermediate states were never observable by consumers.

## What Happened

Each code path set an "I'm about to do X" state followed by an "I did X" state. `activated` was set just before calling `plugin.activate()`, then `running` replaced it immediately after. The window between them was a microtask gap — no consumer ever read `activated`.

Similarly, `resolved` served two unrelated meanings: "dependencies validated" (after topo sort) and "code loaded" (after dynamic import). `deactivated` was set even on plugins that were never activated.

## Learnings

### 1. If No Consumer Reads a State, It's Implementation Detail — Not API

`activated`, `loading`, `resolved`, `deactivating` were all internal to the `activate()` and `deactivate()` methods. They leaked implementation sequencing into the public type union. Consumers only ever needed to know: can I activate this? is it running? is it broken?

**Simplified to 5 states:**
```
registered → ready → running → disabled → error
```

- `registered`: manifest known, code not loaded
- `ready`: code loaded (after preload or after deactivation with cached code)
- `running`: activate() completed
- `disabled`: user or crash disabled
- `error`: load or activation failed

### 2. Actions Define States, Not the Other Way Around

4 actions: install, uninstall, activate, deactivate. The states are the observable residue of those actions. Starting from "what states do I need" produces bloat. Starting from "what can the user do" produces clarity.

### 3. Deactivation Returns to a Prior State — Not a New One

`deactivated` as a distinct state implies the plugin is fundamentally different after deactivation. It's not — it's the same as before activation, except its code might be cached. So deactivation returns to `ready` (code cached) or `registered` (code not cached). No new state needed.

## What Changed

- Collapsed 8 states to 5 in `PluginLifecycleState` type
- Removed `resolved` overloaded dual-meaning
- Removed transient `activated`/`loading`/`deactivating` states
- Deactivate returns to `ready` or `registered` based on code cache
- 4 new tests covering the simplified state transitions
- All 61 tests passing
