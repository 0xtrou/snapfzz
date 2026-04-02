# Agent Instructions — Snapfzz

Read this ENTIRE file before writing any code. This is your reasoning framework.

---

## Architecture Specs — The Source of Truth

Every decision has already been made. Your job is to implement what the specs describe, not to invent new approaches. Read the relevant spec BEFORE coding. Reference it in tests and comments.

### A001 — Performance Architecture
**File:** `docs/plans/A001-performance-architecture.md`

Key constraints you MUST follow:
- **60fps.** Main thread does rendering ONLY. No heavy computation.
- **Child WebViews** for preview pane, not iframes (Tauri IPC broken on iframes).
- **react-resizable-panels** for split panes (CSS flexbox, no JS pixel manipulation).
- **Monaco Editor** for code editing (lazy-loaded, ~5MB chunked).
- **Shiki in Web Worker** for read-only code blocks in chat.
- **CSS containment** (`contain: strict`) on independent panels.
- **GPU-composited animations only** — `transform` and `opacity`. Never animate `width`, `height`, `top`, `left`.

### A002 — State Management
**File:** `docs/plans/A002-state-management.md`

Key constraints you MUST follow:
- **Three zones. Violating zone boundaries is a bug.**
  - **Zone 1 (Rust):** SSE parsing, token batching (16ms), file watching. Data arrives at JS pre-parsed.
  - **Zone 2 (Web Worker):** State mutations (use-workerized-reducer), syntax highlighting (Shiki). Plugin lifecycle management (enable/disable, crash counting, activation events).
  - **Zone 3 (Main thread):** React rendering ONLY. `useTransition` for non-urgent updates. `useSyncExternalStore` for store reads.
- If you're writing code that does computation → it goes in Zone 1 or Zone 2, NOT Zone 3.
- If you're writing code that renders UI → it goes in Zone 3 ONLY.

### A003 — Instant Loading
**File:** `docs/plans/A003-instant-loading.md`

Key constraints you MUST follow:
- **< 200ms** to workspace visible (skeleton + local disk data).
- **< 500ms** to interactive (critical plugins activated).
- **BoxLite < 50ms** boot per micro-VM. Snapshot restore for Python cold start.
- **Lazy plugin activation**: only `onStartupFinished` plugins at boot. Others on `onViewVisible`.
- **requestIdleCallback** for background plugin preloading.

### A004 — Workspace Architecture
**File:** `docs/plans/A004-workspace-architecture.md`

Key constraints you MUST follow:
- **A project IS a folder** with `.snapfzz/` directory. No database. No registration.
- **Human-readable**: JSON and Markdown. No proprietary formats (except BoxLite snapshots).
- **Append-only logs** for build history and decisions (JSONL).
- **Global state** in platform app data directory (`~/.snapfzz-global/`), NOT in projects.
- **API keys NEVER inside project folders.** Always in global config.

### A005 — Plugin Architecture
**File:** `docs/plans/A005-plugin-architecture.md`

Key constraints you MUST follow:
- **Core is tiny.** Window management, plugin loader, event bus, bridge. NOTHING feature-specific.
- **System plugins = third-party plugins.** Same API. No shortcuts. No privileged access.
- **JS-only plugins.** No Rust plugins. TypeScript/React only.
- **Bus-only communication.** Plugins NEVER import from each other. EventBus + CommandBus + ApiBroker.
- **Plugins provide everything:** UI tabs, commands, shortcuts, agent skills, tools, eval benchmarks, deploy targets, identity providers, compliance templates, mini apps.
- **Manifest-driven.** `definePlugin()` declares what the plugin provides. Core reads manifests.
- **Crash isolation.** ErrorBoundary per plugin. 3 crashes in 5min → auto-disable.
- **Lazy activation.** Plugins activate on their declared `activationEvents`, NOT eagerly.
- **Enable/disable persists.** Disabled plugins skipped during boot. Storage preserved.
- **Theme is core, NOT a plugin.** Available before plugins load via CSS variables.
- **Plugin lifecycle management runs in Worker (Zone 2).** Registry state, dependency resolution, crash counting, enable/disable persistence — all off main thread. Main thread only receives "activate this plugin" / "remove these contributions" messages.

### A006 — Core Runtime
**File:** `docs/plans/A006-core-runtime.md`

Key constraints you MUST follow:
- **Plugin host, shell layout, Rust IPC** are core. Everything else is a plugin.
- **Shells are empty until plugins register content.** Launcher and project shells read from ContributionStore.
- **Boot sequence:** 0ms window → 50ms skeleton → 100ms manifests → 150ms critical plugins → 200ms interactive.
- **`@snapfzz/plugin-sdk` is the stable contract.** NEVER modify it without explicit approval.

---

## UI Specs

### U001 — Navigation Index → `docs/ui-specs/U001-navigation.md`
Two-window model. Launcher + Project windows. Spec file map.

### U002 — Responsive → `docs/ui-specs/U002-responsive.md`
3 breakpoints: mobile ≤640, tablet 641-1024, desktop ≥1025. Touch targets ≥44px.

