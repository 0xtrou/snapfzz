# A008 — Budget Registry

## Decision

Every resource the app consumes is allocated from a central Budget Registry before use. Nothing runs without a permit. The registry is the kernel — Zones, Runtimes, and Plugins all register with it.

## Why

A desktop app runs on someone else's machine. Without budgeting, subsystems compete for resources invisibly. The SSE pipeline floods the frame budget. A leaked plugin eats RAM. AgentScope grows to 2GB. The user's machine degrades and they blame us.

The Budget Registry makes resource consumption explicit, limited, and enforced. Inspired by Qdrant's semaphore-based `ResourceBudget` (production at scale), Linux SCHED_DEADLINE (runtime per period), and Chromium's FrameScheduler (task priorities with frame deadlines).

## Boot Sequence

```
1. DETECT    → sysinfo reads cores, RAM, disk, battery state
2. SELECT    → preset chosen (auto from hardware, or user override)
3. COMMIT    → BudgetRegistry created with limits from preset
4. CLASSIFY  → each resource registered as Controlled or Supervised
5. ENFORCE   → subsystems acquire permits before consuming resources
```

## Presets

Presets are the initial budget allocation based on hardware and power state. User can override in System Preferences.

```
Performance (desktop, plugged in, ≥8 cores, ≥16GB RAM):
  cpu_permits:     4
  memory_mb:       2048
  storage_gb:      10
  frame_target_ms: 16    (60fps)
  batch_rate_ms:   16

Balanced (laptop, plugged in, ≥4 cores, ≥8GB RAM):
  cpu_permits:     2
  memory_mb:       1024
  storage_gb:      5
  frame_target_ms: 16    (60fps)
  batch_rate_ms:   16

Battery (laptop, on battery):
  cpu_permits:     2
  memory_mb:       1024
  storage_gb:      5
  frame_target_ms: 33    (30fps)
  batch_rate_ms:   33
```

## Two Domains

### Controlled (in-process, structural enforcement)

Resources where the registry prevents violations from happening. Semaphore-based — `try_acquire()` returns `None` if budget exhausted.

| Budget | What It Gates | Enforcement |
|---|---|---|
| Frame | Render cycle time per window | `frame_target_ms` emitted to frontend, PerformanceObserver measures |
| CPU | Zone 1/2 work permits | `Semaphore::try_acquire()` before spawning compute tasks |
| Reliability | Plugin crash tolerance | Strike counter per plugin, auto-disable at threshold |
| Network | SSE batch flush rate | Rate limiter gates `channel.send()` |
| Window | Per-layout frame budget | Each window gets independent allocation |
| Startup | Boot sequence timing | Activation timeout kills slow plugins |

### Supervised (cross-process, observe + react)

Resources where the registry monitors externally and responds to violations. Cannot prevent — can only detect and kill.

| Budget | What It Monitors | Response |
|---|---|---|
| Process Memory | AgentScope RSS via sysinfo | Kill + restart if over limit |
| Process Health | HTTP /health poll | Restart with backoff after N failures |
| Storage | Disk usage of ~/.snapfzz/ and .snapfzz/ | Trigger cleanup, warn user |

## Registry API

```rust
pub struct BudgetRegistry {
    preset: Preset,
    controlled: ControlledBudgets,
    supervised: SupervisedBudgets,
}

pub struct ControlledBudgets {
    cpu_permits: Arc<Semaphore>,
    network_rate: RateLimiter,
    plugin_strikes: DashMap<String, StrikeState>,
    frame_target_ms: AtomicU64,
    startup_budget_ms: u64,
}

pub struct SupervisedBudgets {
    processes: DashMap<String, ProcessBudget>,
    storage: StorageBudget,
}

pub struct Preset {
    pub name: String,
    pub cpu_permits: usize,
    pub memory_mb: u64,
    pub storage_gb: u64,
    pub frame_target_ms: u64,
    pub batch_rate_ms: u64,
}

pub struct ProcessBudget {
    pub pid: Option<u32>,              // None for cloud sandboxes (no local PID)
    pub max_memory_mb: u64,
    pub health_url: String,            // localhost:8090 or cloud-sandbox-1.snapfzz.io:8090
    pub health_interval_ms: u64,
    pub max_health_failures: u32,
    pub max_restarts: u32,
    pub location: ProcessLocation,
}

pub enum ProcessLocation {
    Local,                             // sysinfo RSS monitoring available
    Cloud { endpoint: String },        // HTTP-only monitoring, no sysinfo
}

pub struct StorageBudget {
    pub max_gb: u64,
    pub paths: Vec<PathBuf>,
    pub cleanup_threshold_percent: u8,
}

impl BudgetRegistry {
    /// Detect hardware + select preset
    pub fn from_hardware() -> Self;

    /// Override with user-selected preset
    pub fn with_preset(preset: Preset) -> Self;

    /// Acquire permit before doing work. Returns None if budget exhausted.
    pub fn try_acquire(&self, class: &str, resource: Resource) -> Option<Permit>;

    /// Record resource usage after work completes
    pub fn record(&self, class: &str, resource: Resource, used: u64);

    /// Query current usage for a budget class
    pub fn query(&self, class: &str) -> BudgetSnapshot;

    /// Register a supervised process
    pub fn register_process(&self, name: &str, budget: ProcessBudget);

    /// Periodic enforcement loop — runs in tokio::spawn
    pub async fn enforce_loop(&self, app_handle: AppHandle, shutdown: CancellationToken);
}

pub enum Resource {
    CpuPermit(usize),
    Memory(u64),
    NetworkOp,
    Strike,
    DiskBytes(u64),
}

pub struct Permit {
    _semaphore_permit: Option<OwnedSemaphorePermit>,
    class: String,
    resource: Resource,
}

impl Drop for Permit {
    fn drop(&mut self) {
        // Semaphore permit released automatically
        // Registry notified of deallocation
    }
}

pub struct BudgetSnapshot {
    pub allocated: u64,
    pub used: u64,
    pub available: u64,
    pub violations: u32,
}
```

