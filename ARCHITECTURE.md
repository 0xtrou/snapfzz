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
│    └── setup: menus, process spawn, metrics loop                     │
│                                                                      │
│  commands/          ← thin Tauri command handlers, delegate to crates│
│    ├── settings.rs    get/save settings                              │
│    ├── vault.rs       vault store/read/delete/list/has               │
│    ├── process.rs     restart/kill/list processes, logs              │
│    ├── budget.rs      snapshot, preset, batch interval, hardware     │
│    ├── stream.rs      send_message, stop, create/load session        │
│    ├── cef.rs         window lifecycle, navigate, devtools, capture  │
│    ├── miniapp.rs     open/close mini app, bookmarks                 │
│    └── system.rs      health, open_path, pick_folder, preferences   │
│                                                                      │
│  fonts.rs           ← install/list/remove custom fonts               │
│  menus.rs           ← native window menus                            │
│  metrics.rs         ← 2s budget-metrics emission loop                │
│  helpers.rs         ← resolve_data_dir, spawn config, base URL       │
└────────┬─────────┬──────────┬──────────┬──────────┬─────────────────┘
         │         │          │          │          │
    ┌────▼───┐ ┌───▼────┐ ┌──▼───┐ ┌───▼───┐ ┌───▼────┐
    │snapfzz │ │snapfzz │ │snpfz │ │snpfz  │ │snapfzz │
    │kernel  │ │stream  │ │vault │ │cef    │ │plugin- │
    │        │ │        │ │      │ │       │ │bridge  │
    └────────┘ └────────┘ └──────┘ └───────┘ └────────┘
```

---

## Crate Responsibilities

| Crate | Owns | Does NOT own |
|---|---|---|
| **snapfzz-kernel** | Boot (preflight + hooks), budget (registry + presets + permits), process (spawn + health + logs + supervisor), settings (schema + load/save), plugin_host (lifecycle types), shared types | Tauri commands, window management, event emission |
| **snapfzz-stream** | SSE consumer, token batching at `batch_interval_ms`, Channel callback | Tauri Channel type, HTTP client config |
| **snapfzz-vault** | AES-256-GCM encryption, master key (keychain/keyfile), vault file I/O, rate limiting | Tauri commands, plugin access policy |
| **snapfzz-cef** | CEF runtime (lazy init + download), browser windows, navigation, devtools, capture | Process spawning, budget registration |
| **snapfzz-plugin-bridge** | Schema validation, capability checking, typed command routing (Beta) | Plugin discovery, plugin UI rendering |
| **main.rs + commands/** | Tauri command handlers, event emission (`app.emit`), window management, menus, orchestration flow | Domain logic — always delegates to crates |

### The Rule

**main.rs is the orchestrator. Crates do the work.**

- Commands are thin: validate args → delegate to crate → emit event → return result
- Domain logic (encryption, process management, budget gating, SSE parsing) NEVER lives in commands/
- If a command is >10 lines, the logic should move to a crate

---

## Three Zones

```
Zone 1 (Rust — tokio async)           Zone 3 (Main thread — React)
┌─────────────────────────┐           ┌─────────────────────────┐
│ SSE parsing + batching  │           │ React rendering only    │
│ Process supervision     │           │ No computation          │
│ Health monitoring       │──emit()──→│ useAppSettings          │
│ Budget enforcement      │           │ Plugin components       │
│ Vault encryption        │←invoke()──│ TauriBridge (cached)    │
│ CEF management          │           │ ConfirmAction, AppButton│
└─────────────────────────┘           └─────────────────────────┘

Zone 2 (Web Workers — future Beta scope)
  Shiki syntax highlighting, state mutations, plugin sandboxing
```

---

## Boot Sequence (A012)

```
main()
  ├── PreflightService::new(data_dir)
  ├── register_init(Phase::Vault, VaultInitializer)
  ├── run_sync()                              < 25ms
  │   ├── Phase 1: filesystem                 create ~/.snapfzz/*
  │   ├── Phase 2: vault                      master key + vault.enc
  │   │   └── VaultInitializer hook
  │   ├── Phase 3: settings                   load settings.json
  │   └── Phase 4: budget                     BudgetRegistry from preset
  ├── manage(registry, vault, process_mgr, settings_mgr)
  ├── .setup()
  │   ├── menus::setup_menus()
  │   ├── ProcessManager::spawn("agentscope")
  │   └── metrics::run_metrics_loop()
  └── .run()
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

## CEF Integration (A015)

```
First mini app open:
  CefDownloader → 124MB from Spotify CDN → ~/.snapfzz/runtime/cef/
  CefRuntime::init() → cef_rs::initialize() (~200ms)

Subsequent opens:
  CefRuntime.create_window(url, config) → ~50ms

Window lifecycle:
  Kernel spawns backend → budget gate → health check → CEF window
  Close window → kill process → free budget → deregister

Performance:
  Boot: 0ms CEF impact (lazy loaded)
  Window: <500ms after CEF ready
  Isolation: separate Chromium process per window
  Memory: 256MB per window, enforced by kernel supervisor
  Main thread: zero CEF work
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
| A012 | Preflight Service | 6-phase boot, hookable lifecycle |
| A013 | LLM Providers | Multi-provider, model discovery, usage metering |
| A014 | Kernel Architecture | Crate merge, main.rs orchestrator |
| A015 | Mini App Runtime | CEF, full-stack plugin apps, bookmarks |
| U001-U010 | UI Specs | Navigation, responsive, design system, etc. |
| U011 | Vault Settings | Vault management UI |
