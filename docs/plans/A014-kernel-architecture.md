# A014 — Kernel Architecture

Consolidate five stub/scattered crates into `snapfzz-kernel`. main.rs is the orchestrator — it routes, gates, and emits. Crates do the work.

---

## Why

Today, core runtime logic is split between:
- `snapfzz-budget` (1659 lines) — resource gating
- `snapfzz-preflight` (964 lines) — boot phases + hooks
- `snapfzz-core` (31 lines) — stub types
- `snapfzz-agent-supervisor` (1 line) — empty stub
- `snapfzz-stream-pipeline` (1 line) — empty stub
- `snapfzz-tauri-shell` (1 line) — empty stub
- `main.rs` (1520 lines) — everything else

Process management (~300 lines), SSE streaming (~200 lines), settings CRUD (~120 lines) all live in main.rs because there's no proper home for them. Adding A011 Vault and A013 LLM Providers would push main.rs past 2000 lines.

The refactor creates a clean boundary: **main.rs orchestrates, crates execute.**

---

## Architecture

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

This spec defines the kernel consolidation work and orchestrator constraints that implement that architecture.

---

## Merge Plan

### INTO snapfzz-kernel

| Source | Destination | What moves |
|---|---|---|
| `snapfzz-budget/src/*` | `kernel/budget/*` | BudgetRegistry, presets, controlled, supervised, metrics, detect |
| `snapfzz-preflight/src/*` | `kernel/boot/*` | PreflightService, phases, hooks, PreflightContext |
| `snapfzz-core/src/*` | `kernel/types.rs` | PluginManifest, HostSurface, BusMessage |
| `main.rs` process code | `kernel/process/*` | RuntimeState, ProcessLogs, spawn_runtime, shutdown_runtime, health |
| `main.rs` settings code | `kernel/settings/*` | Settings struct, get_settings, save_settings helpers, defaults |

### INTO snapfzz-stream

| Source | Destination | What moves |
|---|---|---|
| `main.rs` SSE code | `stream/sse.rs` | reqwest SSE consumer, ContentBlock parsing |
| `main.rs` batching code | `stream/batch.rs` | Token accumulation, batch_interval_ms flush |
| `main.rs` channel code | `stream/channel.rs` | Tauri Channel<ContentBlockBatch> sending |

### DELETE (merged into kernel)

| Crate | Reason |
|---|---|
| `snapfzz-budget` | → `kernel/budget/` |
| `snapfzz-preflight` | → `kernel/boot/` |
| `snapfzz-core` | → `kernel/types.rs` |
| `snapfzz-agent-supervisor` | → `kernel/process/` (was empty stub) |
| `snapfzz-tauri-shell` | main.rs IS the tauri shell (was empty stub) |
| `snapfzz-stream-pipeline` | → `snapfzz-stream` (was empty stub, renamed) |
| `snapfzz-plugin-host` (Rust) | Delete stub — Beta scope, rebuild when needed |

### KEEP (future crates, not part of this refactor)

| Crate | Status | When |
|---|---|---|
| `snapfzz-vault` | Not yet created | A011 (next task after refactor) |
| `snapfzz-llm` | Not yet created | A013 (after vault) |
| `snapfzz-plugin-bridge` | Keep stub | Beta scope |

---

## snapfzz-kernel Internal Structure

```
src-tauri/crates/snapfzz-kernel/
├── Cargo.toml
└── src/
    ├── lib.rs              # pub mod boot, budget, process, settings, types
    │
    ├── boot/
    │   ├── mod.rs           # PreflightService, run_sync, phase execution
    │   ├── context.rs       # PreflightContext (incremental Option<T> fields)
    │   └── hooks.rs         # OnPreflightInit, OnPreflightReady, Phase enum
    │
    ├── budget/
    │   ├── mod.rs           # BudgetRegistry
    │   ├── controlled.rs    # Semaphores, strikes, invoke permits, CPU permits
    │   ├── supervised.rs    # Process monitoring, storage budget, health checks
    │   ├── preset.rs        # Performance/Balanced/Battery, hardware scaling (80% rule)
    │   ├── metrics.rs       # BudgetMetrics, ProcessSnapshot, ProcessStatus
    │   └── detect.rs        # HardwareInfo from sysinfo
    │
    ├── process/
    │   ├── mod.rs           # ProcessManager (spawn, kill, restart)
    │   ├── runtime.rs       # RuntimeState, child process handle
    │   ├── health.rs        # HTTP health polling
    │   ├── logs.rs          # ProcessLogs ring buffer (append-only, tail query)
    │   └── supervisor.rs    # Enforce loop: RSS monitor, auto-restart, kill
    │
    ├── settings/
    │   ├── mod.rs           # SettingsManager (load, save, merge)
    │   └── schema.rs        # Settings struct, serde, all field defaults
    │
    └── types.rs             # PluginManifest, HostSurface, BusMessage
```

