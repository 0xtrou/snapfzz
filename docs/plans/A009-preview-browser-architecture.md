---
title: "A009 — Preview Browser Architecture (CEF)"
type: architecture
date: 2026-04-06
derives-from: A001, A002, A003, A005, A007, A008
budget: frame, memory, startup, reliability
supersedes: "A001 §Child WebViews (preview only)"
---

# A009 — Preview Browser Architecture (CEF)

The preview pane embeds a full Chromium browser (via CEF/cef-rs) inside the project window for live "vibe coding" — real-time preview of web apps being built by AI agents. Agents get full programmatic control via in-process CDP.

## Why CEF, Not WKWebView

A001 originally specified Tauri child WebViews (WKWebView on macOS). Research revealed three hard blockers:

1. **Agent automation**: WKWebView has no CDP, no accessibility tree API, no network interception. Agents cannot drive the preview.
2. **DevTools**: WKWebView only exposes Safari Web Inspector (requires separate Safari.app). CEF provides full Chrome DevTools natively.
3. **Automation standard**: The industry converges on Playwright MCP with CDP. WKWebView is incompatible. CEF speaks CDP natively.

CEF is not a fork — it IS Chromium, packaged as an embeddable library with a stable C API. `cef-rs` is Rust FFI bindings maintained by the Tauri team, tracking Chromium 146.

## Decision

CEF renders the preview. WKWebView renders the shell. Dual-engine architecture.

```
Shell windows (launcher, project, preferences) → WKWebView via Tauri (0MB, A003 instant)
Preview pane (inside project window)           → CEF via cef-rs (250MB, full Chrome, CDP)
```

---

## Registry Contract

