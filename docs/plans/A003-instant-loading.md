---
title: "A003 — Startup Budget Enforcement"
type: architecture
date: 2026-04-05
derives-from: A008
budget: startup
---

# A003 — Startup Budget Enforcement

The user clicks the icon and is productive within the startup budget. Every millisecond of blank screen says "I'm not ready for you."

## Registry Contract

```
Budget class: "startup"
Domain: Controlled (in-process)
Source of truth: A008 preset
  visible_ms: 200 (all presets)
  interactive_ms: 500 (all presets)
  activation_timeout_ms: 5000 (per plugin)

Enforcement:
  - HTML skeleton at 0ms (structural — no JS needed)
  - Plugin activation gated by STARTUP_BUDGET from registry
  - Per-plugin activation timeout from registry (kill hung plugins)
  - requestIdleCallback for non-critical preload

Measurement:
  - LCP via PerformanceObserver
  - Long task detection during boot
  - TTI measurement
  - All reported to registry: budget_report_violation("startup", actual_ms)
```

---

## Loading Sequence

```
0ms     Tauri window opens + HTML skeleton (sidebar, status bar, empty workspace)
        Budget: visible_ms countdown starts

50ms    Skeleton visible, CSS parsed, fonts loaded (bundled, no network)
        Budget: 150ms remaining to visible target

100ms   React hydrates, PluginHost created, BudgetRegistry initialized
        Registry reads preset → emits frame_target_ms, startup_budget_ms to frontend

150ms   Plugin discovery: registerDiscoveredPlugins()
        Registry: try_acquire per plugin for activation

200ms   Critical plugins activated (onStartupFinished)
        Budget: visible_ms target met ✓
        Registry: STARTUP_BUDGET_MS from preset, not hardcoded

~500ms  Chat input active, user can type
        Budget: interactive_ms target met ✓
        Non-critical plugins: requestIdleCallback preload
```

---

## Skeleton Strategy

Static HTML in `index.html` — visible before React loads. No JavaScript dependency.

```html
<div id="skeleton" class="skeleton-container">
  <div class="header"><span>Snapfzz</span></div>
  <div class="content">
    <div class="sidebar"></div>
    <div class="main"></div>
  </div>
  <div class="footer">Ready</div>
</div>
```

React hydrates → adds `data-app-ready` → skeleton fades out via CSS transition (GPU-only, opacity).

---

## Plugin Activation Budget

Plugins declare `activationEvents` in their manifest. The PluginHost reads `startup_budget_ms` and `activation_timeout_ms` from the Budget Registry.

```typescript
// PluginHost reads budget from registry on boot
const startupBudget = await invoke('get_startup_budget');
// startupBudget.total_ms = 200
// startupBudget.per_plugin_timeout_ms = 5000

// Activate critical plugins within budget
const startTime = performance.now();
for (const plugin of criticalPlugins) {
  if (performance.now() - startTime > startupBudget.total_ms) {
    console.warn('[PluginHost] Startup budget exceeded, deferring remaining plugins');
    break;
  }
  await host.activate(plugin.id);  // times out at per_plugin_timeout_ms
}
```

No hardcoded constants in the frontend. All values flow from the Budget Registry preset.

---

## Background Preload

Non-critical plugins load during idle time. `requestIdleCallback` ensures preloading never steals frame budget.

```typescript
const schedule = typeof requestIdleCallback === 'function'
  ? requestIdleCallback
  : (cb: () => void) => setTimeout(cb, 0);

for (const plugin of nonCriticalPlugins) {
  schedule(() => host.preloadPlugin(plugin.id));
}
```

---

## AgentScope Runtime Boot

AgentScope Runtime starts as a supervised process (A008). Its boot time is NOT part of the startup budget — the UI is interactive before the Runtime is ready.

```
0ms     UI skeleton visible (startup budget)
200ms   UI interactive (plugins activated)
~2-15s  AgentScope Runtime healthy (background, supervised)
        Status bar: "○ Connecting..." → "● Connected"
```

First run: `uv sync` installs dependencies (~60s). Progress shown in status bar. Subsequent runs: Runtime starts in ~2s.

---

## First Run vs Subsequent Runs

| | First Run | Subsequent |
|---|---|---|
| UI skeleton | 0ms (HTML) | 0ms (HTML) |
| React hydrate | ~100ms | ~100ms |
| Plugin activation | ~150ms | ~150ms |
| AgentScope Runtime | ~60s (uv sync + install) | ~2s |
| User experience | UI instant, "Setting up intelligence..." | Everything instant |

---

## Measurement

All timing reported to Budget Registry for the startup budget class:

```typescript
// LCP measurement
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    invoke('budget_report_violation', { class: 'startup', metric: 'lcp', value_ms: entry.startTime });
  }
}).observe({ type: 'largest-contentful-paint', buffered: true });

// Long task during boot
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    invoke('budget_report_violation', { class: 'startup', metric: 'longtask', value_ms: entry.duration });
  }
}).observe({ type: 'longtask', buffered: true });
```
