# Build: T15e — Preferences Shell Test Coverage

## Priority: P1

## Problem
`preferences/src/app/App.test.tsx` has 1 test for 135 lines of shell logic. Sidebar navigation, section ordering, auto-selection, crash handling, skeleton transition — all untested. Essentially test theater.

## Locations
- `frontend/packages/preferences/src/app/App.test.tsx` — expand from 1 test to full coverage
- Source: `frontend/packages/preferences/src/app/App.tsx`

## 5 Questions
1. Which spec? → A007/Multi-Layout Architecture: preferences window, settingsSections contributions
2. Which zone? → Zone 3 (React shell)
3. Core or plugin? → Core (preferences shell)
4. Existing pattern? → `launcher/App.test.tsx` and `project/App.test.tsx` provide mock patterns
5. Test name? → `A007/preferences: renders sections from store sorted by order`, `A007/preferences: auto-selects first section on mount`, `A007/preferences: clicking sidebar item selects section`, `A005/isolation: crash in section triggers reportCrash`, `A003/InstantLoading: shows skeleton before hydration`

## What Must Be Done
- Add header comment: `// Spec: A007-multi-layout-architecture.md, A005-plugin-architecture.md`
- Test: inject 3 settingsSections with different `order` values → verify sidebar renders in order
- Test: first section auto-selected on mount (verify active state)
- Test: click a sidebar item → section content changes
- Test: empty settingsSections → "no settings available" message (existing test, keep it)
- Test: `handleCrash` calls `host.reportCrash(pluginId)` via ErrorBoundary
- Test: skeleton visible before plugins load, removed after `data-app-ready`
- Test: surface identity — PluginHost created with `'preferences'`
- Run `pnpm --filter @snapfzz/preferences exec npx vitest run`
- Target: ≥90% coverage

## Effort: Short (2-4h)