```
Budget class: "cef"
Domain: Supervised (in-process library with spawned child processes)
Source of truth: A008 preset

Memory budget:
  Performance: 500 MB (renderer + GPU combined)
  Balanced:    350 MB
  Battery:     250 MB

Enforcement:
  - CefTaskManager polls renderer RSS every 2s (enforce_loop)
  - V8 heap capped via --max-old-space-size (from preset)
  - Renderer killed via KillTask() on memory exceeded
  - OnRenderProcessTerminated → record_strike("snapfzz.preview")
  - 3 strikes in 5min → preview plugin auto-disabled

Measurement:
  - CefTaskInfo.memory (per-process RSS)
  - CefTaskInfo.gpu_memory
  - CefTaskInfo.cpu_usage
  - All reported in BudgetMetrics every 2s
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Tauri NSWindow (parent)                                         │
│                                                                 │
│  WKWebView (Tauri shell — React app, Zone 3)                    │
│  ┌──────────────┬──────────────────────────────────────────────┐│
│  │ Left Panel   │ Right Panel                                  ││
│  │ (Chat/Team)  │ [KB] [Code] [👁 Preview] [Deploy] [ID] [§]  ││
│  │              │                                              ││
│  │  contain:    │  ┌ placeholder div ────────────────────────┐ ││
│  │  content     │  │ contain: strict                        │ ││
│  │              │  │ width: 100%; height: 100%              │ ││
│  │              │  │                                        │ ││
│  │              │  │ (CEF child window covers this rect)     │ ││
│  │              │  │                                        │ ││
│  │              │  └────────────────────────────────────────┘ ││
│  └──────────────┴──────────────────────────────────────────────┘│
│                                                                 │
│  CEF Child NSWindow (addChildWindow:ordered:NSWindowAbove)       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ http://localhost:5173 (Vite dev server)                   │  │
│  │                                                           │  │
│  │ Own Metal/CoreAnimation compositor (A001: independent)    │  │
│  │ Own renderer process (A002: External/Supervised zone)     │  │
│  │ In-process CDP via DevToolsMessageObserver                │  │
│  │ Agent automation: click/type/screenshot/a11y/network      │  │
│  │ HMR via Vite WebSocket (native Chrome networking)         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Performance Compliance Matrix

Every implementation in this spec MUST trace to a performance goal. If a design violates any row, the design is wrong.

### A001 — Frame Budget (NON-NEGOTIABLE)

| A001 Requirement | CEF Implementation | Verification |
|---|---|---|
| 60fps (preset.frame_target_ms = 16) | CEF renders in a **separate child NSWindow** with its own Metal/CoreAnimation compositor. Preview frames NEVER compete with Tauri shell frames. Independent frame budget per A007. | FPS counter in status bar measures shell AND preview independently. |
| CSS containment on preview panel | `contain: strict` on the placeholder div in Zone 3. Preview rendering is in a completely separate OS window — containment is structural, not just CSS. | PerformanceObserver longtask detection. Preview activity MUST NOT appear in shell longtask entries. |
| GPU-only animations | CEF's Chromium compositor is GPU-native via Metal on Apple Silicon. No CPU-side compositing. | Xcode Metal System Trace. |
| No JS pixel math during drag | Panel resize uses `react-resizable-panels` CSS flexbox (`flexGrow`). CEF child window position synced on `onLayoutChanged` (drag **end**) only. During drag: rAF-debounced `setFrame` at most once per 16ms. | Profile: zero `invoke()` calls during drag at >60Hz. |
| Split pane: no React re-renders during drag | `react-resizable-panels` uses `useSyncExternalStore`. The preview placeholder div resizes via CSS flexbox — no React re-render. CEF window tracks via native `setFrame`. | React DevTools profiler: 0 renders during drag. |

### A002 — Zone Placement (NON-NEGOTIABLE)

| Zone | What Happens | What NEVER Happens |
|---|---|---|
| Zone 1 (Rust) | `CefInitialize()`, `CreateBrowser()`, `set_bounds()`, `execute_dev_tools_method()`, all IPC command handlers, enforce_loop CEF monitoring, OnRenderProcessTerminated handling. | — |
| Zone 2 (Worker) | No CEF interaction. Workers remain for Shiki/state per A002. | Worker code never calls CEF APIs. |
| Zone 3 (Main thread) | Preview plugin React component renders a placeholder `<div>`. Listens for `cef-browser-ready` event. Reports panel bounds on `onLayoutChanged`. | Zone 3 NEVER runs CEF code, NEVER parses CDP responses, NEVER processes preview DOM. |
| External (CEF processes) | CEF renderer process: V8 + Blink. CEF GPU process: Metal compositing. CEF network service: HTTP stack. All supervised by Budget Registry. | CEF processes have no access to Tauri IPC, plugin bus, or shared state. |

### A003 — Startup Budget (NON-NEGOTIABLE)

| Phase | Budget | CEF Impact |
|---|---|---|
| 0ms → 200ms (visible) | Shell skeleton rendered, zero CEF involvement | CEF is NOT loaded. Not initialized. Not imported. Zero bytes on startup path. |
| 200ms → 500ms (interactive) | Chat input active, user can type | CEF still not loaded. Preview tab is lazy (`onViewVisible:preview`). |
| 500ms+ (idle preload) | `requestIdleCallback` fires | `load_cef()` + `CefInitialize()` run in background. Framework dylib loads (~100ms). Browser + GPU processes start (~200-400ms). Invisible to user. |
| First Preview tab open | User clicks Preview tab | `CreateBrowser()` called. First paint ~150-300ms after click. Show "Starting preview..." skeleton during this window. |
| Warm navigation | Subsequent URL changes | < 100ms. Browser and renderer already running. |

**Hard rule**: `CefInitialize()` MUST NOT be called before the 500ms interactive target is met. It runs during idle time only.

### A005 — Plugin Architecture (NON-NEGOTIABLE)

| A005 Requirement | CEF Implementation |
|---|---|
| Preview is a plugin, not core | `plugins/preview/` with `definePlugin({ surface: ['project'], contributes: { workspaceTabs, agentTools } })`. Same API as chat plugin. |
| System plugins = third-party API | Preview plugin uses `ctx.rust.invoke()` to control CEF. No privileged core APIs. If a third-party plugin can't build a preview, the API is wrong. |
| Crash isolation: ErrorBoundary + 3-strike | CEF renderer crash → `OnRenderProcessTerminated` callback → `record_strike("snapfzz.preview")` → ErrorBoundary shows "Preview crashed. [Retry]". 3 strikes → plugin auto-disabled. CEF crash CANNOT take down Tauri shell (separate processes). |
| Lazy activation | `activationEvents: ['onViewVisible:preview']`. Plugin JS chunk loaded on first tab open. CEF browser created on activation. |
| Bus-only communication | Preview plugin communicates with other plugins (chat, code) via EventBus only. No direct imports. |

### A007 — Multi-Layout / Independent Frame Budgets (NON-NEGOTIABLE)

| A007 Requirement | CEF Implementation |
|---|---|
| Separate frame budgets per window | CEF child NSWindow has its own Metal compositor. Its frame timing is independent of the Tauri shell's WKWebView. Chat at 60fps while preview rebuilds a complex page — no interference. |
| Own PluginHost per window | Preview plugin activates in the project window's PluginHost only. Launcher and preferences windows never load CEF. |
| `HostSurface` targeting | Preview plugin declares `surface: ['project']`. No HostSurface enum extension needed. |

### A008 — Budget Registry (NON-NEGOTIABLE)

| A008 Budget | CEF Registration | Enforcement | Degradation |
|---|---|---|---|
| **Process Memory** | `register_cef_budget()` registers CEF as a supervised entry. NOT the same as `register_process()` — CEF is in-process, not a separate PID. | `CefTaskManager::GetTaskInfo(renderer_task_id).memory` polled every 2s in `enforce_loop()`. If RSS > preset limit → `KillTask(renderer_task_id)`. | Renderer killed. `OnRenderProcessTerminated(TS_PROCESS_WAS_KILLED)` fires. User sees "Preview exceeded memory limit. [Restart]". `record_strike()`. |
| **V8 Heap** | `OnBeforeChildProcessLaunch` injects `--js-flags=--max-old-space-size={limit}` per preset. | V8 enforces internally. OOM → `OnRenderProcessTerminated(TS_PROCESS_OOM)`. | Same as memory exceeded. |
| **Reliability** | `record_strike("snapfzz.preview")` on every `OnRenderProcessTerminated`. | 3 strikes in 5min → plugin auto-disabled. `CloseBrowser(true)`. | Preview tab shows "Preview disabled after repeated crashes. [Re-enable in Settings]". |
| **Frame (metered)** | Shell-side PerformanceObserver on placeholder div. CEF-side performance data via CDP `Performance.getMetrics`. | Shell: metered, not gated (per A001). CEF internal: observe only. | Report violations in budget-metrics. |
| **Startup** | CEF initialization deferred past 500ms interactive target. | `CefInitialize()` runs in `requestIdleCallback`. Never on the critical boot path. | If idle callback doesn't fire within 10s (machine extremely loaded), defer further until first Preview tab open. |
| **CPU** | CEF renderer and GPU processes are separate OS processes — not gated by Zone 1/2 semaphores. | Observe via `CefTaskInfo.cpu_usage`. Report in metrics. | No enforcement — CEF processes are external. Log high CPU to metrics. |

---

## CEF Process Model

CEF is a library loaded into the Tauri process. It then spawns child processes. This is NOT the same as AgentScope (separate binary).

```
AgentScope pattern (A006):
  Tauri process  ──HTTP/SSE──►  Python process (separate binary, separate PID)

