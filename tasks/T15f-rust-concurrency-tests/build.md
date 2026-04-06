# Build: T15f — Rust Budget Concurrency Tests

## Priority: P1

## Problem
`BudgetRegistry`, `ControlledBudgets`, and `SupervisedBudgets` all use `Arc<Semaphore>`, `DashMap`, `AtomicU64` — designed for multi-thread access — but not one test spawns a second thread. A subtle semaphore misuse or DashMap deadlock would pass the current suite.

## Locations
- `src-tauri/crates/snapfzz-budget/src/controlled_test.rs` — add concurrency tests
- `src-tauri/crates/snapfzz-budget/src/supervised_test.rs` — add concurrency tests
- `src-tauri/crates/snapfzz-budget/src/registry_test.rs` — add concurrency tests

## 5 Questions
1. Which spec? → A008/Budget Registry: "Zones, Plugins, Runtimes all register" (shared across threads)
2. Which zone? → Zone 1 (Rust)
3. Core or plugin? → Core (budget infrastructure)
4. Existing pattern? → Existing tests use `#[test]` with sync assertions
5. Test name? → `a008_controlled_concurrent_acquire_respects_limit`, `a008_controlled_concurrent_release_restores_permits`, `a008_supervised_concurrent_register_and_health_failure`, `a008_registry_concurrent_snapshot_consistent`

## What Must Be Done
- ControlledBudgets: N threads race to acquire M permits → exactly M succeed, rest get None
- ControlledBudgets: concurrent acquire + release cycle — no panics, no lost permits
- SupervisedBudgets: concurrent register_process + record_health_failure — no panics, no data corruption
- BudgetRegistry: concurrent snapshot() while permits are being acquired — snapshot is consistent (cpu_used + cpu_available == cpu_total)
- Use `std::thread::spawn` + `Arc` for sharing, `std::sync::Barrier` for synchronized start
- Run `cargo test -p snapfzz-budget` — all tests pass

## Effort: Short (2-4h)
