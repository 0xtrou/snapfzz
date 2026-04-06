# Review: T8a — Preferences Shell Package

## Verdict: PASS WITH NOTES

## Findings

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | No vitest.config.ts, vitest not in devDeps | Add config + dep |
| 2 | Medium | TRACEABILITY.md not updated with A007 rows | Update |
| 3 | Medium | App.test.tsx has only 1 test, unused userEvent import | Expand tests, remove unused import |
| 4 | Low | FpsCounter uses hardcoded hex colors | Fix in both project + preferences |
| 5 | Note | pluginsInitialized guard correct | No action |
| 6 | Note | A008 frame target not wired yet | Expected, deferred |
| 7 | Note | vite emptyDirFirst pre-existing bug | Not introduced here |

## What's Good
- A007: separate package, own PluginHost, module-level store, pluginsInitialized guard
- A001: contain:strict on both panels, GPU-only animations, FPS counter
- ContributionStore: settingsSections follows existing pattern exactly, 5 new tests
- plugin-host: registerManifestContributions handles settingsSections
- U009: CSS variables throughout, no-flash theme, Ant ConfigProvider
- Zero TODO/FIXME/HACK, inline spec comments present
