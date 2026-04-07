# T28 — Orchestrator Modules (A014) Build Report

## 5 Questions (AGENTS.md)
1. **Which spec?**
   - `docs/plans/A014-kernel-architecture.md`
   - Supporting structure/documentation alignment: `ARCHITECTURE.md`, `AGENTS.md`, `docs/plans/A001-A015`, `docs/ui-specs/U001-U011`
2. **Which zone?**
   - Zone 1 (Rust backend orchestration and Tauri command boundary)
3. **Core or plugin?**
   - Core (`src-tauri` orchestrator + command wiring)
4. **Existing pattern?**
   - Thin Tauri command wrappers delegating to kernel/stream/vault crates
   - Existing preflight + process manager bootstrap pattern in `main.rs`
5. **Test name?**
   - `A014/commands: {module exports behavior}`

## Scope Completed

### 1) Split `main.rs` into domain command modules
Created/used:
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/commands/settings.rs`
- `src-tauri/src/commands/vault.rs`
- `src-tauri/src/commands/process.rs`
- `src-tauri/src/commands/budget.rs`
- `src-tauri/src/commands/stream.rs`
- `src-tauri/src/commands/system.rs`

Command layout now maps by domain as requested.

### 2) Helpers extraction
Created/used:
- `src-tauri/src/helpers.rs`

Moved/centralized helpers there, including:
- `resolve_data_dir` (+ `resolve_data_dir_from`)
- `agentscope_base_url`
- `resolve_spawn_config`
- bootstrap/runtime helpers (`BootLogger`, AgentScope spawn path)

### 3) `main.rs` slimmed to orchestrator role
- `VaultInitializer` retained in `main.rs`
- `main.rs` now holds module declarations, preflight init glue, builder setup, and `generate_handler!`
- **Line count: 80** (requirement was `< 120`)

### 4) Moved open path commands into system module
- `open_path` and `pick_folder` are in `commands/system.rs`
- `src-tauri/src/open_path.rs` remains unlinked/obsolete (no active module import)

### 5) Tests moved/added for module organization
Added/confirmed in command modules:
- `settings` export coverage for `get_settings`, `save_settings`
- `vault` export coverage for all 5 vault commands
- `process` export coverage includes `restart_process`, `kill_process`
- `stream` export coverage includes `send_message`

All Rust tests currently pass (see verification).

### 6) Spec/doc architecture-reference sweep
Added architecture-source-of-truth pointer to all required spec files:
- `docs/plans/A001` … `A015`
- `docs/ui-specs/U001` … `U011`

Reference used:
- `> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.`

Also confirmed AGENTS structure section is:
- `See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete system architecture, crate responsibilities, boot sequence, IPC pattern, and spec index.`

## Follow-up Fixes Found During Verification

Rust compile/test failures after refactor were fixed by small boundary imports/wiring:
- `src-tauri/src/menus.rs`
  - import updated from `crate::open_preferences` → `crate::commands::system::open_preferences`
- `src-tauri/src/commands/settings.rs`
  - added `use tauri::Emitter;` for `app.emit(...)`
- `src-tauri/src/commands/system.rs`
  - added `use tauri::Manager;` for `get_webview_window(...)`
- `src-tauri/src/fonts.rs`
  - added `use std::path::PathBuf;`

No kernel/stream/vault crate internals were modified.

## Verification Results

Executed required commands:

1. `cd src-tauri && cargo check 2>&1 | tail -5` ✅
- Finished `dev` profile successfully

2. `cd src-tauri && cargo test 2>&1 | grep "test result"` ✅
- `test result: ok. 9 passed; 0 failed; ...`

3. `wc -l src-tauri/src/main.rs` ✅
- `80 src-tauri/src/main.rs`

4. `ls src-tauri/src/commands/` ✅
- `budget.rs mod.rs process.rs settings.rs stream.rs system.rs vault.rs`

5. `cd frontend && CI=true npx vitest run 2>&1 | tail -5` ⚠️
- Fails in current workspace with broad pre-existing frontend test environment errors (`document/window is not defined`) across many frontend package tests.
- This task did **not** modify frontend code; failure appears environmental/workspace-level for the aggregate command path.

Additional verification:
- `cargo check` ✅
- `cargo test` ✅
- `lsp_diagnostics` on `src-tauri/src` shows no Rust errors; one hint for unlinked obsolete file (`open_path.rs`).

## GitNexus Impact Checks
Ran impact analysis before edits on touched symbols (low risk reported):
- `main`
- `validate_open_path_target`
- `setup_menus`
- `save_settings`
- `open_preferences`
- `install_font_from_file`

No HIGH/CRITICAL warnings encountered in this completion pass.

## Final Status
- ✅ Command-module split implemented
- ✅ `main.rs` reduced below 120 lines (80)
- ✅ Required command export tests in place and passing
- ✅ Spec/UI architecture reference sweep completed for A001-A015 and U001-U011
- ✅ AGENTS structure section aligned to ARCHITECTURE.md
- ⚠️ Frontend aggregate vitest command fails in current environment (outside Rust refactor scope)
