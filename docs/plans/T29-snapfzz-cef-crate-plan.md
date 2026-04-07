---
title: T29: Build snapfzz-cef Crate with CEF Runtime, Downloader, CDP Server, and Onboarding Flow
type: feat
status: active
date: 2026-04-07
origin: docs/plans/A015-miniapp-runtime.md
---

# T29: Build snapfzz-cef Crate

## Overview

Build a CEF (Chromium Embedded Framework) runtime for mini apps — full Chromium windows inside Snapfzz, managed by the kernel, with CDP (Chrome DevTools Protocol) server for debugging and inspection.

**Key changes from A015 spec:**
- CEF download is **user-initiated** via onboarding flow (NOT preflight)
- **Platform-specific paths** for CEF binary storage
- **CDP server** in kernel — all DevTools access goes through kernel, not direct

## Problem Frame

Mini apps need full Chromium browsers (not platform webviews) for:
- Consistent behavior across macOS/Windows/Linux
- Full WebRTC, WebGL, service worker support
- DevTools access on all platforms
- Process isolation from Tauri windows

A015 defines the architecture. This plan implements the `snapfzz-cef` crate + kernel integration.

## Requirements Trace

- R1. CEF binary downloaded on-demand (NOT at boot) — user triggers via onboarding
- R2. Platform-specific storage paths (macOS/Linux/Windows)
- R3. CDP server for kernel-managed debugging (no direct DevTools access)
- R4. 90% test coverage on snapfzz-cef crate
- R5. Lazy init — CEF NOT loaded until first mini app open

## Scope Boundaries

- **In scope**: snapfzz-cef crate, CDP server, onboarding UI, Tauri commands
- **Out of scope**: Mini app plugin scaffolding (separate task), ProcessManager changes (already exists)

## Context & Research

### Relevant Code and Patterns

- `src-tauri/crates/` — existing crate structure (snapfzz-kernel, snapfzz-stream, snapfzz-vault)
- `src-tauri/src/commands/` — Tauri command pattern (thin wrappers)
- `plugins/settings-vault/` — settings plugin with onboarding flow pattern
- A015 spec — CefRuntime, CefWindow, CefDownloader API design

### Platform-Specific Path Conventions

```rust
// Follow Tauri's path::data_dir() which returns:
// macOS: ~/Library/Application Support/{bundle_id}/
// Linux: ~/.local/share/{bundle_id}/
// Windows: %APPDATA%/{bundle_id}/
```

## Key Technical Decisions

| Decision | Rationale |
|---|---|
| **User-initiated download** (NOT preflight) | CEF is 124MB — don't force download on users who may never use mini apps. Onboarding flow with progress + cancel. |
| **CDP server in kernel** | Direct DevTools access bypasses kernel supervision. CDP proxy lets kernel log console messages, intercept network, capture screenshots. |
| **Platform-specific paths** | Follows OS conventions, Tauri patterns, user expectations. |
| **Lazy CEF init** | Preserves A003 boot targets (< 200ms visible). CEF loads only on first mini app open. |
| **cef-rs from GitHub** | No crates.io package. Use `cef-rs = { git = "https://github.com/tauri-apps/cef-rs" }` |

## Open Questions

### Resolved During Planning

- **Q: Where to store CEF binary?** → A: `data_dir()/runtime/cef/` per platform
- **Q: When to download CEF?** → A: User clicks "Enable Mini Apps" in onboarding/preferences
- **Q: Direct DevTools or CDP proxy?** → A: CDP proxy — kernel manages all debugging access

### Deferred to Implementation

- Exact CDP command routing (Tauri command → CDP session → CEF browser)
- Checksum/hash algorithm for CEF binary verification
- Download resume strategy (partial file detection)

## High-Level Technical Design

> This illustrates the intended approach and is directional guidance for review, not implementation specification.

### CEF Download Flow (User-Initiated)

```
User clicks "Enable Mini Apps" in Preferences
    ↓
Tauri command: cef_download_start()
    ↓
CefDownloader::download() → Stream<DownloadProgress>
    ↓
Progress events → Frontend (progress bar, cancel button)
    ↓
Download complete → verify_checksum() → extract → mark ready
    ↓
Emit "cef:ready" event → UI shows "Mini Apps Enabled"
```