CEF pattern (A009):
  Tauri process (+ CEF framework loaded in-process via dylib)
       │ CefInitialize()
       ├── spawns: Renderer process (V8 + Blink, one per origin)
       ├── spawns: GPU process (Metal compositing, shared)
       └── spawns: Network service (sandboxed utility)
```

### Supervision Model Extension

The existing A008 `ProcessBudget` uses PID-based monitoring via `sysinfo`. CEF requires a different supervision model because the browser process IS Tauri's process — you cannot kill your own PID.

```rust
/// A009 extension to A008's supervised domain
pub enum SupervisionMode {
    /// External PID monitored via sysinfo + HTTP health (AgentScope, BoxLite)
    ExternalProcess,
    /// In-process library with own child processes monitored via CefTaskManager
    InProcessLibrary,
}

/// Extended ProcessBudget for CEF
pub struct CefBudget {
    pub max_memory_mb: u64,          // from preset
    pub max_v8_heap_mb: u64,         // injected via --max-old-space-size
    pub renderer_task_id: Option<i64>,  // set after CreateBrowser
    pub gpu_task_id: Option<i64>,       // set after CefInitialize
    pub status: ProcessStatus,
}
```

`enforce_loop()` checks CEF budget entries via `CefTaskManager::GetTaskInfo()` — NOT via `sysinfo::System`. No PID lookup needed.

### Memory Budgets Per Preset

```
Performance (≥16GB RAM):
  cef.max_memory_mb:  500    (renderer + GPU combined)
  cef.max_v8_heap_mb: 256    (V8 old-space limit)
  Leaves 1548 MB for AgentScope + app (of 2048 MB total app budget)

