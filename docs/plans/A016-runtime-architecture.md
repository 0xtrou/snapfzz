# A016 — Runtime Architecture

> **Updated 2026-04-16 (A020 Phase 1):** The `snapfzz-runtime` crate described in this spec was not created. AgentScope runtime management was replaced by the generic `PluginProcessFactory` (`src-tauri/src/factories/plugin_runtime.rs`), which is data-driven from manifest declarations rather than hardcoded per-service. The `agentscope.rs` entry in this spec refers to a file that no longer exists. LiteLLM and CEF lifecycle remain managed via `snapfzz-packs`. The conceptual separation (kernel vs. runtime management) still holds — it's implemented via `PluginProcessFactory` + `ProcessFactoryRegistry` rather than a dedicated crate.

Manages all runtime services: LiteLLM gateway, CEF browser engine, and plugin-declared runtimes (e.g., orchestrator). Each runtime has binary readiness checks, health monitoring, and graceful lifecycle management.

## Decision

Separate runtime management from kernel. Kernel owns boot/budget/process/settings infrastructure. Runtime owns the actual services that run on top.

```
snapfzz-kernel    → Boot, budget, process, settings, components trait
snapfzz-packs     → Download/install system components (uv, python, cef, agentscope, litellm)
snapfzz-runtime   → Runtime lifecycle for services (AgentScope, CEF, LiteLLM)
snapfzz-vault     → Secret storage
snapfzz-stream    → SSE consumer
snapfzz-llm       → LiteLLM config + key/spend API proxy
```

---

## Architecture Overview

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

### Crate: snapfzz-runtime

```
src-tauri/crates/snapfzz-runtime/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── manager.rs       (RuntimeManager — orchestrates all runtimes)
│   ├── runtime.rs        (Runtime trait + RuntimeStatus + ReadinessCheck)
│   ├── agentscope.rs     (REMOVED — replaced by PluginProcessFactory, A020 Phase 1)
│   ├── litellm.rs        (LiteLLM gateway lifecycle)
│   └── cef.rs            (CEF browser runtime lifecycle)
```

---

## 1. Runtime Trait

Every runtime implements this trait. The key method is `is_runtime_ready()` — used by diagnostics and system packs plugins.

```rust
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeStatus {
    NotInstalled,         // binary/package not found
    Installed,            // binary exists but not running
    Starting,             // process spawned, waiting for health
    Online,               // healthy and serving
    Degraded(String),     // running but health check failing
    Offline,              // was running, now stopped
    Error(String),        // failed to start
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadinessCheck {
    pub runtime_id: String,
    pub status: RuntimeStatus,
    pub binary_installed: bool,
    pub binary_path: Option<String>,
    pub binary_version: Option<String>,
    pub process_running: bool,
    pub pid: Option<u32>,
    pub health_url: Option<String>,
    pub health_ok: bool,
    pub last_health_check: Option<u64>,   // Unix ms
    pub port: Option<u16>,
    pub uptime_ms: Option<u64>,
}

#[async_trait::async_trait]
pub trait Runtime: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn port(&self) -> u16;

    /// Full readiness check — used by diagnostics + system packs plugins
    async fn is_runtime_ready(&self) -> ReadinessCheck;

    /// Start the runtime (spawn process, wait for health)
    async fn start(&self) -> Result<(), RuntimeError>;

    /// Stop the runtime (graceful shutdown)
    async fn stop(&self) -> Result<(), RuntimeError>;

    /// Restart (stop + start)
    async fn restart(&self) -> Result<(), RuntimeError>;

    /// Current status
    fn status(&self) -> RuntimeStatus;
}
```

### is_runtime_ready() Contract

This is the single source of truth for "can this runtime serve requests". It checks:

1. **Binary installed** — Does the binary/package exist at the expected path?
2. **Binary version** — Can we get the version string? (validates binary is not corrupted)
3. **Process running** — Is the PID alive?
4. **Health check** — Does HTTP GET to health_url return 2xx?

