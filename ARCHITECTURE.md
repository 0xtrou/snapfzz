# Snapfzz Architecture

Single source of truth for the system architecture. All specs, guides, and docs reference this file — never duplicate architecture diagrams elsewhere.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    src-tauri/src/ — THE ORCHESTRATOR                  │
│                                                                      │
│  main.rs (~100 lines)                                                │
│    ├── Builder config, state management, invoke_handler              │
│    └── setup: runtime env, process spawn, metrics loop               │
│                                                                      │
│  commands/          ← thin Tauri command handlers, delegate to crates│
│    ├── settings.rs    get/save settings                              │
│    ├── vault.rs       vault store/read/delete/list/has               │
│    ├── process.rs     restart/kill/list processes, logs              │
│    ├── budget.rs      snapshot, preset, batch interval, hardware     │
│    ├── stream.rs      send_message, stop, create/load session        │
│    ├── cef.rs         window lifecycle, navigate, devtools, capture  │
│    ├── components.rs  system pack CRUD, download, uninstall          │
│    ├── runtime.rs     runtime check/start/stop/restart               │
│    ├── llm.rs         LiteLLM config, key mgmt, spend tracking      │
│    └── system.rs      health, open_path, pick_folder, preferences   │
│                                                                      │
│  helpers.rs         ← resolve_data_dir, configure_runtime_env        │
│  metrics.rs         ← 2s budget-metrics emission loop                │
└────────┬─────────┬──────────┬──────────┬──────────┬─────────────────┘
         │         │          │          │          │
    ┌────▼───┐ ┌───▼────┐ ┌──▼───┐ ┌───▼───┐ ┌───▼────┐ ┌────────┐
    │snapfzz │ │snapfzz │ │snpfz │ │snpfz  │ │snapfzz │ │snapfzz │
    │kernel  │ │runtime │ │vault │ │packs  │ │stream  │ │llm     │
    └────────┘ └────────┘ └──────┘ └───────┘ └────────┘ └────────┘
```

---

## Crate Responsibilities

| Crate | Owns | Does NOT own |
|---|---|---|
| **snapfzz-kernel** | Boot (preflight + hooks), budget (registry + presets + permits), process (spawn + health + logs + supervisor), settings (schema + load/save), components trait (SystemComponent), shared types | Tauri commands, runtime lifecycle, window management |
| **snapfzz-runtime** | Runtime lifecycle for AgentScope, LiteLLM, CEF. Runtime trait with `is_runtime_ready()`. RuntimeManager orchestration. Health checks. | Component downloads, budget gating, Tauri commands |
| **snapfzz-packs** | System component downloads (uv, Python, CEF, AgentScope, LiteLLM). Implements SystemComponent trait. | Runtime lifecycle, process spawning |
| **snapfzz-stream** | SSE consumer, token batching at `batch_interval_ms`, Channel callback | Tauri Channel type, HTTP client config |
| **snapfzz-vault** | AES-256-GCM encryption, master key (keychain/keyfile), vault file I/O, rate limiting | Tauri commands, plugin access policy |
| **snapfzz-llm** | LiteLLM config.yaml generation, virtual key management (/key/* proxy), spend tracking (/spend/* proxy) | LiteLLM process lifecycle (snapfzz-runtime owns that) |
| **snapfzz-plugin-bridge** | Schema validation, capability checking, typed command routing (Beta) | Plugin discovery, plugin UI rendering |
| **main.rs + commands/** | Tauri command handlers, event emission (`app.emit`), window management, orchestration flow | Domain logic — always delegates to crates |

### The Rule

**main.rs is the orchestrator. Crates do the work.**

- Commands are thin: validate args → delegate to crate → emit event → return result
- Domain logic NEVER lives in commands/
- If a command is >10 lines, the logic should move to a crate

### Dependency Graph (no cycles)

```
snapfzz-kernel ← snapfzz-packs (uses SystemComponent trait)
snapfzz-kernel ← snapfzz-runtime (uses ProcessManager, BudgetRegistry)
snapfzz-runtime ← snapfzz-packs (checks if components installed before starting)
snapfzz-runtime ← snapfzz-llm (LiteLLM runtime uses llm config)
```

---

## Runtime Directory

All managed binaries, processes, and packages live under `~/.snapfzz/runtime/`:

```
~/.snapfzz/
├── settings.json              user settings
├── vault.enc                  encrypted secrets
├── runtime/
│   ├── bin/                   managed binaries (on PATH)
│   │   ├── uv                 uv binary (~15MB)
│   │   └── python/            Python 3.12 (managed by uv, ~30MB)
│   ├── processes/             runtime process CWDs
│   │   ├── agentscope/        AgentScope CWD (app.py, pyproject.toml)
│   │   ├── litellm/           LiteLLM CWD (config.yaml lives here)
│   │   └── cef/               CEF extracted binary + browser cache
│   └── packages/              pip-installed packages
│       ├── agentscope/        agentscope pip packages
│       └── litellm/           litellm[proxy] pip packages
```

### Runtime Env Vars (set at boot, before any process spawning)

```rust
PATH = ~/.snapfzz/runtime/bin:~/.snapfzz/runtime/bin/python:$PATH
UV_PYTHON_INSTALL_DIR = ~/.snapfzz/runtime/bin/python
SNAPFZZ_RUNTIME_DIR = ~/.snapfzz/runtime
SNAPFZZ_BIN_DIR = ~/.snapfzz/runtime/bin
SNAPFZZ_PROCESSES_DIR = ~/.snapfzz/runtime/processes
```

### Process CWD Convention

Every spawned process runs with CWD set to its `processes/` subdirectory:

```rust
// AgentScope: CWD = ~/.snapfzz/runtime/processes/agentscope/
Command::new(uv_bin).args(["run", "python", "app.py"])
    .current_dir(runtime_dir.join("processes/agentscope"))

