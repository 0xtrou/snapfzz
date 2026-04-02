# Launcher Window — Project Selector

The first thing you see. Pick a project or start a new one. Nothing else.

---

## App Opens → Launcher

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                        ⚡ snapfzz                           │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
  splash (< 100ms) → fades into:
```

---

## Empty State (First Launch, No Projects)

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Snapfzz                                    [⚙] [📊] [🧠]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                                                             │
│                  ⚡ Launch your first startup                │
│                                                             │
│                  Describe your idea and we'll               │
│                  find, build, and ship it.                  │
│                                                             │
│         ┌──────────────────────────────────────────┐       │
│         │                                          │       │
│         │  What do you want to build?              │       │
│         │                                          │       │
│         │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │       │
│         │                                          │       │
│         │                            [→ Start]     │       │
│         └──────────────────────────────────────────┘       │
│                                                             │
│           ─── or pick a template ───                       │
│                                                             │
│           ┌────────┐ ┌────────┐ ┌────────┐                │
│           │ 🌐 SaaS│ │ 📄 Land│ │ 🔌 API │                │
│           └────────┘ └────────┘ └────────┘                │
│           ┌────────┐ ┌────────┐ ┌────────┐                │
│           │ 🤖 CLI │ │ 🛒 Store│ │ 📱 App │                │
│           └────────┘ └────────┘ └────────┘                │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ● Ready │ claude-sonnet │ 0 projects                        │
└─────────────────────────────────────────────────────────────┘
```

---

## With Projects — The Main View

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Snapfzz                                    [⚙] [📊] [🧠]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ SEARCH ────────────────────────────────────────────┐   │
│  │ 🔍 Search projects...                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  LIVE  ──────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  🟢 SEA Atlas                                       │   │
│  │  Company incorporation for SEA founders              │   │
│  │                                                     │   │
│  │  Stage: Shipped                                     │   │
│  │  URL: sea-atlas.vercel.app                          │   │
│  │  Revenue: $240/mo │ Health: ● 147ms                 │   │
│  │  Last opened: 2 hours ago                           │   │
│  │                                                     │   │
│  │  [Open]                              [Live ↗] [···]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  🟢 AI Code Review                                  │   │
│  │  Automated code review for small teams               │   │
│  │                                                     │   │
│  │  Stage: Shipped                                     │   │
│  │  URL: codrev.app                                    │   │
│  │  Revenue: $89/mo │ Health: ● 203ms                  │   │
│  │  Last opened: Yesterday                             │   │
│  │                                                     │   │
│  │  [Open]                              [Live ↗] [···]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  IN PROGRESS  ───────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  🟡 API Gateway                                     │   │
│  │  Rate-limited API gateway with analytics             │   │
│  │                                                     │   │
│  │  Stage: Build (72%)                                 │   │
│  │  ████████████████████████████░░░░░░░░░░ 72%         │   │
│  │  Last opened: 30 min ago                            │   │
│  │                                                     │   │
│  │  [Resume]                                     [···]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  🟡 Landing Builder                                 │   │
│  │  AI-powered landing page generator                   │   │
│  │                                                     │   │
│  │  Stage: Clarify (2/5 questions answered)             │   │
│  │  ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 25%         │   │
│  │  Last opened: 3 days ago                            │   │
│  │                                                     │   │
│  │  [Resume]                                     [···]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │            ⚡ New Project                            │   │
│  │                                                     │   │
│  │  ┌──────────────────────────────────────────────┐  │   │
│  │  │ What do you want to build?                   │  │   │
│  │  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  │   │
│  │  └──────────────────────────────────────────────┘  │   │
│  │                                       [→ Start]    │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ● Ready │ claude-sonnet │ 4 projects │ 2 live │ $329/mo     │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Card States

### Live (Shipped)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🟢 SEA Atlas                                               │
│  Company incorporation for SEA founders                      │
│                                                             │
│  Stage: Shipped                                             │
│  URL: sea-atlas.vercel.app                                  │
│  Revenue: $240/mo │ Health: ● 147ms                         │
│  Last opened: 2 hours ago                                   │
│                                                             │
│  [Open]                                   [Live ↗] [···]   │
└─────────────────────────────────────────────────────────────┘
```

### In Progress (Building)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🟡 API Gateway                                             │
│  Rate-limited API gateway with analytics                     │
│                                                             │
│  Stage: Build (72%)                                         │
│  ████████████████████████████░░░░░░░░░░ 72%                 │
│  Workers: Scaffold ✓ │ Customize ✓ │ Harden ● │ Test ○     │
│  Last opened: 30 min ago                                    │
│                                                             │
│  [Resume]                                            [···]  │
└─────────────────────────────────────────────────────────────┘
```

### Health Issue

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🔴 Landing Builder                                         │
│  AI-powered landing page generator                           │
│                                                             │
│  Stage: Shipped                                             │
│  URL: landbuild.io                                          │
│  ⚠ DOWN — 503 Service Unavailable │ SSL expired             │
│  Last checked: 5 min ago                                    │
│                                                             │
│  [Open] [🤖 Auto-fix]                    [Live ↗] [···]    │
└─────────────────────────────────────────────────────────────┘
```

### Paused / Abandoned

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ⚪ Newsletter Tool                                         │
│  Email newsletter builder with AI content                    │
│                                                             │
│  Stage: Discover (paused)                                   │
│  Last opened: 2 weeks ago                                   │
│                                                             │
│  [Resume]                              [Archive] [···]      │
└─────────────────────────────────────────────────────────────┘
```

