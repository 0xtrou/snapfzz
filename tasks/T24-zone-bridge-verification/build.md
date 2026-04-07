# T24 — Zone Bridge Verification Build Report

## Scope
Verified Zone 1 ↔ Zone 3 bridge coverage, enforced targeted A001/A003 performance constraints, removed forbidden async preflight hooks from `snapfzz-preflight`, and validated the resulting build with Rust + frontend test suites.

## 5 Questions (AGENTS.md)
1. Which spec? → `A001-performance-architecture.md`, `A002-state-management.md`, `A003-instant-loading.md`, `A006-core-runtime.md`, `A008-budget-registry.md`, `A012-preflight-service.md`.
2. Which zone? → Zone 1 Rust bridge/preflight plus Zone 3 shell/plugin rendering surfaces.
3. Core or plugin? → Both, but only targeted bridge/performance fixes in core shells/shared bridge and existing settings plugins.
4. Existing pattern? → Existing `TauriBridge`, `PreflightService`, shell containment usage, and settings plugin polling patterns.
5. Test name? → `A012/...`, existing frontend Vitest suites, plus diagnostics on every changed file.

## Findings

### Zone 1 → Zone 3 events
Emitted by Rust runtime:
- `settings-changed`
- `supervisor-event`
- `budget-metrics`
- `agent-status`

Frontend listeners found:
- `settings-changed` → `frontend/packages/shared/src/hooks/use-app-settings.ts`
- `budget-metrics` → added in `plugins/settings-performance/src/PerformanceSettings.tsx`
- `supervisor-event` → no frontend listener found
- `agent-status` → no frontend listener found

Result:
- Active bridge coverage after this task:
  - `settings-changed` ✅
  - `budget-metrics` ✅
- Remaining orphaned emits:
  - `supervisor-event`
  - `agent-status`

### Zone 3 → Zone 1 command audit
Frontend/plugin command usage verified across current codepaths includes:
- `get_settings`
- `save_settings`
- `get_data_dir`
- `pick_folder`
- `set_data_dir`
- `budget_snapshot`
- `set_preset`
- `list_processes`
- `get_process_logs`
- `clear_process_logs`
- `restart_process`
- `kill_process`
- `open_path`
- `get_hardware_info`
- `install_font_from_url`
- `install_font_from_file`
- `list_installed_fonts`
- `remove_font`

Registered Tauri commands in `main.rs` also include currently uncalled handlers:
- `get_batch_interval`
- `get_startup_budget`
- `budget_record_strike`
- `budget_report_violation`
- `open_preferences`
- `update_process_config`
- `preflight_status`

Command mismatch resolved:
- Removed stale frontend call to nonexistent `set_plugin_enabled` from `plugins/settings-plugins/src/PluginsSettings.tsx`

Result:
- No frontend invokes a nonexistent Tauri command ✅
- Registered but currently uninvoked commands remain:
  - `get_batch_interval`
  - `get_startup_budget`
  - `budget_record_strike`
  - `budget_report_violation`
  - `open_preferences`
  - `update_process_config`
  - `preflight_status`

### EventBus verification
- `frontend/packages/shared/src/lib/events.ts` is still live.
- It is used by plugin host internals for the in-process plugin bus, not as a duplicate replacement for Tauri cross-window/native events.
- No removal performed.

### A001 / A003 audit outcomes
- Inline skeleton CSS/markup already present in launcher/project/preferences `index.html` files ✅
- `requestIdleCallback` background preload already present in plugin host ✅
- No layout-property animations found in targeted audit ✅
- Render-path filter/sort work existed in launcher/preferences/project and was moved behind `useMemo` where applicable ✅
- Missing containment was tightened to `contain: strict` in targeted shell/plugin containers ✅

## Changes Made

### 1) Cached shared Tauri bridge imports
Updated `frontend/packages/shared/src/lib/tauri-bridge.ts`:
- caches `@tauri-apps/api/core` invoke binding once
- caches `@tauri-apps/api/event` listen binding once
- keeps lazy loading while removing repeated dynamic import setup per call

### 2) Removed render-path computation leaks
Updated:
- `frontend/packages/preferences/src/app/App.tsx`
  - memoized sorted `settingsSections`
