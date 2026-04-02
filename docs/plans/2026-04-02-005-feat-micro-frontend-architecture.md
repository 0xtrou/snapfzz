---
title: "Micro-Frontend Architecture — Two Window Types"
type: feat
status: active
date: 2026-04-02
---

# Micro-Frontend: Launcher Window + Project Window

One project per window. Zero distraction. The launcher is a separate lightweight window for managing projects. Each project opens in its own full-screen workspace.

## Two Window Types

```
LAUNCHER WINDOW                        PROJECT WINDOW
(lightweight, always available)        (one per open project)

┌───────────────────────────┐          ┌────────────────────────────────────────┐
│ ⚡ Snapfzz                │          │ SEA Atlas                    ● Build  │
│                           │   open   │ ┌──────────────┐ ┌────────────────┐   │
│ ● SEA Atlas        [Open]│ ───────► │ │ Main WebView │ │ Preview WebView│   │
│ ● Code Review      [Open]│          │ │              │ │                │   │
│ ○ API Gateway      [Open]│          │ │ Chat/Code/   │ │ Live App       │   │
│                           │          │ │ Stages       │ │ (BoxLite :3000)│   │
│ [⚡ New Project]          │          │ │              │ │                │   │
│                           │          │ └──────────────┘ └────────────────┘   │
│ ⚙ Settings                │          │ ┌──────────────────────────────────┐   │
│ 📊 Eval                   │          │ │ Status Bar WebView               │   │
│ 🧠 Memory                 │          │ └──────────────────────────────────┘   │
└───────────────────────────┘          └────────────────────────────────────────┘
```

## Why Two Windows

| One-window (before) | Two-window (now) |
|---|---|
| Sidebar steals 240px from Build | Full window width for split-pane |
| Project switching = sidebar click, context bleed | Project switching = window switch, OS-native |
| Settings/Eval/Memory compete with project content | Settings/Eval/Memory live in Launcher |
| Complex 4-WebView layout | Simple: Launcher = 1 WebView, Project = 2-3 WebViews |
| Mobile collapse is awkward with sidebar | Mobile: Launcher = project list, Project = full-screen build |

## Launcher Window

Lightweight. Shows all projects, global settings, eval dashboard, memory. Think Finder/Explorer but for your startups.

### Desktop

```
┌─────────────────────────────────────────────────────────┐
│ ⚡ Snapfzz Startup Launcher              [⚙] [📊] [🧠] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │ SEA Atlas                         ● Live       │    │
│  │ Company incorporation for SEA founders          │    │
│  │ Stage: Shipped │ sea-atlas.vercel.app           │    │
│  │ [Open]  [View Live ↗]                          │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │ AI Code Review                    ● Live       │    │
│  │ Automated code review for small teams           │    │
│  │ Stage: Shipped │ codrev.app                     │    │
│  │ [Open]  [View Live ↗]                          │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │ API Gateway                       ○ Building   │    │
│  │ Rate-limited API gateway with analytics         │    │
│  │ Stage: Build (72%)                              │    │
│  │ [Resume]                                        │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │               ⚡ New Project                    │    │
│  │                                                 │    │
│  │  Describe your idea or pick a template          │    │
│  │  [→ Start]                                      │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ ● Ready │ Projects: 3 │ 2 Live │ claude-sonnet          │
└─────────────────────────────────────────────────────────┘
```

### Mobile Launcher

```
┌─────────────────────────────────────┐
│ ⚡ Snapfzz              [⚙] [📊] [🧠]│
├─────────────────────────────────────┤
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ SEA Atlas              ● Live   │ │
│ │ Shipped │ sea-atlas.vercel.app  │ │
│ │ [Open]  [Live ↗]               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ AI Code Review         ● Live   │ │
│ │ Shipped │ codrev.app            │ │
│ │ [Open]  [Live ↗]               │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ API Gateway            ○ Build  │ │
│ │ Build (72%)                     │ │
│ │ [Resume]                        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │      ⚡ New Project              │ │
│ │      [→ Start]                  │ │
│ └─────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ ● Ready │ 3 projects │ claude-sonnet│
└─────────────────────────────────────┘
```

## Project Window

Full workspace. One project, full focus. No sidebar, no project list. Just the work.

### Desktop — Build Stage (The Core Experience)

