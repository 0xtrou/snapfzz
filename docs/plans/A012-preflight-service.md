# A012 — Preflight Service

Consolidated boot-time initialization service. Every system prerequisite runs here — once, in order, before the first window opens.

---

## Why

Today, boot-time initialization is scattered across `main.rs`:
- `resolve_data_dir()` — creates `~/.snapfzz/` if missing
- `spawn_runtime()` — spawns AgentScope process, registers with BudgetRegistry
- `settings_path()` — implicitly creates parent dirs on first `save_settings`
- Font loading, metrics loop, menu setup — all inline in `.setup()`

Adding Secret Vault (A011) and LLM Providers (A013) means more boot-time work: generate master key, initialize vault, migrate plaintext secrets, validate provider configs. Scattering these across `main.rs` is unsustainable.

The Preflight Service consolidates ALL first-boot and every-boot initialization into a single, ordered, observable pipeline.

---

## Architecture

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Preflight remains a phased pipeline (filesystem → vault → settings → budget) before window open, with async services started after setup.

### Phase Guarantees

- **Phases 1-4** are synchronous and MUST complete before the first window opens. Total budget: <25ms.
- **Phase 5-6** are async — spawned as background tasks. The window opens immediately; AgentScope may still be starting.
- Each phase emits structured log: `[preflight] Phase {n}: {name} — {duration}ms`
- Any phase failure is logged but non-fatal (app continues in degraded mode) except Phase 1 (filesystem) which is fatal.

### Hookable Lifecycle

Inspired by NestJS `OnModuleInit` / `OnApplicationBootstrap`. Sync phases can register hooks that run at specific lifecycle points. This allows crates to participate in boot without coupling to `PreflightService` internals.

Two hook types (sync only — async work belongs in Zone 1 via `tokio::spawn` in `main.rs .setup()`):

```rust
/// Runs during a specific sync phase (1-4).
/// Similar to NestJS OnModuleInit — called during the phase that owns the component.
pub trait OnPreflightInit: Send + Sync {
    fn on_preflight_init(&self, ctx: &mut PreflightContext) -> Result<(), PreflightError>;
}

/// Runs after all sync phases complete, before window opens.
/// Similar to NestJS OnApplicationBootstrap.
pub trait OnPreflightReady: Send + Sync {
    fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError>;
}

pub struct PreflightContext {
    pub data_dir: PathBuf,
    settings: Option<PreflightSettings>,
    registry: Option<Arc<BudgetRegistry>>,
}
```

**No `OnPreflightAsync` hook.** Async background services (process spawning, metrics loop, pricing refresh) need `tauri::AppHandle` which is only available in `.setup()`. These stay explicitly wired in `main.rs` where they have Tauri runtime access. The preflight crate doesn't know about Tauri — this is the correct boundary.

```
Preflight hooks (sync, crate-level, no Tauri dependency):
  OnPreflightInit(Phase)   ← vault init, token generation, settings migration
  OnPreflightReady         ← cross-phase validation, boot logging

Zone 1 async work (main.rs .setup, has AppHandle):
  spawn_runtime()          ← needs app.emit("agent-status")
  run_metrics_loop()       ← needs app.emit("budget-metrics")
```

**Registration**: components register hooks via `PreflightService::register_init()` / `register_ready()` before `run_sync()`.

```rust
let mut preflight = PreflightService::new(data_dir);
preflight.register_init(Phase::Vault, Box::new(vault_initializer));
preflight.register_ready(Box::new(boot_logger));
let result = preflight.run_sync()?;
```

**Execution order**: within a phase, hooks run in registration order. Cross-phase order is guaranteed by phase numbering. Hooks run AFTER the built-in phase logic.

### Process Auth Tokens

Phase 2 generates per-process auth tokens. These tokens secure IPC between the Rust supervisor and spawned processes.

