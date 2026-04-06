# Build: T15g — PluginContext Subsystem Tests (registry, storage, apis)

## Priority: P1

## Problem
`plugin-context-factory.test.ts` leaves 3 of 7 PluginContext subsystems completely untested: `context.registry`, `context.storage`, `context.apis`. Also untested: `settings.onChange`, `disposePluginContext`. These are the APIs every plugin author calls — a breaking change ships undetected.

## Locations
- `frontend/packages/plugin-host/src/plugin-context-factory.test.ts` — extend
- Source: `frontend/packages/plugin-host/src/plugin-context-factory.ts`

## 5 Questions
1. Which spec? → A005/Plugin Architecture: "PluginContext with all fields"
2. Which zone? → Zone 2 (plugin infrastructure, no React)
3. Core or plugin? → Core (plugin-host)
4. Existing pattern? → Existing tests in same file for bus/commands/logger — follow that pattern
5. Test name? → `A005/context/registry: registerTab adds tab to store`, `A005/context/storage: set and get with namespace prefix`, `A005/context/apis: provide and get with token`, `A005/context/settings: onChange fires on update`, `A005/context/dispose: disposePluginContext cleans up all subsystems`

## What Must Be Done
- **registry**: Test `registerTab()`, `registerBottomPanel()`, `registerStatusItem()`, `registerComponent()` — verify each adds to ContributionStore and dispose removes it
- **storage**: Test `set()`, `get()`, `delete()` — verify namespace prefix `snapfzz:plugin:${pluginId}:storage:` is applied
- **apis**: Test `provide()` and `get()` with token-based API broker — verify cross-plugin sharing works and missing token throws
- **settings.onChange**: Test callback fires when setting is updated
- **disposePluginContext**: Test that calling dispose cleans up bus subscriptions, command registrations, store contributions, storage — verify no lingering references
- Verify zone correctness: no React or browser globals in new tests
- Run `pnpm --filter @snapfzz/plugin-host exec npx vitest run`

## Effort: Short (2-4h)
