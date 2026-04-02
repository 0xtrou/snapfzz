---
title: "Performance Architecture — Technical Decisions"
type: feat
date: 2026-04-02
source: "7-agent parallel research on Tauri + React + live preview performance"
---

# Performance Architecture

Technical decisions for achieving 60fps, sub-200ms interactions, and smooth live preview across all platforms. Every decision is backed by research evidence from official docs, production apps, and open-source implementations.

---

## Critical Architecture Decision: Child WebViews, Not Iframes

**Decision:** Use Tauri's native `window.add_child()` WebView API for the preview pane, NOT `<iframe>`.

**Why:**
- Tauri Issue #6204 (OPEN): iframe IPC is broken on Windows — Rust callbacks fire on parent, not iframe
- Issue #10935: iframes cause `__TAURI_INVOKE__ is not a function` console spam on Windows
- Child WebViews get full IPC, independent CSP, and `.auto_resize()` for 60fps pane resizing

**Pattern:**
```rust
// Two child WebViews in one Tauri window
let editor = main_window.add_child(
  WebviewBuilder::new("editor", WebviewUrl::App("/editor".into()))
    .auto_resize(),
  LogicalPosition::new(0., 0.),
  LogicalSize::new(width / 2., height),
)?;

let preview = main_window.add_child(
  WebviewBuilder::new("preview",
    WebviewUrl::External("http://localhost:3000".parse().unwrap())
  ).auto_resize(),
  LogicalPosition::new(width / 2., 0.),
  LogicalSize::new(width / 2., height),
)?;
```

