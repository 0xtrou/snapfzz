---
title: "Core Runtime — The Bones Before Plugins"
type: feat
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

## Packages

### Frontend

| Package | What It Does |
|---|---|
| `@snapfzz/plugin-sdk` | `definePlugin()`, all TypeScript types, contribution interfaces |
| `@snapfzz/plugin-host` | `PluginHost` class, `ContributionStore`, manifest discovery, dep resolution, lazy loading, activation, PluginContext factory, ErrorBoundary wrapping |
| `@snapfzz/shared` | Entities (Project, Agent), lib (EventBus, TauriBridge, formatters), hooks (useTheme, useTauriEvent), theme (Ant Design zinc tokens) |
| `@snapfzz/launcher` | Thin shell: reads ContributionStore, renders registered content. Header + main + status bar slots. |
| `@snapfzz/project` | Thin shell: reads ContributionStore. Left panel tabs + right panel tabs + bottom panel + status bar. Resizable split pane. |

### Rust Crates

| Crate | What It Does |
|---|---|
| `snapfzz-core` | PluginManifest, HostSurface, BusMessage types |
| `snapfzz-tauri-shell` | Window management, IPC invoke/event handlers, EventBus bridge |
| `snapfzz-plugin-host` | Manifest registry (Rust side), capability checking |
| `snapfzz-plugin-bridge` | Schema validation (serde ↔ zod), typed command routing |
| `snapfzz-box-manager` | Sandbox abstraction (BoxLite microVM first, horizontally scales to Container/Cloud/Wasm). AI code execution isolation. |
| `snapfzz-agent-supervisor` | AgentScope process lifecycle via `uv`. Start, health check, restart, graceful shutdown. Orchestration is AgentScope's job — proven at 1M agents. |
| `snapfzz-stream-pipeline` | SSE consumer, 16ms batcher, Channel emitter, multiplexer |

---

## Building the Core Runtime

### Plugin Host — Full Implementation

`@snapfzz/plugin-host` needs:

Already implemented:
- **Dependency resolution**: topological sort, validate deps exist
- **Activation/deactivation**: call `plugin.activate(ctx)`, cleanup on deactivate
- **PluginContext factory**: creates namespaced EventBus, CommandBus, ContributionRegistry, SettingsRegistry, PluginStorage, ApiBroker, RustBridge, Logger
- **Crash containment**: ErrorBoundary wrapper for each plugin's UI contributions
- **React integration**: `useContributionStore()` hook (useSyncExternalStore)

Needs implementation (per A005/Lifecycle):
- **Activation events**: gate activation by `onStartupFinished`, `onViewVisible`, `onCommand`, `onEvent`
- **Startup budget**: 200ms for critical plugins, `requestIdleCallback` for background preload
- **Enable/disable**: persist disabled state, skip during activation, re-enable flow
- **Reload**: deactivate → invalidate module cache → re-import → re-activate
- **Uninstall**: remove third-party plugin + storage + chunks
- **Update**: replace plugin version, verify compatibility
- **Crash supervision**: 3 crashes in 5min → auto-disable
- **Capability checking**: verify plugin has required capabilities before granting access

### Shell Layout — Dynamic Rendering

Both shells read from ContributionStore:

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

### Rust IPC — Wired for Real

`snapfzz-tauri-shell` needs:

- **Invoke handlers**: register Tauri commands that plugins call via `ctx.rust.invoke()`
- **Event bridge**: Rust emits events → JS EventBus receives. JS emits → Rust receives → forwards to other WebViews.
- **Window management**: create project windows, track open windows
