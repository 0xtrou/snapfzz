# Snapfzz Architecture

Single source of truth for the system architecture. All specs, guides, and docs reference this file — never duplicate architecture diagrams elsewhere.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    src-tauri/src/ — THE ORCHESTRATOR                  │
│                                                                      │
│  main.rs (236 lines)                                                 │
│    ├── Builder config, state management, invoke_handler (95 cmds)    │
│    └── setup: boot phases, metrics loop                              │
│                                                                      │
│  boot.rs (155 lines)                                                 │
│    └── Three-phase async bootstrap (Python → PostgreSQL → Services)  │
│                                                                      │
│  commands/          ← thin Tauri command handlers, delegate to crates│
│    ├── settings.rs    get/save settings                              │
│    ├── vault.rs       vault store/read/delete/list/has               │
│    ├── process.rs     restart/kill/list processes, logs              │
│    ├── budget.rs      snapshot, preset, batch interval, hardware     │
│    ├── stream.rs      send_message, stop, create/load session        │
│    ├── cef.rs         window lifecycle, navigate, devtools, capture  │
│    ├── components.rs  system pack CRUD, download, uninstall          │
│    ├── llm.rs         LiteLLM config, key mgmt, spend tracking      │
│    ├── pip.rs         python pack install/uninstall, runtime status  │
│    └── system.rs      health, open_path, pick_folder, preferences   │
│                                                                      │
│  factories/         ← ProcessFactory impls for managed services      │
│    ├── agentscope.rs  AgentScope process factory                     │
│    └── litellm.rs     LiteLLM process factory (prisma cache, DB URL)│
│                                                                      │
│  helpers.rs         ← resolve_data_dir, configure_runtime_env        │
│  metrics.rs         ← 2s budget-metrics emission loop                │
└────────┬─────────┬──────────┬──────────┬──────────┬─────────────────┘
         │         │          │          │          │
    ┌────▼───┐ ┌───▼────┐ ┌──▼───┐ ┌───▼───┐ ┌───▼────┐ ┌────────┐
    │snapfzz │ │snapfzz │ │snpfz │ │snpfz  │ │snapfzz │ │snapfzz │
    │kernel  │ │packs   │ │vault │ │stream │ │llm     │ │cef     │
    └────────┘ └────────┘ └──────┘ └───────┘ └────────┘ └────────┘
```

---

## Crate Responsibilities

| Crate | Owns | Does NOT own |
|---|---|---|
| **snapfzz-kernel** | Boot (preflight + hooks), budget (registry + presets + permits), process (spawn + health + logs + supervisor), settings (schema + load/save), shared types | Tauri commands, runtime lifecycle, window management |
| **snapfzz-packs** | Service pack architecture: `core/` (traits, DTOs, Python toolchain, PostgreSQL infra), `litellm/` (LiteLLM service), `agentscope/` (AgentScope service). Implements SystemComponent + ManagedService traits. | Process spawning, budget gating, Tauri commands |
| **snapfzz-stream** | SSE consumer, token batching at `batch_interval_ms`, Channel callback | Tauri Channel type, HTTP client config |
| **snapfzz-vault** | AES-256-GCM encryption, master key (keychain/keyfile), vault file I/O, rate limiting | Tauri commands, plugin access policy |
| **snapfzz-llm** | LiteLLM config.yaml generation, virtual key management (/key/* proxy), spend tracking (/spend/* proxy) | LiteLLM process lifecycle |
| **snapfzz-cef** | CEF binary download, runtime lifecycle, window management, CDP automation | Tauri commands |
| **snapfzz-plugin-bridge** | Schema validation, capability checking, typed command routing (Beta) | Plugin discovery, plugin UI rendering |
| **main.rs + commands/** | Tauri command handlers, event emission (`app.emit`), window management, orchestration flow | Domain logic — always delegates to crates |

### The Rule

**main.rs is the orchestrator. Crates do the work.**

- Commands are thin: validate args → delegate to crate → emit event → return result
- Domain logic NEVER lives in commands/
- If a command is >10 lines, the logic should move to a crate

### Dependency Graph (no cycles)

```
snapfzz-kernel ← snapfzz-packs (uses PythonRuntime, ManagedService)
snapfzz-kernel (standalone — no deps on packs, llm, cef, vault)
snapfzz-packs  (standalone — no deps on kernel, llm, cef, vault)
snapfzz-llm    (standalone — no inter-crate deps)
snapfzz-stream (standalone — no inter-crate deps)
snapfzz-vault  (standalone — no inter-crate deps)
snapfzz-cef    (standalone — no inter-crate deps)

