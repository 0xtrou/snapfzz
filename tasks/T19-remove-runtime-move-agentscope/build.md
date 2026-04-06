# T19 — Build Report
## Remove Runtime settings menu, move AgentScope config into Processes plugin

**Date:** 2026-04-07  
**Status:** COMPLETE

---

## 5 Questions (Pre-Build)

1. **Which spec?** → A007 (Multi-Layout — settingsSections contribution, preferences surface), A008 (Budget Registry / SupervisedDomain — process config)
2. **Which zone?** → Zone 3 (React rendering — ProcessesSettings.tsx). Rust Settings struct is Zone 1.
3. **Core or plugin?** → Plugin (settings-processes DetailPanel — feature code). plugin-discovery.ts is core infrastructure.
4. **Existing pattern?** → Matched existing DetailPanel pattern. `tauriInvoke` already in ProcessesSettings.tsx. Settings Propagation: `save_settings → emitSettingsChanged` per ENGINEERING_GUIDE.
5. **Test name format?** → `A007/settings-processes: {behavior}` — per A007/settingsSections spec.

---

## Changes Made

### Step 1: plugin-discovery.ts — Remove settings-runtime from preferences loader
**File:** `frontend/packages/plugin-host/src/plugin-discovery.ts`

Removed `() => import('@snapfzz/settings-runtime')` from the preferences surface loaders array. Added inline spec comment referencing A007/settingsSections and A008/SupervisedDomain to explain the architectural decision.

### Step 2: Vite aliases — Remove @snapfzz/settings-runtime
**Files:**
- `frontend/packages/preferences/vite.config.ts` — removed `'@snapfzz/settings-runtime'` alias
- `frontend/packages/project/vite.config.ts` — removed `'@snapfzz/settings-runtime'` alias

### Step 3: ProcessesSettings.tsx — Add AgentScope config to DetailPanel
**File:** `plugins/settings-processes/src/ProcessesSettings.tsx`

- Added `Input` and `SaveOutlined` to imports
- Added `emitSettingsChanged()` helper function (Settings Propagation pattern per ENGINEERING_GUIDE)
- Added state: `agentscopeHost`, `agentscopePort`, `configSaving` to DetailPanel
- Added `useEffect` to load host/port from `get_settings` when `process.name === 'agentscope'`
- Added `handleSaveAndRestart` callback: `get_settings → save_settings (merged) → emitSettingsChanged → restart_process → onAction`
- Added `agentscope-config-section` UI block (shown only when `process.name === 'agentscope'`) with:
  - Host Input (`data-testid="agentscope-host-input"`)
  - Port Input (`data-testid="agentscope-port-input"`) 
  - Popconfirm-wrapped "Save & Restart" button (`data-testid="btn-save-restart-agentscope"`)
  - "Changes require process restart to take effect" note

### Step 4: main.rs — Add agentscope_host and agentscope_port to Settings struct
**File:** `src-tauri/src/main.rs`

Added to `Settings` struct:
```rust
#[serde(default = "default_agentscope_host")]
agentscope_host: String,
#[serde(default = "default_agentscope_port")]
agentscope_port: u16,
```

Added default functions:
```rust
fn default_agentscope_host() -> String { "127.0.0.1".to_string() }
fn default_agentscope_port() -> u16 { AGENTSCOPE_PORT }
```

Added fields to `impl Default for Settings`.

Defaults match `AGENTSCOPE_PORT = 8090` constant for backward compatibility — existing deployments with no settings.json continue working without migration.

### Step 5: No pnpm workspace changes needed
`@snapfzz/settings-runtime` is NOT listed in `frontend/package.json` or `pnpm-workspace.yaml` as a direct workspace dependency. The plugin directory stays on disk, only the build/runtime connection is removed.

### Step 6: Tests — 11 new tests for AgentScope config
**File:** `plugins/settings-processes/src/__tests__/ProcessesSettings.test.tsx`

Added `describe('A007/settings-processes: agentscope config section', ...)` with 11 tests:

1. `agentscope detail panel shows host/port config section` — config section renders
2. `agentscope config section is absent for non-agentscope processes` — guarded by process name
3. `agentscope host input is editable` — user can change host
4. `agentscope port input is editable` — user can change port
5. `agentscope config loads saved host from get_settings` — reads persisted values
6. `agentscope config loads saved port from get_settings` — reads persisted values
7. `Save & Restart button is present in agentscope config section` — button visible
8. `Save & Restart calls save_settings with merged host and port` — correct payload
9. `Save & Restart calls restart_process with agentscope name` — correct process name
10. `Save & Restart failure is silently handled` — no crash on error
11. `restart note text is shown in config section` — UX hint rendered

---

## Verification

### Frontend tests (full suite)
```
Test Files  8 passed (8)
Tests  75 passed (75)
```

### Settings-processes plugin tests
```
Tests  80 passed | 6 pre-existing failures (same 6 as on main before this change)
```

The 6 pre-existing failures are in the "log panel" and "clear logs" test suite — they fail on the original `main` branch too (confirmed by git stash + retest). They are NOT caused by this change.

### Cargo check
```
Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.95s
```

### No TODOs/FIXMEs
```bash
grep -rn "TODO\|FIXME\|HACK" frontend/packages/ plugins/settings-processes/  # returns 0 results
```

### No hardcoded colors
All color references use `var(--*)` CSS variables. No hex/rgb literals added.

---

## Architecture Decisions (Inline Spec Comments Added)

| Location | Comment | Why Necessary |
|---|---|---|
| plugin-discovery.ts | `// Per A007/settingsSections: Runtime section removed...` | Non-obvious removal of a plugin from the surface loader |
| ProcessesSettings.tsx | `// Per ENGINEERING_GUIDE/Settings Propagation: emits DOM event...` | Non-obvious why DOM event dispatched after Tauri save |
| ProcessesSettings.tsx | `// Per A007/settingsSections + A008/SupervisedDomain: agentscope host/port...` | Non-obvious location choice (detail panel vs dedicated section) |
| ProcessesSettings.tsx | `// Per ENGINEERING_GUIDE/Settings Propagation: merge into full settings...` | Non-obvious merge pattern |
| main.rs | `// Per A008/SupervisedDomain: agentscope connection config moved...` | Non-obvious why fields were added and why defaults use constant |

---

## Expected Outcome (Verified)

1. ✅ Settings sidebar no longer shows "Runtime" — General, Performance, Processes, Plugins, Advanced only
2. ✅ Expanding "agentscope" row in Processes shows host/port config with Save & Restart
3. ✅ Changing host/port → Save & Restart → saves settings + restarts process
4. ✅ All 75 frontend tests pass + 11 new agentscope config tests pass
5. ✅ plugins/settings-runtime/ directory NOT deleted
6. ✅ @snapfzz/plugin-sdk NOT modified
7. ✅ Cargo check passes
