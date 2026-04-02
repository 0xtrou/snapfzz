---
title: "Core Runtime — The Bones Before Plugins"
type: feat
status: active
date: 2026-04-02
---

# Core Runtime

What must exist before any plugin can load. This is the infrastructure. Plugins are the features.

## Core Runtime vs Plugins

```
CORE RUNTIME (build first)              PLUGINS (build after core)
──────────────────────────              ──────────────────────────
@snapfzz/plugin-host                    plugins/chat/
  Plugin discovery + resolution         plugins/team/
  Lazy loading + activation             plugins/knowledge-base/
  ContributionStore                     plugins/code/
  ErrorBoundary wrapping                plugins/preview/
  PluginContext factory                  plugins/deployments/
                                        plugins/identities/
@snapfzz/launcher shell                 plugins/compliance/
  Reads ContributionStore               plugins/agent-network/
  Renders registered content            plugins/eval/
  Empty until plugins load              plugins/mini-app-runtime/

@snapfzz/project shell
  Left panel: leftPanelTabs from store
  Right panel: workspaceTabs from store
  Bottom panel: bottomPanels from store
  Status bar: statusItems from store
  Resizable split pane
  All empty until plugins load

Rust: snapfzz-tauri-shell
  Tauri IPC (invoke + events)
  EventBus bridge (JS ↔ Rust ↔ other WebView)
  Window management

Rust: snapfzz-stream-pipeline
  SSE consumer (reqwest-eventsource)
  16ms batching
  Channel API to frontend
```

## What Core Runtime Provides to Plugins

Every plugin receives a `PluginContext` on activation:

```
PluginContext {
  bus          → EventBus (typed pub/sub, cross-plugin)
  commands     → CommandBus (execute/register commands)
  registry     → ContributionRegistry (register tabs, panels, status items)
  settings     → SettingsRegistry (namespaced read/write)
  storage      → PluginStorage (namespaced persistence)
  apis         → ApiBroker (request another plugin's API by token)
  rust         → RustBridge (invoke Tauri commands, listen to events)
  logger       → Logger (debug/info/warn/error)
  surface      → 'launcher' | 'project'
  projectPath  → .snapfzz/ path (project window only)
}
```

## Boot Sequence

```
0ms     Tauri opens window
        → loads @snapfzz/launcher or @snapfzz/project shell

50ms    Shell renders skeleton (header + empty panels + status bar)
        → imports @snapfzz/plugin-host

100ms   Plugin host reads all plugin manifests
        → resolves dependency graph (topological sort)
        → filters by current surface (launcher vs project)

150ms   Activate critical plugins (activationEvent: "onStartupFinished")
        → import plugin JS chunk
        → call plugin.activate(ctx)
        → plugin calls ctx.registry.registerTab(...)
        → shell re-renders: tabs appear

200ms   User sees populated UI, can interact

500ms+  Background: preload remaining plugins via requestIdleCallback
        → other plugins activate on first tab open (onViewVisible)
```

## Implementation Status

### Packages

| Package | Status | What It Does |
|---|---|---|
| `@snapfzz/plugin-sdk` | ✅ Done | `definePlugin()`, all TypeScript types, contribution interfaces |
| `@snapfzz/plugin-host` | 🔨 Stub | `PluginHost` class (register/get), `ContributionStore` (register/subscribe). Needs: manifest discovery, dep resolution, lazy loading, activation, PluginContext factory. |
| `@snapfzz/shared` | ✅ Done | Entities (Project, Agent), lib (EventBus, TauriBridge, formatters), hooks (useTheme, useTauriEvent), theme (Ant Design zinc tokens) |
| `@snapfzz/launcher` | ✅ Shell | Boots with splash → header + empty body + status bar. Needs: read ContributionStore, render registered tabs/panels dynamically. |
| `@snapfzz/project` | ✅ Shell | Boots with resizable split pane. Needs: left panel tabs from store, right panel tabs from store, bottom panel from store, status items from store. |

### Rust Crates