---

## [···] Context Menu

```
  [···] ──► ┌──────────────────────┐
            │ Open                  │
            │ View Live ↗           │
            │ ─────────────────── │
            │ Run Health Check      │
            │ Run Eval Suite        │
            │ Re-enter Build Mode   │
            │ ─────────────────── │
            │ Open in Finder        │
            │ Open in VS Code       │
            │ Open in Terminal      │
            │ ─────────────────── │
            │ Export .snapfzz       │
            │ ─────────────────── │
            │ Archive               │
            │ Delete                │
            └──────────────────────┘
```

---

## Top Bar Actions

```
[⚙] → Opens Settings panel (inline, not new window)
       LLM config, BYOK, model routing, theme, workspace root

[📊] → Opens Eval Dashboard panel (inline)
       Cross-project agent scores, trends, regressions

[🧠] → Opens Memory panel (inline)
       Preferred stack, business entity, decision history, Telos export
```

These open as full-page panels within the Launcher window, replacing the project list. Back button returns to project list.

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Snapfzz  ← Projects                      [⚙] [📊] [🧠]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚙ SETTINGS                                                │
│                                                             │
│  ┌─ LLM Configuration ────────────────────────────────┐   │
│  │  Gateway URL: https://llm.solo.engineer/v1          │   │
│  │  API Key: sk-••••••••7dd4                           │   │
│  │  Default Model: cc/claude-sonnet-4-6            ▾   │   │
│  │  [Test Connection] ● Connected                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Model Routing ────────────────────────────────────┐   │
│  │  Cheap tasks: cc/claude-haiku-3                 ▾   │   │
│  │  Expensive tasks: cc/claude-sonnet-4-6          ▾   │   │
│  │  Eval grading: cc/claude-haiku-3                ▾   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Workspace ────────────────────────────────────────┐   │
│  │  Project root: ~/snapfzz-projects/         [Change] │   │
│  │  Theme: ○ Light  ● Dark  ○ System                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Save]                                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ● Ready │ claude-sonnet │ 4 projects                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Keyboard Shortcuts (Launcher)

```
⌘ + N         → New Project (focus input field)
⌘ + O         → Open project (focus search)
⌘ + 1-9       → Open Nth project
⌘ + ,         → Settings
⌘ + K         → Command palette (search projects, settings, actions)
↑ / ↓         → Navigate project list
Enter         → Open selected project
⌘ + Q         → Quit app
```

---

## Flow: Launcher → Project Window

```
User sees Launcher
    │
    ├── Clicks [Open] or [Resume] on a project card
    │       │
    │       ▼
    │   New Tauri window opens for that project
    │   Launcher stays open in background
    │   (or minimizes — user preference)
    │
    ├── Types idea in "New Project" input + clicks [→ Start]
    │       │
    │       ▼
    │   Launcher creates ~/snapfzz-projects/<name>/.snapfzz/
    │   New Tauri window opens → starts at Clarify stage
    │   Launcher updates project list (new card appears)
    │
    ├── Clicks template card (SaaS, Landing, API, etc.)
    │       │
    │       ▼
    │   Launcher pre-fills idea with template description
    │   Same flow as typing custom idea
    │
    └── Clicks [⚙] [📊] [🧠]
            │
            ▼
        Panel replaces project list (inline, not new window)
        [← Projects] returns to list
```

---

## Responsive: Launcher Window

### Desktop (720x600 default)

As shown above — cards with full detail.

### Narrow / Small Screen (480px min-width)

```
┌────────────────────────────────┐
│ ⚡ Snapfzz        [⚙] [📊] [🧠]│
├────────────────────────────────┤
│ 🔍 Search...                   │
│                                │
│ ┌────────────────────────────┐ │
│ │ 🟢 SEA Atlas               │ │
│ │ Shipped │ $240/mo │ ● 147ms│ │
│ │ [Open]              [···]  │ │
│ └────────────────────────────┘ │
│                                │
│ ┌────────────────────────────┐ │
│ │ 🟡 API Gateway             │ │
│ │ Build 72% │ 30 min ago     │ │
│ │ [Resume]            [···]  │ │
│ └────────────────────────────┘ │
│                                │
│ ┌────────────────────────────┐ │
│ │ ⚡ New Project              │ │
│ │ [░░░░░░░░░░░░░░] [Start]  │ │
│ └────────────────────────────┘ │
│                                │
├────────────────────────────────┤
│ ● Ready │ 4 projects │ 2 live │
└────────────────────────────────┘
```

---

## Project List Sorting

Default: last opened first. Grouped by status.

```
LIVE        → sorted by last opened
IN PROGRESS → sorted by last opened
PAUSED      → sorted by last opened (bottom)
ARCHIVED    → hidden (show via filter)
```

User can change via sort dropdown (future enhancement, not MVP).
