---
title: "Frontend Structure — Feature-Sliced Micro-Frontend"
type: feat
status: active
date: 2026-04-02
---

# Frontend Structure

Feature-sliced architecture. Two apps (launcher + project) sharing entities, components, lib, and workers via a shared package. Each app is its own Vite build → its own Tauri WebView.

## Monorepo Layout

```
frontend/
├── package.json                          # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json                    # Shared TS config
├── tailwind.config.ts                    # Shared Tailwind config (Inter, zinc)
│
├── packages/
│   ├── shared/                           # @snapfzz/shared — cross-app code
│   │   ├── package.json
│   │   ├── components/
│   │   │   └── ui/                       # Design system primitives (Ant Design + shadcn overrides)
│   │   │       ├── button.tsx
│   │   │       ├── input.tsx
│   │   │       ├── card.tsx
│   │   │       ├── tabs.tsx
│   │   │       ├── badge.tsx
│   │   │       ├── avatar.tsx
│   │   │       ├── tooltip.tsx
│   │   │       ├── dropdown.tsx
│   │   │       ├── modal.tsx
│   │   │       ├── skeleton.tsx
│   │   │       └── index.ts
│   │   ├── entities/                     # Domain models — typed, shared across apps
│   │   │   ├── project/
│   │   │   │   ├── types.ts              # Project, ProjectConfig, ProjectStatus
│   │   │   │   ├── schema.ts             # Zod schemas for .snapfzz/ files
│   │   │   │   └── index.ts
│   │   │   ├── agent/
│   │   │   │   ├── types.ts              # Agent, AgentStatus, AgentMessage
│   │   │   │   ├── schema.ts
│   │   │   │   └── index.ts
│   │   │   ├── spec/
│   │   │   │   ├── types.ts              # Spec, SpecVersion, SpecDraft, SpecMeta
│   │   │   │   ├── schema.ts
│   │   │   │   └── index.ts
│   │   │   ├── eval/
│   │   │   │   ├── types.ts              # Benchmark, EvalResult, EvalScore
│   │   │   │   ├── schema.ts
│   │   │   │   └── index.ts
│   │   │   ├── deployment/
│   │   │   │   ├── types.ts              # Deployment, DeployTarget, HealthCheck
│   │   │   │   ├── schema.ts
│   │   │   │   └── index.ts
│   │   │   ├── identity/
│   │   │   │   ├── types.ts              # Identity, Provider, Connection
│   │   │   │   ├── schema.ts
│   │   │   │   └── index.ts
│   │   │   ├── compliance/
│   │   │   │   ├── types.ts              # ComplianceArea, ChecklistItem
│   │   │   │   ├── schema.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   ├── lib/                          # Pure utilities — no React, no Tauri
│   │   │   ├── events.ts                 # Typed event bus (mitt wrapper)
│   │   │   ├── tauri-bridge.ts           # Typed Tauri invoke/listen wrappers
│   │   │   ├── format.ts                 # Date, number, file size formatters
│   │   │   ├── markdown.ts              # Markdown parser config
│   │   │   └── index.ts
│   │   ├── hooks/                        # Shared React hooks
│   │   │   ├── use-tauri-event.ts        # Listen to Tauri events
│   │   │   ├── use-theme.ts             # Dark/light theme toggle
│   │   │   ├── use-worker.ts            # Comlink worker factory hook
│   │   │   └── index.ts
│   │   ├── workers/                      # Web Workers (shared across apps)
│   │   │   ├── state-worker.ts           # use-workerized-reducer state management
│   │   │   ├── highlight-worker.ts       # Shiki syntax highlighting
│   │   │   ├── diff-worker.ts            # Unified diff computation
│   │   │   └── index.ts
│   │   ├── theme/                        # Design tokens + Ant Design config
│   │   │   ├── tokens.css                # CSS variables (zinc palette)
│   │   │   ├── antd-theme.ts            # Ant Design 5 theme config (dark + light)
│   │   │   ├── monaco-theme.ts          # Monaco editor themes
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── launcher/                         # @snapfzz/launcher — Launcher window app
│   │   ├── package.json
│   │   ├── index.html
│   │   ├── vite.config.ts                # Independent build → ~80KB
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx            # Root layout (Ant ConfigProvider + theme)
│   │       │   ├── page.tsx              # Default: project list
│   │       │   ├── globals.css
│   │       │   └── (panels)/
│   │       │       ├── settings/
│   │       │       │   └── page.tsx      # [⚙] Settings panel
│   │       │       ├── eval/
│   │       │       │   └── page.tsx      # [📊] Eval dashboard panel
│   │       │       └── memory/
│   │       │           └── page.tsx      # [🧠] Memory panel
│   │       ├── features/
│   │       │   ├── project-list/         # Project cards, filtering, sorting
│   │       │   │   ├── project-card.tsx
│   │       │   │   ├── project-list.tsx
│   │       │   │   └── index.ts
│   │       │   ├── new-project/          # Idea input + templates
│   │       │   │   ├── idea-input.tsx
│   │       │   │   ├── template-grid.tsx
│   │       │   │   └── index.ts
│   │       │   ├── settings/             # LLM config, BYOK, model routing
│   │       │   │   ├── llm-config.tsx
│   │       │   │   ├── byok-config.tsx
│   │       │   │   ├── model-routing.tsx
│   │       │   │   └── index.ts
│   │       │   ├── eval-dashboard/       # Cross-project agent scores, benchmarks
│   │       │   │   ├── agent-scores.tsx
│   │       │   │   ├── score-history.tsx
│   │       │   │   ├── benchmark-browser.tsx
│   │       │   │   └── index.ts
│   │       │   └── memory/              # Cross-project preferences, decisions
│   │       │       ├── profile.tsx
│   │       │       ├── decisions-log.tsx
│   │       │       ├── health-monitor.tsx
│   │       │       └── index.ts
│   │       ├── widgets/
│   │       │   ├── topbar/               # Launcher title bar with [⚙] [📊] [🧠]
│   │       │   │   └── topbar.tsx
│   │       │   ├── status-bar/           # Bottom: connection, projects, revenue
│   │       │   │   └── status-bar.tsx
│   │       │   └── command-palette/      # ⌘K launcher command palette
│   │       │       └── command-palette.tsx
│   │       └── lib/
│   │           └── utils.ts              # Launcher-specific utils
│   │
│   └── project/                          # @snapfzz/project — Project window app
│       ├── package.json
│       ├── index.html
│       ├── vite.config.ts                # Independent build → ~200KB + Monaco
│       └── src/
│           ├── app/
│           │   ├── layout.tsx            # Root layout (Ant ConfigProvider + theme)
│           │   ├── page.tsx              # Default: Chat tab active
│           │   └── globals.css
│           ├── features/
│           │   ├── chat/                 # Left panel: Chat tab — orchestrator conversation
│           │   │   ├── chat-panel.tsx
│           │   │   ├── message-list.tsx  # react-virtuoso
│           │   │   ├── message-bubble.tsx
│           │   │   ├── sender-input.tsx
│           │   │   └── index.ts
│           │   ├── team/                 # Left panel: Team tab — agent dashboard
│           │   │   ├── team-panel.tsx
│           │   │   ├── agent-card.tsx
│           │   │   ├── agent-chat.tsx    # Drill-in 1:1 conversation
│           │   │   └── index.ts
│           │   ├── knowledge-base/       # Right panel tab: KB — Notion-like docs
│           │   │   ├── kb-panel.tsx
│           │   │   ├── doc-tree.tsx
│           │   │   ├── doc-editor.tsx    # Rich markdown editor
│           │   │   ├── doc-viewer.tsx
│           │   │   ├── version-history.tsx
│           │   │   ├── diff-viewer.tsx
│           │   │   └── index.ts
│           │   ├── code/                 # Right panel tab: Code — Monaco + file explorer
│           │   │   ├── code-panel.tsx
│           │   │   ├── file-explorer.tsx
│           │   │   ├── monaco-editor.tsx # Monaco wrapper with theme
│           │   │   ├── diff-view.tsx
│           │   │   ├── quality-report.tsx
│           │   │   └── index.ts
│           │   ├── preview/              # Right panel tab: Preview — live dev server
│           │   │   ├── preview-panel.tsx
│           │   │   ├── viewport-controls.tsx
│           │   │   ├── triple-viewport.tsx
│           │   │   ├── console-panel.tsx
│           │   │   └── index.ts
│           │   ├── deployments/          # Right panel tab: Deployments — agent-organized
│           │   │   ├── deployments-panel.tsx
│           │   │   ├── deploy-card.tsx
│           │   │   ├── deploy-history.tsx
│           │   │   ├── miniapp-host.tsx  # Mini app iframe renderer
│           │   │   └── index.ts
│           │   ├── identities/           # Right panel tab: Identities — agent-organized
│           │   │   ├── identities-panel.tsx
│           │   │   ├── identity-card.tsx
│           │   │   ├── connect-flow.tsx
│           │   │   ├── miniapp-host.tsx
│           │   │   └── index.ts
│           │   ├── compliance/           # Right panel tab: Compliance — agent-organized
│           │   │   ├── compliance-panel.tsx
│           │   │   ├── compliance-area.tsx
│           │   │   ├── checklist.tsx
│           │   │   ├── miniapp-host.tsx
│           │   │   └── index.ts
│           │   └── agent-network/        # Bottom panel: MsgHub log
│           │       ├── network-panel.tsx
│           │       ├── message-log.tsx
│           │       ├── filter-bar.tsx
│           │       ├── intervention-input.tsx
│           │       └── index.ts
│           ├── widgets/
│           │   ├── topbar/               # Project title + tab bar + [⚙] [✕]
│           │   │   └── topbar.tsx
│           │   ├── left-panel/           # Left panel container with Chat/Team tabs
│           │   │   └── left-panel.tsx
│           │   ├── right-panel/          # Right panel container with workspace tabs
│           │   │   └── right-panel.tsx
│           │   ├── status-bar/           # Bottom: agent, model, tokens, files
│           │   │   └── status-bar.tsx
│           │   ├── resizer/             # Drag handle between panels
│           │   │   └── resizer.tsx       # react-resizable-panels
│           │   └── command-palette/
│           │       └── command-palette.tsx
│           └── lib/
│               ├── miniapp-sandbox.ts    # Sandboxed iframe renderer for mini apps
│               ├── monaco-setup.ts       # Monaco editor initialization
│               └── utils.ts
```

