# T30 — Command coverage hardening (A014)

## Scope
- Refactor command modules for safer testability while preserving command signatures/behavior.
- Achieve >=90% line coverage for required files:
  - `src-tauri/src/commands/process.rs`
  - `src-tauri/src/commands/settings.rs`
  - `src-tauri/src/commands/stream.rs`
  - `src-tauri/src/commands/system.rs`
  - `src-tauri/src/commands/vault.rs`
  - `src-tauri/src/commands/budget.rs`
  - `src-tauri/src/commands/cef.rs`
  - `src-tauri/src/helpers.rs`

## What was changed

### process.rs
- Kept command signatures intact.
- Updated `kill_process` command path to avoid async-runtime panic when `ProcessManager::kill` uses `blocking_lock`:
  - command now executes `do_kill_process` via `tokio::task::spawn_blocking`, then emits supervisor event.
- Added/adjusted tests:
  - `a014_commands_process_kill_process_command_propagates_missing_runtime_error`
  - `a014_commands_process_emit_supervisor_emits_without_panicking`
  - `a014_commands_process_do_restart_process_with_config_propagates_health_timeout_error`
  - stabilized restart-command error assertion flow with deterministic ordering.

### stream.rs
- Preserved external command APIs.
- Extracted pure/isolated helpers for network pathways:
  - `create_session_request`
  - `do_stop_generation`
  - `do_create_session`
  - `do_load_session`
- Added focused tests for request shaping + network-failure paths:
  - request body absent/present cases
  - pure async error-path tests for stop/create/load

### system.rs
- Preserved command APIs.
- Reduced cfg-dependent dead lines in debug by making `preferences_webview_url` cfg-block based.
- Extracted/tested thin helpers:
  - `focus_existing_preferences_window`
  - `build_preferences_window`
- Added/expanded tests:
  - connected health case via ephemeral local HTTP health server
  - preflight status with multiple timings
  - window construction helper test
  - missing-leaf resolve target canonical parent path case

### helpers.rs
- Stabilized test `a014_helpers_spawn_agentscope_emits_error_when_intelligence_missing` by robust cwd restore fallback.
- Kept behavior intact.

## Verification run

### 1) Tests
- Command: `cargo test --bin Snapfzz`
- Result: **pass** (`108 passed; 0 failed`)

### 2) Coverage
- Command: `cargo llvm-cov test -p snapfzz --bin Snapfzz --summary-only`
- Result: required files all >=90% line coverage

| File | Line Coverage |
|---|---:|
| commands/budget.rs | 97.00% |
| commands/cef.rs | 90.91% |
| commands/process.rs | 95.34% |
| commands/settings.rs | 92.37% |
| commands/stream.rs | 90.62% |
| commands/system.rs | 91.29% |
| commands/vault.rs | 96.53% |
| helpers.rs | 93.24% |

## GitNexus checks
- Impact analysis run before edits on touched symbols (where resolvable), all returned LOW risk for resolved symbols.
- `gitnexus_detect_changes(scope="all")` run before finalization.
- Note: repository has many unrelated in-flight changes; detect_changes reports CRITICAL at whole-repo scope due to broad working-tree churn, not this task alone.

## Outcome
- Target met: required command/helper files now all >=90% line coverage.
- No command signature changes.
- Behavior preserved; failures fixed via test-safe refactor paths and helper extraction.