Balanced (≥8GB RAM):
  cef.max_memory_mb:  350
  cef.max_v8_heap_mb: 192
  Leaves 674 MB for AgentScope + app (of 1024 MB total)

Battery:
  cef.max_memory_mb:  250
  cef.max_v8_heap_mb: 128
  Leaves 262 MB for AgentScope + app (of 512 MB total)
```

---

## CEF Lifecycle

### Phase 1: Framework Load (during idle)

```rust
// Called from requestIdleCallback bridge, AFTER 500ms interactive target met
pub fn preload_cef(registry: &BudgetRegistry) -> Result<()> {
    // 1. Load CEF framework dylib (~50-100ms on Apple Silicon)
    let library = load_cef();

    // 2. Configure settings
    let settings = Settings {
        no_sandbox: true,  // macOS sandbox handled by Helper app entitlements
        external_message_pump: true,  // Tauri owns the main thread event loop
        windowless_rendering_enabled: false,  // windowed mode, not OSR
        javascript_flags: CefString::from(format!(
            "--max-old-space-size={}",
            registry.preset.cef.max_v8_heap_mb
        )),
        remote_debugging_port: 0,  // no external CDP — we use in-process
        ..Default::default()
    };

    // 3. Initialize CEF (spawns GPU + browser processes, ~200-400ms)
    let app = CefApp::new(BrowserProcessHandler::new(registry.clone()));
    initialize(Some(&main_args), Some(&settings), Some(&mut app), ptr::null_mut());

    // 4. Register with Budget Registry
    registry.register_cef(CefBudget {
        max_memory_mb: registry.preset.cef.max_memory_mb,
        max_v8_heap_mb: registry.preset.cef.max_v8_heap_mb,
        renderer_task_id: None,  // no browser yet
        gpu_task_id: find_gpu_task_id(),
        status: ProcessStatus::Online,
    });

    Ok(())
}
```

### Phase 2: Browser Creation (on first Preview tab open)

```rust
// Called when preview plugin activates (onViewVisible:preview)
pub fn create_preview_browser(
    app_handle: &AppHandle,
    url: &str,
    bounds: Rect,
) -> Result<CefBrowser> {
    let window = app_handle.get_webview_window("project")?;
    let ns_view: *mut c_void = window.ns_view();

    let window_info = WindowInfo::default()
        .set_as_child(ns_view, &bounds);

    let client = PreviewClient::new(/* CDP observer, render handler, etc. */);

    let browser = browser_host_create_browser_sync(
        Some(&window_info),
        Some(&mut client),
        Some(&CefString::from(url)),
        Some(&browser_settings),
        None, // no extra info
        None, // default request context
    );

    // Update Budget Registry with renderer task ID
    let task_id = CefTaskManager::get_task_manager()
        .get_task_id_for_browser_id(browser.get_identifier());
    registry.update_cef_renderer_task(task_id);

    Ok(browser)
}
```

### Phase 3: Resize (during panel drag)

```
react-resizable-panels drag starts
  → CSS flexbox resizes placeholder div (GPU compositor, zero JS)
  → Shell stays at 60fps (contain: strict on placeholder)

