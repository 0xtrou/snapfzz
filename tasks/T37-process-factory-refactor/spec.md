# T37: Process Factory Refactor

## Goal

Replace ad-hoc process spawning with a **BudgetedProcess** abstraction that encapsulates port allocation, log streaming, budget integration, lifecycle management, and health monitoring. Introduce a **ProcessFactory** trait and registry pattern to eliminate code duplication and enable plugin processes to register themselves.

## Problem Statement

Current state has duplicated logic scattered across multiple files:

| Issue | Location | Impact |
|---|---|---|
| `spawn_agentscope()` and `spawn_litellm()` are 90% identical | `helpers.rs` | Adding new processes = copy-paste |
| `restart_process()` uses manual string dispatch | `commands/process.rs` | O(n) switch-case, fragile |
| Port allocation is manual per-process | `helpers.rs` | Duplicated `find_available_port()` calls |
| Port persistence is manual per-process | `helpers.rs` | Duplicated settings save logic |
| Budget tracking is manual | `helpers.rs` | ProcessBudget constructed inline |
| Health URL varies per-process | `helpers.rs` | `/health` vs `/health/liveness` hardcoded |
| Log streaming is external | `ProcessManager.logs` | Not encapsulated with process |

Adding a new process (e.g., `ollama`, `postgres`) requires touching 4+ files with copy-paste code.

## Spec Reference

- **A008-budget-system.md** — Unified budget architecture
- **A013-llm-providers.md** — LLM provider architecture
- **A033-managed-service-refactor** — ManagedService trait pattern

## What Already Exists

| Piece | Location | Status |
|---|---|---|
| `ManagedService` trait | `snapfzz-packs/src/runtime/service.rs` | ✅ build_command, resource_limits |
| `AgentScopeService`, `LiteLLMService` | `snapfzz-packs/src/runtime/` | ✅ Implement ManagedService |
| `ProcessManager.spawn_process` | `snapfzz-kernel/src/process/mod.rs` | ✅ Generic spawn |
| `ProcessManager.shutdown` | `snapfzz-kernel/src/process/mod.rs` | ✅ Generic kill |
| `BudgetRegistry` | `snapfzz-kernel/src/budget/supervised.rs` | ✅ Tracks all processes |
| `ProcessLogs` | `snapfzz-kernel/src/process/logs.rs` | ✅ Log capture and tail |
| `SettingsManager` | `snapfzz-kernel/src/settings/mod.rs` | ✅ Persist settings |
| `find_available_port()` | `helpers.rs` | ✅ Random port allocation |

## What's Missing

