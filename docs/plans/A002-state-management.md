---
title: "State Management Architecture — Worker-First for 60fps"
type: feat
date: 2026-04-02
source: "4-agent parallel research on Worker state management, Tauri IPC, SSE offloading"
---

# State Management: Worker-First Architecture

The main thread does ONE thing: render at 60fps. Everything else runs somewhere else.

---

## The Problem

Four heavy data streams compete with React rendering on the main thread:

| Stream | Source | Frequency | Main Thread Cost |
|---|---|---|---|
| Agent tokens (SSE) | Python sidecar :8000 | 100-250 tok/s | JSON.parse + state update per token |
| HMR updates | Vite dev server :3000 | On every file save | WebSocket parse + module update |
| Console capture | Preview WebView | Every console.log/error | postMessage + state update |
| File watcher | Tauri Rust backend | On every file change | Channel event + state update |

At peak load (agent generating code + user testing in preview + HMR firing), this **kills 60fps** because parsing, state updates, and rendering all compete for the same thread.

---

## The Architecture: Three Zones

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ZONE 1: RUST (Native Speed)                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ • SSE consumer (reqwest-eventsource)                       │  │
│  │ • Token batching (16ms frame-budget batches)               │  │
│  │ • File watcher (notify crate)                              │  │
│  │ • Process lifecycle (sidecar spawn/crash/restart)          │  │
│  │ • Channel API → pushes pre-parsed data to JS              │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │ Tauri Channel (< 8KB = direct eval)│
│  ZONE 2: WEB WORKER (Background JS)                             │
│  ┌──────────────────────────▼─────────────────────────────────┐  │
│  │ • Syntax highlighting (Shiki via Web Worker)               │  │
│  │ • Diff computation (code changes → render-ready diffs)     │  │
│  │ • Markdown rendering (agent messages → HTML)               │  │
│  │ • State reducer (use-workerized-reducer)                   │  │
│  │ • Timer management (worker-timers for accurate debounce)   │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │ postMessage (structured clone)     │
│  ZONE 3: MAIN THREAD (Rendering Only)                           │
│  ┌──────────────────────────▼─────────────────────────────────┐  │
│  │ • React rendering (60fps)                                  │  │
│  │ • User input handling                                      │  │
│  │ • CSS animations (compositor-only)                         │  │
│  │ • Layout/paint                                             │  │
│  │ • useTransition for non-urgent updates                     │  │
│  │ • useDeferredValue for expensive renders                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Zone 1: Rust — SSE Consumer + File Watcher

### Decision: Parse SSE in Rust, not JavaScript

**Why:** Eliminates ALL JavaScript parsing overhead. Data arrives at the main thread already structured and batched. The Tauri Channel API auto-optimizes delivery (< 8KB = direct eval, fast path).

**Evidence:** llama.cpp fixed a UI freeze at 250+ tok/s by adding RAF yields. We skip the problem entirely — tokens never touch the JS parsing pipeline.

```rust
// src-tauri/src/stream.rs
use reqwest_eventsource::EventSource;
use tauri::ipc::Channel;
use std::time::{Duration, Instant};

#[derive(Clone, Serialize)]
pub struct TokenBatch {
    pub content: String,
    pub batch_id: u32,
    pub token_count: usize,
}

#[tauri::command]
pub async fn consume_agent_stream(
    url: String,
    on_event: Channel<TokenBatch>,
) -> Result<(), String> {
    let mut es = EventSource::get(&url);
    let mut batch = String::new();
    let mut batch_id: u32 = 0;
    let mut token_count: usize = 0;
    let mut batch_start = Instant::now();

    while let Some(event) = es.next().await {
        match event {
            Ok(Event::Message(msg)) => {
                batch.push_str(&msg.data);
                token_count += 1;

                // Flush every 16ms (1 frame budget)
                if batch_start.elapsed() >= Duration::from_millis(16) {
                    on_event.send(TokenBatch {
                        content: std::mem::take(&mut batch),
                        batch_id,
                        token_count,
                    }).map_err(|e| e.to_string())?;
                    batch_id += 1;
                    token_count = 0;
                    batch_start = Instant::now();
                }
            }
            Err(e) => return Err(e.to_string()),
        }
    }

    // Flush remaining
    if !batch.is_empty() {
        on_event.send(TokenBatch { content: batch, batch_id, token_count })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

**Cargo.toml additions:**
```toml
[dependencies]
reqwest = { version = "0.12", features = ["stream"] }
reqwest-eventsource = "0.6"
```

---

## Zone 2: Web Worker — Processing Pipeline

### Two Workers

| Worker | Responsibility | Library |
|---|---|---|
| **StateWorker** | App state reducer, action dispatch | `use-workerized-reducer` + `comlink` |
| **HighlightWorker** | Syntax highlighting for code blocks in chat | `shiki` |

Note: Diff and git operations run in Rust (`git2-rs`) + Monaco's built-in diff editor. No JS workers needed for those.

### StateWorker — The Brain

Runs the entire app state machine off the main thread. Main thread receives render-ready state patches only.

```typescript
// workers/state-worker.ts
import { initWorkerizedReducer } from 'use-workerized-reducer';

