# Build: T15d — Rewrite Plugin Discovery Tests

## Priority: P1

## Problem
Both tests in `plugin-discovery.test.ts` verify empty state (no plugins → nothing happens). The real branching logic, error recovery, and surface-specific imports are uncovered. One test spies on the wrong method (`registerWithLoader` instead of `register`), making it structurally deceptive.

## Locations
- `frontend/packages/plugin-host/src/plugin-discovery.test.ts` — rewrite entirely
- Source: `frontend/packages/plugin-host/src/plugin-discovery.ts`

## 5 Questions
1. Which spec? → A006/Core Runtime: "Boot: 100ms manifests → 150ms critical plugins"
2. Which zone? → Zone 2 (plugin infrastructure, no React)
3. Core or plugin? → Core (plugin-host)
4. Existing pattern? → `plugin-host.test.ts` mocking pattern for PluginHost
5. Test name? → `A006/boot: discoverPlugins returns launcher plugins for launcher surface`, `A006/boot: discoverPlugins filters out project plugins from launcher`, `A006/boot: registerDiscoveredPlugins calls host.register for each discovered plugin`, `A006/boot: registerDiscoveredPlugins continues on import failure`

## What Must Be Done
- Delete both existing tests (they are vacuous)
- Read `plugin-discovery.ts` source to understand the actual import map and branching logic
- Test surface-specific discovery: `'launcher'` returns launcher plugins, `'project'` returns project plugins, `'preferences'` returns preferences plugins
- Test error recovery: mock a plugin import that throws → verify it logs and continues
- Test `registerDiscoveredPlugins` calls `host.register()` (NOT `registerWithLoader`) for each discovered manifest
- Verify zone correctness: no React/browser globals
- Add spec header comment
- Run `pnpm --filter @snapfzz/plugin-host exec npx vitest run`

## Effort: Short (2-4h)
