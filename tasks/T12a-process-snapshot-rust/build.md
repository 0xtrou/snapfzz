# Build: T12a — ProcessSnapshot + Generalize Budget Crate

## What Was Built
- ProcessSnapshot struct in metrics.rs (name, pid, status, rss_mb, max_memory_mb, etc.)
- ProcessBudget extended: status, started_at, owner fields
- list_snapshots() on SupervisedBudgets — iterates all processes
- snapshot() generalized — populates processes vec, keeps backward-compat agentscope fields
- 3 new tests (list_snapshots, snapshot vec, backward compat)

## Verification
- cargo check: clean
- cargo test -p snapfzz-budget: 41 passed