react-resizable-panels onLayoutChanged fires (drag END)
  → invoke('resize_cef_panel', { x, y, width, height })
  → Rust: dispatch_async(main_queue) {
      cef_child_window.setFrame(new_rect, display: true, animate: false)
    }
  → CEF compositor reflows to new size
```

**During drag** (continuous): rAF-debounced updates at most once per 16ms.

```typescript
// PreviewPanel.tsx — Zone 3 render only
let rafId: number;
function handlePanelResize() {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    const rect = panelRef.current!.getBoundingClientRect();
    invoke('resize_cef_panel', {
      x: rect.x, y: rect.y,
      width: rect.width, height: rect.height,
    });
  });
}
```

**Hard constraint**: `invoke('resize_cef_panel')` MUST NOT fire more than once per frame (16ms). rAF ensures this.

### Phase 4: Shutdown

```rust
pub fn shutdown_cef(registry: &BudgetRegistry) {
    // 1. Force close all browsers (skip JS onbeforeunload)
    for browser in &browsers {
        browser.get_host().close_browser(true);
    }
    // 2. Wait for OnBeforeClose callback
    // 3. Deregister from Budget Registry
    registry.deregister_cef();
    // 4. CEF shutdown
    shutdown();
}
```

---

## Event Loop Coexistence

CEF and Tauri both need the macOS main thread. Solution: `external_message_pump = true`.

```
Tauri's tao/wry event loop runs on main thread (owns NSApplication)
  │
  ├── On each iteration:
  │     do_message_loop_work()  ← pump CEF one iteration (~0.1ms)
  │
  └── CEF's OnScheduleMessagePumpWork(delay_ms) callback:
        Tells Tauri "pump me again in {delay_ms} milliseconds"
        → Tauri schedules a timer on its run loop
```

**Performance impact**: `do_message_loop_work()` takes ~0.1ms per tick. At 60fps (16ms budget), this consumes <1% of frame time. Acceptable.

**Hard rule**: NEVER call `CefRunMessageLoop()`. It takes over the main thread and blocks Tauri. Always use `external_message_pump: true` + `do_message_loop_work()`.

---

## macOS Helper App Bundle

CEF on macOS requires a Helper app for sandboxed child processes. `cef-rs` provides `bundle-cef-app` CLI tool.

```
Snapfzz.app/
  Contents/
    Frameworks/
      Chromium Embedded Framework.framework/   (~250 MB)
      Snapfzz Helper.app/
        Contents/MacOS/
          Snapfzz Helper                        (renderer/GPU/network processes)
    MacOS/
      Snapfzz                                   (Tauri binary + CEF browser process)
    Resources/
      (Tauri web assets, icons, etc.)
```

Integrate `bundle-cef-app` into `cargo tauri build` pipeline via build script.

---

## Agent Automation Surface

CEF provides in-process CDP via `BrowserHost::execute_dev_tools_method()` + `DevToolsMessageObserver`. No external process, no WebSocket server, no Playwright dependency.

### Available to Agents

| Capability | CDP Method | Latency | Budget Impact |
|---|---|---|---|
| Navigate | `Page.navigate` | < 5ms | None |
| Click element | `Input.dispatchMouseEvent` | < 5ms | None |
| Type text | `Input.dispatchKeyEvent` | < 5ms | None |
| Screenshot | `Page.captureScreenshot` | ~20ms | One-shot, no budget |
| Accessibility tree | `Accessibility.getFullAXTree` | ~10ms | One-shot, no budget |
| Read DOM | `Runtime.evaluate` | ~5-20ms | None |
| Console capture | `Console.enable` → events pushed | 0ms (push) | None |
| Network intercept | `Fetch.enable` + `Fetch.requestPaused` | 0ms (push) | None |
| Viewport emulation | `Emulation.setDeviceMetricsOverride` | ~5ms | None |
| Performance metrics | `Performance.getMetrics` | ~5ms | None |

### Rust CDP Bridge

```rust
/// In snapfzz-cef crate
pub struct CdpBridge {
    host: BrowserHost,
    pending: DashMap<i32, oneshot::Sender<Value>>,
    next_id: AtomicI32,
}

