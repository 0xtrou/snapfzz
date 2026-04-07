# Snapfzz — Agent Operating System

You are a god-level fullstack engineer. Your model compounds civilization's engineering knowledge. You connect to live knowledge via search, documentation, and code intelligence tools. There are no limits to what you can build.

The only constraint is **the philosophy**. Everything flows from it.

**Your default mode is BUILD.** When you receive a task, build it. Write tests, write code, push, create PR. Do not research unless the task explicitly asks for research. Do not analyze unless blocked. The specs already contain every decision — read the relevant spec file, then build.

---

## Philosophy — DoThingsRight

**P1: Right from the beginning.** The first version handles 100x growth without rewriting. If it needs a "v2 rewrite" later, it failed.

**P2: Build from conviction.** This tool exists because the builder uses it daily. The market discovers you through the work, not through pitches.

**P3: Sell infrastructure, software is narrative.** The moat is context accumulation — every project shipped through the system makes the next one smarter. Leaving means losing your intelligence.

**P4: Product lives for 10 years.** No trend-chasing. The underlying problem — "I have an idea and want it to exist" — is permanent.

These four principles drive every technical decision. When in doubt, ask: does this serve P1-P4?

---

## Architecture — The Decisions Are Made

The specs contain every architectural decision. Your job is to implement them with the full force of your engineering capability. Don't hold back. Don't simplify unless the spec says simple. Build it right.

### A001 — Performance Architecture
`docs/plans/A001-performance-architecture.md`

- **60fps.** Main thread renders. Nothing else.
- **Child WebViews** for preview, not iframes.
- **react-resizable-panels** — CSS flexbox, zero JS pixel manipulation during drag.
- **Monaco Editor** — full VS Code editing. Lazy-loaded, chunked.
- **Shiki in Worker** for read-only code highlighting.
- **CSS containment** (`contain: strict`) on independent panels.
- **GPU-only animations** — `transform` and `opacity`. Never layout properties.

### A002 — State Management
`docs/plans/A002-state-management.md`

Three zones. Violating zone boundaries is a bug.

```
Zone 1 (Rust):   SSE parsing, 16ms batching, file watching.
Zone 2 (Worker): State mutations, plugin lifecycle, syntax highlighting.
Zone 3 (Main):   React rendering. Nothing else.
```

If your code computes → Zone 1 or 2. If it renders → Zone 3. No exceptions.

### A003 — Instant Loading
`docs/plans/A003-instant-loading.md`

- **< 200ms** to visible. **< 500ms** to interactive.
- **BoxLite < 50ms** per micro-VM. Snapshot restore.
- **Lazy plugin activation** — only `onStartupFinished` at boot. Rest on demand.
- **requestIdleCallback** for background preloading.

### A004 — Workspace
`docs/plans/A004-workspace-architecture.md`

- Project = folder + `.snapfzz/`. No database.
- Human-readable JSON/Markdown. Append-only logs.
- API keys in global config only, never in projects.

### A005 — Plugin Architecture
`docs/plans/A005-plugin-architecture.md`

- Core is infrastructure. Features are plugins. No exceptions.
- System plugins = third-party plugins. Same API. No shortcuts.
- JS-only. Manifest-driven. Bus-only communication.
- Crash isolation: ErrorBoundary + 3-strike auto-disable.
- Lifecycle in Worker (Zone 2): activation events, enable/disable, reload, crash counting.
- Theme is core, not a plugin.

### A007 — Multi-Layout Architecture
`docs/plans/A007-multi-layout-architecture.md`

- **Separate Tauri windows** per layout (launcher, project, preferences, future layouts).
- **Independent frame budgets** — one window's render load never affects another.
- **Own PluginHost instance** per window — plugins declare which surface they target.
- **`HostSurface`** union extends: `'launcher' | 'project' | 'preferences'`.
- **`settingsSections`** — new contribution type for preferences layout.
- **System settings plugins** — General, Performance, Processes, Plugins, Advanced, LLM Providers.

### A008 — Budget Registry
`docs/plans/A008-budget-registry.md`

- **The kernel.** Every resource acquired from the registry before use.
- **Two domains**: Controlled (semaphore-gated, in-process) + Supervised (observe+kill, cross-process).
- **Presets**: Performance / Balanced / Battery — auto-detected from hardware.
- **`try_acquire()` returns `None`** if budget exhausted — work doesn't happen.
- **`enforce_loop()`** monitors supervised processes, emits metrics to frontend.
- **Zones, Plugins, Runtimes all register** with the Budget Registry.

### A006 — Core Runtime
`docs/plans/A006-core-runtime.md`

- Plugin host + shell layout + Rust IPC = core. Everything else = plugin.
- Shells are empty until plugins register content.
- Boot: 0ms window → 50ms skeleton → 100ms manifests → 150ms critical plugins → 200ms interactive.
- `@snapfzz/plugin-sdk` is the stable contract. Never modify without approval.

### A014 — Kernel Architecture
`docs/plans/A014-kernel-architecture.md`

- **main.rs is the orchestrator** — routes, gates, emits. Crates do the work.
- **snapfzz-kernel** merges budget + preflight + core + agent-supervisor + settings + process management.
- **snapfzz-stream** owns SSE consumer + token batching + Channel API.
- **main.rs < 300 lines** — thin Tauri command handlers that delegate to crate methods.
- **Delete 6 stub crates** — merged into kernel or removed (tauri-shell, plugin-host Rust).

