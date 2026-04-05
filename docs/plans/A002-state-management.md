---
title: "A002 — CPU Budget Enforcement (Zone Placement)"
type: architecture
date: 2026-04-05
derives-from: A008
budget: cpu
---

# A002 — CPU Budget Enforcement (Zone Placement)

The main thread does ONE thing: render. Everything else runs somewhere else. Zone placement is how the CPU budget is enforced.

## Registry Contract

```
Budget class: "cpu"
Domain: Controlled (in-process, semaphore-gated)
Source of truth: A008 preset.cpu_permits

Enforcement:
  - Zone 1 (Rust): try_acquire("stream-pipeline", CpuPermit) before SSE parsing
  - Zone 2 (Worker): BudgetEnvelope allocated at Worker creation, self-managed
  - Zone 3 (Main): no permits needed — rendering only, metered by frame budget
  - External (AgentScope): supervised, not gated

Measurement:
  - PerformanceObserver longtask detection (Zone 3 violation = computation leaked to main thread)
  - Worker envelope usage reported back periodically
```

---

## The Problem

Four data streams compete for the main thread:

| Stream | Source | Frequency |
|---|---|---|
| Agent tokens (SSE) | AgentScope Runtime :8090 | 100-250 tok/s |
| HMR updates | Vite dev server | On file save |
| Console capture | Preview WebView | On console.log/error |
| File watcher | Rust backend | On file change |

Without zone placement, parsing + state updates + rendering all compete for the same 16ms frame.

---

## Three Zones

```
ZONE 1: RUST (Native)
  Registry: try_acquire("stream-pipeline", CpuPermit(1))
  ┌────────────────────────────────────────────────┐
  │ SSE consumer (reqwest + line parsing)           │
  │ Token batching (preset.batch_rate_ms)           │
  │ File watcher (notify crate)                     │
  │ Process supervision (Budget Registry enforce_loop) │
  │ Channel API → pushes pre-parsed data to JS      │
  └──────────────────────┬─────────────────────────┘
                         │ Tauri Channel (< 8KB = direct eval)

ZONE 2: WEB WORKER (Background JS)
  Registry: BudgetEnvelope allocated at creation
  ┌──────────────────────▼─────────────────────────┐
  │ Syntax highlighting (Shiki)                     │
  │ Diff computation                                │
  │ State reducer (use-workerized-reducer)          │
  │ Self-manages within envelope, reports usage     │
  └──────────────────────┬─────────────────────────┘
                         │ postMessage (structured clone)

ZONE 3: MAIN THREAD (Rendering Only)
  Registry: no permits — metered by frame budget (A001)
  ┌──────────────────────▼─────────────────────────┐
  │ React rendering                                 │
  │ User input handling                             │
  │ CSS animations (compositor-only)                │
  │ Pretext layout (arithmetic — no DOM measurement)│
  │ PerformanceObserver reports violations           │
  └────────────────────────────────────────────────┘

EXTERNAL: AgentScope Runtime (Supervised)
  Registry: register_process("agentscope", ProcessBudget)
  ┌────────────────────────────────────────────────┐
  │ Agent orchestration, LLM calls, tools, memory   │
  │ RSS monitored via sysinfo (local)               │
  │ Health monitored via HTTP (local + cloud)        │
  │ Killed + restarted if over budget               │
  └────────────────────────────────────────────────┘
```

---

## Zone 1: Rust — SSE Consumer

Parse SSE in Rust. Data arrives at the main thread already structured and batched.

```rust
let batch_rate = registry.query("frame").batch_rate_ms;  // from A008 preset

while let Some(line) = reader.next_line().await? {
    if let Some(data) = line.strip_prefix("data: ") {
        batch.push_str(data);
        token_count += 1;

        if batch_start.elapsed() >= Duration::from_millis(batch_rate) {
            channel.send(ContentBlockBatch { content: batch, batch_id, token_count })?;
            batch = String::new();
            batch_id += 1;
            token_count = 0;
            batch_start = Instant::now();
        }
    }
}
```

Batch rate reads from registry — not hardcoded. Battery mode: 33ms. Performance: 16ms.

---

## Zone 2: Web Worker — Budget Envelope

Workers receive a pre-allocated budget envelope at creation. No per-task round-trip to Rust.

```rust
// Rust: allocate envelope for the Worker
let worker_budget = registry.try_acquire("zone2.state", Resource::CpuPermit(2))?;
// Pass to Worker via initial postMessage
worker.post_message(BudgetEnvelope { cpu_permits: 2 });
```

```typescript
// Worker: self-manages within envelope
const envelope = await receiveEnvelope();
let remaining = envelope.cpu_permits;

function canRun(): boolean { return remaining > 0; }
function recordWork() { remaining--; }

// Periodically report usage back to main thread → Rust registry
setInterval(() => {
  postMessage({ type: 'budget_report', used: envelope.cpu_permits - remaining });
  remaining = envelope.cpu_permits;  // reset for next period
}, 1000);
```

### Two Workers

| Worker | Responsibility | Library |
|---|---|---|
| StateWorker | App state reducer | `use-workerized-reducer` + `comlink` |
| HighlightWorker | Syntax highlighting | `shiki` |

---

## Zone 3: Main Thread — Rendering Only

No computation. No parsing. No sorting. State arrives pre-computed from Zone 2 or pre-parsed from Zone 1.

```typescript
// CORRECT: render pre-computed state
function ChatPanel({ messages }) {
  return <PretextList items={messages} estimateHeight={cachedHeight} ... />;
}

// WRONG: compute during render
function ChatPanel({ rawTokens }) {
  const messages = parseTokensIntoMessages(rawTokens);  // ZONE VIOLATION
  return <PretextList items={messages} ... />;
}
```

If it computes → Zone 1 or Zone 2. If it renders → Zone 3. No exceptions.

---

## Zone Violation Detection

```typescript
// PerformanceObserver detects computation that leaked to Zone 3
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > frame_target_ms) {
      invoke('budget_report_violation', {
        class: 'cpu',
        zone: 'zone3',
        actual_ms: entry.duration,
      });
    }
  }
});
observer.observe({ type: 'longtask' });
```

---

## Anti-Corruption Layer

AgentScope Runtime emits SSE in its own format. We parse into our own `StreamEvent` enum at the Rust boundary. If AgentScope changes their format, we change one parser — nothing downstream knows.

```rust
pub enum StreamEvent {
    ContentDelta { text: String, sequence: u32 },
    ThinkingDelta { text: String },
    ToolCall { id: String, name: String, input: Value },
    ToolResult { id: String, output: Value },
    StreamStart { session_id: String },
    StreamEnd { usage: TokenUsage },
    Error { code: String, message: String },
}

impl StreamEvent {
    fn from_agentscope_sse(line: &str) -> Option<Self> {
        // Parse AgentScope format into our types
        // This is the ONLY place that knows AgentScope's wire format
    }
}
```

---

## Budget Degradation (per A008)

| Zone | On Budget Exhaustion |
|---|---|
| Zone 1 (CPU permits) | Queue the task, execute when permit available |
| Zone 2 (envelope exhausted) | Worker stops non-critical work, waits for next period |
| Zone 3 (frame violation) | Report to registry — meter, no enforcement |
| External (memory exceeded) | Kill process, restart with backoff |
