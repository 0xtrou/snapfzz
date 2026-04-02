# Navigation & App Shell

## Desktop Window (Tauri)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ○ ○ ○                    Snapfzz Startup Launcher                 │
├──────────┬──────────────────────────────────────────────────────────┤
│          │                                                          │
│ SIDEBAR  │                    MAIN CONTENT                          │
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
│          │                                                          │
│          │                                                          │
│          │                                                          │
│          │                                                          │
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

## Sidebar States

```
COLLAPSED (icon-only):           EXPANDED (full):
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
┌─────────────────────────────────────────────────────────────────────┐
│  AgentScope ● Connected  │  LLM: claude-sonnet  │  Tokens: 12.4K  │
│  [disconnected = red ○]  │  [model name]        │  [session total] │
└─────────────────────────────────────────────────────────────────────┘
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
