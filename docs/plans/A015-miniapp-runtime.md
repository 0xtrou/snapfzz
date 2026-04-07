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

```
Plugin registers mini app
  ↓
Kernel ProcessManager spawns backend process
  ↓
CEF window opens → loads frontend from local backend URL
  ↓
User can bookmark → appears in launcher as a pinned shortcut

┌─────────────────────────────────────────────────────────┐
│ Kernel (main.rs orchestrator)                           │
│                                                         │
│  ProcessManager                                         │
│  ├─ agentscope (system — ISOLATED, no plugin access)    │
│  ├─ miniapp:community.supabase:dashboard (plugin proc)  │
│  ├─ miniapp:community.stripe:tax-calc (plugin proc)     │
│  └─ miniapp:snapfzz.deployments:traffic (system proc)   │
│                                                         │
│  WindowManager                                          │
│  ├─ launcher window                                     │
│  ├─ project window                                      │
│  ├─ preferences window                                  │
│  ├─ miniapp:dashboard (CEF window)                      │
│  └─ miniapp:tax-calc (CEF window)                       │
│                                                         │
│  Internal Network                                       │
│  ├─ plugin processes → plugin processes (allowed)       │
│  ├─ plugin processes → system processes (BLOCKED)       │
│  └─ system processes → plugin processes (BLOCKED)       │
└─────────────────────────────────────────────────────────┘
```

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