1. **BudgetedProcess** struct — single entity encapsulating all process concerns
2. **ProcessFactory** trait — defines how to spawn a specific process type
3. **ProcessFactoryRegistry** — manages factories and processes
4. **PortAllocator** — centralized port allocation with persistence
5. **Unified restart** — no switch-case, generic dispatch

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ProcessFactory (trait)                     │
├─────────────────────────────────────────────────────────────────┤
│  name() -> &'static str                                         │
│  owner() -> &'static str              // "system" or "plugin.<id>" │
│  health_path() -> &'static str         // "/health" or "/health/liveness" │
│  health_interval_ms() -> u64                                   │
│  default_port() -> Option<u16>          // None = random, Some = fixed │
│  port_settings_key() -> (&'static str, &'static str)  // (host_key, port_key) │
│  working_dir(settings: &Settings) -> Option<PathBuf>            │
│  can_start(runtime: &PythonRuntime) -> bool                     │
│  build_command(config: &SpawnConfig, runtime: &PythonRuntime)   │
│      -> Result<Command, ServiceError>                           │
│  resource_limits() -> ResourceLimits                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      BudgetedProcess                            │
├─────────────────────────────────────────────────────────────────┤
│  identity:                                                      │
│    name: String                                                 │
│    owner: String                                                │
│    factory: Arc<dyn ProcessFactory>                             │
│                                                                 │
│  config:                                                        │
│    host: String                                                 │
│    port: u16                                                    │
│    working_dir: PathBuf                                         │
│                                                                 │
│  runtime:                                                       │
│    pid: Option<u32>                                             │
│    status: ProcessStatus                                        │
│    started_at: Option<Instant>                                  │
│    restart_count: u32                                           │
│    consecutive_failures: u32                                    │
│                                                                 │
│  health:                                                        │
│    health_url: String                                           │
│    health_interval_ms: u64                                      │
│    max_health_failures: u32                                     │
│    max_restarts: u32                                            │
│                                                                 │
│  metrics (computed):                                            │
│    rss_mb: Option<f64>                                          │
│    cpu_pct: Option<f32>                                         │
│    uptime_secs: u64                                             │
│                                                                 │
│  dependencies (injected):                                       │
│    registry: Arc<BudgetRegistry>                                │
│    logs: Arc<ProcessLogs>                                       │
│    settings_mgr: Arc<SettingsManager>                           │
│    python_runtime: Arc<PythonRuntime>                           │
├─────────────────────────────────────────────────────────────────┤
│  Methods:                                                       │
│    spawn() -> Result<(), ProcessError>                          │
│    kill() -> Result<(), ProcessError>                           │
│    restart() -> Result<(), ProcessError>                        │
│    snapshot() -> ProcessSnapshot                                │
│    check_health() -> bool                                       │
│    measure_rss() -> Option<f64>                                 │
│    measure_cpu() -> Option<f32>                                 │
│    logs_tail(n: usize) -> Vec<String>                           │
│    logs_clear()                                                 │
│    check_memory_exceeded(app_total_mb: u64) -> bool             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   ProcessFactoryRegistry                        │
├─────────────────────────────────────────────────────────────────┤
│  factories: HashMap<String, Arc<dyn ProcessFactory>>            │
│  processes: HashMap<String, BudgetedProcess>                    │
│  registry: Arc<BudgetRegistry>                                  │
│  logs: Arc<ProcessLogs>                                         │
│  settings_mgr: Arc<SettingsManager>                             │
│  python_runtime: Arc<PythonRuntime>                             │
├─────────────────────────────────────────────────────────────────┤
│  Methods:                                                       │
│    new(registry, logs, settings_mgr, python_runtime)            │
│    register(factory: Arc<dyn ProcessFactory>)                   │
│    spawn(name: &str) -> Result<(), ProcessError>                │
│    spawn_all() -> Vec<(String, Result<(), ProcessError>)>       │
│    kill(name: &str) -> Result<(), ProcessError>                 │
│    restart(name: &str) -> Result<(), ProcessError>              │
│    get(name: &str) -> Option<&BudgetedProcess>                  │
│    get_mut(name: &str) -> Option<&mut BudgetedProcess>          │
│    list_snapshots() -> Vec<ProcessSnapshot>                     │
│    total_rss_mb() -> f64                                        │
│    check_health_all() -> HashMap<String, bool>                  │
│    enforce_loop_step(app_total_mb: u64)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### Phase 1: ProcessFactory Trait

Location: `src-tauri/crates/snapfzz-kernel/src/process/factory.rs`

```rust
pub trait ProcessFactory: Send + Sync {
    fn name(&self) -> &'static str;
    fn owner(&self) -> &'static str { "system" }
    fn health_path(&self) -> &'static str;
    fn health_interval_ms(&self) -> u64 { 2000 }
    fn default_port(&self) -> Option<u16> { None }
    fn port_settings_keys(&self) -> (&'static str, &'static str);
    fn working_dir(&self, settings: &Settings) -> Option<PathBuf>;
    
    fn can_start(&self, runtime: &PythonRuntime) -> bool;
    fn build_command(&self, config: &SpawnConfig, runtime: &PythonRuntime) 
        -> Result<Command, ServiceError>;
    fn resource_limits(&self) -> ResourceLimits;
}
```

### Phase 2: BudgetedProcess

Location: `src-tauri/crates/snapfzz-kernel/src/process/budgeted.rs`