- `frontend/packages/launcher/src/app/App.tsx`
  - memoized `headerItems`
  - memoized `mainContent`
  - memoized left/right status item filtering
- `frontend/packages/project/src/app/App.tsx`
  - memoized left status item filtering

### 3) Strengthened containment on independent panels
Updated to `contain: 'strict'` in targeted containers:
- `frontend/packages/preferences/src/app/App.tsx`
- `frontend/packages/launcher/src/app/App.tsx`
- `frontend/packages/project/src/app/App.tsx`
- `plugins/settings-performance/src/PerformanceSettings.tsx`
- `plugins/settings-processes/src/ProcessesSettings.tsx`

### 4) Wired `budget-metrics` event to frontend
Updated `plugins/settings-performance/src/PerformanceSettings.tsx`:
- kept polling fallback via `budget_snapshot`
- added live `bridge.listen('budget-metrics', ...)` subscription
- maintains current UI while covering the Rust event path

### 5) Removed stale nonexistent command usage
Updated `plugins/settings-plugins/src/PluginsSettings.tsx`:
- migrated to shared `createTauriBridge()`
- removed nonexistent `set_plugin_enabled` invoke path
- toggle remains local UI-only until a real backend enable/disable command exists

### 6) Dropped forbidden async preflight APIs
Updated `src-tauri/crates/snapfzz-preflight/src/lib.rs`:
- removed `OnPreflightAsync`
- removed `register_async`
- removed `run_async`
- removed `AsyncHookFailed`
- removed async hook storage

Updated `src-tauri/src/main.rs`:
- removed the `.setup()` async preflight hook spawn path
- preserved sync preflight + ready hook integration

## Files Changed
- `frontend/packages/shared/src/lib/tauri-bridge.ts`
- `frontend/packages/preferences/src/app/App.tsx`
- `frontend/packages/launcher/src/app/App.tsx`
- `frontend/packages/project/src/app/App.tsx`
- `plugins/settings-performance/src/PerformanceSettings.tsx`
- `plugins/settings-plugins/src/PluginsSettings.tsx`
- `plugins/settings-processes/src/ProcessesSettings.tsx`
- `src-tauri/crates/snapfzz-preflight/src/lib.rs`
- `src-tauri/src/main.rs`

## Verification

### Diagnostics
Clean `lsp_diagnostics` on changed files:
- `frontend/packages/shared/src/lib/tauri-bridge.ts`
- `frontend/packages/preferences/src/app/App.tsx`
- `frontend/packages/launcher/src/app/App.tsx`
- `frontend/packages/project/src/app/App.tsx`
- `plugins/settings-plugins/src/PluginsSettings.tsx`
- `plugins/settings-performance/src/PerformanceSettings.tsx`
- `plugins/settings-processes/src/ProcessesSettings.tsx`
- `src-tauri/crates/snapfzz-preflight/src/lib.rs`
- `src-tauri/src/main.rs`

### Tests
Passed:
- `cargo test`
- `cd frontend && CI=true npx vitest run`

## Constraint Compliance
- Did not implement Zone 2 workers ✅
- Did not modify `@snapfzz/plugin-sdk` ✅
- Did not add TODO/FIXME/HACK ✅
- Targeted fixes only; no broad refactor ✅
- Added/kept spec comments only in touched codepaths already following repo style ✅

## Final Status
Completed targeted bridge/performance/preflight verification work with passing tests.

Remaining architectural follow-up outside this task:
- `supervisor-event` still emitted without a frontend listener
- `agent-status` still emitted without a frontend listener
- several registered Tauri commands remain unused from the frontend

---

## T24 Follow-up — Settings IPC Consolidation (Zone Bridge)

### Scope
Consolidated all settings plugins and shared settings hook to use the shared `createTauriBridge()` path for Zone 3 → Zone 1 communication. Removed per-plugin direct `__TAURI_INTERNALS__` wrappers and aligned tests/docs with the single bridge pattern.

