# Agent Get Started

Quick-start guide for Claude Code agents working on Snapfzz. Read this first, then read the spec for your task.

---

## What Is Snapfzz

A Tauri v2 desktop app that helps users go from idea to shipped startup. It manages the full lifecycle: clarify requirements, discover OSS foundations, build with AI agents, and ship (deploy, payments, legal). The app is a plugin-based IDE-like shell backed by Rust, with an embedded Python runtime (AgentScope), PostgreSQL, and a LiteLLM gateway.

**Philosophy (P1-P4):** Right from the beginning (no rewrites). Build from conviction. Sell infrastructure. Product lives for 10 years.

---

## Repository Layout

```
snapfzz-startup-launcher/
├── src-tauri/                          # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── main.rs                     # Orchestrator (~236 lines, 95 Tauri commands)
│   │   ├── boot.rs                     # 3-phase async bootstrap
│   │   ├── commands/                   # Thin Tauri command handlers (delegate to crates)
│   │   │   ├── settings.rs             # get/save settings
│   │   │   ├── vault.rs                # secret vault CRUD
│   │   │   ├── process.rs              # restart/kill/list processes
│   │   │   ├── budget.rs               # snapshot, preset, batch interval
│   │   │   ├── stream.rs               # send_message, stop, sessions
│   │   │   ├── cef.rs                  # window lifecycle, navigate
│   │   │   ├── components.rs           # system pack CRUD
│   │   │   ├── llm.rs                  # LiteLLM config, key/spend tracking
│   │   │   ├── pip.rs                  # python pack install/uninstall
│   │   │   ├── plugin_runtime.rs       # install/register/spawn/unregister plugin runtimes
│   │   │   └── system.rs               # health, open_path, pick_folder
│   │   ├── factories/                  # ProcessFactory impls
│   │   │   ├── plugin_runtime.rs       # PluginProcessFactory (generic, A020 Phase 1)
│   │   │   └── litellm.rs
│   │   ├── helpers.rs
│   │   └── metrics.rs                  # 2s budget-metrics emission loop
│   ├── crates/
│   │   ├── snapfzz-kernel/             # Boot, budget registry, process mgmt, settings
│   │   ├── snapfzz-packs/              # Runtime management (Python, PostgreSQL, LiteLLM, CEF)
│   │   ├── snapfzz-stream/             # SSE parsing + token batching
│   │   ├── snapfzz-vault/              # AES-256-GCM secret vault
│   │   ├── snapfzz-llm/                # LiteLLM config gen, key/spend proxy
│   │   ├── snapfzz-cef/                # CEF runtime, window management
│   │   └── snapfzz-plugin-bridge/      # Schema validation, capability checking
│   └── Cargo.toml                      # Workspace: 8 crates
│
├── frontend/packages/                  # TypeScript frontend (pnpm workspace)
│   ├── shared/                         # @snapfzz/shared — theme, hooks, TauriBridge, EventBus, components
│   ├── plugin-sdk/                     # @snapfzz/plugin-sdk — definePlugin(), contribution types (STABLE, additive only)
│   ├── plugin-host/                    # @snapfzz/plugin-host — plugin loader, ContributionStore, crash supervision
│   ├── launcher/                       # @snapfzz/launcher — thin shell for launcher window
│   ├── project/                        # @snapfzz/project — thin shell for project window
│   └── preferences/                    # @snapfzz/preferences — thin shell for settings window
│
├── plugins/                            # System plugins (TypeScript, in-process)
│   ├── orchestrator/                   # Orchestrator conversation + AI runtime (snapfzz.orchestrator)
│   │   ├── manifest.json               # Plugin manifest — id, runtimes.python[], main
│   │   ├── src/                        # TypeScript UI (Zone 3)
│   │   ├── dist/                       # Built TypeScript bundle
│   │   ├── intelligence/               # Python intelligence package (Zone 1, QwenPaw)
│   │   │   └── src/orchestrator/       # CLI entry point (app.py, cli.py)
│   │   ├── runtime/bin/                # Installed binary (set by install_plugin_runtime)
│   │   └── pack/                       # Declarative config (pack.yaml, prompts/)
│   ├── settings-general/
│   ├── settings-llm/
│   ├── settings-performance/
│   ├── settings-processes/
│   ├── settings-vault/
│   ├── settings-components/
│   ├── settings-diagnostics/
│   ├── settings-plugins/
│   └── settings-advanced/
│
├── docs/
│   ├── plans/                          # Architecture specs (A001-A039)
│   └── ui-specs/                       # UI specs (U001-U011)
│
├── AGENTS.md                           # Agent operating philosophy + hard rules
├── ARCHITECTURE.md                     # System architecture (single source of truth)
├── ENGINEERING_GUIDE.md                # TDD, traceability, UI stack, coverage, IPC
├── REVIEW_GUIDE.md                     # Review checklist, verification protocol
└── CLAUDE.md                           # GitNexus code intelligence instructions
```

