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

## Building the Core Runtime

### Plugin Host — Full Implementation

`@snapfzz/plugin-host` needs:

- **Manifest discovery**: scan plugin packages, read manifests
- **Dependency resolution**: topological sort, validate deps exist
- **Lazy loading**: dynamic import of plugin JS chunks on activation event
- **Activation**: call `plugin.activate(ctx)`, handle errors
- **PluginContext factory**: create EventBus, CommandBus, ContributionRegistry, SettingsRegistry, PluginStorage, ApiBroker, RustBridge, Logger per plugin (all namespaced)
- **Crash containment**: ErrorBoundary wrapper for each plugin's UI contributions
- **React integration**: `useContributionStore()` hook for shells to reactively read registered content

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
