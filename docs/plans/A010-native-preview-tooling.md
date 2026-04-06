---
title: "A010 — Native Preview Tooling (Plugin)"
type: architecture
date: 2026-04-06
derives-from: A005, A008, A009
budget: memory, reliability
scope: plugin-only (NOT core)
---

# A010 — Native Preview Tooling

Agent tools for controlling native emulators and desktop apps. Every capability in this spec is a **plugin** — not core. Core provides web preview only (A009/CEF). Native tooling is optional, installable, and independently budgeted.

## Decision

Web preview is core infrastructure (A009). Native preview is a plugin family.

```
CORE (A009):
  CEF browser embedded in project window
  → every project gets web preview
  → agents get CDP automation
  → ships with the app, zero config

PLUGINS (A010):
  iOS Simulator tools         → requires Xcode + Simulator installed
  Android Emulator tools      → requires Android SDK + emulator installed
  Desktop App tools           → requires Accessibility permission
  → installed per-user, per-need
  → each plugin detects its own prerequisites
  → agents gain tools when plugins are active
```

**Why plugins, not core:**
1. **Prerequisites vary.** Web preview needs nothing (CEF is bundled). iOS needs Xcode (~15GB). Android needs SDK (~5GB). Desktop needs TCC permissions. Bundling any of this into core violates A003 (instant loading) and bloats the app.
2. **A005 says features are plugins.** System plugins = third-party API. If we can't build iOS tooling as a plugin, the plugin API is wrong.
3. **Budget isolation.** Each native tool plugin registers its own supervised processes with A008. A crash in the Android emulator bridge doesn't affect web preview or iOS tools.
4. **10-year horizon (P4).** New platforms (VisionOS, Fuchsia, WASM) become new plugins. Core doesn't change.

---

## Registry Contract

Each native preview plugin registers supervised processes independently with A008:

```
Budget class: "plugin.preview-ios" / "plugin.preview-android" / "plugin.preview-desktop"
Domain: Supervised (external processes)
Source of truth: A008 preset

Memory budgets (additive to CEF — from preset.memory pool):
  iOS Simulator:       monitored via sysinfo (SimulatorKit process)
  Android Emulator:    monitored via sysinfo (qemu-system-aarch64)
  Desktop App:         monitored via sysinfo (target app PID)

Enforcement:
  - enforce_loop() polls RSS of registered emulator/app PIDs
  - Kill + restart on memory exceeded
  - 3 strikes → plugin auto-disabled

Measurement:
  - Per-plugin process metrics in BudgetMetrics
  - Reported alongside CEF metrics every 2s
```

---

## Plugin Family Architecture

```
plugins/
  preview/                    ← CORE (A009) — web only, ships with app
    agentTools: [navigate, click, type, screenshot, a11y-tree, ...]
    protocol: in-process CDP via CEF

  preview-ios/                ← A010 PLUGIN — optional
    agentTools: [ios.tap, ios.screenshot, ios.ui-tree, ios.install, ...]
    protocol: AXe CLI + simctl subprocess
    prerequisites: Xcode, iOS Simulator

  preview-android/            ← A010 PLUGIN — optional
    agentTools: [android.tap, android.screenshot, android.ui-tree, ...]
    protocol: Emulator gRPC + UIAutomator2 HTTP
    prerequisites: Android SDK, Android Emulator

  preview-desktop/            ← A010 PLUGIN — optional
    agentTools: [desktop.click, desktop.screenshot, desktop.ui-tree, ...]
    protocol: AXUIElement + CGEvent + ScreenCaptureKit
    prerequisites: Accessibility + Screen Recording permissions
```

Each plugin is a standard A005 plugin with `surface: ['project']`, lazy activation (`onCommand` or `onViewVisible`), and agent tools registered via `contributes.agentTools`.

---

## iOS Simulator Plugin

### Prerequisites Detection

```typescript
// plugins/preview-ios/src/activate.ts
async activate(ctx: PluginContext): Promise<PluginHandle> {
  // Check: is Xcode installed?
  const xcodePath = await ctx.rust.invoke('check_binary', { name: 'xcrun' });
  if (!xcodePath) {
    ctx.logger.warn('Xcode not found. iOS preview tools unavailable.');
    return { async deactivate() {} };
  }

  // Check: is a Simulator booted?
  const sims = await ctx.rust.invoke('ios_list_simulators');
  // Register tools only if prerequisites met
  ...
}
```