```rust
async fn is_runtime_ready(&self) -> ReadinessCheck {
    let binary_installed = self.check_binary_installed();
    let binary_version = self.check_binary_version().await;
    let process_running = self.check_process_running();
    let health_ok = if process_running {
        self.check_health().await
    } else {
        false
    };

    let status = match (binary_installed, process_running, health_ok) {
        (false, _, _) => RuntimeStatus::NotInstalled,
        (true, false, _) => RuntimeStatus::Installed,
        (true, true, true) => RuntimeStatus::Online,
        (true, true, false) => RuntimeStatus::Degraded("health check failing".into()),
        _ => RuntimeStatus::Error("unexpected state".into()),
    };

    ReadinessCheck {
        runtime_id: self.id().into(),
        status,
        binary_installed,
        binary_path: self.binary_path(),
        binary_version,
        process_running,
        pid: self.pid(),
        health_url: self.health_url(),
        health_ok,
        last_health_check: Some(now_ms()),
        port: Some(self.port()),
        uptime_ms: self.uptime(),
    }
}
```

---

## 2. RuntimeManager

Orchestrates all runtimes. Registered in main.rs as Tauri managed state.

```rust
pub struct RuntimeManager {
    runtimes: HashMap<String, Arc<dyn Runtime>>,
}

impl RuntimeManager {
    pub fn new() -> Self;
    pub fn register(&mut self, runtime: Arc<dyn Runtime>);
    pub fn get(&self, id: &str) -> Option<Arc<dyn Runtime>>;
    pub fn list(&self) -> Vec<Arc<dyn Runtime>>;

    /// Check all runtimes — used by diagnostics plugin
    pub async fn check_all(&self) -> Vec<ReadinessCheck>;

    /// Start all runtimes that have their packs installed
    pub async fn start_installed(&self) -> Vec<Result<(), RuntimeError>>;

    /// Stop all runtimes gracefully
    pub async fn stop_all(&self);
}
```

---

## 3. AgentScope Runtime

```rust
pub struct AgentScopeRuntime {
    uv_binary: PathBuf,          // ~/.snapfzz/runtime/bin/uv
    working_dir: PathBuf,        // ~/.snapfzz/runtime/processes/agentscope/
    host: String,                // 127.0.0.1
    port: u16,                   // 8090
    process: Mutex<Option<Child>>,
    status: RwLock<RuntimeStatus>,
    started_at: RwLock<Option<Instant>>,
}
```

- **Binary check**: `uv_binary.exists()` + `working_dir/app.py` exists
- **Version check**: `uv run python -c "import agentscope; print(agentscope.__version__)"`
- **Start**: `uv run python app.py` with CWD = `runtime/processes/agentscope/`
- **Health URL**: `http://{host}:{port}/health`
- **Stop**: SIGTERM to process group

---

## 4. LiteLLM Runtime

```rust
pub struct LiteLLMRuntime {
    uv_binary: PathBuf,          // ~/.snapfzz/runtime/bin/uv
    working_dir: PathBuf,        // ~/.snapfzz/runtime/processes/litellm/
    host: String,                // 127.0.0.1
    port: u16,                   // 4000
    master_key: String,
    process: Mutex<Option<Child>>,
    status: RwLock<RuntimeStatus>,
    started_at: RwLock<Option<Instant>>,
}
```

- **Binary check**: `uv_binary.exists()` + `uv run python -c "import litellm"` succeeds
- **Version check**: `uv run python -c "import litellm; print(litellm.version)"`
- **Start**: `uv run litellm --config config.yaml --port {port} --host {host}` with CWD = `runtime/processes/litellm/`
- **Health URL**: `http://{host}:{port}/health/liveliness`
- **Env vars**: PATH (with runtime/bin), LITELLM_MASTER_KEY, provider API keys from vault
- **Stop**: SIGTERM to process group
- **Config**: `runtime/processes/litellm/config.yaml` (generated by snapfzz-llm)

