# Navigation & App Shell

Fully responsive from day 1. See [10-responsive.md](10-responsive.md) for full spec.

## Desktop (≥ 1025px) — Full sidebar

```
┌─────────────────────────────────────────────────────────────────────┐
│  ○ ○ ○                    Snapfzz Startup Launcher                 │
├──────────┬──────────────────────────────────────────────────────────┤
│          │                                                          │
│ SIDEBAR  │                    MAIN CONTENT                          │
│ 240px    │                                                          │
│          │                                                          │
│ ┌──────┐ │                                                          │
│ │ ⚡   │ │                                                          │
│ │ New  │ │                                                          │
│ └──────┘ │                                                          │
│          │                                                          │
│ PROJECTS │                                                          │
│ ──────── │                                                          │
│ ▸ SaaS   │                                                          │
│   Toolkit│                                                          │
│ ▸ Landing│                                                          │
│   Page AI│                                                          │
│ ▸ API    │                                                          │
│   Gateway│                                                          │
│          │                                                          │
│ ──────── │                                                          │
│ ⚙ Settings                                                         │
│ 📊 Eval  │                                                          │
│ 🧠 Memory│                                                          │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 12.4K     │
└─────────────────────────────────────────────────────────────────────┘
```

## Tablet (641–1024px) — Icon bar + overlay sidebar

```
┌────┬────────────────────────────────────────────────────────────────┐
│    │                                                                │
│ ⚡ │                       MAIN CONTENT                             │
│    │                       (full width minus 56px icon bar)        │
│ 📁 │                                                                │
│ 📁 │                                                                │
│ 📁 │                                                                │
│    │                                                                │
│ ⚙  │                                                                │
│ 📊 │                                                                │
│ 🧠 │                                                                │
│    │                                                                │
├────┴────────────────────────────────────────────────────────────────┤
│  ● Connected  │  claude-sonnet  │  12.4K tokens                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Mobile (≤ 640px) — Bottom nav, no sidebar

```
┌─────────────────────────────────────┐
│  Snapfzz Startup Launcher     [☰]  │
├─────────────────────────────────────┤
│                                     │
│         MAIN CONTENT                │
│         (full width, full height)   │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  ● claude-sonnet │ 12.4K tokens    │
├─────────────────────────────────────┤
│  [⚡]  [📁]  [⚙]  [📊]  [🧠]     │
│  New   Proj  Set  Eval  Mem        │
└─────────────────────────────────────┘
```

## Sidebar States (Desktop)

```
COLLAPSED (icon-only, 56px):     EXPANDED (full, 240px):
┌────┐                           ┌──────────┐
│ ⚡ │                           │ ⚡ New    │
│    │                           │          │
│ 📁 │                           │ PROJECTS │
│ 📁 │                           │ ▸ SaaS..│
│ 📁 │                           │ ▸ Land..│
│    │                           │ ▸ API ..│
│ ⚙  │                           │          │
│ 📊 │                           │ ⚙ Settings│
│ 🧠 │                           │ 📊 Eval   │
└────┘                           │ 🧠 Memory │
                                 └──────────┘
```

## Status Bar

```
Desktop:
┌─────────────────────────────────────────────────────────────────────┐
│  AgentScope ● Connected  │  LLM: claude-sonnet  │  Tokens: 12.4K  │
│  [disconnected = red ○]  │  [model name]        │  [session total] │
└─────────────────────────────────────────────────────────────────────┘

Tablet:
┌─────────────────────────────────────────────────────────────────────┐
│  ● Connected  │  claude-sonnet  │  12.4K tokens                    │
└─────────────────────────────────────────────────────────────────────┘

Mobile:
┌─────────────────────────────────────┐
│  ● claude-sonnet │ 12.4K tokens    │
└─────────────────────────────────────┘
```

## Navigation Flow

```
Sidebar "New" button
    └─→ 01-idea.md (Idea Input screen)
        └─→ 02-clarify.md (Interview)
            └─→ 03-discover.md (OSS Search)
                └─→ 04-rate.md (P1-P4 Scoring)
                    └─→ 05-build.md (Multi-Agent Build)
                        └─→ 06-ship.md (Deploy/Legal/Pay)

Sidebar project list
    └─→ Project detail (shows current stage + history)

Sidebar Settings
    └─→ 07-settings.md

Sidebar Eval
    └─→ 08-eval-dashboard.md

Sidebar Memory
    └─→ 09-memory.md
```
