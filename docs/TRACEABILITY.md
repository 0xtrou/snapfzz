# Traceability Matrix

Every spec requirement → code → tests. Updated with every change.

---

## 009 Plugin Architecture

| Requirement | Code | Tests |
|---|---|---|
| Plugin registration stores manifest definitions by id | frontend/packages/plugin-host/src/plugin-host.ts:register() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle: registers a plugin and retrieves it by id |
| Surface filtering returns only plugins for target host surface | frontend/packages/plugin-host/src/plugin-host.ts:getPlugins() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle: filters registered plugins by requested host surface |
| Dependency resolution uses topological ordering | frontend/packages/plugin-host/src/plugin-host.ts:resolve() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/resolve: orders plugins so dependencies come before dependents |
| Missing dependency detection fails resolution | frontend/packages/plugin-host/src/plugin-host.ts:resolve() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/resolve: throws when a required dependency is missing |
| Activation calls plugin activate with PluginContext | frontend/packages/plugin-host/src/plugin-host.ts:activate() | frontend/packages/plugin-host/src/plugin-host.test.ts:A006/context: activates plugin with full PluginContext contract |
| Deactivation calls plugin handle deactivate and disposes runtime context | frontend/packages/plugin-host/src/plugin-host.ts:deactivate() + frontend/packages/plugin-host/src/plugin-context-factory.ts:disposePluginContext() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle: calls plugin handle deactivate during host deactivation |
| Event communication is namespaced per plugin | frontend/packages/plugin-host/src/plugin-context-factory.ts:normalizeTopic() + createPluginContext().bus | frontend/packages/plugin-host/src/plugin-context-factory.test.ts:A005/communication: provides namespaced EventBus that isolates plugin topics |
| Command communication goes through shared command registry | frontend/packages/plugin-host/src/plugin-context-factory.ts:createPluginContext().commands | frontend/packages/plugin-host/src/plugin-context-factory.test.ts:A005/communication: CommandBus allows register/execute within same host boundary |
| Settings and storage are namespaced per plugin for isolation | frontend/packages/plugin-host/src/plugin-context-factory.ts:createPluginContext().settings + .storage | frontend/packages/plugin-host/src/plugin-context-factory.test.ts:A005/isolation: SettingsRegistry stores under plugin-namespaced key |
| API broker is token-based (no direct plugin imports) | frontend/packages/plugin-host/src/plugin-context-factory.ts:createPluginContext().apis | frontend/packages/plugin-host/src/plugin-context-factory.test.ts:A006/context: creates PluginContext with all required fields from plugin-sdk contract |
| ContributionStore registers and disposes UI contributions | frontend/packages/plugin-host/src/contribution-store.ts:registerLeftPanelTab/registerWorkspaceTab/registerBottomPanel/registerStatusItem | frontend/packages/plugin-host/src/contribution-store.test.ts:A005/store: registers a left panel tab contribution; A005/store: removes a registered tab contribution when disposer is called |
| Crash isolation wraps plugin UI in error boundary fallback | frontend/packages/plugin-host/src/plugin-error-boundary.tsx | frontend/packages/plugin-host/src/plugin-host-react.test.tsx:A005/isolation: catches render error and shows configured fallback component |

## 010 Core Runtime

| Requirement | Code | Tests |
|---|---|---|
| Core plugin host supports registration, resolution, activation, deactivation lifecycle | frontend/packages/plugin-host/src/plugin-host.ts | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle + A005/resolve + A006/context tests |
| PluginContext factory provides runtime contracts (bus, commands, registry, settings, storage, apis, rust, logger, surface, projectPath) | frontend/packages/plugin-host/src/plugin-context-factory.ts:createPluginContext() | frontend/packages/plugin-host/src/plugin-context-factory.test.ts:A006/context: creates PluginContext with all required fields from plugin-sdk contract |
| React integration kept separate from runtime core | frontend/packages/plugin-host/src/use-contribution-store.ts + frontend/packages/plugin-host/src/use-plugin-host.ts | frontend/packages/plugin-host/src/plugin-host-react.test.tsx:A002/react and A006/react tests |
| Shell reads ContributionStore dynamically (via reactive hook) | frontend/packages/plugin-host/src/use-contribution-store.ts | frontend/packages/plugin-host/src/plugin-host-react.test.tsx:A002/react: re-renders hook when ContributionStore is updated |

## 002 Performance Architecture

| Requirement | Code | Tests |
|---|---|---|
| Reactive shell reads should avoid unnecessary re-renders | frontend/packages/plugin-host/src/use-contribution-store.ts (useSyncExternalStore) | frontend/packages/plugin-host/src/plugin-host-react.test.tsx:A002/react: returns ContributionSnapshot from store via useSyncExternalStore |
| No heavy compute in plugin-host main thread paths | frontend/packages/plugin-host/src/plugin-host.ts + frontend/packages/plugin-host/src/contribution-store.ts + frontend/packages/plugin-host/src/plugin-context-factory.ts (registry/context wiring only) | Covered indirectly by all plugin-host unit tests (no batching/compute loops present in this package) |
| 16ms batching / resize zones / child webviews | Not implemented in @snapfzz/plugin-host (belongs to stream pipeline/shell runtime packages) | — |

