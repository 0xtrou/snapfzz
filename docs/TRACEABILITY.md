# Traceability Matrix

Every spec requirement → code → tests. Updated with every change.

---

## A005 Plugin Architecture

| Requirement | Code | Tests |
|---|---|---|
| Plugin registration stores manifest definitions by id | plugin-host/src/plugin-host.ts:register() | plugin-host.test.ts:A005/lifecycle: registers a plugin and retrieves it by id |
| Surface filtering returns only plugins for target host surface | plugin-host/src/plugin-host.ts:getPlugins() | plugin-host.test.ts:A005/lifecycle: filters registered plugins by requested host surface |
| Dependency resolution uses topological ordering | plugin-host/src/plugin-host.ts:resolve() | plugin-host.test.ts:A005/resolve: orders plugins so dependencies come before dependents |
| Missing dependency detection fails resolution | plugin-host/src/plugin-host.ts:resolve() | plugin-host.test.ts:A005/resolve: throws when a required dependency is missing |
| Deactivation calls plugin handle deactivate and disposes runtime context | plugin-host/src/plugin-host.ts:deactivate() + plugin-context-factory.ts:disposePluginContext() | plugin-host.test.ts:A005/lifecycle: calls plugin handle deactivate during host deactivation |
| Event communication is namespaced per plugin | plugin-context-factory.ts:normalizeTopic() + createPluginContext().bus | plugin-context-factory.test.ts:A005/communication: provides namespaced EventBus that isolates plugin topics |
| Command communication goes through shared command registry | plugin-context-factory.ts:createPluginContext().commands | plugin-context-factory.test.ts:A005/communication: CommandBus allows register/execute within same host boundary |
| Settings and storage are namespaced per plugin for isolation | plugin-context-factory.ts:createPluginContext().settings + .storage | plugin-context-factory.test.ts:A005/isolation: SettingsRegistry stores under plugin-namespaced key |
| API broker is token-based (no direct plugin imports) | plugin-context-factory.ts:createPluginContext().apis | plugin-context-factory.test.ts:A006/context: creates PluginContext with all required fields |
| ContributionStore registers and disposes UI contributions | contribution-store.ts:registerLeftPanelTab/registerWorkspaceTab/registerBottomPanel/registerStatusItem | contribution-store.test.ts:A005/store: registers + removes contributions |
| Crash isolation wraps plugin UI in error boundary fallback | plugin-error-boundary.tsx | plugin-host-react.test.tsx:A005/isolation: catches render error and shows configured fallback component |
| Activation events gate when plugins activate | plugin-host.ts:activateByEvent() | plugin-host.test.ts:A005/lifecycle/activation-events: only activates matching; skips non-matching; dependency order |
| Startup budget: 200ms for critical, requestIdleCallback preload for rest | plugin-host.ts:activateByEvent() + scheduleBackgroundPreload() + scheduleDuringIdle() | plugin-host.test.ts:A003/instant-loading/background-preload: uses requestIdleCallback |
| Activation timeout: 5s kill via Promise.race | plugin-host.ts:activate() (ACTIVATION_TIMEOUT_MS) | plugin-host.test.ts:A005/lifecycle/activation-timeout: rejects activation when plugin exceeds 5000ms |
| Enable/disable with persistence across restarts | plugin-host.ts:enable()/disable()/isEnabled() + persistDisabledPlugins() | plugin-host.test.ts:A005/lifecycle/enable-disable (4 tests) |
| Reload: deactivate → re-import via loader → re-activate | plugin-host.ts:reload() + registerWithLoader() | plugin-host.test.ts:A005/lifecycle/reload: deactivates and re-activates |
| Crash supervision: 3 crashes in 5min → auto-disable | plugin-host.ts:reportCrash()/getCrashCount() + pruneCrashWindow() | plugin-host.test.ts:A005/lifecycle/crash-supervision (3 tests) |
| 5-state lifecycle model (registered/ready/running/disabled/error) | plugin-host.ts:PluginLifecycleState + getPluginState() | plugin-host.test.ts:A005/lifecycle/state (4 tests: state transitions, ready after preload, uninstall removes, error on failure) |
| System plugins protected from uninstall | plugin-host.ts:registerAsSystem()/isSystemPlugin() | plugin-host.test.ts:A005/lifecycle/management tests |
| Uninstall removes plugin entirely from host | plugin-host.ts:uninstall() | plugin-host.test.ts:A005/lifecycle/state: uninstall removes plugin state entirely |
| Update replaces loader and reloads | plugin-host.ts:update() | plugin-host.test.ts:A005/lifecycle/management tests |
| onCommand/onEvent activation auto-wiring | plugin-context-factory.ts:onActivationEvent callback → plugin-host.ts:activateByEvent() | plugin-context-factory.test.ts:A005/activation-events (2 tests: command and bus event callbacks) |
| Zone 2 purity: no DOM/window/localStorage in lifecycle core | plugin-host.ts + contribution-store.ts + plugin-context-factory.ts | plugin-host.test.ts:A002/zones: no direct DOM/window/localStorage dependencies |