### Protocol Stack

```
Agent Tool Layer (A005 agentTools)
  │
  ├── ios.tap(udid, {x, y} | {label})
  ├── ios.swipe(udid, start, end, duration)
  ├── ios.type(udid, text)
  ├── ios.screenshot(udid) → PNG bytes
  ├── ios.ui-tree(udid) → structured JSON
  ├── ios.install(udid, appPath)
  ├── ios.launch(udid, bundleId)
  ├── ios.terminate(udid, bundleId)
  ├── ios.open-url(udid, url)
  ├── ios.push-notification(udid, payload)
  ├── ios.key-press(udid, keycode)
  ├── ios.button(udid, HOME|LOCK|SIRI)
  ├── ios.stream-video(udid, fps) → MJPEG
  ├── ios.batch-actions(udid, steps[])
  ├── ios.build-and-run(project, scheme, udid)
  └── ios.check-responsive(udid, widths[])
  │
Rust Backend (snapfzz-cef crate or new ios-bridge module)
  │
  ├── AXe binary (subprocess)         ← UI automation: tap, swipe, type, describe-ui
  │     └── IndigoHID (Mach IPC)      ← kernel-level touch injection, 10-30ms
  │     └── Private AX bridge         ← accessibility tree, 100-500ms
  │
  ├── xcrun simctl (subprocess)       ← lifecycle: boot, install, launch, screenshot
  │     └── CoreSimulator XPC         ← system daemon
  │
  └── xcodebuild (subprocess)         ← build: compile, test, run
        └── Xcode build system
```

### Why AXe

| Alternative | Rejected Because |
|---|---|
| Raw IDB gRPC | Requires running `idb_companion` daemon. AXe bundles IDB's XCFrameworks as a single binary — simpler. |
| Maestro XCTest runner | Requires building + installing XCTest bundle per Simulator. Heavy setup. Designed for scripted flows, not agentic interaction. |
| WebDriverAgent (WDA) | 5-15s XCTest startup overhead per session. Slower per-action than IndigoHID. |
| XcodeBuildMCP directly | MCP server, not a library. Would need to run as a sidecar process. Better to use the same underlying AXe binary directly. |
| Direct CoreSimulator.framework | Private ObjC API, no Rust FFI. simctl subprocess is equivalent and safer. |

**AXe** (cameroncooke/AXe, MIT, v1.6.0) is a single binary wrapping IDB's XCFrameworks. It provides IndigoHID-level tap speed (10-30ms) + accessibility tree reading + screenshot + video streaming + batch mode. XcodeBuildMCP bundles it — proven in production.

### Latency Budget

| Operation | Target | Tool |
|---|---|---|
| Tap (coordinate) | < 40ms | AXe → IndigoHID |
| Tap (by label) | < 200ms | AXe → AX query + HID |
| Screenshot | < 150ms | simctl io or AXe |
| UI tree | < 500ms | AXe describe-ui |
| Type text | < 10ms/char | AXe type |
| Build + install | < 30s | xcodebuild + simctl |

### A008 Budget Registration

```rust
// On plugin activation, register Simulator as supervised process
let sim_pid = find_simulator_pid(udid)?;
registry.register_process(
    &format!("plugin.preview-ios.{}", udid),
    ProcessBudget {
        pid: Some(sim_pid),
        max_memory_mb: 1024,  // Simulators are memory-hungry
        health_url: "".into(),  // no HTTP health — use PID liveness
        health_interval_ms: 5000,
        max_health_failures: 3,
        max_restarts: 0,  // don't restart Simulator — user manages lifecycle
        location: ProcessLocation::Local,
        consecutive_failures: 0,
        restart_count: 0,
        status: ProcessStatus::Online,
        started_at: Some(Instant::now()),
        owner: "plugin.preview-ios".into(),
    },
);
```

**Note**: `max_restarts: 0` — the plugin does NOT auto-restart the Simulator. It monitors memory and reports to the user. Killing and restarting Simulators is destructive (loses app state). The plugin warns: "iOS Simulator using {N}MB (limit: 1024MB)."

