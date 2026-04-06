# Build: T12b — Process Management Tauri Commands

## What Was Built
- ProcessLogs store (DashMap, 1000 line cap, push/tail/clear)
- stdout/stderr piped from spawn_runtime with reader tasks
- 6 new Tauri commands: list_processes, get_process_logs, clear_process_logs, restart_process, kill_process, update_process_config
- Budget-metrics emit loop (2s interval via tokio::spawn)
- 6 new ProcessLogs tests

## Verification
- cargo check: clean
- cargo test --bin Snapfzz: 12 passed
- cargo test -p snapfzz-budget: 41 passed
