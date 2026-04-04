---
title: "ErrorBoundary Without Host Wiring Is Theater"
type: learning
date: 2026-04-04
tags: [plugin-host, error-boundary, crash-supervision, isolation]
---

# ErrorBoundary Without Host Wiring Is Theater

## Context

The plugin-host had a `PluginErrorBoundary` component that caught render errors and showed a fallback UI. The host had crash supervision logic (3 strikes in 5min → auto-disable). But they weren't connected. The boundary logged to `console.error` and stopped. The host's `reportCrash()` was never called from the UI layer.

## The Gap

```
Plugin crashes in render
  → ErrorBoundary catches ✓
  → Fallback UI shown ✓
  → console.error logged ✓
  → host.reportCrash(pluginId) called ✗  ← broken
  → 3-strike supervision triggered ✗     ← broken
  → Retry button available ✗             ← broken
```

The boundary provided visual isolation but not operational isolation. A plugin could crash infinitely — the user sees the fallback, but the supervision loop never fires, the crash counter never increments, and the plugin is never auto-disabled.

## What Was Missing

1. **`pluginId` prop on ErrorBoundary** — boundary didn't know which plugin crashed
2. **`onCrash` callback prop** — boundary had no way to notify the host
3. **Shell wiring** — shells used ErrorBoundary but never passed pluginId or onCrash
4. **Retry button** — fallback showed "Plugin failed" with no recovery action

## What Changed

- ErrorBoundary accepts `pluginId` + `onCrash` props (backward-compatible, both optional)
- Default fallback includes Retry button that resets error state
- Custom `FallbackComponent` receives `onRetry` callback
- Both shells create `handleCrash` callback that calls `host.reportCrash(pluginId)`
- Every LazyComponent, every status item, every panel wraps with pluginId-aware boundary
- Full loop: crash → boundary → onCrash → reportCrash → 3 strikes → disable → retry

## Rule

An error boundary without host notification is security theater. It looks like crash isolation — the UI recovers gracefully — but the system never learns from the crash. The supervision loop is broken. Always wire the boundary back to the supervisor.