---

## Three Zones — The Most Important Concept

Every line of code belongs to exactly one zone. Wrong zone = bug.

| Zone | Where | Does | Does NOT |
|------|-------|------|----------|
| **Zone 1** | Rust (tokio async) | SSE parsing, batching, encryption, boot, process mgmt, budget enforcement | Render UI, access DOM |
| **Zone 2** | Web Workers (future) | Syntax highlighting (Shiki), diff computation, state reduction | Access DOM, import React |
| **Zone 3** | Main thread (React) | Render UI, handle user input, CSS animations | Compute, parse, sort, transform data |

**The main thread does ONE thing: render.** Everything else runs somewhere else.

---

## Two-Layer Architecture

Every managed service has two layers:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Runtime management** | `snapfzz-packs/src/{service}/` | How to spawn, health check, download |
| **Domain logic** | `snapfzz-{name}/src/` | What it does (config, keys, protocols) |

Domain crates have zero dependency on `snapfzz-packs`. `main.rs` imports all crates; domain crates never depend on packs.

---

## Boot Sequence

```
Sync (<25ms):
  main() → cleanup orphan PIDs → PreflightService::run_sync()
    Phase 1: filesystem (create ~/.snapfzz/*)
    Phase 2: vault (master key + vault.enc)
    Phase 3: settings (load settings.json)
    Phase 4: budget (BudgetRegistry from preset)

Async (fire-and-forget):
  Phase 1: Python Runtime     ──┐
  Phase 2: PostgreSQL start   ──┤── both run in parallel
                                ▼
  Phase 3: Service Spawn (waits for both)
    → spawn_all() concurrent via tokio::spawn
    → LiteLLM: prisma cache → spawn
    (plugin runtimes spawn at plugin activation, not boot)
```

---

## Plugin Architecture

**Core is the bones. Everything else is a plugin.**

- **System plugins** (TypeScript, in-process, trusted): Orchestrator, KB, Code, Preview, Settings-*
- **User plugins** (any language, process-isolated, webhook-based): third-party, sandboxed

### Plugin Manifest Pattern

```typescript
import { definePlugin } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.example',
  name: 'Example',
  version: '1.0.0',
  surface: ['project'],                    // 'launcher' | 'project'
  activationEvents: ['onStartupFinished'], // or 'onViewVisible:tabId'
  contributes: {
    workspaceTabs: [{ id: 'example', label: 'Example', icon: 'AppstoreOutlined', component: () => import('./ExamplePanel') }],
    statusItems: [{ id: 'example-status', component: () => import('./ExampleStatus') }],
  },
  async activate(ctx) { /* receives PluginContext */ },
  async deactivate() { /* cleanup */ },
});
```

### Plugin Communication

- **Between system plugins**: EventBus (`ctx.bus.emit/on`) + CommandBus (`ctx.commands.execute`). Never import from another plugin.
- **User plugins**: loopback HTTP webhooks, HMAC signed, 127.0.0.1 only.

---

## IPC Pattern

All frontend-to-Rust communication goes through `TauriBridge`:

```typescript
import { createTauriBridge } from '@snapfzz/shared';
const bridge = createTauriBridge();

const result = await bridge.invoke<Settings>('get_settings');
const unlisten = await bridge.listen<Payload>('event-name', handler);
```