## How Existing Architecture Registers

### Zone 1 (Rust) — CPU permits

```rust
// SSE pipeline acquires CPU permit before parsing
let permit = registry.try_acquire("stream-pipeline", Resource::CpuPermit(1))?;
parse_sse_batch(data);
drop(permit); // released back to pool
```

### Zone 2 (Worker) — CPU permits

```rust
// Worker tasks acquire permit before compute
let permit = registry.try_acquire("worker.highlight", Resource::CpuPermit(1))?;
run_shiki_highlight(code);
drop(permit);
```

### Zone 3 (Main thread) — Frame budget

```typescript
// Frontend reads frame_target_ms from registry
const target = await ctx.rust.invoke('get_frame_target'); // 16 or 33
// PerformanceObserver measures against target
```

### Plugin Host — Reliability permits

```rust
// Plugin activation acquires reliability permit
let permit = registry.try_acquire(
    &format!("plugin.{}", plugin_id),
    Resource::Strike,
)?;
host.activate(plugin_id);
// On crash: registry.record("plugin.chat", Resource::Strike, 1)
// After 3 strikes: try_acquire returns None → plugin stays disabled
```

### Agent Supervisor — Process budget

```rust
// Register AgentScope process with memory + health budget
registry.register_process("agentscope", ProcessBudget {
    pid: child_pid,
    max_memory_mb: preset.memory_mb,
    health_url: format!("http://127.0.0.1:{}/health", port),
    health_interval_ms: 2000,
    max_health_failures: 3,
    max_restarts: 10,
});
// enforce_loop() monitors RSS and health automatically
```

### Stream Pipeline — Network rate

```rust
// Batch flush gated by network budget
if registry.try_acquire("network", Resource::NetworkOp).is_some() {
    channel.send(batch)?;
}
// If rate exceeded, batch accumulates until next period
```

### Storage — Disk budget

```rust
// enforce_loop() checks disk usage periodically
if storage_usage > budget.max_gb * cleanup_threshold {
    trigger_session_cleanup();
    emit_warning_to_frontend();
}
```

## Measurement

The registry emits metrics to the frontend via Tauri events for display in the status bar and System Preferences:

```rust
// Every 2s, enforce_loop emits:
app_handle.emit("budget-metrics", BudgetMetrics {
    cpu_used: cpu_permits.acquired(),
    cpu_total: cpu_permits.total(),
    memory_rss_mb: check_rss(agentscope_pid),
    memory_limit_mb: preset.memory_mb,
    storage_used_gb: measure_disk_usage(),
    storage_limit_gb: preset.storage_gb,
    frame_avg_ms: frame_timing.average(),
    frame_target_ms: preset.frame_target_ms,
    plugin_violations: plugin_strikes.total_violations(),
    uptime_secs: start_time.elapsed().as_secs(),
});
```

## Crate Structure

```
src-tauri/crates/
  snapfzz-budget/            ← THE KERNEL
    src/
      lib.rs                 # BudgetRegistry, Preset, Resource, Permit
      detect.rs              # Hardware detection (sysinfo)
      controlled.rs          # Semaphore-based in-process budgets
      supervised.rs          # Cross-process observation + kill
      metrics.rs             # BudgetMetrics emission to frontend
```

All other crates register with `snapfzz-budget`:

```
snapfzz-budget (kernel)
  ↑ registered by:
  ├── snapfzz-agent-supervisor  → process budget (memory, health)
  ├── snapfzz-stream-pipeline   → network budget (batch rate)
  ├── snapfzz-tauri-shell       → window budget (per-layout)
  ├── snapfzz-plugin-host       → reliability budget (strikes)
  └── snapfzz-plugin-bridge     → startup budget (activation timeout)
```

## Zone Communication with Registry

Each zone communicates with the registry differently based on its placement:

### Zone 1 (Rust) — Direct API

Same process. `Arc<BudgetRegistry>` shared via Tauri managed state. Zero serialization overhead.

```rust
let permit = registry.try_acquire("stream-pipeline", Resource::CpuPermit(1))?;
// work happens
drop(permit); // released back to pool
```

### Zone 2 (Worker) — Budget envelope

Workers can't call Rust directly. Instead, Rust pre-allocates a budget envelope at Worker creation. Worker self-manages within its allocation and reports usage back periodically.