interface AppState {
  tokens: string;
  messages: Message[];
  buildProgress: BuildProgress;
  previewStatus: PreviewStatus;
  evalScores: EvalScores;
}

initWorkerizedReducer('app', async (state, action) => {
  switch (action.type) {
    case 'TOKEN_BATCH': {
      // Append tokens (Immer handles immutability)
      state.tokens += action.payload.content;
      // Update the latest message content
      const last = state.messages[state.messages.length - 1];
      if (last?.role === 'assistant') {
        last.content += action.payload.content;
      }
      break;
    }
    case 'BUILD_PROGRESS':
      state.buildProgress = action.payload;
      break;
    case 'CONSOLE_ERROR':
      state.previewStatus.errors.push(action.payload);
      break;
    case 'HMR_UPDATE':
      state.previewStatus.lastHMR = Date.now();
      break;
  }
});
```

```typescript
// App.tsx — main thread receives render-ready state
import { useWorkerizedReducer } from 'use-workerized-reducer/react';

const stateWorker = new Worker(
  new URL('./workers/state-worker.ts', import.meta.url),
  { type: 'module' }
);

function App() {
  const [state, dispatch, busy] = useWorkerizedReducer(
    stateWorker, 'app',
    { tokens: '', messages: [], buildProgress: null, previewStatus: null, evalScores: null }
  );

  // State arrives as patches — only changed fields trigger re-render
  return <ChatPanel messages={state.messages} busy={busy} />;
}
```

**Why `use-workerized-reducer`:**
- Immer-based patches — only sends changed state to main thread (not full clone)
- `busy` flag — know when worker is processing (show loading indicator)
- Async reducers — can do heavy computation inside the reducer
- 5KB bundle, maintained by Surma (Chrome engineer)

### HighlightWorker — Syntax Highlighting

```typescript
// workers/highlight-worker.ts
import { expose } from 'comlink';
import { createHighlighter } from 'shiki';

const highlighter = await createHighlighter({
  themes: ['github-dark', 'github-light'],
  langs: ['typescript', 'python', 'rust', 'javascript', 'json', 'html', 'css'],
});

const api = {
  highlight(code: string, lang: string, theme: string): string {
    return highlighter.codeToHtml(code, { lang, theme });
  },
  // Batch highlight for multiple code blocks in a message
  highlightBatch(blocks: { code: string; lang: string }[], theme: string): string[] {
    return blocks.map(b => highlighter.codeToHtml(b.code, { lang: b.lang, theme }));
  },
};

expose(api);
```

```typescript
// Used in ChatMessage component
const highlightWorker = wrap<typeof api>(
  new Worker(new URL('./workers/highlight-worker.ts', import.meta.url), { type: 'module' })
);

// Called when a code block appears in a message
const html = await highlightWorker.highlight(code, 'typescript', 'github-dark');
```

### DiffWorker — File Change Display

```typescript
// workers/diff-worker.ts
import { expose } from 'comlink';

const api = {
  computeDiff(oldContent: string, newContent: string): DiffResult {
    // Unified diff computation — heavy for large files
    return unifiedDiff(oldContent, newContent);
  },
};

expose(api);
```

---

## Zone 3: Main Thread — Render Only

The main thread receives:
1. **State patches** from StateWorker (via `use-workerized-reducer`)
2. **Highlighted HTML** from HighlightWorker (via `comlink`)
3. **Diff results** from DiffWorker (via `comlink`)

It does NOT:
- Parse SSE streams
- Compute diffs
- Run syntax highlighting
- Parse JSON from the backend
- Manage timers for debouncing

### React Concurrent Features (Complement, Not Replace Workers)

```typescript
// Non-urgent state updates don't block user input
const [isPending, startTransition] = useTransition();

function onTokenBatch(batch: TokenBatch) {
  startTransition(() => {
    dispatch({ type: 'TOKEN_BATCH', payload: batch });
  });
}

// Expensive renders are deferred
const deferredMessages = useDeferredValue(state.messages);

return (
  <>
    <MessageCount count={state.messages.length} />  {/* Immediate */}
    <ChatList messages={deferredMessages} />          {/* Deferred */}
  </>
);
```

---

## Data Flow: Complete Pipeline

```
Python AgentScope (SSE at :8000)
    │
    ▼