**Never** access `__TAURI_INTERNALS__` directly. **Never** create per-plugin wrappers. **Never** use raw `import('@tauri-apps/api/core')`.

---

## Budget Registry

Every resource is allocated from a central Budget Registry before use:

| Domain | Enforcement | Examples |
|--------|-------------|---------|
| **Controlled** (in-process) | Semaphore `try_acquire()` | CPU permits, frame budget, plugin strikes, network rate |
| **Supervised** (cross-process) | Observe + kill | Process RSS, health checks, storage |

**Presets**: Performance (80% hardware) / Balanced / Battery. User can override.

---

## UI Stack (Non-Negotiable)

| Allowed | Forbidden |
|---------|-----------|
| Ant Design 5 (components) | Emoji as icons |
| @ant-design/icons (all icons) | Hardcoded hex/rgb colors |
| Tailwind CSS (layout, spacing) | Other icon libraries (Heroicons, Lucide) |
| CSS variables from `tokens.css` | Other component libraries (shadcn, Radix, MUI) |

---

## Spec Traceability — How to Write Code

Every line traces to a spec. Every test verifies a spec requirement.

### Test Names

```
{spec-number}/{section}: {specific behavior}
```

```typescript
describe('A005/PluginHost', () => {
  it('A005/resolve: sorts plugins by dependency order', () => { ... });
});
```

### Inline Comments

```typescript
// Per A001/Performance: CSS flexbox resize for 60fps
// Per A005/Isolation: plugins wrapped in ErrorBoundary
```

### Coverage

Every package: **>=90%** line + branch coverage. No snapshot tests. No assertion-free tests.

---

## Five Questions Before Writing Code

1. **Which spec?** Every line traces to a spec (A001-A039, U001-U011). No orphan code.
2. **Which zone?** Computation → Zone 1 or 2. Rendering → Zone 3. Wrong zone = bug.
3. **Core or plugin?** Feature-specific → plugin. Infrastructure → core.
4. **Existing pattern?** Read the package first. Match what's there.
5. **Test name?** `{spec}/{section}: {behavior}`. If you can't name it, you can't build it.

---

## Commands

```bash
# Frontend
pnpm install                              # Install all deps
pnpm dev:launcher                         # Dev launcher window
pnpm dev:project                          # Dev project window
pnpm dev:preferences                      # Dev preferences window
pnpm build                                # Build all packages
pnpm lint                                 # Lint all packages
pnpm typecheck                            # Typecheck all packages

# Run tests (frontend)
pnpm --filter @snapfzz/plugin-host exec npx vitest run            # Specific package
pnpm --filter @snapfzz/plugin-host exec npx vitest run --coverage # With coverage

# Rust
cd src-tauri && cargo build                # Build Rust
cd src-tauri && cargo test                 # Test all crates
cd src-tauri && cargo test -p snapfzz-kernel  # Test specific crate
cd src-tauri && cargo llvm-cov test -p snapfzz-kernel --lib --summary-only  # Coverage

# Full app
cargo tauri dev                            # Dev mode (Rust + frontend)
```

---

## Hard Rules

These are non-negotiable. Violating any of these will get your PR rejected.

1. **Never** modify `@snapfzz/plugin-sdk` existing types (additive extensions only, with approval)
2. **Never** `// TODO` / `// FIXME` / `// HACK` / `// XXX`
3. **Never** computation on main thread (Zone 3 is render-only)
4. **Never** feature code in core packages
5. **Never** cross-plugin imports (use EventBus)
6. **Never** new dependencies without justification
7. **Never** skip tests
8. **Never** code without a spec reference
9. **Never** animate layout properties (`width`, `height`, `top`, `left`) — use `transform` + `opacity`
10. **Never** API keys in project folders
11. **Never** hardcoded colors — use CSS variables
12. **Never** emoji as icons — use @ant-design/icons
13. **Never** raw Tauri access — use TauriBridge from @snapfzz/shared
14. **Never** apply settings to DOM in plugins — use `emitSettingsChanged()` pipeline
15. **Never** expose internal infrastructure in user-facing text (no "Tauri", "Rust", "AgentScope", "Zone 1")

---

## Spec Index

### Architecture Specs (docs/plans/)