---

## 5. CEF Runtime

```rust
pub struct CefRuntime {
    install_dir: PathBuf,        // ~/.snapfzz/runtime/processes/cef/
    windows: Mutex<HashMap<String, CefWindow>>,
    cdp_server: Mutex<Option<CdpServer>>,
    status: RwLock<RuntimeStatus>,
}
```

- **Binary check**: `install_dir` contains extracted `cef_binary*` directory
- **Version check**: Parse version from extracted directory name
- **Start**: `cef_rs::initialize()` (lazy, only on first mini app open)
- **Health URL**: None (in-process, not a network service)
- **is_runtime_ready**: binary_installed + extraction verified (no health URL for in-process)
- **Stop**: `cef_rs::shutdown()` + close all windows

---

## 6. Vault → Process Key Injection

Provider API keys are stored encrypted in the vault (A011). When spawning LiteLLM, the runtime reads keys from vault and injects them as env vars into the child process. Raw keys NEVER appear in config.yaml or on disk unencrypted.

### Vault Key Naming Convention

```
Vault key                          → Env var injected to process
provider:openai:key1               → OPENAI_KEY_1
provider:openai:key2               → OPENAI_KEY_2
provider:anthropic:key1            → ANTHROPIC_KEY_1
provider:ollama:key1               → OLLAMA_KEY_1
litellm:master_key                 → LITELLM_MASTER_KEY
```

### Injection Flow

```
1. User enters API key in Settings UI
   → frontend calls vault_store("provider:openai:key1", "sk-abc...")
   → vault encrypts with AES-256-GCM, persists to vault.enc

2. Config generation (snapfzz-llm)
   → writes config.yaml with: api_key: os.environ/OPENAI_KEY_1
   → raw key NEVER in YAML — only env var references

3. LiteLLM process spawn (snapfzz-runtime)
   → runtime reads vault: vault.list() → filter "provider:*"
   → for each key: vault.read(key) → decrypt → map to env var name
   → inject all as env vars into child process Command
   → also inject LITELLM_MASTER_KEY from vault

4. LiteLLM reads env vars at startup
   → os.environ/OPENAI_KEY_1 resolves to "sk-abc..."
   → authenticates to OpenAI backend
```

### Key Mapper

```rust
/// Map vault key names to environment variable names for LiteLLM process
pub fn vault_key_to_env_var(vault_key: &str) -> Option<String> {
    if vault_key == "litellm:master_key" {
        return Some("LITELLM_MASTER_KEY".to_string());
    }
    // "provider:openai:key1" → "OPENAI_KEY_1"
    let parts: Vec<&str> = vault_key.split(':').collect();
    if parts.len() == 3 && parts[0] == "provider" {
        let provider = parts[1].to_uppercase();
        let key_name = parts[2].to_uppercase();
        return Some(format!("{}_{}", provider, key_name));
    }
    None
}

/// Read all provider keys from vault, return as env var map
pub fn resolve_provider_env_vars(
    vault: &mut SecretVault,
) -> HashMap<String, String> {
    let mut env_vars = HashMap::new();
    if let Ok(keys) = vault.list() {
        for key in keys {
            if key.starts_with("provider:") || key == "litellm:master_key" {
                if let Some(env_name) = vault_key_to_env_var(&key) {
                    if let Ok(value) = vault.read(&key) {
                        if let Ok(s) = String::from_utf8(value) {
                            env_vars.insert(env_name, s);
                        }
                    }
                }
            }
        }
    }
    env_vars
}
```

### Security Guarantees

- Raw keys encrypted at rest in vault.enc (AES-256-GCM)
- Master key in OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager)
- config.yaml contains ONLY `os.environ/` references — never raw keys
- Env vars injected per-process — not global `std::env::set_var`
- Vault rate-limited (10 reads/sec) to prevent extraction attacks
- vault.enc file permissions 0o600 (owner only)

