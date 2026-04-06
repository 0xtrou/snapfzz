---
title: "Tauri Window Drag Is a Minefield"
type: learning
date: 2026-04-05
tags: [tauri, window-management, drag, macos, capabilities, debugging]
---

# Tauri Window Drag Is a Minefield

## Context

Making a custom draggable title bar in Tauri 2 on macOS took 8+ attempts across multiple approaches. What should be a 5-line feature became a multi-hour debugging session.

## What We Tried (and Why Each Failed)

### 1. `data-tauri-drag-region` attribute
**Result:** Didn't work on macOS with `titleBarStyle: "Overlay"`.
**Why:** This attribute requires the `unstable` Tauri feature flag AND `withGlobalTauri: true`. Even with both, it was unreliable.

### 2. `@tauri-apps/api/window` → `getCurrentWindow().startDragging()`
**Result:** Worked on main window, failed on dynamic windows.
**Why:** The npm package wasn't installed. When installed, the async `import()` created a race condition — the module loaded after the user's first click.

### 3. `__TAURI_INTERNALS__.invoke('plugin:window|start_dragging', { label: 'launcher' })`
**Result:** Worked on main window only.
**Why:** The `label` parameter was wrong. `start_dragging` operates on the calling window — no label needed. Also, passing `label` broke the command signature.

### 4. `__TAURI_INTERNALS__` captured at mount time in useEffect
**Result:** Worked on main window, failed on preferences window.
**Why:** For external URL windows (`http://localhost:5175`), Tauri injects `__TAURI_INTERNALS__` after page load. Capturing it in `useEffect([], [])` got `undefined` because React hydrated before Tauri injected.

### 5. `__TAURI_INTERNALS__` read at call time (not mount time)
**Result:** Worked on main window, STILL failed on preferences window.
**Why:** Tauri capabilities had `"windows": ["*"], URL: local` — permissions only applied to local Tauri URLs (`tauri://localhost`), not external URLs (`http://localhost:5175`).

### 6. Added `remote.urls: ["http://localhost:*"]` to capabilities
**Result:** Both windows worked! But double-click maximize was broken.
**Why:** `mousedown` fired `start_dragging` which captured the mouse. The subsequent `dblclick` event then fired `internal_toggle_maximize` — but the drag was already in progress, causing erratic behavior.

### 7. Click-count debounce (final solution)
**Result:** Works correctly.
**Why:** Single handler on `mousedown` counts clicks within 200ms. Single click → drag. Double click → maximize. No separate `dblclick` listener. No race condition.

## The Final Working Solution

```typescript
const handleMouseDown = (e: MouseEvent) => {
  if (!isInTitleBar(e.target)) return;
  e.preventDefault();
  clickCount++;

  if (clickCount === 1) {
    clickTimer = setTimeout(() => {
      if (clickCount === 1) invokeWindowCommand('plugin:window|start_dragging');
      clickCount = 0;
    }, 200);
  } else if (clickCount === 2) {
    clearTimeout(clickTimer);
    clickCount = 0;
    invokeWindowCommand('plugin:window|internal_toggle_maximize');
  }
};
```

## Three Things That Must Be True

1. **`__TAURI_INTERNALS__` read at CALL TIME, not mount time** — dynamic windows may inject IPC after React hydrates
2. **Capabilities must include `remote.urls: ["http://localhost:*"]`** — external URL windows (dev mode) are denied by default
3. **Use `internal_toggle_maximize` not `toggle_maximize`** — the `internal_` variant respects macOS zoom behavior

## Tauri Capabilities Config

```json
{
  "windows": ["*"],
  "remote": {
    "urls": ["http://localhost:*"]
  },
  "permissions": [
    "core:window:allow-start-dragging",
    "core:window:allow-internal-toggle-maximize",
    "core:window:allow-show",
    "core:window:allow-hide"
  ]
}
```

## Rules

1. Never use `data-tauri-drag-region` — it's unreliable. Use JS `start_dragging` command.
2. Never capture Tauri internals at mount time — always read at call time.
3. Never use separate `mousedown` + `dblclick` handlers for title bar — they race. Use click-count debounce.
4. Always add `remote.urls` to capabilities for dev mode external URL windows.
5. Always test drag on EVERY window type, not just the main window.
6. Dynamic windows created via `WebviewWindowBuilder` need the same capabilities as config-defined windows — but ONLY if their URL matches the capability's `remote.urls` pattern.