impl CdpBridge {
    /// Execute a CDP command and await the result
    pub async fn execute(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.insert(id, tx);

        self.host.execute_dev_tools_method(
            id,
            Some(&CefString::from(method)),
            Some(&mut value_to_dict(params)),
        );

        rx.await.map_err(|_| CefError::CdpTimeout)
    }
}

/// DevToolsMessageObserver routes results back to pending futures
impl ImplDevToolsMessageObserver for CdpObserver {
    fn on_dev_tools_method_result(&self, _browser, message_id, success, result) {
        if let Some((_, tx)) = self.bridge.pending.remove(&message_id) {
            let value = parse_cef_bytes(result);
            let _ = tx.send(value);
        }
    }

    fn on_dev_tools_event(&self, _browser, method, params) {
        // Route to event subscribers (console, network, etc.)
        self.event_bus.emit(method_to_string(method), parse_cef_bytes(params));
    }
}
```

### Agent Tools (Plugin Contributions)

The preview plugin contributes these `agentTools` (per A005):

```typescript
agentTools: [
  { id: 'preview.start-dev-server', name: 'Start Dev Server', handler: ... },
  { id: 'preview.navigate', name: 'Navigate Preview', handler: ... },
  { id: 'preview.click', name: 'Click Element', handler: ... },
  { id: 'preview.type', name: 'Type Text', handler: ... },
  { id: 'preview.screenshot', name: 'Capture Screenshot', handler: ... },
  { id: 'preview.accessibility-tree', name: 'Get Accessibility Tree', handler: ... },
  { id: 'preview.check-responsive', name: 'Check Responsive', handler: ... },
  { id: 'preview.console-errors', name: 'Get Console Errors', handler: ... },
  { id: 'preview.network-requests', name: 'Get Network Requests', handler: ... },
  { id: 'preview.performance-metrics', name: 'Get Performance Metrics', handler: ... },
],
```

Each tool calls `ctx.rust.invoke('cef_cdp_command', { method, params })` → Rust CdpBridge → in-process CDP → result returned to agent.

---

## Triple Viewport Mode (U007)

Three CEF browsers, same URL, different viewport emulation. Each is a child NSWindow.

```
┌─────────────┬─────────────────┬────────────────────┐
│ 📱 375px     │ 📱↔ 768px        │ 🖥 1280px            │
│ CEF Browser 1│ CEF Browser 2   │ CEF Browser 3      │
│ CDP:         │ CDP:            │ CDP:               │
│ setDevice    │ setDevice       │ setDevice          │
│ Metrics(375) │ Metrics(768)    │ Metrics(1280)      │
│              │                 │                    │
│ All 3 browsers point at http://localhost:5173       │
│ All 3 receive HMR updates simultaneously            │
│ All 3 interactive independently                     │
└─────────────┴─────────────────┴────────────────────┘
```

**Budget impact**: 3 browsers × ~100MB renderer = ~300MB. Only within Performance preset budget (500MB). Balanced/Battery presets: triple viewport disabled, show one viewport at a time with viewport switcher buttons.

```rust
// Triple viewport budget check
if registry.preset.cef.max_memory_mb >= 450 {
    // Allow triple viewport (3 browsers)
} else {
    // Single viewport only, resize via Emulation.setDeviceMetricsOverride
}
```

---

## Console & Error Capture (U007)

Injected via CDP, not JS injection. Zero performance overhead on preview app.

```rust
// Enable console capture via CDP
cdp.execute("Console.enable", json!({})).await?;
cdp.execute("Runtime.enable", json!({})).await?;

// Events pushed via DevToolsMessageObserver
fn on_dev_tools_event(&self, _browser, method, params) {
    match method_str {
        "Runtime.consoleAPICalled" => { /* route to preview console panel */ },
        "Runtime.exceptionThrown" => { /* route to error capture + auto-fix */ },
        _ => {},
    }
}
```

Errors forwarded to chat panel via EventBus:
```
CDP Runtime.exceptionThrown event
  → Rust CdpObserver.on_dev_tools_event
  → app_handle.emit("preview-error", error_payload)
  → Preview plugin receives via ctx.bus
  → Emits to chat plugin via EventBus: "preview.error"
  → Chat plugin shows "⚠ Preview error: {message}. [🤖 Auto-fix]"
