---
title: "Micro-Frontend Architecture — Multi-WebView Isolation"
type: feat
status: active
date: 2026-04-02
---

# Micro-Frontend: One WebView Per Pane

No unified DOM tree. Each pane is its own Tauri child WebView with its own DOM, React instance, CSS scope, and main thread. Crash isolation, render isolation, bundle isolation — for free.

## Pane Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Tauri Window                                                    │
│                                                                  │
│  ┌──────────┐ ┌──────────────────────┐ ┌────────────────────┐  │
│  │ WebView: │ │ WebView:             │ │ WebView:           │  │
│  │ SIDEBAR  │ │ MAIN                 │ │ PREVIEW            │  │
│  │          │ │                      │ │                    │  │
│  │ Own DOM  │ │ Own DOM              │ │ Port-forwarded     │  │
│  │ Own React│ │ Own React            │ │ from BoxLite       │  │
│  │ Own CSS  │ │ Own CSS              │ │ :3000              │  │
│  │ ~50KB    │ │ ~200KB               │ │ 0KB (external)     │  │
│  └──────────┘ └──────────────────────┘ └────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ WebView: STATUS BAR (~20KB)                              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Why Multi-WebView Over Unified DOM

| Problem | Unified DOM | Multi-WebView |
|---|---|---|
| CSS bleed | Global cascade, z-index hell | Completely isolated CSSOMx |
| Render coupling | Preview reflow triggers main repaint | Independent compositors |
| Crash isolation | Error boundary = white section | WebView crash = only that pane restarts |
| Bundle size | One massive bundle | Per-pane: sidebar 50KB, main 200KB |
| 60fps | All panels share one main thread | Each WebView has its own main thread |
| Memory | Shared but entangled | Kill a WebView = reclaim all its memory |
| Security | Agent output renders in your DOM | Preview is separate origin, zero DOM access |

## Pane Specifications

| WebView | Content | Bundle | Communication |
|---|---|---|---|
| **Sidebar** | Project list, navigation, stage progress | ~50KB | Tauri events → Main |
| **Main** | Chat, code editor, file tree, diff, eval, settings, memory | ~200KB | Tauri Channel ← Rust SSE |
| **Preview** | User's built app (BoxLite :3000 port-forwarded) | 0KB | postMessage for console |
| **Status Bar** | Connection status, model name, token count | ~20KB | Tauri events |

## Communication: Tauri Events Only

No shared state. No React context across panes. Everything routes through Rust:

```
Sidebar ──emit──► Tauri Event Bus ──listen──► Main
Main    ──emit──► Tauri Event Bus ──listen──► Sidebar
Rust    ──emit──► Tauri Event Bus ──listen──► Status Bar
```

Event types:
- `navigate_stage` — Sidebar → Main
- `project_select` — Sidebar → Main
- `agent_status` — Main → Sidebar
- `token_batch` — Rust → Main
- `token_count` — Main → Status Bar
- `build_progress` — Rust → Main → Sidebar
- `eval_score` — Rust → Main
- `resize_pane` — any pane ↔ Tauri Shell

## Frontend Build Structure

```
frontend/
├── panes/
│   ├── sidebar/
│   │   ├── index.html
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── vite.config.ts     # Independent Vite build
│   │
│   ├── main/
│   │   ├── index.html
│   │   ├── App.tsx
│   │   ├── stages/            # Clarify, Discover, Rate, Build, Ship
│   │   ├── components/
│   │   └── vite.config.ts     # Independent Vite build
│   │
│   ├── status/
│   │   ├── index.html
│   │   ├── App.tsx
│   │   └── vite.config.ts     # Independent Vite build
│   │
│   └── shared/                # Types + tokens only — NO React components
│       ├── events.ts          # Typed event definitions (AppEvents)
│       ├── theme.css          # CSS variables for visual consistency
│       └── types.ts           # Shared TypeScript interfaces
│
└── package.json               # pnpm workspace root
```

Each pane installs `@agentscope-ai/design` independently. Visual consistency via shared CSS variables in `theme.css`, not shared component instances.

## Responsive Collapse

```
Desktop (≥1025px):   4 WebViews — sidebar + main + preview + status
Tablet (641-1024px): 2 WebViews — icon bar + (main OR preview toggle) + status
Mobile (≤640px):     1 WebView — (main OR preview swipe) + status + bottom nav
```

On mobile, Tauri destroys hidden WebViews and recreates on navigation. State lives in Rust (L3 Orchestrator), not in WebViews. Tab switch = create WebView + hydrate from Rust state.

## Tauri WebView Setup

```rust
pub fn create_workspace(window: &Window) -> Result<()> {
    let sidebar = window.add_child(
        WebviewBuilder::new("sidebar", WebviewUrl::App("/sidebar".into()))
            .auto_resize(),
        LogicalPosition::new(0., 0.),
        LogicalSize::new(SIDEBAR_WIDTH, height),
    )?;

    let main = window.add_child(
        WebviewBuilder::new("main", WebviewUrl::App("/main".into()))
            .auto_resize(),
        LogicalPosition::new(SIDEBAR_WIDTH, 0.),
        LogicalSize::new(main_width, main_height),
    )?;

    let preview = window.add_child(
        WebviewBuilder::new("preview",
            WebviewUrl::External("http://localhost:3000".parse().unwrap()))
            .auto_resize(),
        LogicalPosition::new(SIDEBAR_WIDTH + main_width, 0.),
        LogicalSize::new(preview_width, main_height),
    )?;

    let status = window.add_child(
        WebviewBuilder::new("status", WebviewUrl::App("/status".into()))
            .auto_resize(),
        LogicalPosition::new(0., main_height),
        LogicalSize::new(total_width, STATUS_HEIGHT),
    )?;

    Ok(())
}
```