---

## Android Emulator Plugin

### Prerequisites Detection

```typescript
async activate(ctx: PluginContext): Promise<PluginHandle> {
  const adbPath = await ctx.rust.invoke('check_binary', { name: 'adb' });
  const emulatorPath = await ctx.rust.invoke('check_binary', { name: 'emulator' });
  if (!adbPath || !emulatorPath) {
    ctx.logger.warn('Android SDK not found. Android preview tools unavailable.');
    return { async deactivate() {} };
  }
  // Detect running emulator, connect gRPC + UIA2
  ...
}
```

### Protocol Stack — Dual Channel

```
Agent Tool Layer (A005 agentTools)
  │
  ├── android.tap(device, {x, y})
  ├── android.tap-element(device, {resourceId | text | xpath})
  ├── android.swipe(device, start, end, duration)
  ├── android.type(device, text)
  ├── android.screenshot(device) → PNG bytes
  ├── android.screenshot-stream(device, fps) → frame stream
  ├── android.ui-tree(device) → structured JSON
  ├── android.install(device, apkPath)
  ├── android.launch(device, packageName, activityName)
  ├── android.terminate(device, packageName)
  ├── android.open-url(device, url)
  ├── android.key-event(device, keycode)
  ├── android.back(device)
  ├── android.home(device)
  ├── android.set-location(device, lat, lon)
  ├── android.set-battery(device, level, charging)
  ├── android.webview-cdp(device, method, params) → CDP result
  ├── android.logcat(device, filter) → log stream
  └── android.check-responsive(device, widths[])
  │
Rust Backend
  │
  ├── Emulator gRPC Client (tonic)    ← FAST PATH: hardware-level
  │     ├── sendTouch / sendKey       ← 5-15ms tap
  │     ├── getScreenshot (RGBA)      ← 10-30ms screenshot
  │     ├── streamScreenshot (MMAP)   ← <5ms/frame, 60fps capable
  │     ├── setBattery / setGps       ← 5-10ms sensor simulation
  │     └── streamLogcat              ← real-time logs
  │
  ├── UIAutomator2 HTTP Client (reqwest)  ← ELEMENT PATH: semantic
  │     ├── POST /session/{id}/element     ← find by resourceId/xpath
  │     ├── POST /session/{id}/element/click  ← semantic tap
  │     ├── GET /session/{id}/source       ← full UI tree XML
  │     └── GET /session/{id}/screenshot   ← fallback screenshot
  │
  ├── CDP Client (tokio-tungstenite)  ← WEBVIEW PATH
  │     └── adb forward → ws://localhost:9222  ← Chrome DevTools Protocol
  │         ├── DOM.getDocument        ← WebView DOM inspection
  │         ├── Runtime.evaluate       ← JS execution in WebView
  │         └── Network.enable         ← network monitoring
  │
  └── ADB Client (adb_client crate)   ← LIFECYCLE PATH
        ├── push APK + am instrument   ← install UIA2 server (one-time)
        ├── forward tcp ports          ← gRPC + UIA2 + CDP
        ├── shell am start/force-stop  ← app lifecycle
        └── shell pm install           ← APK deployment
```

### Why Dual Channel (Emulator gRPC + UIA2)

Neither protocol alone is sufficient:

| Need | Emulator gRPC | UIAutomator2 |
|---|---|---|
| Tap by coordinate | **5-15ms** | 80-150ms |
| Tap by element (resourceId) | Cannot — no AX tree | **80-150ms** |
| Screenshot | **10-30ms** (framebuffer) | 150-250ms |
| 60fps frame stream | **<5ms/frame** (MMAP) | Not possible |
| UI accessibility tree | Not available | **200-600ms** |
| Sensor simulation | **5-10ms** | Not available |
| WebView DOM | Not available | Not available (use CDP) |

**Emulator gRPC** operates at the kernel/hypervisor level — it injects evdev touch events and reads the framebuffer directly. Fast, but has no concept of UI elements.

**UIAutomator2** operates at the Android framework level — it walks `AccessibilityNodeInfo` trees and calls `UiAutomation.injectInputEvent()`. Slower, but gives structured element access.

