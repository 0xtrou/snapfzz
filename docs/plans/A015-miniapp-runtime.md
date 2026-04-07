# A015 — Mini App Runtime

Full-stack apps inside Snapfzz. A mini app is a complete backend + frontend application provided by a plugin, managed by the kernel, rendered in CEF windows, and bookmarkable by users.

---

## Why

Mini apps in A005 were sandboxed iframes — HTML snippets with `postMessage`. That's a demo, not a product. Real use cases need:

- **Tax calculator** that runs a Python computation backend
- **Revenue dashboard** that serves a React app with real-time charts
- **Architecture diagram** tool with a Go rendering service
- **Database explorer** with a Rust query engine

These need their own processes, their own ports, their own windows. They're full apps — but they live inside the plugin ecosystem, managed by the kernel, subject to plugin boundaries.

---

## Architecture

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Mini app runtime extends that architecture with plugin-owned backend processes and CEF windows, while preserving kernel supervision boundaries.

---

## Mini App Manifest

Declared in the plugin's `contributes.miniApps`:

```typescript
miniApps: [{
  id: 'supabase.dashboard',
  name: 'Supabase Dashboard',
  description: 'Real-time database explorer and query runner',
  icon: 'DatabaseOutlined',

  // Backend process definition
  process: {
    command: 'node',                    // or 'python', 'deno', binary path
    args: ['server.js'],               // relative to plugin's dist/
    port: 0,                           // 0 = kernel assigns random available port
    healthPath: '/health',             // health check endpoint
    env: {                             // additional env vars
      NODE_ENV: 'production',
    },
  },

  // Frontend
  frontend: {
    path: '/',                         // URL path on the backend to load in CEF
    width: 1200,                       // default window size
    height: 800,
    minWidth: 600,
    minHeight: 400,
    resizable: true,
  },

  // Bookmarkable — user can pin to launcher
  bookmarkable: true,
}],
```

### Manifest Validation Schema

```typescript
const MiniAppSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/),
  name: z.string().min(1).max(64),
  description: z.string().max(256),
  icon: z.string().optional(),

  process: z.object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    port: z.number().int().min(0).max(65535).default(0),
    healthPath: z.string().default('/health'),
    env: z.record(z.string()).optional(),
  }),

  frontend: z.object({
    path: z.string().default('/'),
    width: z.number().int().positive().default(1200),
    height: z.number().int().positive().default(800),
    minWidth: z.number().int().positive().default(400),
    minHeight: z.number().int().positive().default(300),
    resizable: z.boolean().default(true),
  }),

  bookmarkable: z.boolean().default(true),
});
```

---

## Lifecycle

```
REGISTERED  → manifest validated, mini app known to kernel
SPAWNING    → ProcessManager starting backend process
HEALTHY     → health check passes, process is ready
OPEN        → CEF window created, frontend loaded
RUNNING     → user interacting with mini app
CLOSING     → CEF window closed by user
STOPPED     → backend process killed (on close or plugin deactivate)
```

### Spawn Flow

```
1. Plugin activates → plugin host reads contributes.miniApps
2. Mini app NOT auto-spawned (lazy — only on user open)
3. User clicks mini app (from plugin tab or launcher bookmark)
     ↓
4. Kernel ProcessManager.spawn({
     name: "miniapp:{pluginId}:{miniAppId}",
     command: manifest.process.command,
     args: manifest.process.args,
     cwd: "~/.snapfzz/plugins/{pluginId}/dist/",     ← jailed to plugin dir
     port: assign_random_port() if port == 0,
     env: {
       ...manifest.process.env,
       SNAPFZZ_PORT: assigned_port,
       SNAPFZZ_DATA_DIR: "~/.snapfzz/plugins/{pluginId}/data/",
       SNAPFZZ_PLUGIN_ID: pluginId,
     },
   })
     ↓
5. Kernel waits for health check (GET http://127.0.0.1:{port}{healthPath})
     ↓
6. Health OK → Kernel creates CEF WebviewWindow
     url: http://127.0.0.1:{port}{frontend.path}
     title: manifest.name
     width/height/min from manifest
     ↓
7. User sees the mini app
```

### Close Flow

```
User closes CEF window
  → Kernel WindowManager detects window close
  → Kernel ProcessManager.kill("miniapp:{pluginId}:{miniAppId}")
  → Process terminated, port freed
  → Budget registry entry removed
```

### Plugin Deactivate/Disable/Uninstall

