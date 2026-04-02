# Traceability Matrix

Every spec requirement → code → tests. Updated with every change.

---

## 009 Plugin Architecture

| Requirement | Code | Tests |
|---|---|---|
| Plugin registration | plugin-host/src/plugin-host.ts:register() | plugin-host.test.ts:PluginHost/register |
| Surface filtering | plugin-host/src/plugin-host.ts:getPlugins() | plugin-host.test.ts:PluginHost/getPlugins filters by surface |
| Dependency resolution (topological sort) | plugin-host/src/plugin-host.ts:resolve() | plugin-host.test.ts:PluginHost/resolve |
| Missing dependency detection | plugin-host/src/plugin-host.ts:resolve() | plugin-host.test.ts:PluginHost/resolve throws on missing dep |
| Plugin activation with PluginContext | plugin-host/src/plugin-host.ts:activate() | plugin-host.test.ts:PluginHost/activate |
| Plugin deactivation | plugin-host/src/plugin-host.ts:deactivate() | plugin-host.test.ts:PluginHost/deactivate |
| ContributionStore: register tabs | plugin-host/src/contribution-store.ts | contribution-store.test.ts:register/dispose |
| ContributionStore: reactive subscribe | plugin-host/src/contribution-store.ts:subscribe() | contribution-store.test.ts:subscribe fires |
| ContributionStore: immutable snapshot | plugin-host/src/contribution-store.ts:getSnapshot() | contribution-store.test.ts:getSnapshot |
| PluginContext: EventBus | plugin-host/src/plugin-context-factory.ts | plugin-context-factory.test.ts:EventBus |
| PluginContext: CommandBus | plugin-host/src/plugin-context-factory.ts | plugin-context-factory.test.ts:CommandBus |
| PluginContext: Logger (namespaced) | plugin-host/src/plugin-context-factory.ts | plugin-context-factory.test.ts:Logger |
| PluginContext: SettingsRegistry | plugin-host/src/plugin-context-factory.ts | plugin-context-factory.test.ts:Settings |
| PluginContext: ContributionRegistry | plugin-host/src/plugin-context-factory.ts | plugin-context-factory.test.ts:Registry |
| Crash isolation (ErrorBoundary) | plugin-host/src/plugin-error-boundary.tsx | plugin-host-react.test.tsx:ErrorBoundary |
| React: useSyncExternalStore for store | plugin-host/src/use-contribution-store.ts | plugin-host-react.test.tsx:useContributionStore |
| React: PluginHostProvider context | plugin-host/src/use-plugin-host.ts | plugin-host-react.test.tsx:usePluginHost |

## 010 Core Runtime

| Requirement | Code | Tests |
|---|---|---|
| Plugin host loads and activates plugins | plugin-host/src/plugin-host.ts | plugin-host.test.ts |
| Shell reads ContributionStore | — (not yet implemented) | — |
| Rust IPC bridge | — (not yet implemented) | — |

## 002 Performance Architecture

| Requirement | Code | Tests |
|---|---|---|
| CSS flexbox resize (react-resizable-panels) | — (not yet implemented) | — |
| Monaco editor (lazy loaded) | — (not yet implemented) | — |
| Child WebViews for preview | — (not yet implemented) | — |
| 16ms batch budget | — (not yet implemented) | — |

## 003 State Management

| Requirement | Code | Tests |
|---|---|---|
| useSyncExternalStore for reactive store | plugin-host/src/use-contribution-store.ts | plugin-host-react.test.tsx:useContributionStore |
| Worker-based state management | — (not yet implemented) | — |
| Rust SSE consumer | — (not yet implemented) | — |

## 006 Instant Loading

| Requirement | Code | Tests |
|---|---|---|
| BoxLite <50ms boot | — (not yet implemented) | — |
| Lazy plugin activation | plugin-host/src/plugin-host.ts:activate() | plugin-host.test.ts:activate |
| Splash screen | launcher/src/app/App.tsx:Splash | — |

## 007 Workspace Architecture

| Requirement | Code | Tests |
|---|---|---|
| .snapfzz/ folder structure | — (not yet implemented) | — |