**CDP over ADB** fills the gap for WebView content — DOM, JS execution, network inspection.

### Startup Sequence

```
1. Detect running emulator via `adb devices`                      (<100ms)
2. Discover Emulator gRPC port from ~/.android/ or `adb emu`      (<100ms)
3. Connect tonic gRPC client to localhost:{port}                   (<100ms)
4. Push + install UIAutomator2 server APKs (one-time per device)  (~2-5s)
5. Start UIA2 instrumentation: `adb shell am instrument ...`      (~1-2s)
6. Forward UIA2 port: `adb forward tcp:6790 tcp:6790`            (<100ms)
7. Create UIA2 session: POST localhost:6790/session                (~500ms)
8. → Ready: agent can operate at <200ms per action
```

Steps 4-5 only run once per emulator boot. Subsequent plugin activations skip to step 6.

### Latency Budget

| Operation | Target | Path |
|---|---|---|
| Tap (coordinate) | < 20ms | Emulator gRPC sendTouch |
| Tap (by element) | < 200ms | UIA2 HTTP find + click |
| Screenshot (single) | < 50ms | Emulator gRPC RGBA8888 |
| Screenshot (stream) | < 5ms/frame | Emulator gRPC MMAP |
| UI tree | < 600ms | UIA2 HTTP /source |
| Type text | < 200ms | UIA2 HTTP sendKeys |
| WebView DOM query | < 50ms | CDP DOM.getDocument |
| Install APK | < 10s | ADB pm install |

### A008 Budget Registration

```rust
// Register the emulator process (qemu-system-aarch64)
let emu_pid = find_emulator_pid(device_serial)?;
registry.register_process(
    &format!("plugin.preview-android.{}", device_serial),
    ProcessBudget {
        pid: Some(emu_pid),
        max_memory_mb: 2048,  // Android Emulator is very memory-hungry
        health_url: "".into(),
        health_interval_ms: 5000,
        max_health_failures: 3,
        max_restarts: 0,  // don't restart emulator — user manages lifecycle
        location: ProcessLocation::Local,
        status: ProcessStatus::Online,
        owner: "plugin.preview-android".into(),
        ..Default::default()
    },
);
```

### Emulator gRPC Rust Integration

```toml
# plugins/preview-android crate (or module in snapfzz-cef)
[dependencies]
android-emulator = "0.1"  # tauri-apps published crate, tonic gRPC client
tonic = "0.12"
prost = "0.13"
adb_client = "1"           # ADB wire protocol, no subprocess
reqwest = "0.12"           # UIA2 HTTP client
tokio-tungstenite = "0.24" # CDP WebSocket for WebView
```

The `android-emulator` crate (published 2026-02-10) provides a typed tonic gRPC client generated from the emulator's `.proto` files. Connection example:

```rust
use android_emulator::{list_emulators, EmulatorConfig};

let emulators = list_emulators().await?;
let instance = emulators.into_iter().next().unwrap();
let mut client = instance.connect(Some(Duration::from_secs(10)), true).await?;

// Screenshot (RGBA, ~10-30ms)
let image = client.get_screenshot(ImageFormat { format: RGBA8888, ..default() }).await?;

// Tap (kernel-level, ~5-15ms)
client.send_touch(TouchEvent {
    touches: vec![Touch { x: 540, y: 960, pressure: 1, .. }],
    ..default()
}).await?;
```

---

## Desktop App Plugin (macOS)

### Prerequisites Detection

```typescript
async activate(ctx: PluginContext): Promise<PluginHandle> {
  const trusted = await ctx.rust.invoke('check_accessibility_permission');
  if (!trusted) {
    ctx.logger.warn('Accessibility permission required for desktop preview tools.');
    // Trigger the system permission dialog
    await ctx.rust.invoke('request_accessibility_permission');
    return { async deactivate() {} };
  }
  // Register tools
  ...
}
```

### Protocol Stack

