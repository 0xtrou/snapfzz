# T25 kernel refactor — process/settings extraction

## Scope completed
- Filled `src-tauri/crates/snapfzz-kernel/src/process/*` with extracted process management primitives:
  - `RuntimeState` in `process/runtime.rs`
  - `ProcessLogs` ring buffer + file persistence in `process/logs.rs`
  - `ProcessManager`, `SpawnConfig`, pid helpers, spawn/shutdown/restart/kill logic in `process/mod.rs`
  - health polling helpers in `process/health.rs`
  - restart/memory-limit helpers in `process/supervisor.rs`
- Filled `src-tauri/crates/snapfzz-kernel/src/settings/*` with extracted settings schema and file I/O:
  - `Settings` schema/defaults in `settings/schema.rs`
  - `SettingsManager`, `settings_path`, and load/save logic in `settings/mod.rs`
- Copied shared types from `snapfzz-core` into `kernel/src/types.rs`:
  - `PluginManifest`
  - `HostSurface`
  - `BusMessage`
- Added `snapfzz-kernel` to the Cargo workspace and linked `snapfzz-budget` as a dependency so kernel compiles independently.

## Constraints honored
- Did not edit `src-tauri/src/main.rs`
- Did not import `tauri` into `snapfzz-kernel`
- Did not touch `snapfzz-stream/*`
- Did not create new source files under `snapfzz-kernel/src/`; only filled existing stub files
- `ProcessManager` returns `Result` values and does not emit Tauri events
- `SettingsManager` handles file I/O only

## Tests added
- `process::logs::tests::a014_process_logs_ring_buffer_keeps_last_n_lines`
- `process::logs::tests::a014_process_logs_clear_removes_process_lines`
- `settings::tests::a014_settings_load_returns_defaults_when_file_missing`
- `settings::tests::a014_settings_save_and_load_round_trip`
- `settings::tests::a014_settings_path_points_to_settings_json`

## Verification
- `cd src-tauri && cargo check -p snapfzz-kernel` ✅
- `cd src-tauri && cargo test -p snapfzz-kernel --lib` ✅
- LSP diagnostics on changed Rust files: clean (only inactive-code hints on platform-gated branches in `process/mod.rs`)

## Notes for wiring agent
- `ProcessManager::spawn()` now requires caller-provided `SpawnConfig { host, port, working_dir }`
- `ProcessManager` defaults to `.snapfzz/runtime/<name>/<name>.pid` and matching log paths via `ProcessLogs`
- `HostSurface` in kernel currently mirrors `snapfzz-core` (`Launcher | Project`); user request mentioned a minimal `String` fallback only if core was effectively empty, which was not needed because `manifest.rs`/`bus.rs` contain real types