```
┌──────────────────────────────────────────────────────────────────────┐
│ SEA Atlas                    Build ●───○───○   [◧◨] [☰ Stages] [✕] │
├────────────────────────────────────┬─────────────────────────────────┤
│ MAIN WebView                       │ PREVIEW WebView                 │
│                                    │                                 │
│ [💬 Chat] [📝 Code] [📁 Files] [±] │ [↗] [📱] [📱↔] [🖥] [▣▣▣]      │
│                                    │                                 │
│ ┌─ 🤖 BuildAgent ──────────────┐  │ ┌─────────────────────────┐    │
│ │ Adding VN jurisdiction now.   │  │ │                         │    │
│ │                                │  │ │    SEA Atlas            │    │
│ │ Working on:                    │  │ │                         │    │
│ │ • Registration form            │  │ │    [🇸🇬] [🇻🇳] [🇹🇭]       │    │
│ │ • ACRA field mapping           │  │ │                         │    │
│ └────────────────────────────────┘  │ │    [Get Started →]      │    │
│                                    │ │                         │    │
│ ┌─ ACTIVITY ─────────────────┐    │ │    ── Features ──       │    │
│ │ ✓ Scaffold      12s        │    │ │                         │    │
│ │ ● Customize     working... │    │ │    ┌────┐ ┌────┐       │    │
│ │ ○ Harden                    │    │ │    │ 🏢 │ │ 🏦 │       │    │
│ │ ○ Test                      │    │ │    └────┘ └────┘       │    │
│ └─────────────────────────────┘    │ └─────────────────────────┘    │
│                                    │                                 │
│ ┌──────────────────────┬────────┐ │  🔄 Hot reload │ ● Live         │
│ │ Make the hero darker │  Send  │ │                                 │
│ └──────────────────────┴────────┘ │                                 │
├────────────────────────────────────┴─────────────────────────────────┤
│ ● BuildAgent │ claude-sonnet │ Tokens: 24K │ Files: 8 │ Quality: —  │
└──────────────────────────────────────────────────────────────────────┘
```

### Desktop — Non-Build Stages (Clarify, Discover, Rate, Ship)

No preview pane needed. Main WebView takes full width.

```
┌──────────────────────────────────────────────────────────────────────┐
│ SEA Atlas                    Clarify ●───○───○───○───○   [☰] [✕]   │
├──────────────────────────────────────────────────────────────────────┤
│ MAIN WebView (full width)                                            │
│                                                                      │
│  ┌── 🤖 ClarifyAgent ──────────────────────────────────────────┐   │
│  │                                                              │   │
│  │ Who is the primary user?                                     │   │
│  │ a) First-time founders incorporating                         │   │
│  │ b) Existing businesses expanding                             │   │
│  │ c) Freelancers formalizing                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌── 👤 You ───────────────────────────────────────────────────┐   │
│  │ Mainly first-time founders based in VN/TH.                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────────────────────────────────┬──────┐      │
│  │ Type your answer...                                │ Send │      │
│  └────────────────────────────────────────────────────┴──────┘      │
│                                                      Question 2/~5  │
├──────────────────────────────────────────────────────────────────────┤
│ ● ClarifyAgent │ claude-sonnet │ Tokens: 2.1K                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Tablet — Project Window

```
┌────────────────────────────────────────────────────┐
│ SEA Atlas              Build   [💬] [👁] [☰] [✕]  │
├────────────────────────────────────────────────────┤
│                                                    │
│  [💬 Chat] [👁 Preview]   ← toggle between panes  │
│                                                    │
│  (active pane takes full width)                    │
│                                                    │
│  Chat tab: full-width chat + code                  │
│  Preview tab: full-width interactive preview       │
│                                                    │
│  PiP thumbnail of inactive pane in corner          │
│                                                    │
│  ┌──────────────────────────────────┬────────┐    │
│  │ Type...                          │  Send  │    │
│  └──────────────────────────────────┴────────┘    │
├────────────────────────────────────────────────────┤
│ ● BuildAgent │ sonnet │ 24K tokens                 │
└────────────────────────────────────────────────────┘
```

### Mobile — Project Window

```
┌─────────────────────────────────────┐
│ SEA Atlas        Build   [☰] [✕]   │
├─────────────────────────────────────┤
│ [💬 Chat] [📝 Code] [👁 Preview]   │
├─────────────────────────────────────┤
│                                     │
│  (active tab, full screen)          │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🤖 Adding jurisdiction...   │   │
│  └─────────────────────────────┘   │
│                                     │
│           ┌───────────────┐        │
│           │ PiP preview   │        │
│           │ (tap=expand)  │        │
│           └───────────────┘        │
│                                     │
├─────────────────────────────────────┤
│ ┌───────────────────────┬────────┐ │
│ │ Type...               │  Send  │ │
│ └───────────────────────┴────────┘ │
├─────────────────────────────────────┤
│ ● BuildAgent │ 24K tokens          │
└─────────────────────────────────────┘
```

## WebView Layout Per Window

### Launcher Window: 1 WebView

```
┌──────────────────────────────┐
│ WebView: LAUNCHER            │
│                              │
│ Single React app             │
│ ~80KB bundle                 │
│ Project list, settings,      │
│ eval dashboard, memory       │
└──────────────────────────────┘
```

### Project Window: 2-3 WebViews

```
Build stage (3 WebViews):
┌──────────────────┬───────────────────┐
│ WebView: MAIN    │ WebView: PREVIEW  │
│ ~200KB           │ 0KB (external)    │
├──────────────────┴───────────────────┤
│ WebView: STATUS BAR (~20KB)          │
└──────────────────────────────────────┘