```
Agent Tool Layer (A005 agentTools)
  │
  ├── desktop.click(pid, {x, y} | {label, role})
  ├── desktop.type(pid, text)
  ├── desktop.key-combo(pid, modifiers[], key)
  ├── desktop.screenshot(pid) → PNG bytes
  ├── desktop.screenshot-stream(pid, fps) → frame stream
  ├── desktop.ui-tree(pid) → structured JSON
  ├── desktop.find-element(pid, {label | role | title})
  ├── desktop.launch(bundlePath | bundleId)
  ├── desktop.terminate(pid | bundleId)
  ├── desktop.list-windows() → [{pid, title, bounds, bundleId}]
  ├── desktop.focus-window(pid)
  ├── desktop.resize-window(pid, width, height)
  ├── desktop.ocr-region(pid, {x, y, w, h}) → text
  └── desktop.electron-cdp(pid, method, params) → CDP result
  │
Rust Backend (objc2 crates — zero-cost macOS API bindings)
  │
  ├── AXUIElement (objc2-application-services)
  │     ├── AXUIElementCreateApplication(pid)     ← root element
  │     ├── AXUIElementCopyAttributeValue         ← read any attribute
  │     ├── AXUIElementSetAttributeValue           ← set value / type text
  │     ├── AXUIElementPerformAction("AXPress")   ← semantic click, 1-5ms
  │     └── AXObserverCreate + AddNotification    ← watch for changes
  │
  ├── CGEvent (objc2-core-graphics)
  │     ├── CGEventCreateMouseEvent               ← coordinate click, 1-3ms
  │     ├── CGEventCreateKeyboardEvent            ← key press, 1-2ms
  │     └── CGEventPost(kCGHIDEventTap, event)    ← inject into HID stream
  │
  ├── ScreenCaptureKit (objc2-screen-capture-kit)
  │     ├── SCScreenshotManager.captureImage      ← single screenshot, 8-20ms
  │     ├── SCStream (60fps)                      ← continuous capture, 16ms/frame
  │     └── SCContentFilter(desktopIndependentWindow)  ← any window, no focus needed
  │
  ├── Vision (objc2-vision)
  │     └── VNRecognizeTextRequest                ← OCR, 30-80ms, no API cost
  │
  └── CDP Client (tokio-tungstenite)              ← Electron apps only
        └── Connect to --remote-debugging-port
```

### Framework Coverage

| Target Framework | Primary Protocol | UI Tree Quality | Fallback |
|---|---|---|---|
| SwiftUI (macOS 13+) | AXUIElement | Excellent | — |
| AppKit / Cocoa | AXUIElement | Excellent | — |
| Electron (you launch) | CDP via Playwright / direct | Full DOM | AXUIElement |
| Electron (pre-built) | CDP if --rdp port available | Full DOM | AXUIElement (partial) |
| Tauri (WKWebView) | AXUIElement | Partial (web content flattened) | Screenshot + OCR |
| Qt macOS | AXUIElement (QAccessible) | Good | — |
| Flutter macOS | AXUIElement (if SemanticsEnabled) | Poor without semantics | Screenshot + Vision model |
| Unity / game engines | None (custom renderers) | None | Screenshot + Vision model |

### Latency Budget

| Operation | Target | Tool |
|---|---|---|
| Click (semantic, AXPress) | < 5ms | AXUIElement |
| Click (coordinate) | < 5ms | CGEventPost |
| Type text | < 3ms/key | CGEvent keyboard |
| Screenshot (single window) | < 25ms | ScreenCaptureKit |
| Screenshot (stream) | 16ms/frame | SCStream |
| UI tree (full app) | < 200ms | AXUIElement walk |
| OCR text region | < 80ms | VNRecognizeTextRequest |
| Electron CDP command | < 10ms | WebSocket |

### Permissions Handling

```rust
// In snapfzz-cef or a new desktop-bridge module
use objc2_application_services::AXIsProcessTrustedWithOptions;

pub fn check_accessibility() -> bool {
    unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
}

pub fn request_accessibility() -> bool {
    // Shows system dialog asking user to grant Accessibility permission
    let options = NSDictionary::from_keys_and_objects(
        &[kAXTrustedCheckOptionPrompt],
        &[NSNumber::new_bool(true)],
    );
    unsafe { AXIsProcessTrustedWithOptions(options.as_ref()) }
}

pub fn check_screen_recording() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

pub fn request_screen_recording() -> bool {
    unsafe { CGRequestScreenCaptureAccess() }
}
```