Tokens are **ephemeral** — held in-process memory only, regenerated every boot. Never persisted to disk or vault (no need — they're only valid for the lifetime of the process).

```rust
pub struct ProcessTokens {
    tokens: HashMap<String, String>,  // process name → hex token
}

impl ProcessTokens {
    pub fn generate(name: &str) -> String {
        let bytes: [u8; 32] = rand::thread_rng().gen();
        hex::encode(bytes)
    }
}
```

Stored in `PreflightResult` and registered as Tauri managed state.

**Flow**:
1. Phase 2: `process_tokens.insert("agentscope", generate_token())`
2. Phase 5: `spawn_runtime()` reads token, passes as `SNAPFZZ_AUTH_TOKEN` env var
3. Python `app.py` reads `SNAPFZZ_AUTH_TOKEN`, adds Starlette middleware that checks `Authorization: Bearer {token}` using `secrets.compare_digest()` (timing-attack safe)
4. All Rust HTTP calls to AgentScope include `Authorization: Bearer {token}` header
5. On restart: new token generated, old one dies with the old process

This ensures only the Snapfzz supervisor can access the AgentScope API, even on localhost. `127.0.0.1` binding blocks remote access; the token blocks local unauthorized access.

---

## Rust Crate

`src-tauri/crates/snapfzz-preflight/`

```rust
pub struct PreflightResult {
    pub vault: SecretVault,
    pub settings: Settings,
    pub registry: Arc<BudgetRegistry>,
    pub durations: Vec<PhaseTiming>,
}

pub struct PhaseTiming {
    pub phase: u8,
    pub name: &'static str,
    pub duration_ms: u64,
    pub status: PhaseStatus,
}

pub enum PhaseStatus {
    Ok,
    Degraded(String),  // non-fatal warning
    Failed(String),    // phase could not complete
}

pub struct PreflightService {
    data_dir: PathBuf,
}

impl PreflightService {
    pub fn new(data_dir: PathBuf) -> Self;

    /// Run all synchronous phases (1-4). Called in Tauri .setup().
    pub fn run_sync(&self) -> Result<PreflightResult, PreflightError>;

    /// Run async phases (5-6). Called after .setup() returns.
    pub async fn run_async(
        &self,
        app: tauri::AppHandle,
        result: &PreflightResult,
    ) -> Result<(), PreflightError>;
}
```

### Phase 1: Filesystem

```rust
fn phase_filesystem(&self) -> Result<PhaseTiming, PreflightError> {
    let dirs = [
        self.data_dir.clone(),
        self.data_dir.join("runtime"),
        self.data_dir.join("runtime/agentscope"),
        self.data_dir.join("fonts"),
        self.data_dir.join("usage"),
    ];
    for dir in &dirs {
        fs::create_dir_all(dir)?;
    }
    Ok(...)
}
```

### Phase 2: Secret Vault

```rust
fn phase_vault(&self) -> Result<(SecretVault, PhaseTiming), PreflightError> {
    // 1. Try OS keychain
    let master_key = match keyring::Entry::new("snapfzz", "vault-master") {
        Ok(entry) => match entry.get_secret() {
            Ok(bytes) if bytes.len() == 32 => bytes.try_into().unwrap(),
            _ => {
                // Generate new key, store in keychain
                let key = generate_random_key();
                let _ = entry.set_secret(&key);
                key
            }
        },
        Err(_) => {
            // Keychain unavailable — use file
            let key_path = self.data_dir.join("vault.key");
            if key_path.exists() {
                read_key_file(&key_path)?
            } else {
                let key = generate_random_key();
                write_key_file(&key_path, &key)?;  // 0o600 permissions
                key
            }
        }
    };

    let vault = SecretVault::open(&master_key, self.data_dir.join("vault.enc"))?;
    Ok((vault, ...))
}
```

### Phase 2b: Migration (one-time)

```rust
fn migrate_plaintext_secrets(
    vault: &mut SecretVault,
    settings: &mut Settings,
) -> Result<u32, VaultError> {
    let mut migrated = 0;

    if !settings.api_key.is_empty() {
        vault.store("provider:legacy:apiKey", settings.api_key.as_bytes())?;
        settings.api_key = String::new();
        migrated += 1;
    }

    Ok(migrated)
}
```

### Phase 3: Settings

```rust
fn phase_settings(&self) -> Result<(Settings, PhaseTiming), PreflightError> {
    let path = self.data_dir.join("settings.json");
    let settings = if path.exists() {
        let content = fs::read_to_string(&path)?;
        serde_json::from_str::<Settings>(&content).unwrap_or_default()
    } else {
        Settings::default()
    };
    Ok((settings, ...))
}
```

### Phase 4: Budget Registry

Moves the existing `detect_hardware → select_preset → build_preset → BudgetRegistry::new()` chain from `main()` into the preflight service.

### Phase 5: Supervised Processes

Moves `spawn_runtime()` into preflight. Reads `agentscope_host` and `agentscope_port` from settings.

### Phase 6: Background Services

Moves the metrics loop into preflight. Future: pricing database refresh (A013), usage aggregation.

---

## Integration with main.rs

Before (current):
```rust
fn main() {
    let hw = detect_hardware();
    let preset_name = select_preset(&hw);
    let preset = build_preset(preset_name, &hw);
    let registry = Arc::new(BudgetRegistry::new(preset, hw));
    // ... 200 lines of setup scattered across .setup() ...
}
```

After:
```rust
fn main() {
    let data_dir = resolve_data_dir();
    let preflight = PreflightService::new(data_dir);

    let result = preflight.run_sync()
        .expect("[preflight] fatal: filesystem initialization failed");

    tauri::Builder::default()
        .manage(result.registry.clone())
        .manage(Mutex::new(result.vault))
        .manage(result.settings)
        .setup(move |app| {
            let handle = app.handle().clone();
            // Menu setup (stays here — it's UI, not preflight)
            setup_menus(app)?;

            // Async phases
            tauri::async_runtime::spawn(async move {
                preflight.run_async(handle, &result).await;
            });

            Ok(())
        })
        // ...
}
```

### What Stays in main.rs

- Tauri Builder configuration (invoke handler, window creation)
- Menu setup (UI concern, not initialization)
- RunEvent handler (shutdown)

### What Moves to PreflightService

- `resolve_data_dir()` / `snapfzz_home()` — Phase 1
- Master key generation — Phase 2 (new)
- SecretVault initialization — Phase 2 (new)
- `Settings` loading — Phase 3
- `BudgetRegistry` construction — Phase 4
- `spawn_runtime()` — Phase 5
- Metrics loop — Phase 6

---

## Observability

```rust
// Preflight emits structured timing to stderr on every boot
[preflight] Phase 1: filesystem — 2ms (ok)
[preflight] Phase 2: vault — 8ms (ok, master key from keychain)
[preflight] Phase 2b: migration — 1ms (ok, migrated 1 secret)
[preflight] Phase 3: settings — 1ms (ok)
[preflight] Phase 4: budget — 3ms (ok, preset=balanced, cores=10, ram=32GB)
[preflight] Sync phases complete: 15ms total
[preflight] Phase 5: processes — spawning agentscope (127.0.0.1:8090)
[preflight] Phase 6: background — metrics loop started (2s interval)
[preflight] Phase 5: processes — agentscope online (pid=12345, 340ms)
```

Frontend can query preflight status:
```rust
#[tauri::command]
async fn preflight_status() -> Result<Vec<PhaseTiming>, String>;
```

---

## Test Specifications

```
A012/preflight: phase 1 creates all required directories
A012/preflight: phase 1 is idempotent (re-run on existing dirs succeeds)
A012/preflight: phase 2 generates master key on first boot
A012/preflight: phase 2 reads existing master key on subsequent boot
A012/preflight: phase 2 falls back to keyfile when keychain unavailable
A012/preflight: phase 2b migrates plaintext apiKey from settings to vault
A012/preflight: phase 2b clears apiKey from settings after migration
A012/preflight: phase 2b is idempotent (empty apiKey = no migration)
A012/preflight: phase 3 loads valid settings.json
A012/preflight: phase 3 returns defaults when settings.json missing
A012/preflight: phase 3 returns defaults when settings.json corrupt
A012/preflight: phase 4 builds registry with detected hardware
A012/preflight: run_sync completes under 25ms on modern hardware
A012/preflight: phase 5 spawns agentscope with settings host/port
A012/preflight: phase failure is logged but non-fatal (except phase 1)
A012/preflight: preflight_status returns all phase timings
```

---

## Dependencies

| Spec | Dependency |
|---|---|
| A011 (Secret Vault) | Phase 2 initializes vault |
| A004 (Workspace) | Phase 1 creates workspace directories |
| A008 (Budget Registry) | Phase 4 initializes budget |
| A013 (LLM Providers) | Phase 2b migrates legacy API keys |

---

## Hard Rules

- Sync phases (1-4) MUST complete before the first window opens
- Total sync phase budget: <25ms
- Phase failure is degraded mode, not crash (except filesystem)
- Master key generation is ONCE — never regenerated unless both keychain and keyfile are lost
- Migration is idempotent — safe to run on every boot
- PreflightService owns initialization order — main.rs delegates, never initializes directly