```rust
// Rust: acquire bulk permit for the Worker
let worker_budget = registry.try_acquire("zone2.state", Resource::CpuPermit(2))?;
// Pass envelope to Worker via initial message
worker.post_message(BudgetEnvelope { cpu_permits: 2, frame_target_ms: 16 });
```

No per-task round-trip through the main thread. Worker is autonomous within its envelope.

### Zone 3 (Main thread) — Read-only observation

The main thread never acquires permits. It only renders. Its relationship with the registry:

1. Reads frame target (16ms or 33ms) to configure PerformanceObserver
2. Receives budget metrics via Tauri events for status bar display
3. Reports frame violations back to Rust

Zone 3 is a **meter**, not a **gate**. It measures and reports. Rust enforces.

### Plugins — Invisible budgeting

Plugins never see the registry. Every `ctx.rust.invoke()` is tagged with the plugin ID by the PluginContext wrapper. Rust checks the registry before executing. Denied calls return errors. The plugin handles the error without knowing budgets exist.

### External (AgentScope) — Supervised observation

The registry spawns the process, writes its PID, monitors RSS and health every 2s via `enforce_loop()`. Kills and restarts when limits are exceeded. AgentScope has no awareness of being monitored.

### Communication Matrix

```
              Registry    Zone 1     Zone 2     Zone 3     Plugins    External
Registry      —           direct     envelope   events     invisible  observe+kill
Zone 1        acquire()   —          spawns     Channel    —          HTTP/spawn
Zone 2        envelope    message    —          message    —          —
Zone 3        listen()    invoke()   message    —          renders    —
Plugins       via ctx     invoke()   —          renders    bus only   —
External      monitored   HTTP/SSE   —          —          —          —
```

## Budget Degradation Protocol

When `try_acquire()` returns `None`, each budget class has a defined response:

| Budget Class | On Exhaustion | User Experience |
|---|---|---|
| CPU permits | Queue task, execute when permit available | Slight delay, no error |
| Network rate | Accumulate batch, flush on next period | Tokens arrive in larger chunks |
| Network concurrency | Return error to plugin | Plugin shows "busy, try again" |
| Plugin strikes | Plugin disabled, contributions removed | "Plugin disabled" notification |
| Frame (metered) | Report violation — no enforcement | Possible jank (logged for debugging) |
| Startup timeout | Kill hung plugin, continue boot | Plugin doesn't load, others unaffected |
| Process memory | Kill process, restart with backoff | "Reconnecting..." status |
| Process health | Restart with backoff | "Reconnecting..." status |
| Storage | Trigger cleanup, warn user | "Storage nearly full" notification |

No silent failures. Every exhaustion is either handled automatically (queue/restart) or reported to the user (notification).

---

## Horizontal Scaling via Cloud Sandboxes

Local machine has a fixed budget (2GB, 4 cores). For scale beyond local limits, the registry manages cloud sandbox processes with the same `register_process()` API:

```
BudgetRegistry
├── local (supervised via sysinfo + health)
│   └── agentscope-local: 512MB, localhost:8090
│
├── cloud (supervised via health only — no sysinfo for remote)
│   ├── sandbox-1: 2GB, cloud:8090
│   ├── sandbox-2: 2GB, cloud:8091
│   └── sandbox-N: ...
```

The registry doesn't care where the process runs. `register_process()` takes a `health_url` — local or remote. `enforce_loop()` polls the same way. Cloud processes get health-based supervision (HTTP poll + kill via API). Local processes get health + RSS monitoring.

This enables: 1000 agents across N cloud sandboxes, all supervised by one registry on the user's machine. The local budget stays within preset limits. Cloud budgets are separate allocations.

## Trust Boundaries

### Plugin trust: human-gated

Agents can write plugins. Humans install them. The plugin SDK is the permission boundary. No hot-reload from agents. No automatic installation.

```
Agent writes plugin code → saved to workspace
Human reviews plugin → approves installation
Plugin manifest declares budget → registry allocates
Plugin activates through SDK → capabilities gated
```

### Process trust: registry-supervised

Every spawned process (local AgentScope, cloud sandboxes) is supervised by the registry. The process doesn't know it's being monitored. The registry kills processes that exceed their budget. No process runs without a `ProcessBudget` allocation.

### Capability trust: SDK-enforced

Every `ctx.rust.invoke()` call is tagged with the plugin ID. The Rust side checks:
1. Is this plugin's budget still valid? (not disabled by strikes)
2. Does this plugin declare this capability? (manifest.budget.capabilities)
3. Is the concurrency limit exceeded? (network.maxConcurrentInvokes)

Denied calls return errors. The plugin handles gracefully without knowing why.

## Relation to Philosophy

From learning 011 — Resource-Budgeted Architecture:

```
"A budget that is defined but not enforced is a wish.
 A budget that is enforced but not measured is a guess.
 All three must be present for the budget to be real."
```

The Budget Registry provides all three:
- Defined: presets declare limits
- Enforced: semaphores gate access, enforce_loop kills violators
- Measured: metrics emitted every 2s to frontend
