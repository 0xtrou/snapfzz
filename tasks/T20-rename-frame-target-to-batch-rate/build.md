# Build Report: T20 — Rename frame_target_ms → batch_interval_ms

**Date:** 2026-04-07  
**Status:** COMPLETE  
**Spec:** A008/BudgetRegistry, A002/Zone1 (SSE batching)

---

## 5 Questions (AGENTS.md)

1. **Which spec?** → A008 (Budget Registry) — field naming in controlled/metrics layers
2. **Which zone?** → Zone 1 (Rust): field renames in ControlledBudgets, BudgetMetrics, BudgetRegistry. Zone 3 (React): interface property rename in PerformanceSettings.tsx.
3. **Core or plugin?** → Core (snapfzz-budget crate + main.rs) + plugin (settings-performance)
4. **Existing pattern?** → Matched field naming patterns: `batch_rate_ms` already existed as correct sibling; `batch_interval_ms` follows same style
5. **Test name?** → `a008_controlled_batch_interval_reads_from_preset`, `a008_registry_battery_preset_uses_33ms_batch_interval`, etc.

---

## Changes Made

### Rust — `src-tauri/crates/snapfzz-budget/src/controlled.rs`
- `pub frame_target_ms: AtomicU64` → `pub batch_interval_ms: AtomicU64`
- `AtomicU64::new(preset.frame.target_ms)` field init key renamed
- `pub fn frame_target()` → `pub fn batch_interval()`

### Rust — `src-tauri/crates/snapfzz-budget/src/lib.rs`
- `swap_preset`: `.frame_target_ms.store(...)` → `.batch_interval_ms.store(...)`
- `pub fn frame_target()` → `pub fn batch_interval()`
- `snapshot()`: `frame_target_ms:` → `batch_interval_ms:`

### Rust — `src-tauri/crates/snapfzz-budget/src/metrics.rs`
- `pub frame_target_ms: u64` → `pub batch_interval_ms: u64`

### Rust — `src-tauri/src/main.rs`
- `async fn get_frame_target` → `async fn get_batch_interval`
- `registry.frame_target()` calls (×3) → `registry.batch_interval()`
- `get_frame_target` in `invoke_handler!` → `get_batch_interval`
- Log message: `"frame={}ms"` → `"batch_interval={}ms"`

### Test — `registry_test.rs`
- `reg.frame_target()` calls → `reg.batch_interval()`
- `snap.frame_target_ms` → `snap.batch_interval_ms`
- `fn a008_registry_battery_preset_uses_33ms_frame_target` → `fn a008_registry_battery_preset_uses_33ms_batch_interval`
- `fn a008_registry_swap_preset_updates_frame_target` → `fn a008_registry_swap_preset_updates_batch_interval`

### Test — `controlled_test.rs`
- `fn a008_controlled_frame_target_reads_from_preset` → `fn a008_controlled_batch_interval_reads_from_preset`
- `perf.frame_target()` / `batt.frame_target()` → `.batch_interval()`

### Test — `preset_test.rs`
- `fn a008_preset_performance_frame_target_is_16ms` → `fn a008_preset_performance_batch_interval_is_16ms`
- `fn a008_preset_battery_frame_target_is_33ms` → `fn a008_preset_battery_batch_interval_is_33ms`

### Frontend — `plugins/settings-performance/src/PerformanceSettings.tsx`
- `BudgetMetrics.frameTargetMs: number` → `batchIntervalMs: number`
- All 3 `metrics.frameTargetMs` references → `metrics.batchIntervalMs`

### Test — `plugins/settings-performance/src/__tests__/PerformanceSettings.test.tsx`
- `makeMetrics({ frameTargetMs: ... })` (×4) → `batchIntervalMs`
- Test name: `'shows 30fps when frameTargetMs > 16'` → `'shows 30fps when batchIntervalMs > 16'`

---

## NOT Changed (per task spec)
- `preset.rs`: `FrameBudget.target_ms` — the struct field name for the preset definition layer (task scope excludes preset struct internals)
- `@snapfzz/plugin-sdk` — not touched
- FPS counter in StatusBar.tsx — not touched
- Actual ms values (16ms, 33ms) — unchanged

---

## Verification Results

```
grep -rn "frame_target|frameTarget" src-tauri/ frontend/ plugins/ → 0 results ✓

cargo test (all crates): 20+61 tests passed, 0 failed ✓
cargo check: Finished dev profile, no errors ✓
frontend/npx vitest run: 75 tests passed, 0 failed ✓
plugins/settings-performance/npx vitest run:
  - 43 tests passed, 29 failed
  - 29 failures are PRE-EXISTING (confirmed via git stash before/after)
  - Our rename introduced 0 new failures ✓
```

---

## Verdict

PASS — Zero `frame_target`/`frameTarget` occurrences remain. All tests that were passing before remain passing. Pre-existing test failures in settings-performance (29 tests, `style.getPropertyValue is not a function` environment issue) are unaffected.
