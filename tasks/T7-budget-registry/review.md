# Review: T7 — Budget Registry + Wired main.rs

## Verdict: FAIL → FIXED

## Findings

| # | Severity | Finding | Fix Applied |
|---|---|---|---|
| 1 | High | max_health_failures miswired to max_restarts | Fixed: hardcoded to 3 (separate from max_restarts) |
| 2 | High | enforce_loop() missing from BudgetRegistry | Fixed: added async enforce_loop with health/memory/storage checks + metrics callback |
| 3 | Medium | Incomplete BudgetMetrics | Deferred: current fields sufficient for Alpha, will expand |
| 4 | Medium | SSE parse in send_message not CPU-budgeted | Fixed: try_acquire_cpu() gates the SSE parse work |
| 5 | Medium | Test naming format | Deferred: Rust test naming uses snake_case convention, spec traceability via a008_ prefix |
| 6 | Low | disabled_plugins from wrong source | Fixed: reads from controlled.disabled_plugin_ids() |

## Verification
- cargo check: 0 warnings
- cargo test -p snapfzz-budget: 38 passed
- Frontend tests: 49 passed