Rust SSE Consumer (reqwest-eventsource)
    │ Parses SSE, batches tokens every 16ms
    ▼
Tauri Channel API
    │ < 8KB direct eval (fast path)
    ▼
Main Thread receives TokenBatch
    │
    ├─→ dispatch('TOKEN_BATCH') ──→ StateWorker (reducer)
    │                                    │
    │                                    ▼ Immer patch
    │                               Main thread re-renders
    │
    ├─→ highlightWorker.highlight() ──→ HighlightWorker
    │                                        │
    │                                        ▼ HTML string
    │                                   Code block renders
    │
    └─→ diffWorker.computeDiff() ──→ DiffWorker
                                         │
                                         ▼ DiffResult
                                    Diff view renders
```

---

## Tauri-Specific Constraints

| Constraint | Impact | Solution |
|---|---|---|
| `__TAURI_INTERNALS__` not available in Workers | Workers can't call Tauri commands | Main thread bridges: Channel → postMessage → Worker |
| Channel API delivers to main thread only | Can't push directly to Worker | Main thread forwards via postMessage (negligible cost for pre-batched data) |
| SharedArrayBuffer requires COOP/COEP headers | Need to configure in tauri.conf.json | Set headers in security config |
| Worker bundling with Vite | Standard `new Worker(new URL(...))` works | Vite handles bundling automatically |

### tauri.conf.json

```json
{
  "app": {
    "security": {
      "headers": {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    }
  }
}
```

---

## Why Not SharedArrayBuffer for State?

SharedArrayBuffer is available but **wrong for this use case:**

- SSE tokens are text strings — SAB is for typed arrays
- State updates are JSON-shaped — SAB requires manual serialization
- Immer patches are ~100 bytes per update — structured clone is fast enough
- Atomics add complexity without matching benefit

**Use SAB only for:** Real-time audio, canvas pixel buffers, or shared counters (not relevant here).

---

## Timer Management: worker-timers

Debounce/throttle timers run in Worker to avoid Tauri WebView throttling when minimized:

```typescript
import { setTimeout, clearTimeout } from 'worker-timers';

// HMR debounce — fires accurately even when app is in background
let hmrTimeout: number;
function debounceHMR(update: HMRUpdate) {
  clearTimeout(hmrTimeout);
  hmrTimeout = setTimeout(() => {
    dispatch({ type: 'HMR_UPDATE', payload: update });
  }, 300);
}
```

---

## Package Stack Addition

```json
{
  "dependencies": {
    "comlink": "^4.4",
    "use-workerized-reducer": "^0.3",
    "worker-timers": "^8.0",
    "immer": "^10.0"
  }
}
```

| Package | Size | Purpose |
|---|---|---|
| `comlink` | 1.1KB gz | RPC for HighlightWorker + DiffWorker |
| `use-workerized-reducer` | 5KB | State management in Worker (Immer patches) |
| `worker-timers` | 3KB | Accurate timers off main thread |
| `immer` | 13KB | Immutable state patches (used by workerized-reducer) |
| **Total** | **~22KB** | |

---

## Production Inspiration

| Product | Worker Pattern | What We Took |
|---|---|---|
| **Figma** | Entire canvas in Worker + OffscreenCanvas + WASM | The philosophy: main thread = render only |
| **Excalidraw** | Worker pool with TTL-based cleanup | Recyclable workers for bursty workloads |
| **Monaco Editor** | Per-language workers for syntax/type checking | Dedicated HighlightWorker pattern |
| **VS Code Web** | Extension host in Worker + MessageChannel | Worker isolation for untrusted code |
| **Stockroom** | Full store in Worker with bidirectional sync | use-workerized-reducer is the modern version |
| **llama.cpp** | RAF batching to prevent UI freeze at 250+ tok/s | 16ms batch budget in Rust SSE consumer |

---

## What Goes Where — Quick Reference

| Data | Zone | Why |
|---|---|---|
| SSE parsing | **Rust** | Zero JS overhead, native speed |
| Token batching | **Rust** | 16ms frame-budget batching at the source |
| State mutations | **Worker** (StateWorker) | Immer patches, async reducers |
| Syntax highlighting | **Worker** (HighlightWorker) | Shiki is heavy, renders HTML |
| Diff computation | **Worker** (DiffWorker) | O(n) algorithm, blocks if on main thread |
| Markdown → HTML | **Worker** (StateWorker or dedicated) | Marked/remark rendering |
| Timer debounce | **Worker** (worker-timers) | Accurate even when app is minimized |
| React rendering | **Main thread** | Only thing that MUST be on main thread |
| User input | **Main thread** | DOM events are main-thread-only |
| CSS animations | **Compositor** | GPU thread, not even main thread |