main.rs imports ALL crates; crates never import each other
(except kernel ← packs for PythonRuntime type)
```

---

## snapfzz-packs — Vertical Domain Slices

```
snapfzz-packs/src/
├── core/                        ← THE STANDARD INTERFACE
│   ├── component.rs               SystemComponent trait (downloadable artifacts)
│   ├── service.rs                 ManagedService trait (spawnable services)
│   ├── status.rs                  RuntimeStatus DTOs
│   ├── registry.rs                ComponentRegistry
│   ├── data.rs                    DataDir (filesystem layout helper)
│   ├── download.rs                download_file, extract helpers
│   ├── platform.rs                PlatformInfo, detect_platform
│   ├── constants.rs               versions, URLs
│   ├── python/                  ← Python toolchain infrastructure
│   │   ├── runtime.rs              PythonRuntime (venv, pip, packages)
│   │   ├── downloader.rs           PythonDownloader (SystemComponent)
│   │   └── uv.rs                   UvDownloader (SystemComponent)
│   └── postgresql/              ← PostgreSQL infrastructure
│       └── runtime.rs              PostgresRuntime (embedded PG lifecycle)
│
├── litellm/                     ← LiteLLM service pack
│   └── service.rs                 LiteLLMService (implements ManagedService)
│
├── agentscope/                  ← AgentScope service pack
│   └── service.rs                 AgentScopeService (implements ManagedService)
│
└── lib.rs                       ← re-exports + backward-compat shim modules
```

**Adding a new service pack:**
1. Create `snapfzz-packs/src/{name}/`
2. Implement `core::ManagedService`
3. Register in `lib.rs`

Core defines contracts; service packs implement them. Dependency flows one way: packs → core, never core → pack.

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

## Boot Sequence (A012 + A039)

### Sync Phase (<25ms)

```
main()
  ├── cleanup_all_orphan_processes()     kill stale PIDs from prior crash
  ├── PreflightService::run_sync()       < 25ms
  │   ├── Phase 1: filesystem            create ~/.snapfzz/*
  │   ├── Phase 2: vault                 master key + vault.enc
  │   ├── Phase 3: settings              load settings.json
  │   └── Phase 4: budget                BudgetRegistry from preset
  ├── manage(registry, vault, process_mgr, settings_mgr, ...)
  └── .setup()
      ├── boot::spawn_boot_phases()      fire-and-forget (async)
      └── metrics::run_metrics_loop()    2s emission loop
```

### Async Phase (A039 — three independent tasks)

```
Phase 1: Python Runtime                 Phase 2: PostgreSQL
  ├── is_runtime_ready()?                 ├── cleanup stale postmaster.pid
  │   yes → skip                          ├── pg.setup() (idempotent)
  │   no →                                ├── pg.start()
  │     ├── download uv                   ├── pg.create_database("litellm")
  │     ├── download Python               └── send URL via watch channel
  │     └── pip install all packages        └── notify pg_ready
  └── notify python_ready
                    │                                    │
                    └──────────┬─────────────────────────┘
                               ▼
                    Phase 3: Service Spawn
                      ├── wait python_ready + pg_ready
                      ├── set_database_url from watch channel
                      ├── spawn_all() (concurrent via tokio::spawn)
                      │   ├── LiteLLM: prisma cache check → spawn
                      │   └── AgentScope: can_start()=false → skip
                      └── emit supervisor events per service
```

**Performance (A039):**
- Prisma schema cached — skip `generate` + `db push` on warm boot (saves 4-8s)
- Health polls every 250ms (not 1s) — service detected healthy in <1s
- Services spawn concurrently via `tokio::spawn` — scales with service count
- Warm boot: ~3-5s (PG start dominates)

---

## Runtime Lifecycle (A016)

```
ProcessFactoryRegistry
  ├── LiteLLM      port dynamic  health: /health/liveliness
  ├── AgentScope    port dynamic  health: /health (disabled)
  └── PostgreSQL    port dynamic  managed by postgresql_embedded

Each service implements ProcessFactory:
  can_start()       → readiness check
  pre_run_setup()   → prisma, migrations, etc.
  build_command()   → tokio::process::Command
  health_path()     → HTTP health endpoint
  resource_limits() → max memory, max restarts
```

---

## Runtime Directory

```
~/.snapfzz/
├── settings.json              user settings
├── vault.enc                  encrypted secrets
├── runtime/
│   ├── python/
│   │   ├── bin/               uv binary, Python install
│   │   └── venv/              virtual environment (pip packages)
│   └── postgres/              PostgreSQL binaries (postgresql_embedded)
├── data/
│   └── postgres/              PostgreSQL data directory + postmaster.pid
└── processes/
    ├── agentscope/            AgentScope CWD
    └── litellm/               LiteLLM CWD (config.yaml, .prisma_hash)
```

---

## LLM Gateway (A013)

```
LiteLLM Proxy (managed child process, dynamic port)
  CWD: ~/.snapfzz/processes/litellm/
  Config: ~/.snapfzz/processes/litellm/config.yaml
  Database: PostgreSQL (embedded, connection via DATABASE_URL)
  ├── /v1/chat/completions     OpenAI-compatible
  ├── /v1/messages             Anthropic-compatible
  ├── /v1/models               model discovery
  ├── /key/*                   virtual key management
  ├── /spend/*                 spend tracking
  ├── /metrics                 Prometheus metrics
  └── /health/liveliness       health check

snapfzz-llm crate (thin proxy):
  ├── config.rs    generate config.yaml
  ├── keys.rs      proxy /key/* API calls
  └── spend.rs     proxy /spend/* API calls
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
      ├── Process health       HTTP polling (250ms startup, 2-5s ongoing)
      └── Storage              disk usage monitoring

Presets: Performance (80% hardware) / Balanced / Battery
```

---

## Codebase Stats

| Metric | Value |
|---|---|
| Total Rust LOC | ~21,000 |
| Total Tests | 462+ |
| Crates | 8 |
| Tauri Commands | 95 |
| main.rs | 236 lines |

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
| A017 | MicroVM Sandbox | SandboxBackend trait, FirecrackerPack, MicrovmRuntime lifecycle |
| A018 | Packs Refactoring | Vertical domain slices, core/ + service packs |
| A039 | Phased Boot | Parallel async boot, prisma cache, fast health poll |
| U001-U010 | UI Specs | Navigation, responsive, design system, etc. |
| U011 | Vault Settings | Vault management UI |