```
Plugin deactivated or disabled
  → All mini app processes for this plugin killed
  → All mini app CEF windows closed
  → Bookmarks remain (greyed out) until plugin re-enabled

Plugin uninstalled
  → All mini app processes killed
  → All CEF windows closed
  → Bookmarks removed
  → Plugin dir deleted (~/.snapfzz/plugins/{id}/)
```

---

## Process Management

Mini app processes are kernel-supervised, same as AgentScope:

```rust
// Registered with BudgetRegistry as supervised processes
registry.register_process("miniapp:community.supabase:dashboard", ProcessBudget {
    pid: Some(child_pid),
    max_memory_mb: 256,                  // per-miniapp limit from plugin budget
    health_url: format!("http://127.0.0.1:{port}/health"),
    health_interval_ms: 5000,            // slower than system processes
    max_health_failures: 3,
    max_restarts: 3,                     // auto-restart up to 3 times
    location: ProcessLocation::Local,
    owner: pluginId.to_string(),         // tracks which plugin owns this process
    ...
});
```

**Rules:**
- Mini app processes inherit the parent plugin's resource budget
- Per-plugin total: max 3 concurrent mini app processes
- Per-miniapp: 256MB memory default (configurable in manifest up to plugin's total budget)
- If a mini app process exceeds memory → killed by supervisor
- If health fails 3 times → process killed, window shows error state
- If process crashes 3 times → mini app auto-disabled, user notified

---

## Internal Network

Mini apps may need to talk to each other (e.g., dashboard queries a shared data service). System processes (AgentScope) must remain isolated.

### Network Zones

```
Zone A: System Processes (ISOLATED)
  ├─ agentscope (127.0.0.1:8090)
  └─ future system services

Zone B: Plugin Processes (SHARED among plugins)
  ├─ miniapp:community.supabase:dashboard (127.0.0.1:49201)
  ├─ miniapp:community.supabase:api (127.0.0.1:49202)
  └─ miniapp:community.stripe:tax-calc (127.0.0.1:49203)
```

**Rules:**
- Zone B → Zone B: **ALLOWED** — plugin processes can reach each other via `127.0.0.1:{port}`
- Zone B → Zone A: **BLOCKED** — plugin processes cannot reach system processes
- Zone A → Zone B: **BLOCKED** — system processes don't need plugin services

**Enforcement:**
- System processes bind to ports in a reserved range (8000-8099)
- Mini app processes get randomly assigned ports in a different range (49152-65535)
- System process auth tokens (A012) reject requests from non-kernel callers
- No port-level firewall needed — auth tokens are the enforcement mechanism

### Service Discovery

Plugins can discover other plugin processes via the kernel:

```typescript
// In plugin context
const services = await ctx.rust.invoke('list_miniapp_processes', {
  pluginId: 'community.supabase'  // optional filter
});
// Returns: [{ name: "miniapp:community.supabase:api", port: 49202, status: "online" }]
```

**Requires capability:** `miniapp.discover`

---

## Bookmarks

Users can pin mini apps to the launcher for quick access:

```
~/.snapfzz/bookmarks.json
{
  "miniApps": [
    {
      "pluginId": "community.supabase",
      "miniAppId": "dashboard",
      "name": "Supabase Dashboard",
      "icon": "DatabaseOutlined",
      "pinned": true,
      "lastOpened": "2026-04-07T12:00:00Z"
    }
  ]
}
```

### Launcher Integration

The launcher window shows bookmarked mini apps:

```
┌─────────────────────────────────────────┐
│  PROJECTS                               │
│  ├─ my-saas-app                         │
│  ├─ portfolio-site                      │
│  └─ + New Project                       │
│                                         │
│  MINI APPS                              │
│  ├─ ⚡ Supabase Dashboard    [Open]     │
│  ├─ 💳 Tax Calculator        [Open]     │
│  └─ 📊 Traffic Dashboard     [Open]     │
└─────────────────────────────────────────┘
```

Clicking "Open":
1. If process not running → spawn → wait for health → open CEF window
2. If process already running → just open/focus the CEF window

---

## CEF Integration

CEF (Chromium Embedded Framework) via `tauri-apps/cef-rs` — full Chromium, NOT platform webview.

### Why CEF, not WebviewUrl::External

| | CEF (`cef-rs`) | `WebviewUrl::External` |
|---|---|---|
| Engine | Full Chromium (consistent everywhere) | Platform webview (WKWebView/WebView2/WebKitGTK) |
| DevTools | Built-in, always available | macOS only (WKWebView inspector) |
| Web APIs | Full: WebRTC, WebGL, service workers, WebUSB | Subset, varies by platform |
| Rendering | Identical on all platforms | Different per platform |
| Tauri IPC | None (correct — mini apps are pure web) | Injected (`__TAURI_INTERNALS__`) — security risk |
| Process model | Separate Chromium process per window | Shares platform webview process |
| Vibe coding | Full browser = build + preview in-app | Limited preview capability |

### CEF Lifecycle

```
App boot:
  CEF NOT initialized (lazy — only on first mini app open)

First mini app open:
  1. cef_rs::initialize(CefSettings) — one-time, ~200ms
  2. CefBrowser::create(url, settings, window_info)

Subsequent mini app opens:
  1. CefBrowser::create(url, settings, window_info) — ~50ms (CEF already initialized)

Mini app close:
  1. CefBrowser::close() — destroys browser
  2. If last CEF window → CEF stays initialized (no shutdown until app exit)

App exit:
  1. All CefBrowser instances closed
  2. cef_rs::shutdown() — clean Chromium teardown
```

### Window Creation

```rust
use cef_rs::{CefApp, CefBrowser, CefSettings, CefWindowInfo};

fn open_miniapp_window(
    miniapp_id: &str,
    url: &str,
    title: &str,
    width: u32,
    height: u32,
) -> Result<CefBrowser, String> {
    let window_info = CefWindowInfo::new()
        .with_title(title)
        .with_size(width, height);

    CefBrowser::create(url, &window_info)
        .map_err(|e| e.to_string())
}
```

### CEF has NO Tauri IPC

Mini app CEF windows are pure Chromium:
- No `__TAURI_INTERNALS__` injected
- No `invoke()` or `listen()` available
- No access to other Tauri windows
- Communication with kernel is ONLY through the mini app's own backend (localhost HTTP)
- This is the correct boundary: mini apps are web apps, not Tauri extensions

### Dependencies

Add to `src-tauri/Cargo.toml`:
```toml
[dependencies]
cef-rs = { git = "https://github.com/tauri-apps/cef-rs" }
```

CEF binary (~300MB) is downloaded on first build via `download-cef` build script from `cef-rs`.

---

## Tauri Commands

```rust
#[tauri::command]
async fn open_miniapp(
    app: tauri::AppHandle,
    plugin_id: String,
    miniapp_id: String,
    process_mgr: State<'_, ProcessManager>,
    registry: State<'_, Arc<BudgetRegistry>>,
) -> Result<MiniAppInfo, String>;

#[tauri::command]
async fn close_miniapp(
    app: tauri::AppHandle,
    plugin_id: String,
    miniapp_id: String,
    process_mgr: State<'_, ProcessManager>,
) -> Result<(), String>;

#[tauri::command]
async fn list_miniapp_processes(
    plugin_id: Option<String>,
    registry: State<'_, Arc<BudgetRegistry>>,
) -> Result<Vec<MiniAppProcessInfo>, String>;

#[tauri::command]
async fn bookmark_miniapp(
    plugin_id: String,
    miniapp_id: String,
    pinned: bool,
) -> Result<(), String>;

#[tauri::command]
async fn list_bookmarks() -> Result<Vec<MiniAppBookmark>, String>;
```

---

## Test Specifications

```
A015/miniapp: spawn registers process with kernel ProcessManager
A015/miniapp: spawn assigns random port when manifest port is 0
A015/miniapp: spawn sets CWD to plugin's dist/ directory
A015/miniapp: spawn passes SNAPFZZ_PORT and SNAPFZZ_DATA_DIR env vars
A015/miniapp: health check waits for backend before opening window
A015/miniapp: close window kills backend process
A015/miniapp: plugin deactivate kills all plugin's mini app processes
A015/miniapp: plugin uninstall removes bookmarks
A015/miniapp: max 3 concurrent mini app processes per plugin
A015/miniapp: memory limit enforced — process killed if exceeded
A015/miniapp: 3 health failures kills process
A015/miniapp: 3 crashes auto-disables mini app
A015/network: plugin process cannot reach system process port range
A015/network: plugin process can reach other plugin processes
A015/network: list_miniapp_processes returns only permitted processes
A015/bookmark: bookmark_miniapp persists to bookmarks.json
A015/bookmark: list_bookmarks returns pinned mini apps
A015/bookmark: opening bookmarked miniapp spawns process if not running
A015/window: CEF window has no __TAURI_INTERNALS__ access
A015/window: CEF window loads external URL from local backend
A015/manifest: invalid manifest rejected on plugin install
A015/manifest: port 0 in manifest triggers random port assignment
```

---

## Dependencies

| Spec | Dependency |
|---|---|
| A005 | Plugin sandbox — mini app processes inherit plugin jail |
| A008 | Budget registry — mini app processes are supervised |
| A012 | Preflight — no preflight dependency (mini apps are lazy) |
| A014 | Kernel — ProcessManager spawns and supervises mini app processes |
| A007 | Multi-layout — CEF windows are independent frame budgets |

---

## Hard Rules

- All mini app processes MUST be registered with the kernel ProcessManager — no rogue processes
- Mini app CWD is ALWAYS `~/.snapfzz/plugins/{pluginId}/dist/` — no jail escape
- Mini app processes CANNOT reach system processes (AgentScope) — auth token enforcement
- CEF windows have NO Tauri IPC — they're pure web browsers loading a local URL
- Data persistence is the plugin's responsibility — kernel provides `data/` directory, nothing else
- Max 3 concurrent mini app processes per plugin — prevents resource exhaustion
- Mini app windows close → process killed. No orphan processes.
- Bookmarks survive app restart. Mini app processes don't (spawned on demand).

---

## CEF Capabilities — 4 Tiers

### Tier 1: Mini App Launcher

| Capability | API | Status |
|---|---|---|
| Open URL in CEF window | `CefRuntime::create_window(url, config)` | Alpha |
| Window lifecycle | create, close, focus, resize | Alpha |
| Process tied to window | close window → kill process | Alpha |
| Bookmarks | pin to launcher, persist across restarts | Alpha |

### Tier 2: Full Browser Experience

| Capability | API | Status |
|---|---|---|
| DevTools | `CefWindow::devtools_open/close()` via `CefBrowserHost::ShowDevTools` | Alpha |
| Console capture | `DisplayHandler::on_console_message` → kernel logs | Alpha |
| Navigation | back/forward/reload/stop via `CefBrowser::GoBack/Forward/Reload/StopLoad` | Alpha |
| Find in page | `CefBrowserHost::Find(searchText)` | Beta |
| Zoom | `CefBrowserHost::SetZoomLevel` per window, persisted per mini app | Beta |
| Fullscreen | `CefBrowserHost::SetFullscreen` toggle | Beta |
| Print / PDF | `CefBrowserHost::Print()`, `PrintToPDF()` | Beta |
| Downloads | `DownloadHandler::OnBeforeDownload` → kernel download manager | Beta |

### Tier 3: Vibe Coding

| Capability | API | Status |
|---|---|---|
| Live preview | HMR proxy — file watcher triggers CEF reload | V1 |
| Split view | Monaco left + CEF right in project window | V1 |
| Responsive | viewport size presets (phone/tablet/desktop) | V1 |
| Network inspector | `ResourceRequestHandler::OnBeforeResourceLoad` capture | V1 |
| Console panel | `on_console_message` → bottom panel in project window | V1 |
| Screenshot | `CefBrowserHost::CaptureScreenshot` → PNG bytes | V1 |
| Performance | page load timing via CDP `Performance.getMetrics` | V1 |

### Tier 4: Platform

| Capability | API | Status |
|---|---|---|
| Custom schemes | `CefApp::OnRegisterCustomSchemes` + `CefRegisterSchemeHandlerFactory` | Beta |
| JS injection | `CefRenderProcessHandler::OnContextCreated` + `CefRegisterExtension` | Beta |
| Cookie isolation | `CefRequestContext::CreateContext` per mini app | Alpha |
| Network intercept | `CefResourceRequestHandler::OnBeforeResourceLoad` | Beta |
| Chrome extensions | `CefRegisterExtension` for React/Vue DevTools | V1 |

---

## snapfzz-cef Crate

### Structure

```
src-tauri/crates/snapfzz-cef/
├── Cargo.toml
└── src/
    ├── lib.rs           # pub mod runtime, window, download
    ├── runtime.rs       # CefRuntime — singleton, lazy init, shutdown
    ├── window.rs        # CefWindow — per-browser lifecycle, navigation, devtools
    ├── download.rs      # CefDownloader — lazy download from Spotify CDN
    └── types.rs         # WindowConfig, ConsoleMessage, DownloadProgress
```

### CefRuntime — Singleton, Lazy

```rust
pub struct CefRuntime {
    initialized: bool,
    cef_dir: PathBuf,           // ~/.snapfzz/runtime/cef/
    windows: HashMap<String, CefWindow>,
}

impl CefRuntime {
    pub fn new(data_dir: &Path) -> Self;

    /// Lazy init — downloads CEF if missing, then cef_rs::initialize().
    /// Returns progress stream for download UI.
    pub async fn ensure_ready(&mut self) -> Result<(), CefError>;

    pub fn is_ready(&self) -> bool;

    /// Create a new CEF browser window.
    pub fn create_window(&mut self, id: &str, url: &str, config: WindowConfig) -> Result<&CefWindow, CefError>;

    /// Get existing window by ID.
    pub fn window(&self, id: &str) -> Option<&CefWindow>;
    pub fn window_mut(&mut self, id: &str) -> Option<&mut CefWindow>;

    /// Close a specific window.
    pub fn close_window(&mut self, id: &str) -> Result<(), CefError>;

    /// Close all windows and shutdown CEF. Called on app exit.
    pub fn shutdown(&mut self);
}
```

### CefWindow — Per Browser

```rust
pub struct CefWindow {
    id: String,
    browser: CefBrowser,
    plugin_id: String,
    miniapp_id: String,
    process_name: String,
    backend_port: u16,
    zoom_level: f64,
    devtools_open: bool,
    console_messages: Vec<ConsoleMessage>,
    created_at: Instant,
}

impl CefWindow {
    // Navigation
    pub fn navigate(&self, url: &str);
    pub fn back(&self);
    pub fn forward(&self);
    pub fn reload(&self);
    pub fn stop(&self);
    pub fn current_url(&self) -> String;

    // DevTools
    pub fn devtools_open(&mut self);
    pub fn devtools_close(&mut self);
    pub fn is_devtools_open(&self) -> bool;

    // Search
    pub fn find(&self, query: &str, forward: bool);
    pub fn find_stop(&self);

    // Zoom
    pub fn set_zoom(&mut self, level: f64);
    pub fn zoom_level(&self) -> f64;

    // Capture
    pub fn screenshot(&self) -> Result<Vec<u8>, CefError>;  // PNG bytes
    pub fn print_to_pdf(&self) -> Result<Vec<u8>, CefError>;

    // Console
    pub fn console_messages(&self) -> &[ConsoleMessage];
    pub fn clear_console(&mut self);

    // Lifecycle
    pub fn close(&self);
}
```

### CefDownloader — Lazy Download

```rust
pub struct CefDownloader {
    cef_dir: PathBuf,
    cdn_base: String,       // https://cef-builds.spotifycdn.com
}

impl CefDownloader {
    pub fn is_cached(&self) -> bool;

    /// Download CEF binary for current platform.
    /// Returns a stream of DownloadProgress events.
    pub async fn download(&self) -> Result<impl Stream<Item = DownloadProgress>, CefError>;

    /// Verify downloaded binary checksum.
    pub fn verify(&self) -> Result<(), CefError>;
}

pub struct DownloadProgress {
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub percent: f32,
    pub status: DownloadStatus,
}

pub enum DownloadStatus {
    Downloading,
    Extracting,
    Verifying,
    Ready,
    Failed(String),
}
```

---

## Kernel CEF Management

### Window Registry in main.rs

```rust
struct ManagedCefWindow {
    window_id: String,
    plugin_id: String,
    miniapp_id: String,
    process_name: String,
    backend_port: u16,
    created_at: Instant,
}

// Managed state
.manage(Mutex::new(CefRuntime::new(&data_dir)))
```

### Tauri Commands — CEF

```rust
// Window lifecycle
cef_open_window(url, config) -> window_id
cef_close_window(window_id)
cef_focus_window(window_id)

// Navigation
cef_navigate(window_id, url)
cef_go_back(window_id)
cef_go_forward(window_id)
cef_reload(window_id)

// DevTools
cef_devtools(window_id, open: bool)

// Search
cef_find(window_id, query, forward: bool)

// Zoom
cef_zoom(window_id, level: f64)

// Capture
cef_screenshot(window_id) -> base64 PNG
cef_print_pdf(window_id) -> bytes

// Console
cef_console_messages(window_id) -> Vec<ConsoleMessage>

// Download status
cef_download_status() -> DownloadProgress
cef_ensure_cef_ready() -> Result<(), String>

// Mini app orchestration (combines process + CEF)
open_miniapp(plugin_id, miniapp_id) -> MiniAppInfo
close_miniapp(plugin_id, miniapp_id)
```

### Orchestration Flow

```
open_miniapp:
  1. cef_runtime.ensure_ready()?           ← download if missing (~124MB, once)
  2. process_mgr.spawn(name, config)?      ← start backend process
  3. registry.register_process(name, budget)?  ← budget gate
  4. wait_until_healthy(port)?             ← HTTP health check
  5. cef_runtime.create_window(id, url, config)?  ← open CEF browser
  6. app.emit("miniapp-opened", info)      ← notify frontend

close_miniapp:
  1. cef_runtime.close_window(id)?         ← destroy browser
  2. process_mgr.kill(name)?               ← kill backend
  3. registry deregister process           ← free budget
  4. app.emit("miniapp-closed", id)        ← notify frontend

on_app_exit:
  1. cef_runtime.shutdown()                ← close all browsers + cef_rs::shutdown()
  2. process_mgr.shutdown_all()            ← kill all processes
```

---

## Performance Guarantees (Non-Negotiable, per A001/A003/A008)

### CEF Window Performance

| Metric | Target | Enforcement |
|---|---|---|
| Window open time | < 500ms (after CEF ready) | `create_window` profiled, logged |
| Navigation time | < 100ms to start loading | CEF browser navigation is async |
| DevTools open | < 200ms | ShowDevTools is native CEF |
| Screenshot | < 500ms | CaptureScreenshot async callback |
| Memory per window | ≤ 256MB default | BudgetRegistry supervised, kill on exceed |

### CEF does NOT affect Tauri windows

```
Tauri windows (launcher, project, preferences):
  ├── Rendered by platform webview (WKWebView/WebView2)
  ├── Independent of CEF — CEF crash doesn't affect Tauri
  ├── 60fps rendering unaffected by CEF load
  └── Separate process from CEF browsers

CEF windows (mini apps):
  ├── Separate Chromium process per window
  ├── Own frame budget — one slow mini app doesn't affect others
  ├── Memory-gated by BudgetRegistry (256MB default, kill on exceed)
  └── CPU isolated — Chromium multi-process architecture
```

### CEF Lazy Loading — No Boot Impact

```
App boot (A003 targets preserved):
  < 200ms to visible (no CEF loaded)
  < 500ms to interactive (no CEF loaded)
  CEF binary: NOT loaded, NOT initialized
  CEF download: NOT started

First mini app open:
  CEF download: ~30s on fast connection (124MB)
  CEF init: ~200ms (cef_rs::initialize)
  Window open: ~50ms after init

Subsequent mini app opens:
  CEF already initialized: ~50ms to window
```

### Resource Budget Integration

```rust
// Per mini app window
ProcessBudget {
    max_memory_mb: 256,         // per A008 supervised domain
    health_interval_ms: 5000,   // slower than system processes
    max_health_failures: 3,     // kill after 3 failures
    max_restarts: 3,            // auto-restart up to 3 times
}

// Per plugin: max 3 concurrent mini app processes
// Global: max 10 concurrent CEF windows (prevents memory exhaustion)
```

### Main Thread Protection (A001)

- CEF runs in separate processes — ZERO main thread work
- `cef_rs::initialize()` is called from `tokio::spawn` — never blocks Tauri event loop
- Console message capture is callback-based — no polling
- Screenshot/PDF are async with callbacks — no blocking
- Window creation is async — returns immediately, CEF creates browser in background

---

## Additional Test Specifications

```
A015/cef: CefRuntime lazy init only on first create_window
A015/cef: CefRuntime downloads CEF if not cached
A015/cef: CefRuntime reuses cached CEF on subsequent launches
A015/cef: CefDownloader reports progress events during download
A015/cef: CefDownloader verifies checksum after download
A015/cef: CefWindow navigate changes URL
A015/cef: CefWindow back/forward navigates history
A015/cef: CefWindow devtools_open sets flag and calls ShowDevTools
A015/cef: CefWindow zoom level persisted per window
A015/cef: CefWindow console_messages captures on_console_message events
A015/cef: CefWindow close destroys browser
A015/cef: CefRuntime shutdown closes all windows
A015/cef: CEF crash does not affect Tauri windows
A015/cef: max 10 concurrent CEF windows enforced
A015/cef: cookie isolation — separate CefRequestContext per window
A015/perf: window open < 500ms after CEF ready
A015/perf: CEF init does not block Tauri main thread
A015/perf: app boot completes without loading CEF
A015/perf: memory limit enforced — window killed at 256MB
```