**First-launch flow:**
1. Plugin activates
2. Checks `AXIsProcessTrusted()` → false
3. Calls `AXIsProcessTrustedWithOptions(prompt: true)` → system dialog
4. User grants in System Settings → Privacy → Accessibility
5. Plugin re-checks on next activation → proceeds
6. Same flow for Screen Recording if screenshot tools are used

### A008 Budget Registration

```rust
// Register target app as supervised (monitor, don't kill)
registry.register_process(
    &format!("plugin.preview-desktop.{}", pid),
    ProcessBudget {
        pid: Some(target_pid),
        max_memory_mb: 2048,
        health_url: "".into(),
        health_interval_ms: 5000,
        max_health_failures: 3,
        max_restarts: 0,  // NEVER auto-restart user's app
        location: ProcessLocation::Local,
        status: ProcessStatus::Online,
        owner: "plugin.preview-desktop".into(),
        ..Default::default()
    },
);
```

---

## Rust Crate Dependencies

### iOS Plugin

```toml
# No Rust crate needed — subprocess-based (AXe + simctl)
# AXe is a pre-built macOS binary
# simctl is part of Xcode command line tools
# Future: tonic + idb.proto for native gRPC to idb_companion
```

### Android Plugin

```toml
[dependencies]
android-emulator = "0.1"       # Emulator gRPC client (tonic)
adb_client = "1"               # ADB wire protocol (no subprocess)
reqwest = { version = "0.12", features = ["json"] }  # UIA2 HTTP
tokio-tungstenite = "0.24"     # CDP WebSocket for WebViews
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Desktop Plugin

```toml
[dependencies]
objc2-application-services = { version = "0.3", features = [
    "HIServices", "AXUIElement", "AXError",
    "AXAttributeConstants", "AXRoleConstants", "AXActionConstants", "AXValue"
] }
objc2-core-graphics = { version = "0.3", features = [
    "CGEvent", "CGEventSource", "CGRemoteOperation", "CGWindow"
] }
objc2-screen-capture-kit = { version = "0.3", features = [
    "SCShareableContent", "SCScreenshotManager", "SCStream"
] }
objc2-vision = { version = "0.3", features = ["VNRecognizeTextRequest"] }
objc2-app-kit = { version = "0.3", features = ["NSRunningApplication", "NSWorkspace"] }
tokio-tungstenite = "0.24"   # CDP for Electron apps
```

Reference implementation: [`andelf/axcli`](https://github.com/andelf/axcli) — full Rust implementation of AX tree walk + CGEvent injection + ScreenCaptureKit screenshots + OCR. MIT licensed.

---

## Plugin Manifest Examples

### iOS

```typescript
definePlugin({
  id: 'snapfzz.preview-ios',
  name: 'iOS Preview Tools',
  version: '1.0.0',
  description: 'Agent tools for iOS Simulator automation',
  surface: ['project'],
  activationEvents: ['onCommand:preview-ios.activate'],
  dependencies: { 'snapfzz.preview': '^1.0' },
  requiredCapabilities: ['box.subprocess'],
  contributes: {
    agentTools: [
      { id: 'preview-ios.tap', name: 'iOS Tap', schema: { udid: 'string', x: 'number', y: 'number' }, handler: () => import('./tools/tap') },
      { id: 'preview-ios.screenshot', name: 'iOS Screenshot', schema: { udid: 'string' }, handler: () => import('./tools/screenshot') },
      { id: 'preview-ios.ui-tree', name: 'iOS UI Tree', schema: { udid: 'string' }, handler: () => import('./tools/ui-tree') },
      { id: 'preview-ios.install', name: 'iOS Install App', schema: { udid: 'string', appPath: 'string' }, handler: () => import('./tools/install') },
      { id: 'preview-ios.launch', name: 'iOS Launch App', schema: { udid: 'string', bundleId: 'string' }, handler: () => import('./tools/launch') },
      { id: 'preview-ios.build-and-run', name: 'iOS Build & Run', schema: { project: 'string', scheme: 'string', udid: 'string' }, handler: () => import('./tools/build-and-run') },
      { id: 'preview-ios.type', name: 'iOS Type Text', schema: { udid: 'string', text: 'string' }, handler: () => import('./tools/type') },
      { id: 'preview-ios.check-responsive', name: 'iOS Check Responsive', schema: { udid: 'string', widths: 'number[]' }, handler: () => import('./tools/check-responsive') },
    ],
    agentSkills: [{
      id: 'preview-ios.automation-expert',
      name: 'iOS Simulator Automation',
      systemPrompt: `You have access to iOS Simulator automation tools. Use ios.ui-tree to understand the current screen state before interacting. Prefer tapping by accessibility label (more stable) over coordinates. Always screenshot after actions to verify results. Check responsive layout at 375px (iPhone SE), 390px (iPhone 15), 428px (iPhone 15 Plus).`,
      targetAgents: ['build-agent', 'orchestrator'],
    }],
    commands: [
      { id: 'preview-ios.activate', title: 'Activate iOS Preview Tools' },
    ],
    settings: [{
      id: 'preview-ios.config',
      label: 'iOS Preview',
      schema: {
        axePath: { type: 'string', default: '', description: 'Path to AXe binary (auto-detected if empty)' },
        defaultUdid: { type: 'string', default: '', description: 'Default Simulator UDID' },
      },
    }],
  },
});
```

### Android

```typescript
definePlugin({
  id: 'snapfzz.preview-android',
  name: 'Android Preview Tools',
  version: '1.0.0',
  description: 'Agent tools for Android Emulator automation',
  surface: ['project'],
  activationEvents: ['onCommand:preview-android.activate'],
  dependencies: { 'snapfzz.preview': '^1.0' },
  requiredCapabilities: ['box.subprocess'],
  contributes: {
    agentTools: [
      { id: 'preview-android.tap', name: 'Android Tap', schema: { device: 'string', x: 'number', y: 'number' }, handler: () => import('./tools/tap') },
      { id: 'preview-android.tap-element', name: 'Android Tap Element', schema: { device: 'string', selector: 'object' }, handler: () => import('./tools/tap-element') },
      { id: 'preview-android.screenshot', name: 'Android Screenshot', schema: { device: 'string' }, handler: () => import('./tools/screenshot') },
      { id: 'preview-android.ui-tree', name: 'Android UI Tree', schema: { device: 'string' }, handler: () => import('./tools/ui-tree') },
      { id: 'preview-android.install', name: 'Android Install APK', schema: { device: 'string', apkPath: 'string' }, handler: () => import('./tools/install') },
      { id: 'preview-android.launch', name: 'Android Launch App', schema: { device: 'string', packageName: 'string' }, handler: () => import('./tools/launch') },
      { id: 'preview-android.type', name: 'Android Type Text', schema: { device: 'string', text: 'string' }, handler: () => import('./tools/type') },
      { id: 'preview-android.webview-cdp', name: 'Android WebView CDP', schema: { device: 'string', method: 'string', params: 'object' }, handler: () => import('./tools/webview-cdp') },
      { id: 'preview-android.set-location', name: 'Android Set Location', schema: { device: 'string', lat: 'number', lon: 'number' }, handler: () => import('./tools/set-location') },
      { id: 'preview-android.logcat', name: 'Android Logcat', schema: { device: 'string', filter: 'string' }, handler: () => import('./tools/logcat') },
    ],
    agentSkills: [{
      id: 'preview-android.automation-expert',
      name: 'Android Emulator Automation',
      systemPrompt: `You have access to Android Emulator automation tools. Use android.ui-tree for structured element discovery. For WebView content inside Android apps, use android.webview-cdp with Chrome DevTools Protocol commands. Use Emulator gRPC (coordinate tap) for speed, UIAutomator2 (element tap) for reliability. Always verify actions with screenshots.`,
      targetAgents: ['build-agent', 'orchestrator'],
    }],
    commands: [
      { id: 'preview-android.activate', title: 'Activate Android Preview Tools' },
    ],
  },
});
```

### Desktop

```typescript
definePlugin({
  id: 'snapfzz.preview-desktop',
  name: 'Desktop App Preview Tools',
  version: '1.0.0',
  description: 'Agent tools for macOS desktop app automation',
  surface: ['project'],
  activationEvents: ['onCommand:preview-desktop.activate'],
  dependencies: { 'snapfzz.preview': '^1.0' },
  requiredCapabilities: ['box.subprocess', 'system.accessibility'],
  contributes: {
    agentTools: [
      { id: 'preview-desktop.click', name: 'Desktop Click', schema: { pid: 'number', target: 'object' }, handler: () => import('./tools/click') },
      { id: 'preview-desktop.type', name: 'Desktop Type', schema: { pid: 'number', text: 'string' }, handler: () => import('./tools/type') },
      { id: 'preview-desktop.screenshot', name: 'Desktop Screenshot', schema: { pid: 'number' }, handler: () => import('./tools/screenshot') },
      { id: 'preview-desktop.ui-tree', name: 'Desktop UI Tree', schema: { pid: 'number' }, handler: () => import('./tools/ui-tree') },
      { id: 'preview-desktop.launch', name: 'Desktop Launch App', schema: { bundlePath: 'string' }, handler: () => import('./tools/launch') },
      { id: 'preview-desktop.list-windows', name: 'Desktop List Windows', schema: {}, handler: () => import('./tools/list-windows') },
      { id: 'preview-desktop.ocr', name: 'Desktop OCR Region', schema: { pid: 'number', region: 'object' }, handler: () => import('./tools/ocr') },
      { id: 'preview-desktop.electron-cdp', name: 'Electron CDP Command', schema: { pid: 'number', method: 'string', params: 'object' }, handler: () => import('./tools/electron-cdp') },
      { id: 'preview-desktop.key-combo', name: 'Desktop Key Combo', schema: { pid: 'number', modifiers: 'string[]', key: 'string' }, handler: () => import('./tools/key-combo') },
    ],
    agentSkills: [{
      id: 'preview-desktop.automation-expert',
      name: 'macOS Desktop Automation',
      systemPrompt: `You have access to macOS desktop app automation tools. Use desktop.ui-tree to read the accessibility tree before interacting — prefer semantic clicks (by label/role) over coordinate clicks. For Electron apps, use desktop.electron-cdp for full DOM access. For Flutter apps without good AX trees, use desktop.screenshot + desktop.ocr. Always check permissions status before automated actions.`,
      targetAgents: ['build-agent', 'orchestrator'],
    }],
    commands: [
      { id: 'preview-desktop.activate', title: 'Activate Desktop Preview Tools' },
    ],
  },
});
```

---

## Existing MCP Servers — Integration Strategy

These existing MCP servers validate our tool design but should NOT be used as runtime dependencies:

| MCP Server | Learn From | Don't Ship As |
|---|---|---|
| XcodeBuildMCP (5K stars) | AXe integration pattern, tool surface design, xcodebuild orchestration | Runtime dependency (Node.js MCP server) |
| mobile-mcp (4.4K stars) | Cross-platform unified tool interface, prerequisite detection | Runtime dependency |
| Peekaboo (3K stars) | AX + CGEvent + ScreenCaptureKit pattern, annotated screenshots | Runtime dependency |
| appium-mcp (293 stars) | Vision-based element finding, W3C WebDriver compliance | Runtime dependency (requires Appium server) |

**Why not use them directly:** They're MCP servers (separate processes speaking stdio/SSE). Our plugins call Rust IPC → native APIs directly. No serialization overhead, no extra process, no Node.js/Python runtime. Same capabilities, tighter integration, budget-registered.

---

## Relation to Philosophy

**P1: Right from the beginning.** The plugin architecture means native tooling scales without core changes. Adding VisionOS support = new plugin. Adding Linux desktop support = new plugin. Core never rewrites.

**P2: Build from conviction.** We don't abstract away platform differences — we expose them. iOS agents know they're talking to IndigoHID. Android agents know they have gRPC + UIA2. Desktop agents know they have AXUIElement. Accurate tools beat leaky abstractions.

**P3: Sell infrastructure.** The agent tool surface IS the infrastructure. Third-party plugin authors can build `preview-visionos`, `preview-embedded`, `preview-wasm` using the same A005 contribution types. The tool registry compounds.

**P4: Product lives for 10 years.** AXUIElement has been stable since 2005. ADB since 2009. simctl since 2014. These are the bedrock protocols — not trends. Building on them means our tools age well.