### CDP Server Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Kernel CDP Server                                       │
│ - WebSocket server (127.0.0.1:{port})                  │
│ - Routes CDP commands to CefWindow sessions            │
│ - Logs console messages, network requests              │
│ - Intercepts screenshots, network capture              │
└─────────────────────────────────────────────────────────┘
              ↑                    ↑
    Tauri command        CEF Browser (CDP enabled)
    (kernel proxy)
```

### CEF Lifecycle

```
App boot → CefRuntime NOT initialized
    ↓
User enables Mini Apps → CefDownloader downloads (~124MB)
    ↓
First mini app open → CefRuntime::ensure_ready() → cef_rs::initialize()
    ↓
CefRuntime::create_window() → CDP session attached
    ↓
Mini app close → CefWindow::close() → browser destroyed
    ↓
App exit → CefRuntime::shutdown() → cef_rs::shutdown()
```

## Implementation Units

- [ ] **Unit 1: Crate Skeleton**

**Goal:** Create snapfzz-cef crate structure with Cargo.toml and module files.

**Requirements:** R4 (test coverage foundation)

**Dependencies:** None

**Files:**
- Create: `src-tauri/crates/snapfzz-cef/Cargo.toml`
- Create: `src-tauri/crates/snapfzz-cef/src/lib.rs`
- Create: `src-tauri/crates/snapfzz-cef/src/runtime.rs`
- Create: `src-tauri/crates/snapfzz-cef/src/window.rs`
- Create: `src-tauri/crates/snapfzz-cef/src/download.rs`
- Create: `src-tauri/crates/snapfzz-cef/src/cdp.rs`
- Create: `src-tauri/crates/snapfzz-cef/src/types.rs`
- Modify: `src-tauri/Cargo.toml` (add workspace member + cef-rs dependency)

**Approach:**
- Mirror existing crate structure (snapfzz-kernel, snapfzz-stream)
- Use `cef-rs` from GitHub (tauri-apps/cef-rs)
- Export modules: `pub mod runtime`, `pub mod window`, `pub mod download`, `pub mod cdp`, `pub mod types`

**Patterns to follow:**
- `src-tauri/crates/snapfzz-kernel/src/lib.rs` — module exports, workspace structure

**Test scenarios:**
- Edge case: Crate compiles with `cargo check`
- Integration: All modules importable from lib.rs

**Verification:**
- `cd src-tauri/crates/snapfzz-cef && cargo check` passes

---

- [ ] **Unit 2: Platform-Specific Path Utilities**

**Goal:** Implement platform-aware CEF storage path resolution.

**Requirements:** R2 (platform-specific paths)

**Dependencies:** Unit 1

**Files:**
- Create: `src-tauri/crates/snapfzz-cef/src/paths.rs`
- Test: `src-tauri/crates/snapfzz-cef/src/paths.rs` (inline tests)

**Approach:**
```rust
pub fn cef_data_dir() -> PathBuf {
    // Returns:
    // macOS: ~/Library/Application Support/snapfzz/runtime/cef/
    // Linux: ~/.local/share/snapfzz/runtime/cef/
    // Windows: %APPDATA%/snapfzz/runtime/cef/
    
    let base = tauri::path::data_dir()?;  // Uses Tauri's built-in path resolution
    Ok(base.join("runtime/cef"))
}

pub fn cef_binary_path() -> PathBuf {
    cef_data_dir().join("cef_binary")
}

pub fn cef_cache_path() -> PathBuf {
    cef_data_dir().join("cache")
}
```

**Test scenarios:**
- Happy path: `cef_data_dir()` returns valid PathBuf on current platform
- Edge case: Directory doesn't exist → `create_dir_all()` succeeds

**Verification:**
- Tests pass: `cargo test paths::`

---

- [ ] **Unit 3: CefDownloader (User-Initiated)**

**Goal:** Implement user-initiated CEF download with progress streaming.

**Requirements:** R1 (user-initiated download), R2 (platform paths)

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src-tauri/crates/snapfzz-cef/src/download.rs`
- Test: `src-tauri/crates/snapfzz-cef/src/download.rs` (inline tests)

