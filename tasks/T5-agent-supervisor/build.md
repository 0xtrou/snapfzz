# Build: T5 — Agent Supervisor

## 5 Questions
1. Which spec? → A005/AgentSupervisor, A002/Zone1
2. Which zone? → Zone 1 — Rust, process supervision
3. Core or plugin? → Core runtime infrastructure
4. Existing pattern? → Replaces inline fire-and-forget spawn in main.rs
5. Test name? → {spec}/{section}: {behavior}

## What Was Built

Full process supervisor for the AgentScope Python process, ~130 LOC added to main.rs:

- `cleanup_stale_pid()` — reads PID file on startup, kills orphans from previous crashes
- `write_pid_file()` / `remove_pid_file()` — PID file lifecycle
- `check_health()` — HTTP GET /health with 2s timeout
- `check_memory()` — sysinfo RSS per PID, kills if > 512MB limit
- `crash_loop_detected()` — N restarts in 5min window → stop retrying
- `spawn_child()` — uv run uvicorn with kill_on_drop(true)
- `graceful_kill()` — kill child + remove PID file
- `supervisor_loop()` — main loop with tokio::select over shutdown/health/memory
- `RunEvent::ExitRequested` hook — cancels supervisor + graceful kill on app exit

## New Dependencies
- `sysinfo = "0.38"` (MIT, 126M downloads) — CPU/memory monitoring
- `tokio-util = "0.7"` — CancellationToken for shutdown coordination
- `libc = "0.2"` (Unix only) — SIGTERM/SIGKILL for orphan cleanup

## Constants
- HEALTH_CHECK_INTERVAL_MS: 2000
- HEALTH_FAILURE_THRESHOLD: 3
- MAX_MEMORY_MB: 512
- MAX_RESTARTS: 10
- BACKOFF_INITIAL_MS: 500
- BACKOFF_MAX_MS: 10000
- CRASH_WINDOW_SECS: 300
- CRASH_LOOP_LIMIT: 5

## Verification
- cargo check: clean (0 warnings, 0 errors)
- 49 plugin-host tests: passing
- All existing tests: passing
