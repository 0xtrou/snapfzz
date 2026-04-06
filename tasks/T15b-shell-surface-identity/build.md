# Build: T15b — Shell Surface Identity Verification

## Priority: P0

## Problem
All 3 shell tests mock `PluginHost` but never verify the constructor receives the correct surface string (`'launcher'`, `'project'`, `'preferences'`). Per A007, surface identity is the core multi-layout guarantee. A bug swapping surfaces would pass all tests.

## Locations
1. `frontend/packages/launcher/src/app/App.test.tsx` ~L34-42 — mock doesn't capture constructor args
2. `frontend/packages/project/src/app/App.test.tsx` ~L39-52 — same gap
3. `frontend/packages/preferences/src/app/App.test.tsx` ~L39 — same gap

## 5 Questions
1. Which spec? → A007/Multi-Layout Architecture: separate windows per layout, own PluginHost instance
2. Which zone? → Zone 3 (React shell tests)
3. Core or plugin? → Core (launcher, project, preferences shells)
4. Existing pattern? → The mocks already spy on PluginHost — add constructor arg capture
5. Test name? → `A007/shell: creates PluginHost with surface '{surface}'`

## What Must Be Done
- In each shell test, capture the args passed to `new PluginHost(store, surface)`
- Add a test asserting the surface string matches: `'launcher'` / `'project'` / `'preferences'`
- Add negative test: verify plugins registered for wrong surface are NOT rendered (e.g., launcher shell should not render `project:*` contributions)
- Run `pnpm --filter @snapfzz/launcher exec npx vitest run` etc. for all 3

## Effort: Quick (<1h)