### Tests

```rust
// A016/VaultEnv: vault_key_to_env_var maps provider keys correctly
// A016/VaultEnv: vault_key_to_env_var maps litellm master key
// A016/VaultEnv: vault_key_to_env_var returns None for unknown keys
// A016/VaultEnv: resolve_provider_env_vars reads all provider keys from vault
// A016/VaultEnv: resolve_provider_env_vars skips non-provider keys
// A016/VaultEnv: injected env vars appear in child process environment
```

---

## 7. Boot Integration

In main.rs, after preflight:

```rust
// Set runtime env vars BEFORE any process spawning
let runtime_dir = data_dir.join("runtime");
helpers::configure_runtime_env(&runtime_dir);

// Create runtimes
let processes_dir = runtime_dir.join("processes");
let bin_dir = runtime_dir.join("bin");
let uv_binary = bin_dir.join("uv");

let agentscope_rt = Arc::new(AgentScopeRuntime::new(
    uv_binary.clone(),
    processes_dir.join("agentscope"),
    ...
));
let litellm_rt = Arc::new(LiteLLMRuntime::new(
    uv_binary.clone(),
    processes_dir.join("litellm"),
    ...
));
let cef_rt = Arc::new(CefRuntime::new(
    processes_dir.join("cef"),
));

let mut runtime_mgr = RuntimeManager::new();
runtime_mgr.register(agentscope_rt);
runtime_mgr.register(litellm_rt);
runtime_mgr.register(cef_rt);

// Start runtimes that have packs installed
runtime_mgr.start_installed().await;

app.manage(Arc::new(runtime_mgr));
```

### Runtime Env Setup (helpers.rs)

```rust
pub fn configure_runtime_env(runtime_dir: &Path) {
    let bin_dir = runtime_dir.join("bin");
    let python_dir = bin_dir.join("python");
    let processes_dir = runtime_dir.join("processes");
    let system_path = std::env::var("PATH").unwrap_or_default();

    let runtime_path = format!("{}:{}:{}",
        bin_dir.display(),
        python_dir.display(),
        system_path
    );

    std::env::set_var("PATH", &runtime_path);
    std::env::set_var("UV_PYTHON_INSTALL_DIR", python_dir.to_str().unwrap_or(""));
    std::env::set_var("SNAPFZZ_RUNTIME_DIR", runtime_dir.to_str().unwrap_or(""));
    std::env::set_var("SNAPFZZ_BIN_DIR", bin_dir.to_str().unwrap_or(""));
    std::env::set_var("SNAPFZZ_PROCESSES_DIR", processes_dir.to_str().unwrap_or(""));
}
```

---

## 7. Tauri Commands

```rust
// Runtime status (used by diagnostics + system packs plugins)
#[tauri::command] async fn runtime_check_all(mgr: State<Arc<RuntimeManager>>) -> Result<Vec<ReadinessCheck>, String>
#[tauri::command] async fn runtime_check(id: String, mgr: State<Arc<RuntimeManager>>) -> Result<ReadinessCheck, String>

// Runtime lifecycle
#[tauri::command] async fn runtime_start(id: String, mgr: State<Arc<RuntimeManager>>) -> Result<(), String>
#[tauri::command] async fn runtime_stop(id: String, mgr: State<Arc<RuntimeManager>>) -> Result<(), String>
#[tauri::command] async fn runtime_restart(id: String, mgr: State<Arc<RuntimeManager>>) -> Result<(), String>
```

---

## 8. Plugin Integration

### Diagnostics Plugin

Calls `runtime_check_all` to show health status of all runtimes:

```
System Health Check
├── AgentScope   ● Online    port 8090    uptime 2h 34m
├── LiteLLM      ● Online    port 4000    uptime 2h 34m
└── CEF          ● Installed (lazy)
```

### System Packs Plugin