```

---

## HMR Pipeline (Updated from U007)

```
Agent writes file via BoxLite/filesystem
    ↓
Vite dev server (child process, supervised by A008) detects change
    ↓
Vite HMR WebSocket pushes delta to CEF browser
    ↓
CEF's Chromium networking stack handles WebSocket natively
    ↓
React Fast Refresh preserves component state
    ↓
Preview updates (~30-90ms total)
```

**No Tauri involvement in HMR path.** The WebSocket connects directly from the CEF renderer process to the Vite dev server. Zero IPC overhead. Zero main thread cost.

---

## Crate Structure

```
src-tauri/crates/
  snapfzz-cef/                    ← NEW
    Cargo.toml
    src/
      lib.rs                      # CefState, preload_cef(), create_preview_browser()
      lifecycle.rs                # CefInitialize, CreateBrowser, CloseBrowser, Shutdown
      window.rs                   # NSView embedding, setFrame, child window management
      cdp.rs                      # CdpBridge, DevToolsMessageObserver, async execute()
      budget.rs                   # CefBudget, integrate with BudgetRegistry, enforce
      handlers.rs                 # BrowserProcessHandler, RenderProcessTerminated
      commands.rs                 # Tauri IPC commands: create, navigate, resize, cdp, close
```

Dependencies:
```toml
[dependencies]
snapfzz-budget = { path = "../snapfzz-budget" }
snapfzz-core   = { path = "../snapfzz-core" }
cef-rs         = { git = "https://github.com/tauri-apps/cef-rs", features = ["default"] }
tauri          = { version = "2", features = ["unstable"] }
tokio          = { version = "1", features = ["full"] }
serde          = { version = "1", features = ["derive"] }
serde_json     = "1"
dashmap        = "6"
```

Registration in workspace:
```toml
# src-tauri/Cargo.toml
[workspace]
members = [
  # ... existing ...
  "crates/snapfzz-cef",
]

[dependencies]
snapfzz-cef = { path = "crates/snapfzz-cef" }
```

---

## Plugin Structure

```
plugins/preview/
  package.json
  src/
    index.ts                      # definePlugin, manifest, activate/deactivate
    contributions/
      PreviewPanel.tsx            # Workspace tab component (placeholder div)
      PreviewControls.tsx         # Viewport buttons: 📱 768 🖥 ▣▣▣
      PreviewConsole.tsx          # Console/Network bottom panel
    hooks/
      use-cef-bounds.ts           # ResizeObserver + rAF debounce → invoke resize
      use-cef-status.ts           # Listen to cef-browser-ready, cef-error events
    tools/
      navigate.ts                 # Agent tool: navigate preview
      click.ts                    # Agent tool: click element via CDP
      type.ts                     # Agent tool: type text via CDP
      screenshot.ts               # Agent tool: capture screenshot via CDP
      check-responsive.ts         # Agent tool: validate 3 viewports
      console-errors.ts           # Agent tool: get console errors
```

---

## Tauri IPC Commands

```rust
// src-tauri/crates/snapfzz-cef/src/commands.rs

