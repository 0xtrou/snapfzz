# A016 — Runtime Architecture

Manages all runtime services: AgentScope, LiteLLM gateway, CEF browser engine. Each runtime has binary readiness checks, health monitoring, and graceful lifecycle management.

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
│   ├── agentscope.rs     (AgentScope runtime lifecycle)
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
    uv_binary: PathBuf,          // ~/.snapfzz/runtime/uv/uv
    working_dir: PathBuf,        // intelligence/
    host: String,                // 127.0.0.1
    port: u16,                   // 8090
    process: Mutex<Option<Child>>,
    status: RwLock<RuntimeStatus>,
    started_at: RwLock<Option<Instant>>,
}
```

- **Binary check**: `uv_binary.exists()` + `intelligence/app.py` exists
- **Version check**: `uv run python -c "import agentscope; print(agentscope.__version__)"`
- **Start**: `uv run python app.py` with SNAPFZZ_HOST, SNAPFZZ_PORT, PATH env vars
- **Health URL**: `http://{host}:{port}/health`
- **Stop**: SIGTERM to process group

---

## 4. LiteLLM Runtime

```rust
pub struct LiteLLMRuntime {
    uv_binary: PathBuf,
    config_path: PathBuf,        // ~/.snapfzz/gateway/config.yaml
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
- **Start**: `uv run litellm --config {config_path} --port {port} --host {host}`
- **Health URL**: `http://{host}:{port}/health/liveliness`
- **Env vars**: PATH (with runtime dir), LITELLM_MASTER_KEY, provider API keys from vault
- **Stop**: SIGTERM to process group

---

## 5. CEF Runtime

```rust
pub struct CefRuntime {
    install_dir: PathBuf,        // ~/.snapfzz/runtime/cef/
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

## 6. Boot Integration

In main.rs, after preflight:

```rust
// Set runtime env vars BEFORE any process spawning
let runtime_dir = data_dir.join("runtime");
helpers::configure_runtime_env(&runtime_dir);

// Create runtimes
let agentscope_rt = Arc::new(AgentScopeRuntime::new(...));
let litellm_rt = Arc::new(LiteLLMRuntime::new(...));
let cef_rt = Arc::new(CefRuntime::new(...));

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
    let uv_dir = runtime_dir.join("uv");
    let python_dir = runtime_dir.join("python");
    let system_path = std::env::var("PATH").unwrap_or_default();

    let runtime_path = format!("{}:{}:{}",
        uv_dir.display(),
        python_dir.display(),
        system_path
    );

    std::env::set_var("PATH", &runtime_path);
    std::env::set_var("UV_PYTHON_INSTALL_DIR", python_dir.to_str().unwrap_or(""));
    std::env::set_var("SNAPFZZ_RUNTIME_DIR", runtime_dir.to_str().unwrap_or(""));
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

## 11. Migration from Current Code

| Current Location | New Location | What |
|---|---|---|
| `snapfzz-cef/download.rs` (SystemComponent impl) | `snapfzz-packs/cef.rs` | CEF download |
| `snapfzz-cef/runtime.rs, window.rs, cdp.rs` | `snapfzz-runtime/cef.rs` | CEF runtime |
| `helpers.rs` (spawn_agentscope) | `snapfzz-runtime/agentscope.rs` | AgentScope lifecycle |
| `commands/process.rs` (restart/kill) | `commands/runtime.rs` | Runtime commands |
| `helpers.rs` (runtime_command_binary) | `snapfzz-runtime/lib.rs` | uv binary resolution |
| NEW | `snapfzz-runtime/litellm.rs` | LiteLLM lifecycle |
| NEW | `snapfzz-runtime/manager.rs` | RuntimeManager |