**Approach:**
```rust
pub struct CefDownloader {
    install_dir: PathBuf,      // from cef_data_dir()
    cdn_base: String,          // https://cef-builds.spotifycdn.com
    platform: String,          // "macos-arm64", "linux-x64", "windows-x64"
}

impl CefDownloader {
    /// Returns true if CEF binary exists and is valid
    pub fn is_installed(&self) -> bool;
    
    /// Download CEF binary. Returns stream of progress events.
    pub async fn download(&self) -> Result<impl Stream<Item = DownloadProgress>, CefError>;
    
    /// Verify downloaded binary checksum
    pub async fn verify_checksum(&self) -> Result<(), CefError>;
    
    /// Extract downloaded archive to install_dir
    pub async fn extract(&self) -> Result<(), CefError>;
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

**Platform detection:**
```rust
fn detect_platform() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "macos-arm64",
        ("macos", "x86_64") => "macos-x64",
        ("linux", "x86_64") => "linux-x64",
        ("windows", "x86_64") => "windows-x64",
        _ => return Err("Unsupported platform"),
    }
}
```

**Patterns to follow:**
- `reqwest` for HTTP download with progress
- `tokio::fs` for async file I/O
- `sha2` for checksum verification

**Test scenarios:**
- Happy path: `is_installed()` returns false before download, true after
- Happy path: `download()` emits progress events with increasing bytes_downloaded
- Edge case: Partial download → resume from last byte (Range header)
- Error path: Network failure → returns CefError with retry suggestion
- Edge case: Checksum mismatch → returns CefError, deletes partial file

**Verification:**
- Tests pass: `cargo test download::`

---

- [ ] **Unit 4: CefRuntime (Lazy Init + Shutdown)**

**Goal:** Implement CefRuntime singleton with lazy initialization.

**Requirements:** R3 (CDP server), R5 (lazy init)

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `src-tauri/crates/snapfzz-cef/src/runtime.rs`
- Create: `src-tauri/crates/snapfzz-cef/src/cdp.rs`
- Test: `src-tauri/crates/snapfzz-cef/src/runtime.rs` (inline tests)

**Approach:**
```rust
pub struct CefRuntime {
    initialized: bool,
    cef_dir: PathBuf,
    windows: HashMap<String, CefWindow>,
    cdp_server: Option<CdpServer>,
}

impl CefRuntime {
    pub fn new(data_dir: &Path) -> Self;
    
    /// Lazy init — download if missing, then cef_rs::initialize().
    /// MUST be called from tokio::spawn (blocks ~200ms).
    pub async fn ensure_ready(&mut self, downloader: &CefDownloader) -> Result<(), CefError>;
    
    pub fn is_ready(&self) -> bool;
    
    /// Create CEF window with CDP session attached
    pub fn create_window(
        &mut self,
        id: &str,
        url: &str,
        config: WindowConfig,
    ) -> Result<&CefWindow, CefError>;
    
    pub fn window(&self, id: &str) -> Option<&CefWindow>;
    pub fn window_mut(&mut self, id: &str) -> Option<&mut CefWindow>;
    pub fn close_window(&mut self, id: &str) -> Result<(), CefError>;
    
    /// Close all windows + shutdown CDP server + cef_rs::shutdown()
    pub fn shutdown(&mut self);
}
```

**CDP Server:**
```rust
pub struct CdpServer {
    port: u16,
    sessions: HashMap<String, CdpSession>,
}

impl CdpServer {
    /// Start WebSocket server on 127.0.0.1:{port}
    pub async fn start(port: u16) -> Result<Self, CefError>;
    
    /// Route CDP command to specific window's session
    pub fn route(&mut self, window_id: &str, method: &str, params: Value) -> Result<Value, CefError>;
    