// LiteLLM: CWD = ~/.snapfzz/runtime/processes/litellm/
Command::new(uv_bin).args(["run", "litellm", "--config", "config.yaml", "--port", "4000"])
    .current_dir(runtime_dir.join("processes/litellm"))

// CEF: in-process, install dir = ~/.snapfzz/runtime/processes/cef/
CefRuntime::new(runtime_dir.join("processes/cef"))
```

No process runs outside `~/.snapfzz/runtime/`. No process uses system-wide binaries.

---

## Three Zones

```
Zone 1 (Rust — tokio async)           Zone 3 (Main thread — React)
┌─────────────────────────┐           ┌─────────────────────────┐
│ SSE parsing + batching  │           │ React rendering only    │
│ Runtime management      │           │ No computation          │
│ Health monitoring       │──emit()──→│ useAppSettings          │
│ Budget enforcement      │           │ Plugin components       │
│ Vault encryption        │←invoke()──│ TauriBridge (cached)    │
│ LLM config generation   │           │ ConfirmAction, AppButton│
│ Component downloads     │           │ SystemComponentCard     │
└─────────────────────────┘           └─────────────────────────┘

Zone 2 (Web Workers — future Beta scope)
  Shiki syntax highlighting, state mutations, plugin sandboxing
```

---

## Boot Sequence (A012)

```
main()
  ├── resolve_data_dir()                     ~/.snapfzz/
  ├── configure_runtime_env(runtime_dir)     set PATH, UV_PYTHON_INSTALL_DIR
  ├── PreflightService::new(data_dir)
  ├── run_sync()                              < 100ms
  │   ├── Phase 1: filesystem                 create ~/.snapfzz/*
  │   ├── Phase 2: vault                      master key + vault.enc
  │   ├── Phase 3: settings                   load settings.json
  │   └── Phase 4: budget                     BudgetRegistry from preset
  ├── manage(registry, vault, process_mgr, settings_mgr)
  ├── manage(component_registry)              system packs
  ├── manage(runtime_manager)                 runtime lifecycle
  ├── .setup()
  │   ├── runtime_manager.start_installed()   start AgentScope, LiteLLM if packs ready
  │   └── metrics::run_metrics_loop()
  └── .run()
```

---

## Runtime Lifecycle (A016)

```
RuntimeManager
  ├── AgentScope   port 8090  health: /health
  ├── LiteLLM      port 4000  health: /health/liveliness
  └── CEF          in-process  health: binary check

Each runtime implements:
  is_runtime_ready() → ReadinessCheck
    ├── binary_installed: bool    (pack downloaded?)
    ├── binary_version: String    (not corrupted?)
    ├── process_running: bool     (PID alive?)
    ├── health_ok: bool           (HTTP health 2xx?)
    └── status: NotInstalled | Installed | Starting | Online | Degraded | Error

Used by:
  - Diagnostics plugin (System Health Check)
  - System Packs plugin (install status + runtime readiness)
  - Boot sequence (start_installed skips uninstalled runtimes)
```

---

## LLM Gateway (A013)

```
LiteLLM Proxy (managed child process, port 4000)
  CWD: ~/.snapfzz/runtime/processes/litellm/
  Config: ~/.snapfzz/runtime/processes/litellm/config.yaml
  ├── /v1/chat/completions     OpenAI-compatible
  ├── /v1/messages             Anthropic-compatible
  ├── /v1/models               model discovery
  ├── /key/*                   virtual key management
  ├── /spend/*                 spend tracking
  ├── /metrics                 Prometheus metrics
  └── /health/liveliness       health check

snapfzz-llm crate (thin proxy):
  ├── config.rs    generate config.yaml → runtime/processes/litellm/
  ├── keys.rs      proxy /key/* API calls
  └── spend.rs     proxy /spend/* API calls

Config flow:
  User settings → GatewayConfig → processes/litellm/config.yaml → LiteLLM reads it
  Provider API keys: vault → env vars → LiteLLM process
```

---

## Settings Propagation

```
Plugin saves → commands::settings::save_settings
  → SettingsManager.save()
  → app.emit("settings-changed")           ALL webviews
  → window.dispatchEvent("snapfzz:settings-changed")  same window

useAppSettings() listens for both
  → bridge.invoke('get_settings')           fresh read from Rust
  → applyDomSettings()                      theme + font + size
```

---

## IPC Pattern

```
Frontend → Rust:  createTauriBridge() → bridge.invoke<T>('command', args)
Rust → Frontend:  app.emit("event-name", payload) → bridge.listen('event-name', handler)
```

- Single `createTauriBridge()` from `@snapfzz/shared` — no raw `__TAURI_INTERNALS__`
- Cached lazy imports — first call pays, rest instant
- All plugins use `AppButton` from `@snapfzz/shared` — no raw Ant Design `Button`
- All confirmations use `ConfirmAction` from `@snapfzz/shared`

---

## Frontend Packages

| Package | Role |
|---|---|
| `@snapfzz/shared` | Theme, hooks (useAppSettings), TauriBridge, EventBus, AppButton, ConfirmAction, SettingsHeader, WindowShell, StatusBar |
| `@snapfzz/plugin-sdk` | definePlugin(), contribution types — stable contract, additive only |
| `@snapfzz/plugin-host` | Plugin discovery, ContributionStore, lazy loading, crash supervision |
| `@snapfzz/launcher` | Thin shell — project list + mini app bookmarks |
| `@snapfzz/project` | Thin shell — chat + panels + future CEF preview |
| `@snapfzz/preferences` | Thin shell — sidebar + settings sections from plugins |

---

## Settings Plugins

| Plugin | Icon | Order | What |
|---|---|---|---|
| `settings-general` | SettingOutlined | 10 | Theme, font, AgentScope host/port |
| `settings-llm-providers` | ApiOutlined | 25 | LLM providers, keys, routing, audit |
| `settings-performance` | DashboardOutlined | 30 | Preset selector, batch interval |
| `settings-processes` | SearchOutlined | 40 | Process list, logs, restart/kill |
| `settings-vault` | LockOutlined | 50 | Secret vault, stored secrets |
| `settings-components` | AppstoreOutlined | 55 | System packs install/uninstall |
| `settings-diagnostics` | MedicineBoxOutlined | 60 | Health checks, hardware info |
| `settings-plugins` | AppstoreOutlined | 70 | Plugin management |
| `settings-advanced` | ToolOutlined | 99 | Data directory, debug |

---

## Plugin Sandbox (A005)

```
~/.snapfzz/plugins/{id}/
  ├── manifest.json        validated on install (Zod)
  ├── dist/                read-only JS bundle
  ├── data/                plugin's namespaced storage
  ├── cache/               expendable temp files
  └── permissions.json     user-approved capabilities (approve once)

Rules:
  CWD locked to plugin dir — no ../escape
  Vault commands BLOCKED — plugins build their own encryption
  System settings BLOCKED — plugins use ctx.settings (namespaced)
  Network CSP per allowedOrigins (V1)
  Max 3 concurrent mini app processes per plugin
```

---

## Budget System (A008)

```
BudgetRegistry (snapfzz-kernel/budget/)
  ├── Controlled domain (in-process, semaphore-gated)
  │   ├── CPU permits          2/4/80% of cores by preset
  │   ├── Invoke concurrency   per-plugin invoke limits
  │   ├── Batch interval       16ms/33ms for SSE batching
  │   └── Plugin strikes       3-strike auto-disable
  │
  └── Supervised domain (cross-process, observe+kill)
      ├── Process memory       RSS monitoring, kill on exceed
      ├── Process health       HTTP polling, restart on failure
      └── Storage              disk usage monitoring

Presets: Performance (80% hardware) / Balanced / Battery
```

---

## Spec Index

All specs live in `docs/plans/` and `docs/ui-specs/`. They reference this file for architecture context.

| Spec | Title | Scope |
|---|---|---|
| A001 | Performance Architecture | 60fps, GPU-only animations, CSS containment |
| A002 | State Management | Three zones, batch interval budget |
| A003 | Instant Loading | <200ms visible, <500ms interactive |
| A004 | Workspace Architecture | ~/.snapfzz/ folder-first |
| A005 | Plugin Architecture | Sandbox, capabilities, security layers |
| A006 | Core Runtime | Plugin host, shell layout, Rust IPC |
| A007 | Multi-Layout Architecture | Separate windows, settingsSections |
| A008 | Budget Registry | Controlled + supervised, presets, 80% scaling |
| A011 | Secret Vault | AES-256-GCM, keychain, rate limiting |
| A012 | Preflight Service | 4-phase boot, hookable lifecycle |
| A013 | LLM Providers | LiteLLM gateway, config gen, key/spend proxy |
| A014 | Kernel Architecture | Crate separation, main.rs orchestrator |
| A015 | Mini App Runtime | CEF, full-stack plugin apps, bookmarks |
| A016 | Runtime Architecture | Runtime trait, RuntimeManager, is_runtime_ready |
| U001-U010 | UI Specs | Navigation, responsive, design system, etc. |
| U011 | Vault Settings | Vault management UI |