| Spec | Title | Key Concepts |
|------|-------|-------------|
| A001 | Frame Budget Enforcement | 60fps, CSS containment, GPU-only animations, Pretext virtualization, SSE batching |
| A002 | CPU Budget (Zone Placement) | 3 zones, main thread render-only, Rust SSE parsing, Worker envelopes |
| A003 | Startup Budget | <200ms visible, <500ms interactive, HTML skeleton, plugin activation budget |
| A004 | Workspace Architecture | .snapfzz/ folder-first, human-readable JSON/MD, append-only logs |
| A005 | Plugin Architecture | System + user plugins, webhook isolation, capabilities, crash supervision |
| A006 | Core Runtime | Plugin host, shell layout, Rust IPC, boot sequence |
| A007 | Multi-Layout Architecture | Separate Tauri windows, settingsSections |
| A008 | Budget Registry | Controlled + supervised domains, presets, semaphore gating, enforce_loop |
| A011 | Secret Vault | AES-256-GCM, master key in OS keychain, rate limiting |
| A012 | Preflight Service | 4-phase sync boot, hookable lifecycle, <25ms |
| A013 | LLM Providers | LiteLLM gateway, multi-provider, config gen, key/spend proxy |
| A014 | Kernel Architecture | main.rs orchestrator, crate separation, two-layer rule |
| A015 | Mini App Runtime | CEF child WebViews, sandboxed iframe host |
| A016 | Runtime Architecture | Runtime trait, RuntimeManager, is_runtime_ready |
| A018 | Packs Refactoring | Vertical domain slices, core/ + service packs |
| A020 | Composable Intelligence | Plugin artifact discovery (DONE — Phase 1), QwenPaw intelligence layer, PluginProcessFactory, Phases 2–6 planned |
| A039 | Phased Boot | Parallel async boot, prisma cache, fast health poll |

### UI Specs (docs/ui-specs/)

| Spec | Title |
|------|-------|
| U001 | Navigation Index |
| U002 | Responsive (3 breakpoints) |
| U003 | Quality Standards (13 checks) |
| U004 | User Journey |
| U005 | Launcher Window |
| U006 | Project Window |
| U007 | Preview & Build Engine |
| U008 | Eval System |
| U009 | Design System (Ant Design + zinc palette) |
| U010 | Git Inspector |

---

## Crate Dependency Graph (no cycles)

```
snapfzz-kernel  ← snapfzz-packs (uses PythonRuntime, ManagedService)
snapfzz-packs   ← snapfzz-cef   (uses CefInstallCheck trait)

snapfzz-kernel  (standalone)
snapfzz-cef     (standalone)
snapfzz-llm     (standalone)
snapfzz-stream  (standalone)
snapfzz-vault   (standalone)

main.rs imports ALL crates; domain crates never depend on packs
```

---

## Settings Propagation

Settings flow through a single pipeline. Plugins never apply settings to the DOM directly.

```
Plugin saves → save_settings (Rust) → app.emit("settings-changed") → all webviews
                                    → window.dispatchEvent("snapfzz:settings-changed")
                                    → useAppSettings() → applyDomSettings() → DOM updated
```

Key files: `shared/src/hooks/use-app-settings.ts`, `shared/src/components/shell/WindowShell.tsx`

---

## Active Initiative: A020 Composable Intelligence

Intelligence delivered as a self-contained plugin (`plugins/orchestrator/`, ID `snapfzz.orchestrator`).

### Phase 1 — DONE
- Plugin renamed `plugins/chat/` → `plugins/orchestrator/`, ID `snapfzz.orchestrator`
- `AgentScopeFactory` / `AgentScopeService` removed; replaced by generic `PluginProcessFactory`
- Full plugin runtime lifecycle: `install_system_plugin` → `install_plugin_runtime` → `register_plugin_runtime` → `spawn_plugin_runtime`
- System plugins follow the same install flow as user plugins (whitelisted in `SYSTEM_PLUGINS`)
- Orchestrator binary compiled by `install_plugin_runtime` (pip install via uv, binary to `runtime/bin/`)
- Intelligence layer delivered via QwenPaw extraction into `plugins/orchestrator/intelligence/`
- 9-block scaffolding design was not implemented — replaced by QwenPaw extraction

