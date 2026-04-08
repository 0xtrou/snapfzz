# T29 — snapfzz-cef Crate Build Report

## 5 Questions (AGENTS.md)
1. **Which spec?**
   - `docs/plans/A015-miniapp-runtime.md`
   - `tasks/T29-snapfzz-cef-crate/plan.md`
2. **Which zone?**
   - Zone 1 for Rust runtime/commands (`src-tauri`, `snapfzz-cef`)
   - Zone 3 for onboarding UI (`plugins/settings-advanced`)
3. **Core or plugin?**
   - Core crate + Tauri command integration, plus plugin UI onboarding section
4. **Existing pattern?**
   - Thin command wrappers in `src-tauri/src/commands/*`
   - Settings plugin component/test style in `plugins/settings-advanced`
5. **Test name?**
   - `A015/...` behavior-focused tests (runtime/window/download/commands)

## Scope Completed (Units 1–8)

### Unit 1 — Crate skeleton
- Added workspace/member wiring and `snapfzz-cef` crate structure.
- Exported modules through `lib.rs`.

### Unit 2 — Platform path utilities
- Added path helpers and directory creation behavior in `paths.rs`.
- Covered platform/base/runtime path expectations with tests.

### Unit 3 — CefDownloader
- Implemented downloader lifecycle helpers:
  - install detection
  - archive/checksum/extract flow
  - cancel + clear-cancel behavior
- Added edge-path tests for checksum mismatch, cancellation, extraction failure, and status transitions.

### Unit 4 — CefRuntime (lazy init + shutdown)
- Implemented runtime readiness and window orchestration.
- Added CDP server ownership and lifecycle hooks.
- Added tests for ready/init behavior and duplicate/missing window handling.

### Unit 5 — CefWindow + CDP capture
- Implemented per-window browser lifecycle:
  - navigation/back/forward/reload/stop
  - devtools open/close state
  - console capture and clearing
  - screenshot via CDP (`Page.captureScreenshot`)
- Expanded `cdp.rs` test coverage for session routing and method dispatch behavior.

### Unit 6 — Tauri commands
- Added `src-tauri/src/commands/cef.rs` thin wrappers for:
  - download start/status
  - readiness check
  - open/close window
  - navigate/back/reload
  - devtools toggle
  - screenshot
  - console messages
- Registered module and handlers in:
  - `src-tauri/src/commands/mod.rs`
  - `src-tauri/src/main.rs`
- Added command module tests for export and download-status mapping behavior.

### Unit 7 — Onboarding UI
- Added `plugins/settings-advanced/src/MiniAppsOnboarding.tsx`.
- Integrated onboarding section into `AdvancedSettings.tsx`.
- Added/updated tests in `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx` for progress and cancel UX.

### Unit 8 — Coverage ≥90%
- Added targeted tests in `types.rs`, `download.rs`, `paths.rs`, and command tests.
- Final measured crate coverage:
  - `cargo llvm-cov -p snapfzz-cef --no-default-features --summary-only`
  - **Total region coverage: 91.38%**

## Files Changed for T29

### Rust crate/runtime
- `src-tauri/crates/snapfzz-cef/Cargo.toml`
- `src-tauri/crates/snapfzz-cef/src/lib.rs`
- `src-tauri/crates/snapfzz-cef/src/cdp.rs`
- `src-tauri/crates/snapfzz-cef/src/download.rs`
- `src-tauri/crates/snapfzz-cef/src/paths.rs`
- `src-tauri/crates/snapfzz-cef/src/runtime.rs`
- `src-tauri/crates/snapfzz-cef/src/types.rs`
- `src-tauri/crates/snapfzz-cef/src/window.rs`

### Tauri app wiring
- `src-tauri/Cargo.toml`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/commands/cef.rs`
- `src-tauri/src/main.rs`

### Frontend onboarding
- `plugins/settings-advanced/src/MiniAppsOnboarding.tsx`
- `plugins/settings-advanced/src/AdvancedSettings.tsx`
- `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx`

## Verification Evidence

### Diagnostics
- `lsp_diagnostics`:
  - `src-tauri/crates/snapfzz-cef/src` → **0 diagnostics**
  - `src-tauri/src` → **0 diagnostics**
  - `plugins/settings-advanced/src` → **0 diagnostics**

### Build/Test
- `cd src-tauri && cargo check` → **pass**
  - note: one warning (`map_cef_error` currently unused)
- `cd src-tauri && cargo test` → **pass** (`14 passed, 0 failed`)
- `cd frontend && CI=true npx vitest run` → **pass** (`31 files, 231 tests`)

### GitNexus scope check (required pre-handoff)
- `gitnexus_detect_changes(scope: "all")` result:
  - risk level: **CRITICAL**
  - reason: working tree currently includes many unrelated in-progress changes outside T29 scope
- T29-local implementation itself has completed verification and tests, but branch contains broader concurrent deltas.

## Notes / Risks
- `src-tauri/src/commands/cef.rs` contains a non-failing dead-code warning for `map_cef_error`.
- Because the branch currently aggregates many active tasks, any commit/PR should be scoped carefully (or split) before merge.