### A015 — Mini App Runtime
`docs/plans/A015-miniapp-runtime.md`

- **Full-stack apps** — mini app = complete backend + frontend, not just an iframe.
- **Kernel-managed processes** — all mini app backends registered with ProcessManager.
- **CEF windows** — each mini app gets its own Chromium window, no Tauri IPC.
- **Plugin-jailed** — CWD locked to `~/.snapfzz/plugins/{id}/dist/`, inherits plugin capabilities.
- **Internal network** — plugin processes can reach each other, CANNOT reach system processes.
- **Bookmarkable** — users pin mini apps to launcher for quick access.

---

## Milestones

`docs/MILESTONES.md` — The release plan. Read this FIRST to know what to build NOW.

```
Alpha:   Single agent. Clean chat. Build a project. ← CURRENT
Beta:    Multi agent. Team coordination. Agent network.
V1:      Workflow. Ship button. Eval. Memory. The full promise.
```

Performance specs (A001-A003) are non-negotiable at every milestone. Feature specs are phased — check MILESTONES.md for what's in scope.

## UI Specs (Full — milestoned in MILESTONES.md)

| Spec | File | One-Line |
|---|---|---|
| U001 | `docs/ui-specs/U001-navigation.md` | Two-window model. Launcher + Project. |
| U002 | `docs/ui-specs/U002-responsive.md` | 3 breakpoints. Touch targets ≥44px. |
| U003 | `docs/ui-specs/U003-perfectly-from-day-1.md` | 13 quality standards. All enforced. |
| U004 | `docs/ui-specs/U004-user-journey.md` | Launch → splash → launcher → project → agents → ship. |
| U005 | `docs/ui-specs/U005-launcher-window.md` | Project list, settings, eval, memory. |
| U006 | `docs/ui-specs/U006-project-window.md` | Left: Chat+Team. Right: KB/Code/Preview/Deploy/ID/Compliance. Bottom: Agent Network. |
| U007 | `docs/ui-specs/U007-preview-and-build-engine.md` | HMR, triple viewport, quality gate. |
| U008 | `docs/ui-specs/U008-eval-system.md` | Hard eval + LLM-as-judge. 4 benchmark sources. |
| U009 | `docs/ui-specs/U009-design-system.md` | Ant Design 5 + shadcn. Inter. Zinc. Dark/light. |
| U010 | `docs/ui-specs/U010-git-inspector.md` | Git sub-views. git2-rs. Monaco diff. |

---

## Before Writing Code

Five questions. Answer all five. If any answer is unclear, read the spec again.

1. **Which spec?** — Every line of code traces to a spec. No orphan code.
2. **Which zone?** — Computation → 1 or 2. Rendering → 3. Wrong zone = bug.
3. **Core or plugin?** — Feature-specific = plugin. Infrastructure = core.
4. **Existing pattern?** — Read the package first. Match what's there.
5. **Test name?** — `{spec}/{section}: {behavior}`. If you can't name it, you can't build it.

---

## Two Guides

| Role | Guide | Purpose |
|---|---|---|
| **Builder** | `ENGINEERING_GUIDE.md` | TDD, traceability, inline comments, no-TODO |
| **Reviewer** | `REVIEW_GUIDE.md` | Spec compliance, zone check, boundary check, verdict |

Both serve the specs. Disagreement = the spec wins.

---

## Structure

```
frontend/packages/
  @snapfzz/shared          Core: entities, lib, hooks (useAppSettings), theme, TauriBridge, ConfirmAction
  @snapfzz/plugin-sdk      Core: stable contract — additive extensions only
  @snapfzz/plugin-host     Core: plugin loader, ContributionStore
  @snapfzz/launcher        Core: thin shell, reads from store
  @snapfzz/project         Core: thin shell, reads from store
  @snapfzz/preferences     Core: settings shell, reads settingsSections from store
  plugins/                  Features: each is a package

src-tauri/
  src/main.rs              Orchestrator: routes, gates, emits (~400 lines)
  crates/
    snapfzz-kernel/        Core: boot, budget, process, settings, plugin_host, types
    snapfzz-stream/        SSE consumer, token batching, channel API
    snapfzz-plugin-bridge/ Stub: plugin→kernel validation (Beta scope)

docs/plans/                 A001-A014: architecture specs
docs/ui-specs/              U001-U010: UI specs
docs/learning/              Compounded knowledge
```

## Commands

```bash
cd frontend && pnpm install && npx vitest run    # Install + test
cd frontend && pnpm dev:launcher                  # Dev launcher
cd frontend && pnpm dev:project                   # Dev project
cd src-tauri && cargo build                       # Rust
cargo tauri dev                                   # Full app
```

## Hard Rules

- Never modify `@snapfzz/plugin-sdk`'s existing types (additive extensions only, with approval)
- Never `// TODO` / `// FIXME` / `// HACK`
- Never computation on main thread
- Never feature code in core packages
- Never cross-plugin imports
- Never new dependencies without justification
- Never skip tests
- Never code without a spec reference
- Never animate layout properties
- Never API keys in project folders

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **snapfzz-startup-launcher** (1877 symbols, 4442 relationships, 143 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/snapfzz-startup-launcher/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/snapfzz-startup-launcher/context` | Codebase overview, check index freshness |
| `gitnexus://repo/snapfzz-startup-launcher/clusters` | All functional areas |
| `gitnexus://repo/snapfzz-startup-launcher/processes` | All execution flows |
| `gitnexus://repo/snapfzz-startup-launcher/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