    /// Capture console message from CDP session
    pub fn on_console_message(&mut self, window_id: &str, message: ConsoleMessage);
}
```

**Patterns to follow:**
- Singleton pattern (one CefRuntime per app)
- CDP over WebSocket (tungstenite crate)

**Test scenarios:**
- Happy path: `ensure_ready()` with cached CEF → initializes quickly
- Happy path: `ensure_ready()` with missing CEF → triggers download error (user must call downloader first)
- Happy path: `create_window()` → CDP session attached
- Edge case: `create_window()` with duplicate ID → returns error
- Integration: `shutdown()` → closes all windows, CDP server, cef_rs::shutdown()

**Verification:**
- Tests pass: `cargo test runtime::`

---

- [ ] **Unit 5: CefWindow (Per-Browser Lifecycle + CDP)**

**Goal:** Implement CefWindow with navigation, DevTools, CDP capture.

**Requirements:** R3 (CDP server), R5 (lazy init)

**Dependencies:** Unit 4

**Files:**
- Modify: `src-tauri/crates/snapfzz-cef/src/window.rs`
- Test: `src-tauri/crates/snapfzz-cef/src/window.rs` (inline tests)

**Approach:**
```rust
pub struct CefWindow {
    id: String,
    browser: CefBrowser,
    cdp_session: CdpSession,
    plugin_id: String,
    miniapp_id: String,
    backend_port: u16,
    zoom_level: f64,
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
    
    // CDP-mediated DevTools
    pub fn devtools_open(&mut self);  // CDP: Runtime.enable()
    pub fn devtools_close(&mut self); // CDP: Runtime.disable()
    pub fn is_devtools_open(&self) -> bool;
    
    // CDP capture
    pub fn console_messages(&self) -> &[ConsoleMessage];
    pub fn clear_console(&mut self);
    
    // CDP capture
    pub async fn screenshot(&self) -> Result<Vec<u8>, CefError>;  // PNG bytes via CDP
    
    // Lifecycle
    pub fn close(&self);
}
```

**Patterns to follow:**
- cef-rs browser lifecycle
- CDP command structure (Runtime, Page, DOM domains)

**Test scenarios:**
- Happy path: `navigate()` changes browser URL
- Happy path: `back()`/`forward()` navigates history
- Happy path: `screenshot()` returns PNG bytes via CDP
- Edge case: `console_messages()` captures on_console_message events
- Integration: `close()` → browser destroyed, CDP session closed

**Verification:**
- Tests pass: `cargo test window::`

---

- [ ] **Unit 6: Tauri Commands (CEF Lifecycle)**

**Goal:** Expose CEF operations as Tauri commands.

**Requirements:** R1 (user-initiated download), R3 (CDP server)

**Dependencies:** Unit 4, Unit 5

**Files:**
- Create: `src-tauri/src/commands/cef.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add cef module)

**Approach:**
```rust
// Download / Onboarding
#[tauri::command]
async fn cef_download_start() -> Result<(), String>;

#[tauri::command]
async fn cef_download_status() -> Result<DownloadProgress, String>;

#[tauri::command]
async fn cef_download_cancel() -> Result<(), String>;

#[tauri::command]
async fn cef_is_ready() -> Result<bool, String>;

// Window lifecycle
#[tauri::command]
async fn cef_open_window(id: String, url: String, config: WindowConfig) -> Result<(), String>;

#[tauri::command]
async fn cef_close_window(id: String) -> Result<(), String>;

// Navigation
#[tauri::command]
async fn cef_navigate(id: String, url: String) -> Result<(), String>;

#[tauri::command]
async fn cef_go_back(id: String) -> Result<(), String>;

#[tauri::command]
async fn cef_go_forward(id: String) -> Result<(), String>;

#[tauri::command]
async fn cef_reload(id: String) -> Result<(), String>;

// CDP-mediated
#[tauri::command]
async fn cef_devtools(id: String, open: bool) -> Result<(), String>;

#[tauri::command]
async fn cef_screenshot(id: String) -> Result<String, String>;  // base64 PNG

#[tauri::command]
async fn cef_console_messages(id: String) -> Result<Vec<ConsoleMessage>, String>;
```

**Patterns to follow:**
- `src-tauri/src/commands/settings.rs` — thin wrapper pattern
- Error handling: `Result<T, String>` with user-safe messages