| Crate | Status | What It Does |
|---|---|---|
| `snapfzz-core` | ✅ Done | PluginManifest, HostSurface, BusMessage types |
| `snapfzz-tauri-shell` | 📝 Stub | Needs: window management, IPC invoke/event handlers, EventBus bridge |
| `snapfzz-plugin-host` | 📝 Stub | Needs: manifest registry (Rust side), capability checking |
| `snapfzz-plugin-bridge` | 📝 Stub | Needs: schema validation (serde ↔ zod), typed command routing |
| `snapfzz-box-manager` | 📝 Stub | Needs: BoxLite integration, VM lifecycle, port mapping, health checks |
| `snapfzz-agent-orchestrator` | 📝 Stub | Needs: agent registry, MsgHub routing, session management |
| `snapfzz-stream-pipeline` | 📝 Stub | Needs: SSE consumer, 16ms batcher, Channel emitter, multiplexer |

## What Needs to Be Built (Core Runtime Completion)

### Step 1: Plugin Host — Full Implementation

Upgrade `@snapfzz/plugin-host` from stub to working:

- **Manifest discovery**: scan plugin packages, read manifests
- **Dependency resolution**: topological sort, validate deps exist
- **Lazy loading**: dynamic import of plugin JS chunks on activation event
- **Activation**: call `plugin.activate(ctx)`, handle errors
- **PluginContext factory**: create EventBus, CommandBus, ContributionRegistry, SettingsRegistry, PluginStorage, ApiBroker, RustBridge, Logger per plugin (all namespaced)
- **Crash containment**: ErrorBoundary wrapper for each plugin's UI contributions
- **React integration**: `useContributionStore()` hook for shells to reactively read registered content

### Step 2: Shell Layout — Dynamic Rendering

Upgrade both shells to read from ContributionStore:

**@snapfzz/project shell:**
```
┌──────────────────────────────────┬───────────────────────────────────────┐
│ LEFT PANEL                       │ RIGHT PANEL                            │
│ ┌────────┬──────────┐           │ ┌────┬──────┬──────┬──────┬────┬────┐│
│ │ tab 1  │ tab 2    │ ← from   │ │tab1│tab2  │tab3  │tab4  │tab5│tab6││ ← from
│ └────────┴──────────┘  store    │ └────┴──────┴──────┴──────┴────┴────┘│  store
│ (active tab component)           │ (active tab component)                │
├──────────────────────────────────┴───────────────────────────────────────┤
│ BOTTOM PANEL                                                     ← from │
│ (registered panel components)                                     store │
├──────────────────────────────────────────────────────────────────────────┤
│ STATUS BAR: [items from store]                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**@snapfzz/launcher shell:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ HEADER: logo + [registered header items from store]                      │
├──────────────────────────────────────────────────────────────────────────┤
│ MAIN: registered content from store (project list plugin fills this)     │
├──────────────────────────────────────────────────────────────────────────┤
│ STATUS BAR: [items from store]                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Step 3: Rust IPC — Wired for Real

Upgrade `snapfzz-tauri-shell`:

- **Invoke handlers**: register Tauri commands that plugins call via `ctx.rust.invoke()`
- **Event bridge**: Rust emits events → JS EventBus receives. JS emits → Rust receives → forwards to other WebViews.
- **Window management**: create project windows, track open windows

## Delegation Plan

All three steps delegate to a **single deep agent** for integration coherence:

```
task(
  category="deep",
  load_skills=["ce:work"],
  description="Build core runtime: plugin host + shell layout + Rust IPC",
  prompt="<full context from this doc + plugin-architecture spec + existing code>"
)
```

The agent receives:
1. This document (core runtime spec)
2. The plugin architecture spec (009)
3. The existing code (plugin-sdk types, plugin-host stub, both shells, Rust crates)
4. Clear success criteria: a plugin can be registered, activated, and render a tab in the project shell

## Success Criteria

Core runtime is DONE when:

- [ ] A test plugin with `definePlugin({ id: 'test', contributes: { leftPanelTabs: [...] } })` loads and renders a tab in the project window's left panel
- [ ] A test plugin's workspaceTab renders in the right panel
- [ ] Clicking tabs switches between plugin components
- [ ] Plugin crash (throw in render) shows fallback UI, doesn't crash the shell
- [ ] EventBus: plugin A emits → plugin B receives
- [ ] ContributionStore updates trigger React re-renders in the shell
- [ ] Status bar renders items from registered plugins
- [ ] Launcher shell renders registered main content
- [ ] All without importing anything from a plugin package — pure manifest + dynamic import
