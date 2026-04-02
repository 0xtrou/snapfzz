---
title: "Instant Loading Architecture"
type: feat
status: active
date: 2026-04-02
---

# Instant Loading — Perfectly From Day 1

The user clicks the app icon and is productive in < 200ms. The intelligence layer connects silently in the background.

## Loading Sequence

```
0ms     Tauri window opens + static shell (sidebar, status bar, empty workspace)
50ms    Workspace data from disk (projects list, last session, preferences)
100ms   User sees their projects, can browse, click, read
~200ms  ClarifyAgent VM restored from snapshot (< 50ms boot)
~500ms  All lazy VMs booted in background — user never noticed
```

## Why This Works

BoxLite micro-VMs boot in **< 50ms**. That's sub-frame at 60fps. The VM layer is faster than React hydration.

| Component | Boot Time | Strategy |
|---|---|---|
| Tauri window | ~100ms | Native, can't improve |
| Static shell (skeleton) | ~30ms | Pre-rendered HTML, no JS needed |
| Workspace data | ~20ms | Read from local disk |
| BoxLite VM (each) | **< 50ms** | Hardware virtualization |
| Snapshot restore (VM + Python) | **< 50ms** | BoxLite checkpoint, fork & clone |
| OCI image (cached) | ~0ms | COW from local cache |

## First Run vs Subsequent Runs

| | First Run | Subsequent Runs |
|---|---|---|
| OCI image | Pull ~50MB — progress bar | Cached, 0ms |
| Python packages | `pip install` — progress bar | Persistent state, 0ms |
| Snapshot | Doesn't exist — cold boot ~2-3s | Restore < 50ms |
| User experience | Honest setup screen | **Instant** |

## Lazy Agent Boot

Only boot what the user needs NOW. Pre-warm the next stage in the background.

```
App launch:
  ├── Boot ClarifyAgent (immediate — user starts here)
  └── Background: nothing else

User in Clarify stage:
  └── Background: pre-warm DiscoverAgent

User in Discover stage:
  └── Background: pre-warm RateAgent

User in Rate stage:
  └── Background: pre-warm BuildAgent + Preview Box

User in Build stage:
  └── Background: pre-warm ShipAgent
```

Stage transitions feel instant because the next agent is already warm.

## Manifesto Standard #13: Instant Loading

```
✓ App window visible in < 200ms (Tauri native + skeleton UI)
✓ Workspace browsable in < 200ms (local disk read)
✓ Chat input active in < 500ms (ClarifyAgent snapshot restore)
✓ Background agents pre-warmed while user works
✓ Lazy boot for later-stage agents
✓ First run: honest setup screen with progress bar
✓ Every subsequent run: snapshot restore < 50ms per VM
✓ No spinner on stage transitions (next agent pre-warmed)

EVAL:
- Time-to-interactive < 500ms (measured)
- Stage transition < 200ms
- No visible spinner after first run
```