```rust
pub struct BudgetedProcess {
    name: String,
    owner: String,
    factory: Arc<dyn ProcessFactory>,
    config: SpawnConfig,
    pid: Option<u32>,
    status: ProcessStatus,
    started_at: Option<Instant>,
    restart_count: u32,
    consecutive_failures: u32,
    health_url: String,
    health_interval_ms: u64,
    max_health_failures: u32,
    max_restarts: u32,
    registry: Arc<BudgetRegistry>,
    logs: Arc<ProcessLogs>,
    settings_mgr: Arc<SettingsManager>,
    python_runtime: Arc<PythonRuntime>,
}

impl BudgetedProcess {
    pub async fn spawn(&mut self) -> Result<(), ProcessError>;
    pub fn kill(&mut self) -> Result<(), ProcessError>;
    pub async fn restart(&mut self) -> Result<(), ProcessError>;
    pub fn snapshot(&self) -> ProcessSnapshot;
    pub fn check_health(&mut self) -> bool;
    pub fn measure_rss(&self) -> Option<f64>;
    pub fn measure_cpu(&self) -> Option<f32>;
    pub fn logs_tail(&self, n: usize) -> Vec<String>;
    pub fn logs_clear(&self);
}
```

### Phase 3: ProcessFactoryRegistry

Location: `src-tauri/crates/snapfzz-kernel/src/process/registry.rs`

```rust
pub struct ProcessFactoryRegistry {
    factories: HashMap<String, Arc<dyn ProcessFactory>>,
    processes: HashMap<String, BudgetedProcess>,
    registry: Arc<BudgetRegistry>,
    logs: Arc<ProcessLogs>,
    settings_mgr: Arc<SettingsManager>,
    python_runtime: Arc<PythonRuntime>,
}

impl ProcessFactoryRegistry {
    pub fn register(&mut self, factory: Arc<dyn ProcessFactory>);
    pub async fn spawn(&mut self, name: &str) -> Result<(), ProcessError>;
    pub async fn spawn_all(&mut self);
    pub fn kill(&mut self, name: &str) -> Result<(), ProcessError>;
    pub async fn restart(&mut self, name: &str) -> Result<(), ProcessError>;
    pub fn list_snapshots(&self) -> Vec<ProcessSnapshot>;
    pub fn total_rss_mb(&self) -> f64;
}
```

### Phase 4: AgentScopeFactory and LiteLLMFactory

Location: `src-tauri/src/factories/`

```rust
// src-tauri/src/factories/agentscope.rs
pub struct AgentScopeFactory {
    runtime: Arc<PythonRuntime>,
}

impl ProcessFactory for AgentScopeFactory {
    fn name(&self) -> &'static str { "agentscope" }
    fn health_path(&self) -> &'static str { "/health" }
    fn port_settings_keys(&self) -> (&'static str, &'static str) { 
        ("agentscopeHost", "agentscopePort") 
    }
    // ...
}

// src-tauri/src/factories/litellm.rs
pub struct LiteLLMFactory {
    runtime: Arc<PythonRuntime>,
}

impl ProcessFactory for LiteLLMFactory {
    fn name(&self) -> &'static str { "litellm" }
    fn health_path(&self) -> &'static str { "/health/liveness" }
    fn port_settings_keys(&self) -> (&'static str, &'static str) { 
        ("litellmHost", "litellmPort") 
    }
    // ...
}
```

### Phase 5: Integration

Replace in `main.rs`:
```rust
let mut factory_registry = ProcessFactoryRegistry::new(
    registry.clone(),
    logs.clone(),
    settings_mgr.clone(),
    python_runtime.clone(),
);

factory_registry.register(Arc::new(AgentScopeFactory::new(python_runtime.clone())));
factory_registry.register(Arc::new(LiteLLMFactory::new(python_runtime.clone())));

factory_registry.spawn_all().await;
```

Replace in `commands/process.rs`:
```rust
pub async fn restart_process(
    name: String,
    factory_registry: tauri::State<'_, Arc<Mutex<ProcessFactoryRegistry>>>,
) -> Result<(), String> {
    factory_registry.lock().await.restart(&name).await.map_err(|e| e.to_string())
}
```

## Zone Analysis

| Concern | Zone | Why |
|---|---|---|
| ProcessFactory trait | Zone 1 | Process spawning, I/O |
| BudgetedProcess | Zone 1 | Process lifecycle, budget tracking |
| ProcessFactoryRegistry | Zone 1 | Orchestrates Zone 1 operations |
| Factory implementations | Zone 1 | Build commands, file paths |
| Tauri commands | Zone 2 | IPC bridge |
| UI actions | Zone 3 | Render only |

## Tests Required