Non-build stages (2 WebViews):
┌──────────────────────────────────────┐
│ WebView: MAIN (full width, ~200KB)   │
├──────────────────────────────────────┤
│ WebView: STATUS BAR (~20KB)          │
└──────────────────────────────────────┘
```

Preview WebView only exists during Build stage. Created when entering Build, destroyed when leaving.

## Communication

### Launcher ↔ Project Windows

```
Launcher                          Project Window(s)
   │                                    │
   │  Tauri inter-window events         │
   │  ───────────────────────►          │
   │  • open_project(project_id)        │
   │  • close_project(project_id)       │
   │                                    │
   │  ◄───────────────────────          │
   │  • project_stage_changed           │
   │  • project_health_updated          │
   │  • token_usage_updated             │
   │                                    │
```

### Within Project Window

```
Main WebView ◄──► Tauri Events ◄──► Status Bar WebView
                       ▲
                       │ Tauri Channel
                       │
                  Rust Backend
              (L2-L6 all layers)
```

## Frontend Build Structure (Updated)

```
frontend/
├── windows/
│   ├── launcher/
│   │   ├── index.html
│   │   ├── App.tsx              # Project list, new project, settings, eval, memory
│   │   ├── components/
│   │   └── vite.config.ts       # Independent build ~80KB
│   │
│   ├── project/
│   │   ├── main/
│   │   │   ├── index.html
│   │   │   ├── App.tsx          # Chat, code, stages, file tree, diff
│   │   │   ├── stages/          # Clarify, Discover, Rate, Build, Ship views
│   │   │   ├── components/
│   │   │   └── vite.config.ts   # Independent build ~200KB
│   │   │
│   │   └── status/
│   │       ├── index.html
│   │       ├── App.tsx          # Connection, model, tokens, quality
│   │       └── vite.config.ts   # Independent build ~20KB
│   │
│   └── shared/                  # Types + tokens only — NO React components
│       ├── events.ts
│       ├── theme.css
│       └── types.ts
│
└── package.json                 # pnpm workspace root
```

## Tauri Window Management (Rust)

```rust
// Open launcher on app start
fn create_launcher(app: &AppHandle) -> Result<Window> {
    let launcher = WindowBuilder::new(app, "launcher")
        .title("Snapfzz Startup Launcher")
        .inner_size(720., 600.)
        .min_inner_size(480., 400.)
        .build()?;
    Ok(launcher)
}

// Open a project in a new window
fn open_project(app: &AppHandle, project_id: &str) -> Result<Window> {
    let project = WindowBuilder::new(app, format!("project-{}", project_id))
        .title(format!("{} — Snapfzz", project_name))
        .inner_size(1440., 900.)
        .min_inner_size(800., 600.)
        .build()?;

    // Add Main WebView
    let main = project.add_child(
        WebviewBuilder::new("main", WebviewUrl::App("/project/main".into()))
            .auto_resize(),
        LogicalPosition::new(0., 0.),
        LogicalSize::new(main_width, main_height),
    )?;

    // Add Status Bar WebView
    let status = project.add_child(
        WebviewBuilder::new("status", WebviewUrl::App("/project/status".into()))
            .auto_resize(),
        LogicalPosition::new(0., main_height),
        LogicalSize::new(total_width, STATUS_HEIGHT),
    )?;

    // Preview WebView added dynamically when entering Build stage
    Ok(project)
}

// Dynamically add Preview WebView when entering Build stage
fn enter_build_stage(project_window: &Window, preview_port: u16) -> Result<()> {
    // Resize Main to 50%
    // Add Preview WebView for the other 50%
    let preview = project_window.add_child(
        WebviewBuilder::new("preview",
            WebviewUrl::External(format!("http://localhost:{}", preview_port).parse().unwrap()))
            .auto_resize(),
        LogicalPosition::new(main_width, 0.),
        LogicalSize::new(preview_width, main_height),
    )?;
    Ok(())
}

// Remove Preview WebView when leaving Build stage
fn leave_build_stage(project_window: &Window) -> Result<()> {
    // Destroy Preview WebView
    // Resize Main to full width
    Ok(())
}
```

## Stage Navigation Within Project Window

The project window has a top bar with stage progress and a [☰ Stages] menu:

```
┌──────────────────────────────────────────────────────────────────────┐
│ SEA Atlas        ●───●───●───●───○        [☰ Stages] [Settings] [✕]│
│                  C    D    R    B    S                               │
└──────────────────────────────────────────────────────────────────────┘
  ↑ Click any completed stage dot to revisit
  ↑ [☰ Stages] opens dropdown:
     ✓ Clarify — edit requirements
     ✓ Discover — search again
     ✓ Rate — re-score
     ● Build — current
     ○ Ship — next
```

## Design Rules (Updated)

1. **One project per window.** Full focus. No sidebar distraction.
2. **Launcher is separate.** Lightweight window for project management, settings, eval, memory.
3. **Multiple projects = multiple windows.** OS window management handles switching.
4. **Preview WebView is dynamic.** Created on Build stage entry, destroyed on exit.
5. **Non-build stages get full width.** No wasted space on chat-only screens.
6. **State lives in Rust, not WebViews.** Windows can be closed and reopened. State survives.
7. **Launcher can be a menu bar app (future).** It's so lightweight it could live in the system tray.
