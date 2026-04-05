# Build: T7 — Budget Registry Crate

## 5 Questions
1. Which spec? → A008 Budget Registry (kernel)
2. Which zone? → Zone 1 (Rust native), kernel for all zones
3. Core or plugin? → Core infrastructure — THE kernel
4. Existing pattern? → Qdrant ResourceBudget (semaphore permits)
5. Test name? → A008/{module}: {behavior}

## What Was Built

`src-tauri/crates/snapfzz-budget/` — 4 modules, ~350 LOC:

- `preset.rs` (~140 LOC) — hardware detection via sysinfo, auto preset selection, 3 preset definitions
- `controlled.rs` (~130 LOC) — semaphore-based CPU/invoke permits, plugin strike counter with windowed tracking
- `supervised.rs` (~130 LOC) — cross-process RSS monitoring via sysinfo, health checking via HTTP, storage measurement
- `metrics.rs` (~40 LOC) — BudgetMetrics snapshot struct, ProcessStatus enum, BudgetViolation struct
- `lib.rs` (~120 LOC) — BudgetRegistry tying all modules, public API: try_acquire_cpu, try_acquire_invoke, record_strike, register_process, snapshot

## Dependencies
- tokio (sync, time) — semaphores, async
- sysinfo — hardware detection, RSS monitoring
- serde/serde_json — serialization
- serde_yaml — config parsing (future: read budget.yaml)
- reqwest — health checks
- dashmap — concurrent process/strike maps
- dirs — global config path

## Verification
- cargo check -p snapfzz-budget: clean (0 warnings)
- cargo check (full workspace): clean