---

## snapfzz-stream Internal Structure

```
src-tauri/crates/snapfzz-stream/
├── Cargo.toml
└── src/
    ├── lib.rs              # pub fn send_and_consume()
    ├── sse.rs              # SSE event source, ContentBlock parsing
    ├── batch.rs            # Token accumulation, interval-gated flush
    └── types.rs            # ContentBlock, ContentBlockBatch, MessageResult
```

---

## main.rs After Refactor (~300 lines)

```rust
use snapfzz_kernel::{
    boot::PreflightService,
    budget::BudgetRegistry,
    process::ProcessManager,
    settings::SettingsManager,
};
use snapfzz_stream::StreamPipeline;

fn main() {
    let data_dir = resolve_data_dir();
    let mut preflight = PreflightService::new(data_dir);
    let result = preflight.run_sync().expect("[kernel] boot failed");

    let process_mgr = ProcessManager::new();
    let settings_mgr = SettingsManager::from(result.settings.clone());

    tauri::Builder::default()
        .manage(result.registry.clone())
        .manage(process_mgr.clone())
        .manage(settings_mgr.clone())
        .invoke_handler(tauri::generate_handler![...])
        .setup(move |app| {
            setup_menus(app)?;
            // Plugin runtimes spawn at plugin activation, not boot — see A020
            boot::spawn_boot_phases(&app.handle(), result.registry.clone());
            start_metrics_loop(app.handle(), result.registry.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Snapfzz");
}
```

Command handlers become thin:

```rust
#[tauri::command]
async fn save_settings(
    app: tauri::AppHandle,
    mgr: State<'_, SettingsManager>,
    settings: serde_json::Value,
) -> Result<(), String> {
    mgr.save(settings).await?;
    let _ = app.emit("settings-changed", ());
    Ok(())
}

#[tauri::command]
async fn restart_process(
    app: tauri::AppHandle,
    name: String,
    process_mgr: State<'_, ProcessManager>,
    registry: State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    process_mgr.restart(&name, &app, &registry).await
}
```

---

## What Does NOT Move

These stay in main.rs because they need `tauri::AppHandle`:

- `app.emit()` calls — event emission is the orchestrator's job
- `setup_menus()` — UI concern, needs `App` reference
- `open_preferences()` — creates Tauri WebviewWindow
- `pick_folder()` — uses Tauri dialog API
- Font commands — use `resolve_data_dir()` which is main.rs's bootstrap anchor

---

## Test Migration

All existing tests move with their source code:

| Current test location | New location |
|---|---|
| `snapfzz-budget/src/*_test.rs` (61 tests) | `snapfzz-kernel/src/budget/*_test.rs` |
| `snapfzz-preflight/src/lib.rs` tests (22 tests) | `snapfzz-kernel/src/boot/mod.rs` tests |
| `main.rs` tests (20 tests) | Split: process tests → kernel, stream tests → stream, remaining → main.rs |

Total: 103 Rust tests must pass after migration. Zero test deletions.

---

## Dependency Graph

```
main.rs
  ├── snapfzz-kernel
  ├── snapfzz-stream
  ├── tauri
  ├── reqwest (for font URL download — stays in main.rs)
  └── serde_json

snapfzz-kernel
  ├── serde / serde_json
  ├── tokio
  ├── sysinfo
  ├── dashmap
  ├── reqwest (health checks in process/)
  ├── dirs (home dir)
  └── tempfile (dev-dependency, tests)

snapfzz-stream
  ├── reqwest + reqwest-eventsource
  ├── serde / serde_json
  ├── tokio
  └── tauri (for Channel type — or abstract with trait)
```

---

## Verification Criteria

```
1. cargo check — 0 warnings, 0 errors
2. cargo test — all 103+ Rust tests pass
3. cargo test -p snapfzz-kernel --lib — budget + boot + process + settings tests pass
4. cargo test -p snapfzz-stream --lib — SSE + batching tests pass
5. cd frontend && CI=true npx vitest run — 75 tests pass
6. All 5 plugin test suites pass
7. main.rs < 400 lines
8. No remaining references to deleted crate names in Cargo.toml workspace members
9. grep -rn "snapfzz_budget\|snapfzz_preflight\|snapfzz_core" src-tauri/src/ — 0 results
   (all imports now use snapfzz_kernel::*)
10. cargo tauri dev — app boots and functions identically
```

---

## Hard Rules

- Zero behavior changes — pure structural refactor
- All existing tests move, none deleted
- main.rs is the orchestrator — crates never import tauri directly (except snapfzz-stream if Channel is needed)
- No new features in this refactor — A011/A013 come after
- Preflight hooks (OnPreflightInit, OnPreflightReady) preserved exactly as-is
- BudgetRegistry API unchanged — all public methods stay identical
- Settings struct unchanged — serde schema backward-compatible
