---
name: task-assignment
description: Use when delegating any implementation work to a subagent. Enforces spec traceability, TDD, and engineering standards. Trigger on any task dispatch, code delegation, plugin implementation, or feature building.
---

# Task Assignment

Every delegated task must trace back to specs. Every test must reference what it verifies. Every architectural decision must cite the spec that mandated it.

## Before Dispatching Any Agent

### 1. Identify Relevant Specs

Read the task description. Map it to spec files:

| Spec | When Relevant |
|---|---|
| `docs/plans/2026-04-02-009-feat-plugin-architecture.md` | Any plugin work, contribution types, plugin API, lifecycle |
| `docs/plans/2026-04-02-010-feat-core-runtime.md` | Core shell, plugin host, boot sequence |
| `docs/plans/2026-04-02-002-feat-performance-architecture.md` | 60fps, child WebViews, HMR, split pane, Monaco, CSS containment |
| `docs/plans/2026-04-02-003-feat-state-management-architecture.md` | Workers, Rust SSE, zones, batching |
| `docs/plans/2026-04-02-006-feat-instant-loading-architecture.md` | Startup budget, lazy loading, BoxLite snapshots |
| `docs/plans/2026-04-02-007-feat-workspace-architecture.md` | .snapfzz/ folders, config format, file storage |
| `docs/ui-specs/14-project-window.md` | Project window layout, left/right panels, Agent Network |
| `docs/ui-specs/13-launcher-window.md` | Launcher window, project list |
| `docs/ui-specs/17-design-system.md` | Ant Design + shadcn, Inter, zinc, dark/light |
| `docs/ui-specs/16-eval-system.md` | Hard eval + LLM-as-judge, benchmarks |
| `docs/ui-specs/15-preview-and-build-engine.md` | Live preview, HMR, triple viewport |
| `docs/ui-specs/18-git-inspector.md` | Git sub-views, git2-rs, Monaco diff |

Every task must reference at minimum ONE spec. If a task doesn't trace to any spec, question whether it should exist.

### 2. Identify Relevant Existing Code

The agent must read existing code before writing new code:

| Package | When To Reference |
|---|---|
| `frontend/packages/plugin-sdk/src/types.ts` | Any plugin work — THE stable contract |
| `frontend/packages/plugin-host/src/` | Plugin host, ContributionStore, PluginContext |
| `frontend/packages/shared/src/` | Entities, EventBus, TauriBridge, theme, hooks |
| `frontend/packages/launcher/src/` | Launcher shell |
| `frontend/packages/project/src/` | Project shell |
| `src-tauri/crates/snapfzz-core/src/` | Rust types |

### 3. Compose the Agent Prompt

Every agent prompt MUST include these sections in this order:

```
## TASK
What to build. One clear deliverable.

## SPEC REFERENCES (read before coding)
- /absolute/path/to/spec1.md (sections X, Y relevant)
- /absolute/path/to/spec2.md (section Z relevant)

## EXISTING CODE (read before coding)
- /absolute/path/to/file1.ts
- /absolute/path/to/file2.ts

## ENGINEERING STANDARDS
Follow /absolute/path/to/ENGINEERING_GUIDE.md:

- TDD: write failing test FIRST, then implement
- Test names: {spec-number}/{section}: {behavior}
- Inline comments: // Per {spec-number}/{section}: {why}
- Update docs/TRACEABILITY.md after implementation

## MUST DO
- Read ALL spec and code files listed above before writing any code
- Write tests first (TDD)
- Test names reference specs: 009/PluginHost: resolves dependencies
- Inline comments reference specs: // Per 002/Performance: 16ms batch
- Update docs/TRACEABILITY.md with new rows
- Verify pnpm dev:launcher still works
- Verify npx vitest run passes

## MUST NOT DO
- Do NOT modify @snapfzz/plugin-sdk (stable contract)
- Do NOT skip tests
- Do NOT write code without a spec reference
- Do NOT add dependencies without justification
```

### 4. Verify After Completion

When the agent finishes, check:

1. **Tests pass**: `cd frontend && npx vitest run`
2. **App boots**: `pnpm dev:launcher` returns HTTP 200
3. **Test names have spec prefixes**: grep test files for `{number}/`
4. **Inline comments reference specs**: grep source files for `// Per {number}/`
5. **TRACEABILITY.md updated**: new rows exist for new code
6. **No spec violations**: code matches what specs describe

If any check fails, resume the agent session with the specific failure.

## Example: Delegating Shell Layout

```typescript
task(
  category="deep",
  load_skills=["ce:work", "test-driven-development", "task-assignment"],
  description="Build project shell layout from ContributionStore",
  prompt=`
## TASK
Update @snapfzz/project shell to render tabs dynamically from ContributionStore.
Left panel tabs + right panel tabs + bottom panel + status bar.

## SPEC REFERENCES (read before coding)
- /Users/mrk/.../docs/plans/2026-04-02-009-feat-plugin-architecture.md
  (sections: Registration Points, Plugin Lifecycle)
- /Users/mrk/.../docs/plans/2026-04-02-010-feat-core-runtime.md
  (section: Shell Layout — Dynamic Rendering)
- /Users/mrk/.../docs/plans/2026-04-02-002-feat-performance-architecture.md
  (section: Split Pane — react-resizable-panels)
- /Users/mrk/.../docs/ui-specs/14-project-window.md
  (full document — the layout spec)
- /Users/mrk/.../docs/ui-specs/17-design-system.md
  (section: Ant Design 5 Theme Config)

## EXISTING CODE (read before coding)
- /Users/mrk/.../frontend/packages/plugin-host/src/contribution-store.ts
- /Users/mrk/.../frontend/packages/plugin-host/src/use-contribution-store.ts
- /Users/mrk/.../frontend/packages/plugin-host/src/use-plugin-host.ts
- /Users/mrk/.../frontend/packages/project/src/app/App.tsx
- /Users/mrk/.../frontend/packages/shared/src/theme/antd-theme.ts

## ENGINEERING STANDARDS
Follow /Users/mrk/.../ENGINEERING_GUIDE.md
...
`
)
```

## Example: Delegating a System Plugin

```typescript
task(
  category="deep",
  load_skills=["ce:work", "test-driven-development", "task-assignment"],
  description="Build Chat system plugin",
  prompt=`
## TASK
Build the Chat system plugin at frontend/plugins/chat/.
Uses definePlugin() to register a leftPanelTab with orchestrator conversation UI.

## SPEC REFERENCES (read before coding)
- /Users/mrk/.../docs/plans/2026-04-02-009-feat-plugin-architecture.md
  (sections: Plugin Manifest, PluginContext, Intelligence Contributions)
- /Users/mrk/.../docs/ui-specs/14-project-window.md
  (section: LEFT PANEL — Communication, Chat tab)
- /Users/mrk/.../docs/ui-specs/17-design-system.md
  (Ant Design + shadcn aesthetic)
- /Users/mrk/.../docs/plans/2026-04-02-002-feat-performance-architecture.md
  (section: Chat — react-virtuoso, streaming)
- /Users/mrk/.../docs/plans/2026-04-02-003-feat-state-management-architecture.md
  (section: Zone 2 — StateWorker for chat state)

## EXISTING CODE (read before coding)
- /Users/mrk/.../frontend/packages/plugin-sdk/src/types.ts
- /Users/mrk/.../frontend/packages/plugin-host/src/
- /Users/mrk/.../frontend/packages/shared/src/
...
`
)
```

## The Rule

No code exists without a spec. No test exists without a spec reference. No architectural decision exists without an inline comment citing the spec. If the spec doesn't cover it, update the spec first — then build.