```rust
// process/factory.rs tests
// T37/factory: name returns correct process identifier
// T37/factory: default_port returns None for random allocation
// T37/factory: port_settings_keys returns correct setting keys

// process/budgeted.rs tests
// T37/budgeted_process: spawn allocates port and saves to settings
// T37/budgeted_process: spawn creates ProcessBudget entry
// T37/budgeted_process: kill removes process and cleans pid file
// T37/budgeted_process: restart kills then spawns
// T37/budgeted_process: snapshot returns current metrics
// T37/budgeted_process: measure_rss returns memory for running process
// T37/budgeted_process: measure_cpu returns cpu percentage
// T37/budgeted_process: logs_tail returns captured logs
// T37/budgeted_process: check_health updates status on success/failure

// process/registry.rs tests
// T37/registry: register stores factory by name
// T37/registry: spawn creates BudgetedProcess from factory
// T37/registry: spawn_all spawns all registered factories
// T37/registry: kill removes process from tracking
// T37/registry: restart delegates to BudgetedProcess
// T37/registry: list_snapshots aggregates all process snapshots
// T37/registry: total_rss_mb sums all process memory
// T37/registry: spawn returns error for unknown factory

// factories/agentscope.rs tests
// T37/agentscope_factory: health_path is /health
// T37/agentscope_factory: port_settings_keys are agentscopeHost/Port
// T37/agentscope_factory: can_start checks python dependencies
// T37/agentscope_factory: build_command creates correct uvicorn command

// factories/litellm.rs tests
// T37/litellm_factory: health_path is /health/liveness
// T37/litellm_factory: port_settings_keys are litellmHost/Port
// T37/litellm_factory: can_start checks python dependencies
// T37/litellm_factory: build_command creates correct litellm command
```

## Constraints

- Never modify `@snapfzz/plugin-sdk`
- Never `// TODO` / `// FIXME` / `// HACK`
- Add inline spec references: `// A037/section: description`
- Keep 90% code coverage threshold
- All existing tests must continue to pass
- No breaking changes to Tauri commands (maintain backward compatibility)
- ProcessFactory trait must be `Send + Sync` for thread safety

## Success Criteria

1. `ProcessFactory` trait exists in `snapfzz-kernel/src/process/factory.rs`
2. `BudgetedProcess` struct exists in `snapfzz-kernel/src/process/budgeted.rs`
3. `ProcessFactoryRegistry` exists in `snapfzz-kernel/src/process/registry.rs`
4. `AgentScopeFactory` and `LiteLLMFactory` exist in `src-tauri/src/factories/`
5. `spawn_agentscope()` and `spawn_litellm()` functions removed from `helpers.rs`
6. `restart_process()` uses registry (no switch-case)
7. All existing tests pass
8. New tests cover factory, budgeted process, and registry
9. Coverage ≥ 90%
10. Plugin processes can register themselves via `ProcessFactory` trait

## Out of Scope

- UI changes (Processes plugin already works with any registered process)
- Config.yaml generation for LiteLLM (separate task)
- Key management API (separate task)
- Spend tracking (separate task)
- Plugin process registration API (follow-up task after core refactor)
- Distributed process management (cloud processes, separate task)

## Migration Path

1. **Phase 1**: Add new types alongside existing code (no breaking changes)
2. **Phase 2**: Implement factories for AgentScope and LiteLLM
3. **Phase 3**: Wire registry into main.rs boot sequence
4. **Phase 4**: Update Tauri commands to use registry
5. **Phase 5**: Remove deprecated `spawn_agentscope()` and `spawn_litellm()` helpers
6. **Phase 6**: Update `helpers.rs` to use registry for restart dispatch

## File Structure After Refactor

```
src-tauri/
├── crates/snapfzz-kernel/src/process/
│   ├── mod.rs              // Re-exports
│   ├── factory.rs          // ProcessFactory trait
│   ├── budgeted.rs         // BudgetedProcess struct
│   ├── registry.rs         // ProcessFactoryRegistry
│   ├── logs.rs             // (unchanged)
│   ├── runtime.rs          // (unchanged)
│   ├── health.rs           // (unchanged)
│   └── supervisor.rs       // (unchanged)
├── src/
│   ├── factories/
│   │   ├── mod.rs
│   │   ├── agentscope.rs
│   │   └── litellm.rs
│   ├── commands/
│   │   └── process.rs      // Simplified, uses registry
│   ├── helpers.rs          // Removed spawn_* functions
│   └── main.rs             // Creates registry, registers factories
```