---
title: "A001 — Frame Budget Enforcement"
type: architecture
date: 2026-04-05
derives-from: A008
budget: frame
---

# A001 — Frame Budget Enforcement

How the app protects the user's visual fluency. Every rendering decision traces to the frame budget allocated by the Budget Registry (A008).

## Registry Contract

```
Budget class: "frame"
Domain: Controlled (in-process)
Source of truth: A008 preset.batch_interval_ms
  Performance: 16ms (batch every 16ms)
  Balanced:    16ms (batch every 16ms)
  Battery:     33ms (batch every 33ms)

Enforcement:
  - CSS containment (structural — browser enforces)
  - Pretext arithmetic layout (structural — no DOM measurement possible)
  - GPU-only animations (structural — never trigger layout)
  - 16ms/33ms SSE batch coalescing (registry-governed rate)
Measurement:
  - PerformanceObserver for longtask > frame_target_ms
  - FPS counter in status bar (continuous display)
  - Violations reported to registry: budget_report_violation()
```

---

## Critical Architecture Decision: Child WebViews, Not Iframes

Use Tauri's native `window.add_child()` WebView API for preview, NOT `<iframe>`.

- Tauri Issue #6204: iframe IPC broken on Windows
- Child WebViews get full IPC, independent CSP, `.auto_resize()`
- Each WebView has its own frame budget (A007 multi-layout)

```rust
let preview = main_window.add_child(
  WebviewBuilder::new("preview",
    WebviewUrl::External("http://localhost:3000".parse().unwrap())
  ).auto_resize(),
  LogicalPosition::new(width / 2., 0.),
  LogicalSize::new(width / 2., height),
)?;
```

---

## Split Pane: react-resizable-panels

CSS flexbox-based (`flexGrow`) — browser compositor handles it. `useSyncExternalStore` — no React re-renders during drag. Used by CodeSandbox Sandpack in production.

Only update WebView dimensions on `onLayoutChanged` (drag end), not `onLayoutChange`.

---

## Chat: Pretext-Powered Virtualization

**Decision:** Custom `PretextList` virtualizer using `@chenglou/pretext` for exact height measurement. Replaces react-virtuoso.

**Why:** react-virtuoso estimates heights via DOM measurement — violates the frame budget by forcing synchronous reflow. Pretext computes heights via pure arithmetic (`prepare()` + `layout()`). Zero DOM reads in the hot path.

**Pattern:**
```tsx
<PretextList
  items={messages}
  estimateHeight={pretextMeasuredHeight}  // prepare()+layout() cached per message
  renderItem={(msg) => <PretextBubble><PretextMarkdown text={msg.content} /></PretextBubble>}
  keyExtractor={(msg) => msg.id}
  followOutput
/>
```

**Height cache:** `prepare()` called once when message content changes (useMemo). `layout()` is arithmetic-only on resize (useLayoutEffect). Heights cached per message ID — never recomputed.

**Visible range:** Binary search O(log n) — scales to 10K+ messages without degradation.

---

## Code Editor: Monaco (Lazy) + Shiki (Worker)

| Use case | Library | Bundle | Zone |
|---|---|---|---|
| Editable code (Code tab) | `monaco-editor` | ~5MB (lazy-loaded) | Zone 3 (render) |
| Read-only code blocks (chat) | `shiki` (Web Worker) | ~200KB | Zone 2 (worker) |

Monaco is lazy-loaded — only when Code tab opens. Doesn't affect startup budget (A003).

---

## Animations: GPU-Only

**Hard rules (from frame budget):**
- NEVER animate `width`, `height`, `top`, `left`, `margin` — use `transform` and `opacity` only
- NEVER use `setInterval` — `requestAnimationFrame` only
- CSS `contain: strict` on every independent panel
- `content-visibility: auto` on off-screen messages

| Tier | Method | Use For |
|---|---|---|
| 1 | Pure CSS transitions | Hover, theme switch |
| 2 | `@formkit/auto-animate` | List enter/exit (<3KB) |
| 3 | `motion` (WAAPI) | Scroll reveals (3.8KB) |

---

## CSS Containment: Frame Budget Isolation

```css
.chat-panel { contain: content; }     /* Chat doesn't repaint when preview updates */
.preview-panel { contain: strict; }   /* Preview is fully independent */
.file-tree-item { contain: layout; }  /* File tree items isolated */
.chat-message {                       /* Skip off-screen messages */
  content-visibility: auto;
  contain-intrinsic-size: 1px 80px;
}
```

Evidence: OpenTable reduced layout time 6× (11.21ms → 1.89ms) with `contain: strict`.

---

## SSE Streaming Pipeline

Agent tokens flow through Rust (Zone 1), never parsed on the main thread.

```
AgentScope Runtime (localhost:8090/process)
    ↓ SSE stream (sequence-numbered events)
Rust: parse events, extract content blocks
Rust: batch at registry.query("frame").batch_rate_ms
    ↓ Tauri Channel API (< 8KB = direct eval)
Frontend: append to message state, render
```

Batch rate comes from the Budget Registry preset — not hardcoded. Battery mode uses 33ms, Performance uses 16ms.

---

## IPC: Tauri v2 Channel API

For high-frequency updates (SSE tokens, file watcher): Channel API, not invoke.

```typescript
const channel = new Channel<ContentBlockBatch>();
channel.onmessage = (batch) => { appendToMessages(batch); };
await invoke('send_message', { text, sessionId, onToken: channel });
```

< 8KB payloads: direct eval (fastest path). Larger: fetch.

---

## Performance Metrics

| Metric | Target (from A008 preset) | Tool |
|---|---|---|
| Frame drops during scroll | 0 | PerformanceObserver |
| Long tasks (>50ms) | 0 during interaction | Long Task API |
| LCP | < 2.5s | Web Vitals |
| CLS | < 0.1 | Web Vitals |
| JS bundle (initial) | < 200KB gzipped | Bundle analyzer |