### U003 — Perfectly From Day 1 → `docs/ui-specs/U003-perfectly-from-day-1.md`
13 quality standards enforced on every shipped app. Responsive, 60fps, accessible, fast, secure, SEO, error handling, dark mode, i18n, analytics, legal, deploy-ready, instant loading.

### U004 — User Journey → `docs/ui-specs/U004-user-journey.md`
Launch → splash → launcher → project → agents → ship → back to launcher.

### U005 — Launcher Window → `docs/ui-specs/U005-launcher-window.md`
Project list, cards (Live/In Progress/Paused), new project input, settings, eval, memory.

### U006 — Project Window → `docs/ui-specs/U006-project-window.md`
Left panel: Chat tab (orchestrator) + Team tab (agent dashboard). Right panel: KB, Code, Preview, Deployments, Identities, Compliance tabs. Bottom panel: Agent Network. Mini apps in generic tabs. Orchestrator is the co-creator.

### U007 — Preview & Build Engine → `docs/ui-specs/U007-preview-and-build-engine.md`
HMR pipeline via BoxLite port-forward. Triple viewport. Console capture. Responsive enforcement. 13-standard quality gate.

### U008 — Eval System → `docs/ui-specs/U008-eval-system.md`
Hard eval (MetricBase) + LLM-as-judge (OpenJudge). 4 benchmark sources: built-in, community, local, custom.

### U009 — Design System → `docs/ui-specs/U009-design-system.md`
Ant Design 5 + shadcn aesthetic. Inter font. Zinc palette. Dark/light themes. Monaco theme. No custom colors.

### U010 — Git Inspector → `docs/ui-specs/U010-git-inspector.md`
Git sub-views in Code tab: files, diff, log, branches, blame. git2-rs in Rust. Monaco built-in diff editor.

---

## Before You Write Code — Mandatory Reasoning

For EVERY piece of code you're about to write, answer these questions:

1. **Which spec(s) mandate this code?** → If none, question whether it should exist.
2. **Which zone does this code run in?**
   - Computation/state → Zone 1 (Rust) or Zone 2 (Worker)
   - Rendering → Zone 3 (Main thread)
   - If you're putting computation in Zone 3, you're violating A002. Stop and redesign.
3. **Is this core or plugin?** → If it's feature-specific, it's a plugin. Core is only infrastructure.
4. **Does this follow the existing pattern?** → Read existing code in the same package first.
5. **Can you write the test name with a spec reference?** → If not, the code isn't traceable. Find the spec or don't write the code.

---

## Engineering Standards

Full details in `ENGINEERING_GUIDE.md`. Summary:

- **TDD**: Failing test first. Test names: `{spec}/{section}: {behavior}`.
- **Inline comments**: `// Per {spec}/{section}: {why}` for architectural decisions.
- **Traceability**: Update `docs/TRACEABILITY.md` after implementation.
- **No TODOs**: Within scope = implement now. Out of scope = don't mention in code.
- **No spec violations**: Code matches what specs describe. If the spec is wrong, update the spec first.

---

## Project Structure

```
frontend/                      # pnpm monorepo
├── packages/
│   ├── @snapfzz/shared        # Entities, lib, hooks, theme (CORE)
│   ├── @snapfzz/plugin-sdk    # Plugin contract (STABLE — DO NOT MODIFY)
│   ├── @snapfzz/plugin-host   # Plugin loader + ContributionStore (CORE)
│   ├── @snapfzz/launcher      # Launcher window shell (CORE — reads from store)
│   └── @snapfzz/project       # Project window shell (CORE — reads from store)
└── plugins/                   # System plugins (each is a package, same API as third-party)

src-tauri/                     # Rust workspace
├── crates/                    # Core Rust crates (Zone 1)
└── tauri.conf.json

docs/plans/                    # Architecture specs (A001-A006)
docs/ui-specs/                 # UI specs (U001-U010)
docs/TRACEABILITY.md           # Spec → Code → Test matrix
ENGINEERING_GUIDE.md           # How to build (TDD, traceability, no-TODO)
```

## Commands

```bash
cd frontend && pnpm install              # Install deps
cd frontend && npx vitest run            # Run all tests
cd frontend && pnpm dev:launcher         # Dev server for launcher
cd frontend && pnpm dev:project          # Dev server for project
cd src-tauri && cargo build              # Build Rust
cargo tauri dev                          # Full Tauri app (from project root)
```

## Hard Rules

- **NEVER** modify `@snapfzz/plugin-sdk` — it is the stable API contract
- **NEVER** write `// TODO`, `// FIXME`, `// HACK`, `// XXX`
- **NEVER** put computation on the main thread (Zone 3 = rendering only)
- **NEVER** put feature code in core packages (features are plugins)
- **NEVER** let plugins import from each other (bus-only communication)
- **NEVER** add npm dependencies without justification
- **NEVER** skip tests
- **NEVER** write code without a spec reference
- **NEVER** animate layout properties (`width`, `height`, `top`, `left`)
- **NEVER** store API keys in project folders (global config only)