**Test scenarios:**
- Integration: `cef_download_start()` → triggers downloader, emits progress
- Integration: `cef_open_window()` → creates CefWindow, attaches CDP
- Integration: `cef_screenshot()` → returns base64 PNG via CDP

**Verification:**
- `cargo check` passes
- Commands registered in `generate_handler![]`

---

- [ ] **Unit 7: Onboarding Flow (Preferences Plugin)**

**Goal:** Add "Enable Mini Apps" onboarding to preferences UI.

**Requirements:** R1 (user-initiated download)

**Dependencies:** Unit 6

**Files:**
- Create: `plugins/settings-advanced/src/MiniAppsOnboarding.tsx`
- Modify: `plugins/settings-advanced/src/AdvancedSettings.tsx` (add onboarding section)

**Approach:**
```
┌──────────────────────────────────────────────────────────┐
│ Mini Apps (Beta)                                         │
│                                                          │
│ Mini apps let you run full-stack apps inside Snapfzz.   │
│ Requires downloading Chromium (~124MB).                 │
│                                                          │
│ [Enable Mini Apps]  ← Click to start download           │
│                                                          │
│ OR (if downloading):                                    │
│ Downloading CEF... 45% [████████░░░░░░░░░░]             │
│ [Cancel]                                                 │
│                                                          │
│ OR (if ready):                                          │
│ ✓ Mini Apps Enabled                                      │
│ [Open Mini App]  [Manage Bookmarks]                     │
└──────────────────────────────────────────────────────────┘
```

**Component state machine:**
```typescript
type OnboardingState = 'not-started' | 'downloading' | 'ready' | 'failed';
```

**Patterns to follow:**
- `plugins/settings-vault/src/VaultSettings.tsx` — async operation with progress
- Ant Design Progress, Button, Alert components

**Test scenarios:**
- Happy path: Click "Enable" → download starts → progress updates → shows "Ready"
- Edge case: Click "Cancel" → download stops → returns to "not-started"
- Error path: Download fails → shows error message with retry button

**Verification:**
- `cd frontend && npx vitest run plugins/settings-advanced` passes
- Manual: Onboarding flow works end-to-end

---

- [ ] **Unit 8: Tests + 90% Coverage**

**Goal:** Achieve ≥90% test coverage on snapfzz-cef crate.

**Requirements:** R4 (90% coverage)

**Dependencies:** Unit 1-7

**Files:**
- All test files from Unit 1-7

**Approach:**
- Run `cargo llvm-cov` on snapfzz-cef crate
- Add tests for uncovered branches
- Target: ≥90% lines, ≥90% functions

**Test scenarios:**
- All scenarios from Unit 1-7
- Edge cases for error paths
- Integration tests for full download → init → window flow

**Verification:**
- `cd src-tauri/crates/snapfzz-cef && cargo llvm-cov --fail-under-lines 90` passes

---

## System-Wide Impact

- **Interaction graph:** CefRuntime registered in main.rs, CDP server listens on localhost port
- **Error propagation:** CEF download failure → onboarding UI shows error (non-blocking)
- **State lifecycle risks:** Partial CEF download → resume on next attempt (not redownload)
- **API surface parity:** No changes to existing Tauri commands or plugin APIs

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| cef-rs incompatibility with Tauri v2 | Low | High | Test early with Unit 1, pin cef-rs commit |
| CEF download timeout on slow connections | Medium | Medium | Resume support, user can cancel/retry |
| CDP server port conflict | Low | Medium | Random port assignment (port 0) |
| Memory exhaustion with many CEF windows | Medium | Medium | BudgetRegistry enforces 256MB/window, 10 max windows |

## Documentation / Operational Notes

- A015 spec updated with CDP server architecture
- Onboarding UX pattern documented for future large downloads
- CDP command reference for kernel debugging capabilities

## Sources & References

- **Origin document:** [A015 spec](docs/plans/A015-miniapp-runtime.md)
- cef-rs: https://github.com/tauri-apps/cef-rs
- CDP documentation: https://chromedevtools.github.io/devtools-protocol/
- Tauri path APIs: https://tauri.app/develop/api/rust/path/
