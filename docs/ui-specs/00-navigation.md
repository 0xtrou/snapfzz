# UI Specification Index

Complete UI/UX spec for Snapfzz Startup Launcher. Agent-first IDE.

## Architecture

Two windows. Launcher for project management. Project window for working with agents.

```
LAUNCHER WINDOW                     PROJECT WINDOW
┌─────────────────────┐             ┌──────────────────────────────────────┐
│ Project list         │             │ ┌──────────┬──────────────────────┐ │
│ New project          │   open ►    │ │ LEFT     │ RIGHT                │ │
│ Settings/Eval/Memory │             │ │ Chat     │ Workspace tabs:      │ │
└─────────────────────┘             │ │ Team     │ KB│Code│Prev│Dep│ID│C│ │
                                     │ ├──────────┴──────────────────────┤ │
                                     │ │ ▲ Agent Network (bottom)       │ │
                                     │ ├────────────────────────────────┤ │
                                     │ │ Status Bar                     │ │
                                     └──────────────────────────────────────┘
```

**Core model:** Orchestrator is the main agent — PM, engineer, designer, ops, legal, everything. Generic workspace tabs are agent-organized containers + mini app runtimes. Each agent runs in its own BoxLite micro-VM.

## Spec Files

### Windows & Layout

| File | Content |
|---|---|
| [13-launcher-window.md](13-launcher-window.md) | Launcher: project list, cards, new project, settings, eval, memory |
| [14-project-window.md](14-project-window.md) | Project: left panel (Chat + Team), right panel (KB, Code, Preview, Deployments, Identities, Compliance), Agent Network, mini apps |

### Build Engine

| File | Content |
|---|---|
| [15-preview-and-build-engine.md](15-preview-and-build-engine.md) | Preview tab: HMR pipeline, triple viewport, console capture, responsive enforcement, quality gate |

### Intelligence Quality

| File | Content |
|---|---|
| [16-eval-system.md](16-eval-system.md) | Eval: hard eval + LLM-as-judge, benchmark database (built-in/community/local/custom), auto-extraction, cross-project accumulation |

### Design & Cross-Cutting

| File | Content |
|---|---|
| [17-design-system.md](17-design-system.md) | Design system: Ant Design 5 + shadcn aesthetic, Inter font, zinc palette, dark/light themes, logo usage, Monaco theme, component overrides |
| [10-responsive.md](10-responsive.md) | Responsive rules, breakpoints, touch targets, typography, testing matrix |
| [11-perfectly-from-day-1.md](11-perfectly-from-day-1.md) | 13 quality standards manifesto |
| [12-user-journey.md](12-user-journey.md) | Complete flow: launch → launcher → project → agents → ship → back |