## Dependency Graph

```
@snapfzz/shared          ← no app dependencies, pure library
    │
    ├── @snapfzz/launcher    ← depends on shared only
    │
    └── @snapfzz/project     ← depends on shared only

No cross-dependency between launcher and project.
They communicate via Tauri inter-window events only.
```

## pnpm Workspace

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/shared'
  - 'packages/launcher'
  - 'packages/project'
```

```json
// packages/launcher/package.json
{
  "name": "@snapfzz/launcher",
  "dependencies": {
    "@snapfzz/shared": "workspace:*",
    "@agentscope-ai/design": "latest",
    "@agentscope-ai/chat": "latest",
    "antd": "^5",
    "react": "^19",
    "react-dom": "^19"
  }
}
```

```json
// packages/project/package.json
{
  "name": "@snapfzz/project",
  "dependencies": {
    "@snapfzz/shared": "workspace:*",
    "@agentscope-ai/design": "latest",
    "@agentscope-ai/chat": "latest",
    "antd": "^5",
    "react": "^19",
    "react-dom": "^19",
    "monaco-editor": "^0.52",
    "react-resizable-panels": "^2",
    "react-virtuoso": "^4",
    "comlink": "^4",
    "mitt": "^3"
  }
}
```

## Layer Rules

| Layer | Can Import From | Cannot Import From |
|---|---|---|
| `app/` (routes, layouts) | features, widgets, shared | — |
| `features/` (business logic) | shared (entities, lib, hooks, components/ui) | other features, widgets, app |
| `widgets/` (composite UI) | features, shared | app |
| `shared/entities/` | shared/lib | features, widgets, app |
| `shared/components/ui/` | shared/theme | features, entities, app |
| `shared/lib/` | nothing (pure utilities) | everything |
| `shared/workers/` | shared/lib | everything else |
| `shared/hooks/` | shared/lib, shared/workers | features, widgets |

**Key rule: features cannot import from other features.** Communication between features goes through shared entities, Tauri events, or parent widgets that compose them.

## Build Output

```
dist/
├── launcher/
│   ├── index.html          # ~80KB total (Ant Design tree-shaken)
│   ├── assets/
│   └── ...
├── project/
│   ├── index.html          # ~200KB + Monaco lazy-loaded
│   ├── assets/
│   ├── monaco/             # Monaco editor chunks (lazy, ~5MB)
│   └── ...
└── shared/                 # Not built separately — inlined by each app via workspace:*
```

Tauri loads:
- Launcher window → `dist/launcher/index.html`
- Project window → `dist/project/index.html`