## 003 State Management

| Requirement | Code | Tests |
|---|---|---|
| useSyncExternalStore for reactive contribution reads | frontend/packages/plugin-host/src/use-contribution-store.ts | frontend/packages/plugin-host/src/plugin-host-react.test.tsx:A002/react: re-renders hook when ContributionStore is updated; A002/react: returns ContributionSnapshot from store via useSyncExternalStore |
| Core runtime logic remains React-free | frontend/packages/plugin-host/src/plugin-host.ts + frontend/packages/plugin-host/src/contribution-store.ts + frontend/packages/plugin-host/src/plugin-context-factory.ts | frontend/packages/plugin-host/src/plugin-host.test.ts + frontend/packages/plugin-host/src/contribution-store.test.ts + frontend/packages/plugin-host/src/plugin-context-factory.test.ts |
| React-specific integration isolated to dedicated files | frontend/packages/plugin-host/src/use-contribution-store.ts + frontend/packages/plugin-host/src/use-plugin-host.ts + frontend/packages/plugin-host/src/plugin-error-boundary.tsx | frontend/packages/plugin-host/src/plugin-host-react.test.tsx:A002/react + A006/react + A005/isolation tests |
| Worker-based state reducers / Rust SSE consumer | Not implemented in @snapfzz/plugin-host (belongs to other runtime/shell packages) | — |

## A005 Plugin Lifecycle (COMPLETE)

| Requirement | Spec Section | Code | Tests |
|---|---|---|---|
| Activation events gate when plugins activate | A005/Lifecycle: Activation Events | frontend/packages/plugin-host/src/plugin-host.ts:activateByEvent() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle/activation-events: only activates plugins matching the fired event; skips plugins with non-matching events; activates in dependency order within same event |
| Startup budget: 200ms for critical, background preload for rest | A005/Lifecycle: Startup Budget | frontend/packages/plugin-host/src/plugin-host.ts:activateByEvent() (STARTUP_BUDGET_MS, scheduleBackgroundPreload) | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle/activation-events tests verify event-gated activation |
| Enable/disable with persistence across restarts | A005/Lifecycle: Enable/Disable | frontend/packages/plugin-host/src/plugin-host.ts:enable()/disable()/isEnabled() + persistDisabledPlugins() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle/enable-disable: disabled plugin skipped during activation; disable deactivates running plugin; enable re-activates with correct event; disabled state persists via storage interface |
| Reload: deactivate → re-import via loader → re-activate | A005/Lifecycle: Reload | frontend/packages/plugin-host/src/plugin-host.ts:reload() + registerWithLoader() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle/reload: deactivates and re-activates plugin via loader |
| Crash supervision: 3 crashes in 5min → auto-disable | A005/Lifecycle: Crash Supervision | frontend/packages/plugin-host/src/plugin-host.ts:reportCrash()/getCrashCount() + pruneCrashWindow() | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle/crash-supervision: increments crash count on reportCrash; auto-disables after 3 crashes in 5 minutes; resets crash count on successful activation |
| Plugin state query (registered, resolved, loading, activated, running, deactivated, disabled, error) | A005/Lifecycle: Lifecycle States | frontend/packages/plugin-host/src/plugin-host.ts:getPluginState() + pluginStates Map | frontend/packages/plugin-host/src/plugin-host.test.ts:A005/lifecycle/state: returns correct state for each lifecycle phase |
| Zone 2 purity: no DOM/window/localStorage in lifecycle core | A002/State Management: Three Zones | frontend/packages/plugin-host/src/plugin-host.ts + contribution-store.ts + plugin-context-factory.ts (injectable ContextStorageAdapter) | frontend/packages/plugin-host/src/plugin-host.test.ts:A002/zones: PluginHost has no direct DOM/window/localStorage dependencies |

## Spec Gaps (within plugin-host scope — not lifecycle)

| Requirement | Code |
|---|---|
| Manifest discovery from plugin packages (not manual register only) | Not implemented — register()/registerWithLoader() take pre-imported definitions or loaders |

## Out-of-scope for this package but referenced by specs

| Spec requirement | Owner package |
|---|---|
| Child WebViews + resizable preview layout + CSS containment | Tauri shell + launcher/project shell packages |
| Rust stream pipeline 16ms SSE batching | src-tauri stream pipeline crates |
| Workerized app reducers/highlighter/diff processing | shell app/runtime worker packages |
| Workspace architecture (`.snapfzz/`) | project/runtime packages |