### Phase 1 polish — 2026-04-20 checkpoint
- **Spark chat wholesale port, then slimmed** — kept only qwenpaw's `sessionApi` + HTTP `api/` helpers; deleted ChatPage, ModelSelector, OptionsPanel, i18n/router/zustand wrappers (−563 KB bundle, −4 npm deps). `ChatPanel/index.tsx` mounts `AgentScopeRuntimeWebUI` directly inside `ConfigProvider` + `App`.
- **`/api/console/chat` adapter** — swapped from `/api/agent/process` so chats register with `ChatManager` + `TaskTracker` (persistence + reconnect). Adapter also slices `data.input` to the last user message so backend memory is single-source (Spark's `enableHistoryMessages:false` only gates the native-fetch path).
- **Session restore bridge** — `sessionApi.updateWindowVariables()` writes `snapfzz.chat.session.v1` to `localStorage`; `ChatPanel` reads it at component top into `pluginSessionApi.preferredChatId` so reload/zoom lands back on the live stream via `TaskTracker.attach_or_start`. Stale-UUID cleanup in `applyChatsToSessionList`.
- **System prompt wiring fix** — `_seed_agents_md()` now **raises** on missing source (no silent fallback), `_seed_agent_config()` always overwrites `agent.json`, `_PACK_DIR` resolves correctly (prior off-by-one parent traversal), `system_prompt_files=["AGENTS.md"]`.
- **`QwenPawAgent.name` monkey-patch** — upstream `react_agent.py:163` hardcodes `name="Friday"`; `app.py` wraps `__init__` to post-set `self.name = agent_config.name` so the agent introduces itself as "Snapfzz Orchestrator".
- **OrchestrationPanel flicker + bubble rendering** — removed `[...conversation]` spread (stable array ref), pre-filter `toAdd` before `setExpandedIds` to bail on no-ops. Text turns now render as role-aligned chat bubbles (user right `--bg-tertiary`, assistant left `--bg-subtle`); reasoning/tool rows keep the compact chip+caret. Adaptive polling — 1 Hz while running/changing, 30 s heartbeat after two stable idle ticks.
- **Shell layout** — thinner resize handles (1 px visible + 4 px hitbox), maximise/restore per pane, persisted sizes via `react-resizable-panels` autoSaveId, dropped the redundant "BOTTOM PANEL" label strip.

### What's Next (Phases 2–6)
2. **Memory database** — `snapfzz-memory` crate, PostgreSQL `memory` DB, migrations
3. **Intelligence integration** — wire `pack/pack.yaml` into runtime startup, end-to-end chat flow
4. **Plugin intelligence contributions** — agentTools, agentSkills in manifest
5. **Rich input UI** — file upload, session switcher, memory indicator
6. **RAG pipeline** — pgvector embeddings, similarity search, fact extraction

---

## GitNexus Code Intelligence

The codebase is indexed by GitNexus (3637 symbols, 8923 relationships, 291 execution flows). Before editing any symbol:

1. **Run impact analysis**: `gitnexus_impact({target: "symbolName", direction: "upstream"})` — check blast radius
2. **Before committing**: `gitnexus_detect_changes()` — verify only expected scope changed
3. **When exploring**: `gitnexus_query({query: "concept"})` — find execution flows by concept
4. **For full context**: `gitnexus_context({name: "symbolName"})` — callers, callees, processes

If the index is stale: `npx gitnexus analyze`

---

## Checklist Before Every PR

1. Every test name starts with a spec reference (`A00X/` or `U00X/`)
2. Architectural decisions have inline spec comments (`// Per A00X/...`)
3. No spec violations — code matches what specs describe
4. Test coverage >= 90%
5. No TODOs, FIXMEs, HACKs
6. No hardcoded colors, no emoji icons
7. Zone placement correct (no computation on main thread)
8. No cross-plugin imports
9. No feature code in core packages
10. Tests pass: `npx vitest run`
11. App boots: `pnpm dev:launcher`
12. `gitnexus_detect_changes()` confirms expected scope