### Files Updated
- `frontend/packages/shared/src/lib/tauri-bridge.ts`
- `frontend/packages/shared/src/hooks/use-app-settings.ts`
- `plugins/settings-general/src/GeneralSettings.tsx`
- `plugins/settings-advanced/src/AdvancedSettings.tsx`
- `plugins/settings-plugins/src/PluginsSettings.tsx`
- `plugins/settings-processes/src/ProcessesSettings.tsx`
- `plugins/settings-general/src/__tests__/GeneralSettings.test.tsx`
- `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx`
- `plugins/settings-plugins/src/__tests__/PluginsSettings.test.tsx`
- `plugins/settings-processes/src/__tests__/ProcessesSettings.test.tsx`
- `ENGINEERING_GUIDE.md`
- `REVIEW_GUIDE.md`

### What Changed
1. **Shared bridge caching**
   - `tauri-bridge.ts` now caches dynamic imports for invoke/listen in module-level caches.
   - `createTauriBridge()` keeps the same interface (`isAvailable`, `invoke`, `listen`).

2. **Shared hook migration**
   - `use-app-settings.ts` removed local `getTauriInvoke()` and now uses module-level `const bridge = createTauriBridge()` for both invoke and listen paths.

3. **Settings plugin migration (4 plugins)**
   - Removed local `tauriInvoke()` wrappers from:
     - General
     - Advanced
     - Plugins
     - Processes
   - All commands now call `bridge.invoke<T>(...)` with explicit generic return types.

4. **Tests migrated to bridge mocks**
   - Replaced direct `window.__TAURI_INTERNALS__` mocking with `vi.mock('@snapfzz/shared')` and `createTauriBridge` stubs in all 4 plugin test suites.

5. **Guide updates**
   - Added **"Tauri IPC — Single Bridge Pattern (Non-Negotiable)"** section to `ENGINEERING_GUIDE.md`.
   - Added review checklist row + grep verification command to `REVIEW_GUIDE.md` for raw Tauri access violations.

6. **Shared production cleanup**
   - `use-tauri-event.ts` now subscribes through `createTauriBridge()` instead of raw `@tauri-apps/api/event` imports.
   - `use-window-drag.ts` now invokes window commands through `createTauriBridge()` instead of `window.__TAURI_INTERNALS__`.
   - `settings-performance` removed its remaining local `tauriInvoke()` wrapper and now calls `bridge.invoke(...)` directly.

### Final Verification (Settings IPC consolidation)

#### Diagnostics
- `lsp_diagnostics` clean on changed test files:
  - `plugins/settings-general/src/__tests__/GeneralSettings.test.tsx`
  - `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx`
  - `plugins/settings-plugins/src/__tests__/PluginsSettings.test.tsx`
  - `plugins/settings-processes/src/__tests__/ProcessesSettings.test.tsx`
  - `plugins/settings-performance/src/__tests__/PerformanceSettings.test.tsx`

#### Raw Tauri internals grep
- `grep -R --line-number "__TAURI_INTERNALS__" plugins frontend/packages/shared/src --include='*.ts' --include='*.tsx'`
  - No matches in production codepaths.
- Confirmed with content grep:
  - `plugins/**/*.ts(x)` → no matches
  - `frontend/packages/shared/src/**/*.ts(x)` → no matches

#### Test runs
Passed:
- `cd frontend && CI=true npx vitest run`
- `cd plugins/settings-general && CI=true npx vitest run src/__tests__/GeneralSettings.test.tsx`
- `cd plugins/settings-advanced && CI=true npx vitest run src/__tests__/AdvancedSettings.test.tsx`
- `cd plugins/settings-plugins && CI=true npx vitest run src/__tests__/PluginsSettings.test.tsx`
- `cd plugins/settings-processes && CI=true npx vitest run src/__tests__/ProcessesSettings.test.tsx`
- `cd plugins/settings-performance && CI=true npx vitest run src/__tests__/PerformanceSettings.test.tsx`

#### Test expectation alignment completed
- `settings-processes` assertions updated from `toHaveBeenCalledWith('list_processes', undefined)` to `toHaveBeenCalledWith('list_processes')`.
- `settings-performance` assertions updated from `toHaveBeenCalledWith('<cmd>', undefined)` to single-arg command assertions, matching shared bridge invocation shape.
- All settings test suites now use `vi.clearAllMocks()` in `afterEach` to avoid wiping mocked bridge implementations used by module-scoped `createTauriBridge()` instances.