**Known risk:** Linux WebKitGTK has a resize bug after ~6 resizes (Issue #10131). Monitor and workaround with manual size setting.

**Source:** [Tauri multiwebview example](https://github.com/tauri-apps/tauri/blob/b27be063ff3052cb1071ac3ec719cfa104460fa4/examples/multiwebview/main.rs)

---

## Split Pane: react-resizable-panels

**Decision:** Use `react-resizable-panels` (bvaughn, 5.2K stars) for the editor-side internal layout.

**Why over Allotment:**
- CSS flexbox-based (`flexGrow`) — browser compositor handles it, guaranteed 60fps
- `useSyncExternalStore` — no React re-renders during drag
- Used by CodeSandbox Sandpack in production
- `pointer-events: none` auto-applied to panels during drag (prevents iframe capture)
- Two callbacks: `onLayoutChange` (every frame) and `onLayoutChanged` (drag end only)

**Pattern:**
```tsx
<PanelGroup direction="horizontal" onLayoutChanged={handleLayoutChanged}>
  <Panel defaultSize={50} minSize={20}>
    <ChatAndEditor />
  </Panel>
  <PanelResizeHandle />
  <Panel minSize={20}>
    <LivePreview />
  </Panel>
</PanelGroup>
```

**Key rule:** Only update iframe/WebView dimensions on `onLayoutChanged` (drag end), not `onLayoutChange`.

---

## Live Preview: HMR Pipeline

**Decision:** Agent writes files → Vite/Next.js dev server HMR → WebView auto-updates via WebSocket.

**Architecture:**
```
AgentScope writes file (MCP write_text_file)
    ↓
Vite/Next.js filesystem watcher detects change
    ↓
HMR module graph updated
    ↓
WebSocket pushes delta to all connected clients
    ↓
Preview WebView receives update (~200ms total)
    ↓
React Fast Refresh preserves component state
```

**Vite config for reliable HMR in Tauri:**
```typescript
export default defineConfig({
  server: {
    host: 'localhost',
    port: 3000,
    hmr: {
      host: 'localhost',
      port: 3000,
      protocol: 'ws',
    },
    cors: true,
    watch: {
      usePolling: false, // Native watcher is faster
    },
  },
});
```

**Console/error capture:** Inject via Tauri `initialization_script` on preview WebView:
```javascript
// Captures console.error and forwards to parent via Tauri event
const origError = console.error;
console.error = (...args) => {
  origError.apply(console, args);
  window.__TAURI_INTERNALS__?.invoke('preview_error', {
    message: args.map(String).join(' ')
  });
};
```

**Reference:** Sandpack's [consoleHook.ts](https://github.com/codesandbox/sandpack/blob/main/sandpack-client/src/inject-scripts/consoleHook.ts) and [historyListener.ts](https://github.com/codesandbox/sandpack/blob/main/sandpack-client/src/clients/node/inject-scripts/historyListener.ts)

---

## Triple Viewport: 3 WebViews

**Decision:** 3 independent Tauri child WebViews, not 3 iframes.

**Memory budget:** ~75-180MB per React dev instance × 3 = 225-540MB. Acceptable on 8GB+ machines.

**Resource sharing:** Same-origin WebViews share HTTP cache, connections. Each has independent WS for HMR.

**Performance rules:**
```css
/* CSS containment on each viewport container */
.viewport-panel {
  contain: strict;
  content-visibility: auto;
  contain-intrinsic-size: 768px 1024px;
}
```

- Stagger HMR: 50-100ms delay between WebView reloads to prevent simultaneous re-renders
- Inactive viewports: `pointer-events: none` for UX (prevents accidental interaction), NOT for performance
- 3 viewports is well within safe zone — Polypane/Responsively handle 8-15+ without issues

**Alternative considered:** Single WebView + CSS container queries. Rejected — requires refactoring every target app to use `@container` instead of `@media`, not viable for arbitrary OSS projects.

---

## Chat: Streaming + Virtual Scrolling

**Decision:** `react-virtuoso` for chat message list.

**Why:**
- Purpose-built `VirtuosoMessageList` API with `followOutput="smooth"`
- Variable-height messages handled automatically
- Bi-directional infinite scroll (load older messages)
- 60fps scroll with ~20 DOM nodes regardless of history length
- `ScrollSeekPlaceholder` for fast-scroll optimization

**Pattern:**
```tsx
<Virtuoso
  data={messages}
  followOutput={(isAtBottom) => isAtBottom ? 'smooth' : false}
  initialTopMostItemIndex={messages.length - 1}
  itemContent={(_, msg) => <ChatMessage message={msg} />}
/>
```

**SSE streaming:** Fetch + ReadableStream (not EventSource) — supports POST, custom headers, abort.

**Backpressure:** Batch tokens (100-200) before rendering, flush via `requestAnimationFrame`.

---

## Code Editor: Monaco

**Decision:** Monaco Editor for the Code tab (full VS Code editing), Shiki for read-only code blocks in chat.

| Use case | Library | Bundle |
|---|---|---|
| Editable code (Code tab) | `monaco-editor` | ~5MB (lazy-loaded, chunked) |
| Read-only code blocks (chat) | `shiki` (Web Worker) | ~200KB, zero runtime JS |

**Why Monaco over CodeMirror:** This IS an IDE. Full IntelliSense, multi-cursor, go-to-definition, built-in diff editor, minimap. The 5MB is lazy-loaded (only when Code tab opens) so it doesn't affect startup.

**Shiki in Web Worker:** Offload syntax highlighting for chat code blocks to keep main thread free during streaming.

---

## Animations: Tiered Approach

| Tier | Library | Use For | Bundle |
|---|---|---|---|
| 1 | Pure CSS | Transitions, hover, theme switch | 0KB |
| 2 | `@formkit/auto-animate` | List enter/exit/reorder | <3KB |
| 3 | `motion` (WAAPI) | Scroll reveals, stagger | 3.8KB |
| 4 | `motion/react` (LazyMotion) | Layout animations, gestures (rare) | 15KB |

**Hard rules:**
- NEVER animate `width`, `height`, `top`, `left`, `margin` — use `transform` and `opacity` only
- NEVER use `setInterval` for animation — `requestAnimationFrame` only
- CSS `contain: content` on every independent panel (chat, code, preview, file tree)
- `content-visibility: auto` on off-screen chat messages

---

## CSS Containment: Isolation Zones

```css
/* Chat panel doesn't repaint when preview updates */
.chat-panel { contain: content; }

/* Preview is fully independent */
.preview-panel { contain: strict; }

/* File tree items */
.file-tree-item { contain: layout; }

/* Code blocks in chat — skip rendering when off-screen */
.chat-message { content-visibility: auto; contain-intrinsic-size: 1px 80px; }
```

**Evidence:** OpenTable reduced layout time 6× (11.21ms → 1.89ms) with `contain: strict`.

---

## Python Sidecar: Lifecycle

**Spawn:** Tauri Shell plugin `sidecar()` with `externalBin` bundling.

**Communication:** SSE over HTTP (localhost:8000). Agent → React via `fetch` + `ReadableStream`.

**Crash recovery:** Monitor `CommandEvent::Terminated`, auto-restart with backoff (max 3 attempts/5min).

**Graceful shutdown:** Tauri listens `close-requested` → SIGTERM to Python → 5s grace → SIGKILL.

**Python side:**
```python
signal.signal(signal.SIGTERM, lambda s, f: cleanup_and_exit())
```

**Production reference:** [Benito Martin's Tauri + FastAPI + llama.cpp](https://aiechoes.substack.com/p/building-production-ready-desktop) — bundled with PyInstaller, SSE streaming, UTF-8 fixes for Windows.

---

## IPC: Tauri v2 Channel API

**For high-frequency updates** (file watcher → HMR notifications): Use Tauri Channel API, not invoke.

```typescript
const hmrChannel = new Channel<HMRNotification>();
hmrChannel.onmessage = (msg) => { /* trigger preview refresh */ };
await invoke('watch_files', { path: '/src', onEvent: hmrChannel });
```

**Performance:** <8KB payloads go through direct eval (fastest path). Larger payloads use fetch.

---

## Platform-Specific Notes

| Platform | WebView Engine | Notes |
|---|---|---|
| macOS | WKWebView | Primary target. 60fps cap by default. Use `tauri-plugin-macos-fps` to unlock 120Hz on Apple Silicon. |

---

## Package Stack

```json
{
  "dependencies": {
    "react-virtuoso": "^4.7",
    "react-resizable-panels": "^2.1",
    "monaco-editor": "^0.52",
    "shiki": "^3.0",
    "motion": "^12.0",
    "@formkit/auto-animate": "^0.8",
    "@agentscope-ai/design": "latest",
    "@agentscope-ai/chat": "latest"
  },
  "devDependencies": {
    "tauri-plugin-macos-fps": "^0.1"
  }
}
```

---

## Eval: Performance Metrics

Every build is measured. Part of the ME eval benchmark:

| Metric | Target | Tool |
|---|---|---|
| Lighthouse Performance | ≥ 90 | Lighthouse CI |
| LCP | < 2.5s | Web Vitals |
| CLS | < 0.1 | Web Vitals |
| FID | < 100ms | Web Vitals |
| JS bundle (initial) | < 200KB gzipped | Bundle analyzer |
| Frame drops during scroll | 0 | PerformanceObserver |
| Long tasks (>50ms) | 0 during interaction | Long Task API |
| axe-core violations | 0 critical/serious | axe-core |