#[tauri::command]
async fn cef_preload(state: State<'_, CefState>) -> Result<(), String>

#[tauri::command]
async fn cef_create_browser(
    state: State<'_, CefState>,
    url: String,
    x: f64, y: f64, width: f64, height: f64,
) -> Result<(), String>

#[tauri::command]
async fn cef_navigate(state: State<'_, CefState>, url: String) -> Result<(), String>

#[tauri::command]
async fn cef_resize(
    state: State<'_, CefState>,
    x: f64, y: f64, width: f64, height: f64,
) -> Result<(), String>

#[tauri::command]
async fn cef_show(state: State<'_, CefState>) -> Result<(), String>

#[tauri::command]
async fn cef_hide(state: State<'_, CefState>) -> Result<(), String>

#[tauri::command]
async fn cef_cdp_command(
    state: State<'_, CefState>,
    method: String,
    params: Value,
) -> Result<Value, String>

#[tauri::command]
async fn cef_close(state: State<'_, CefState>) -> Result<(), String>
```

---

## Metrics Extension

BudgetMetrics (emitted every 2s) gains CEF fields:

```rust
pub struct BudgetMetrics {
    // ... existing fields from A008 ...

    // A009: CEF browser metrics
    pub cef_renderer_rss_mb: Option<u64>,   // None if no browser open
    pub cef_gpu_rss_mb: Option<u64>,
    pub cef_renderer_cpu_pct: Option<f64>,
    pub cef_memory_limit_mb: u64,
    pub cef_status: ProcessStatus,          // Starting|Online|Unhealthy|Stopped
    pub cef_browser_count: u32,             // 1 (single) or 3 (triple viewport)
}
```

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| No production Tauri + CEF app exists | **HIGH** | Incremental: get CefInitialize working first, then CreateBrowser, then CDP, then budget integration. Each step is independently verifiable. |
| macOS event loop conflict | **MEDIUM** | `external_message_pump: true` is proven in cef-rs OSR example. Same pattern, windowed mode. |
| CEF Helper app bundling | **MEDIUM** | `bundle-cef-app` CLI tool handles structure. Integrate into cargo-tauri build. Test DMG distribution early. |
| Child NSWindow focus switching | **LOW** | Click-to-focus is native macOS behavior. No user confusion — same as clicking between apps. |
| 250MB bundle size | **LOW** | Acceptable for dev tool. VS Code: ~400MB. Cursor: ~500MB. Compress with brotli in DMG. |
| CEF cold start 200-400ms (after preload) | **LOW** | Deferred to idle time. User never waits. First preview open: skeleton shown during 150-300ms CreateBrowser. |

---

## Implementation Phases

### Phase 1: CEF Foundation
- Create `snapfzz-cef` crate
- `load_cef()` + `CefInitialize()` with `external_message_pump`
- Wire `do_message_loop_work()` into Tauri's run loop
- Helper app bundle integration
- Tauri commands: `cef_preload`, `cef_create_browser`, `cef_navigate`, `cef_resize`, `cef_close`
- **Verify**: CEF browser renders localhost:5173 inside project window

### Phase 2: Budget Integration
- Extend `BudgetRegistry` with `CefBudget` + `SupervisionMode::InProcessLibrary`
- Wire `CefTaskManager` polling into `enforce_loop()`
- `OnRenderProcessTerminated` → `record_strike` integration
- V8 heap cap via `OnBeforeChildProcessLaunch`
- BudgetMetrics CEF fields
- **Verify**: enforce_loop kills renderer when memory exceeded. 3 strikes disables plugin.

### Phase 3: Agent Automation
- `CdpBridge` with async execute + DevToolsMessageObserver
- Tauri command: `cef_cdp_command`
- Preview plugin agent tools: navigate, click, type, screenshot, a11y tree
- Console/error capture via CDP events → EventBus
- **Verify**: agent can click a button, read DOM state, take screenshot, all via Rust IPC

### Phase 4: Triple Viewport + Quality Gate
- Multiple CEF browsers with viewport emulation
- Budget-gated triple viewport (Performance preset only)
- Responsive validation tool: 3 viewport screenshots + overflow detection
- Quality gate integration (U007)
- **Verify**: triple viewport renders 3 browsers at 60fps independently

---

## Relation to Philosophy

**P1: Right from the beginning.** CEF is Chromium — same engine users' customers will see in production. No WKWebView rendering quirks. The preview is truthful from day one. The budget integration means it handles 100x growth (more tabs, more viewports) without rewriting.

**P2: Build from conviction.** We embed a full browser because agents need full control. Half-measures (WKWebView + JS injection) would force a rewrite when agents need network interception or accessibility trees.

**P3: Sell infrastructure, software is narrative.** The CEF integration + CDP bridge is infrastructure. Future plugins (visual regression, performance auditing, A/B testing) build on the same CDP pipe. Each new capability compounds.

**P4: Product lives for 10 years.** CEF tracks Chromium — it evolves with the web platform. WKWebView is Apple-gated. CEF gives us control over our own trajectory.