For each pack, shows:
- Pack install status (from ComponentRegistry)
- Runtime readiness (from RuntimeManager via `is_runtime_ready()`)
- If pack installed but runtime not ready → "Installed, not running" with [Start] button

---

## 9. Dependency Graph

```
snapfzz-kernel (traits, process infra)
    ↑
snapfzz-packs (download/install, implements SystemComponent)
    ↑
snapfzz-runtime (service lifecycle, implements Runtime)
    ↑
snapfzz-llm (LiteLLM config + API proxy)
```

No circular dependencies. Each layer depends only on the one below.

---

## 10. Tests

```rust
// A016/Runtime: AgentScopeRuntime is_runtime_ready returns NotInstalled when uv missing
// A016/Runtime: AgentScopeRuntime is_runtime_ready returns Installed when uv exists but not running
// A016/Runtime: AgentScopeRuntime is_runtime_ready returns Online when health returns 200
// A016/Runtime: AgentScopeRuntime is_runtime_ready returns Degraded when health fails

// A016/Runtime: LiteLLMRuntime is_runtime_ready returns NotInstalled when litellm not installed
// A016/Runtime: LiteLLMRuntime is_runtime_ready returns Installed when binary exists
// A016/Runtime: LiteLLMRuntime is_runtime_ready returns Online when health returns alive

// A016/Runtime: CefRuntime is_runtime_ready returns NotInstalled when not extracted
// A016/Runtime: CefRuntime is_runtime_ready returns Installed when extracted

// A016/Manager: RuntimeManager check_all returns all runtimes
// A016/Manager: RuntimeManager start_installed skips uninstalled runtimes
// A016/Manager: RuntimeManager stop_all stops all running runtimes

// A016/Env: configure_runtime_env prepends uv and python to PATH
// A016/Env: configure_runtime_env sets SNAPFZZ_RUNTIME_DIR
// A016/Env: configure_runtime_env sets UV_PYTHON_INSTALL_DIR
```

---

## 11. Directory Convention

All runtime paths are relative to `~/.snapfzz/runtime/`:

```
runtime/
├── bin/                       managed binaries (prepended to PATH)
│   ├── uv                     uv binary
│   └── python/                Python 3.12
├── processes/                 runtime process CWDs (every process runs here)
│   ├── agentscope/            AgentScope CWD
│   │   ├── app.py             entrypoint
│   │   └── pyproject.toml
│   ├── litellm/               LiteLLM CWD
│   │   └── config.yaml        generated by snapfzz-llm
│   └── cef/                   CEF extracted binary + cache
│       └── cef_binary_*/      extracted CEF files
└── packages/                  pip-installed packages
    ├── agentscope/            agentscope site-packages
    └── litellm/               litellm[proxy] site-packages
```

**Hard rule:** No process runs outside `~/.snapfzz/runtime/`. No process uses system-wide binaries.

---

## 12. Migration from Current Code

| Current Location | New Location | What |
|---|---|---|
| `snapfzz-cef/download.rs` (SystemComponent impl) | `snapfzz-packs/cef.rs` | CEF download to `processes/cef/` |
| `snapfzz-cef/runtime.rs, window.rs, cdp.rs` | `snapfzz-runtime/cef.rs` | CEF runtime from `processes/cef/` |
| `helpers.rs` (spawn_agentscope) | REMOVED — plugin runtimes use `PluginProcessFactory` (A020 Phase 1) | N/A |
| `commands/process.rs` (restart/kill) | `commands/runtime.rs` | Runtime commands |
| `helpers.rs` (runtime_command_binary) | `helpers.rs` (configure_runtime_env) | PATH = `bin/` dir |
| NEW | `snapfzz-runtime/litellm.rs` | CWD = `processes/litellm/` |
| NEW | `snapfzz-runtime/manager.rs` | RuntimeManager |
| `intelligence/` (repo root) | REMOVED — now at `plugins/orchestrator/intelligence/` (A020 Phase 1) | N/A |
