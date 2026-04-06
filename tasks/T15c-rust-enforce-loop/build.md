# Build: T15c — Test BudgetRegistry enforce_loop

## Priority: P0

## Problem
`enforce_loop()` in `src-tauri/crates/snapfzz-budget/src/lib.rs:110-142` is the runtime kernel of A008 — the monitoring loop that checks memory limits, runs health checks, monitors storage, and emits metrics. It has **zero tests**. Any regression here (swapped condition, skipped process) is invisible.

## Locations
- Source: `src-tauri/crates/snapfzz-budget/src/lib.rs` L110-142
- Test file: `src-tauri/crates/snapfzz-budget/src/registry_test.rs` (add tests here)

## 5 Questions
1. Which spec? → A008/Budget Registry: "enforce_loop() monitors supervised processes, emits metrics to frontend"
2. Which zone? → Zone 1 (Rust)
3. Core or plugin? → Core (budget registry infrastructure)
4. Existing pattern? → Other registry tests use `with_preset_name("balanced")` factory
5. Test name? → `a008_registry_enforce_loop_checks_memory`, `a008_registry_enforce_loop_emits_metrics`, `a008_registry_enforce_loop_detects_exceeded`

## What Must Be Done
- Use `tokio::time::pause()` for deterministic time control
- Use `tokio::select!` with timeout to run enforce_loop for a controlled duration
- Test: register a process with low memory limit, mock RSS above limit → verify `is_memory_exceeded` returns true
- Test: metrics emission — verify `snapshot()` reflects enforcement state after loop iteration
- Test: health check failure detection (may need mock HTTP server or skip HTTP and test the check_memory / is_memory_exceeded paths individually)
- Run `cargo test -p snapfzz-budget` — all tests pass

## Effort: Medium (1-2d)
