# Navigation & App Architecture

Two windows. Launcher for managing projects. Project window for working on one project with agent tabs.

## Core Model

**Tab = Agent = Conversation = BoxLite VM**

Each tab is a dedicated agent with its own chat, workspace, and isolated process. Agents coordinate via AgentScope MsgHub, visible in the bottom Agent Network panel.

## Two Window Types

```
LAUNCHER WINDOW (720x600)              PROJECT WINDOW (1440x900)
┌───────────────────────────┐          ┌──────────────────────────────────────────┐
│ Project list               │          │ Tabs: Clarify│Specs│Disc│Rate│Build│Ship│
│ New project input          │  open ►  │ ┌────────────────┬───────────────────┐  │
│ Settings / Eval / Memory   │          │ │ Agent Chat     │ Agent Workspace   │  │
│                           │          │ └────────────────┴───────────────────┘  │
│                           │          │ ▲ Agent Network (bottom panel)          │
│                           │          │ Status bar                              │
└───────────────────────────┘          └──────────────────────────────────────────┘
```

## Spec Documents

| Spec | Covers |
|---|---|
| [13-launcher-window.md](13-launcher-window.md) | Launcher: project list, new project, settings, eval, memory |
| [14-project-window.md](14-project-window.md) | Project: all agent tabs, chat+workspace, Agent Network panel, specs versioning |
| [12-user-journey.md](12-user-journey.md) | Complete flow from app launch to shipped business |
| [05-build.md](05-build.md) | Build tab deep-dive: live preview, triple viewport, HMR, responsive enforcement |
| [10-responsive.md](10-responsive.md) | Responsive rules for all screens |
| [11-perfectly-from-day-1.md](11-perfectly-from-day-1.md) | 13 quality standards manifesto |

## Superseded Specs

Files 01-04, 06-09 contain early designs with the old sidebar + stage model. The current architecture is defined in files 13 and 14. The old files are preserved for historical reference but **14-project-window.md is the source of truth** for all tab/agent designs.

## Navigation Flows

```
Launcher: [→ Start] with idea text
    └─► Creates project folder + .snapfzz/
    └─► Project Window opens → Clarify tab (agent interviews user)

Launcher: [Open] on project card
    └─► Project Window opens → last active tab (with full history)

Launcher: [Resume] on in-progress project
    └─► Project Window opens → last active tab

Project: Click any tab
    └─► Agent chat + workspace loads for that tab
    └─► Build tab adds Preview WebView (split pane)
    └─► All other tabs: chat (left) + workspace (right), full width

Project: Agent Network panel (bottom)
    └─► Live view of AgentScope MsgHub
    └─► Human can intervene with @agent messages
    └─► Filter by agent

Project: [+] tab
    └─► Add custom agent (Analytics, Test, Content, Security, or custom)

Project: Close [✕]
    └─► All state saved to .snapfzz/ → back to Launcher
```