## A006 Core Runtime

| Requirement | Code | Tests |
|---|---|---|
| Activation calls plugin activate with full PluginContext contract | plugin-host.ts:activate() + plugin-context-factory.ts:createPluginContext() | plugin-host.test.ts:A006/context: activates plugin with full PluginContext contract |
| PluginContext factory provides all runtime contracts | plugin-context-factory.ts:createPluginContext() | plugin-context-factory.test.ts:A006/context: creates PluginContext with all required fields |
| React integration kept separate from runtime core | use-contribution-store.ts + use-plugin-host.ts | plugin-host-react.test.tsx:A002/react + A006/react tests |
| Shell reads ContributionStore dynamically (via reactive hook) | use-contribution-store.ts (useSyncExternalStore) | plugin-host-react.test.tsx:A002/react: re-renders hook when ContributionStore is updated |
| Plugin discovery: async manifest discovery + host registration bridge | plugin-discovery.ts:discoverPlugins() + registerDiscoveredPlugins() | plugin-discovery.test.ts:A006/boot/discovery + A006/boot/registration |
| Project shell renders contributions from store (no plugin imports) | project/src/app/App.tsx | project/src/app/App.test.tsx:A006/shell (6 tests) |
| Launcher shell renders contributions from store (no plugin imports) | launcher/src/app/App.tsx | launcher/src/app/App.test.tsx:A006/shell (5 tests) |
| Shells call registerDiscoveredPlugins before startup activation | launcher/src/app/App.tsx + project/src/app/App.tsx | launcher/project App.test.tsx (mock includes registerDiscoveredPlugins) |

## A003 Instant Loading

| Requirement | Code | Tests |
|---|---|---|
| Launcher skeleton visible at 0ms, fades on React hydration | launcher/index.html + launcher/src/app/App.tsx:useEffect | launcher/App.test.tsx:A003/InstantLoading (2 tests) |
| Project skeleton visible at 0ms, fades on React hydration | project/index.html + project/src/app/App.tsx:useEffect | project/App.test.tsx:A003/InstantLoading (2 tests) |
| Startup metrics: LCP, long tasks, TTI measured on boot | launcher/src/app/App.tsx:measureStartup() | console output [A003/metrics] during test runs |
| Background preload uses requestIdleCallback (not setTimeout) | plugin-host.ts:scheduleDuringIdle() | plugin-host.test.ts:A003/instant-loading/background-preload |

## A002 State Management

| Requirement | Code | Tests |
|---|---|---|
| useSyncExternalStore for reactive contribution reads | use-contribution-store.ts | plugin-host-react.test.tsx:A002/react (2 tests) |
| Core runtime logic remains React-free (Zone 2 safe) | plugin-host.ts + contribution-store.ts + plugin-context-factory.ts | plugin-host.test.ts:A002/zones |
| React-specific integration isolated to dedicated files | use-contribution-store.ts + use-plugin-host.ts + plugin-error-boundary.tsx | plugin-host-react.test.tsx:A002/react + A006/react + A005/isolation |
| Immutable frozen snapshots for concurrent-safe consumers | contribution-store.ts:createSnapshot() | contribution-store.test.ts:A002/store-reactivity: returns immutable snapshot objects |

## U009 Design System

| Requirement | Code | Tests |
|---|---|---|
| Zinc palette CSS tokens (dark + light) | shared/src/theme/tokens.css | — (visual) |
| Semantic alias tokens (--bg-default, --bg-subtle, --accent) | shared/src/theme/tokens.css | — (visual) |
| Ant Design theme config (Inter, zinc, border radii) | shared/src/theme/antd-theme.ts | — (visual) |
| No-flash theme prepaint script | launcher/index.html + project/index.html | — (visual) |

## Spec Gaps (known, not yet implemented)

| Requirement | Status |
|---|---|
| ErrorBoundary → crash supervision wiring (pluginId + onCrash callback) | Open — boundary currently logs only, no host.reportCrash() callback |
| Dynamic manifest discovery from Tauri IPC | Open — plugin-discovery.ts returns empty list |
| Capability checking (requiredCapabilities gate) | Open — SDK types exist, host does not enforce |
| RustBridge.channel\<T\>() for high-frequency streaming | Open — SDK only has invoke + listen |

## Out-of-scope for plugin-host package

| Spec requirement | Owner package |
|---|---|
| Child WebViews + resizable preview layout + CSS containment | Tauri shell + launcher/project shell packages |
| Rust stream pipeline 16ms SSE batching | src-tauri stream pipeline crates |
| Workerized app reducers/highlighter/diff processing | shell app/runtime worker packages |
| Workspace architecture (.snapfzz/) | project/runtime packages |
| Responsive breakpoints (U002) | launcher/project shell packages |
| Keyboard shortcuts (U005/U006) | shell packages |
