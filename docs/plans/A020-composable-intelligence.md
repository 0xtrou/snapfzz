---
title: "A020 — Composable Intelligence Architecture"
type: architecture
date: 2026-04-13
derives-from: [A005, A008, A014]
budget: [cpu, memory, network]
---

# A020 — Composable Intelligence Architecture

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Intelligence is a whitebox shipped via the plugin architecture. The orchestrator plugin is a **self-contained unit** — it owns both the frontend (TypeScript, Zone 3) and the backend intelligence runtime (Python, Zone 1). The app discovers and wires plugin artifacts across all zones automatically.

---

## Current State (as of 2026-04-15)

### DONE — Phase 1: Plugin Artifact Discovery

The plugin runtime lifecycle is fully implemented:

- Plugin renamed: `plugins/chat/` → `plugins/orchestrator/`, plugin ID `snapfzz.orchestrator`
- `AgentScopeFactory` / `AgentScopeService` removed — replaced by generic `PluginProcessFactory`
- `PluginProcessFactory` (`src-tauri/src/factories/plugin_runtime.rs`) — data-driven factory created from manifest runtime declarations
- Tauri commands implemented in `src-tauri/src/commands/plugin_runtime.rs`:
  - `install_system_plugin` — installs system plugins (symlink in dev, copy in production)
  - `install_plugin_runtime` — pip-installs the intelligence package, copies binary to `runtime/bin/`
  - `register_plugin_runtime` — registers factory in `ProcessFactoryRegistry`
  - `spawn_plugin_runtime` — spawns the managed process
  - `unregister_plugin_runtime` — cleanup on deactivation
  - `list_installed_plugins`, `get_plugin_info` — discovery helpers for the plugin host
- System plugins follow the **same install flow as user plugins** — whitelisted in `SYSTEM_PLUGINS` constant
- The orchestrator binary is compiled by `install_plugin_runtime` (pip install + binary copy to `runtime/bin/`), not a build hook

### DONE — Intelligence Layer: QwenPaw Extraction

The original 9-block scaffolding design was **replaced** by QwenPaw extraction. The intelligence layer now lives at `plugins/orchestrator/intelligence/` as a proper Python package with its own structure:

```
plugins/orchestrator/intelligence/
├── agent/          # ReAct agent loop, hooks
├── config/         # Models, configuration
├── memory/         # PostgreSQL memory, agent_md, remelight manager
├── mission/        # Handler, prompts, runner, state
├── security/       # File guard, skill scanner, tool guard
├── src/orchestrator/  # Main CLI entry point (app.py, cli.py)
└── tools/          # File I/O, shell, browser, media, agent ops
```

The `pack/` directory contains the declarative configuration (`pack.yaml`, `prompts/`).

### PLANNED — Phases 2–6

See Implementation Phases section below.

---

## Design Principles

1. **Plugin ships everything.** UI, runtime, pack config, system prompt, tools — all inside `plugins/orchestrator/`. The root-level `intelligence/` directory no longer exists.
2. **QwenPaw is the intelligence layer.** The Python intelligence package (extracted via QwenPaw) provides the ReAct agent loop, tools, memory, and mission handling.
3. **Pack config, not framework.** Declarative `pack/pack.yaml` configures the agent. The intelligence package reads this at startup.
4. **Multi-zone artifact discovery.** Plugins declare runtimes (Python processes, Web Workers) in their manifest. The app discovers and spawns them at activation time.
5. **PostgreSQL for memory.** The intelligence layer includes a PostgresMemory adapter under `intelligence/memory/`.

---

## What Stays

- **LiteLLM gateway** = LLM provider routing (already managed)
- **snapfzz-stream** = SSE parsing + batching (Rust Zone 1)
- **Pretext components** = chat rendering (Zone 3)
- **Plugin architecture** (A005) = contribution types, lifecycle, crash supervision

## What Changed (Phase 1 — DONE)

- `intelligence/` directory at repo root **removed** — intelligence now lives inside `plugins/orchestrator/intelligence/`
- Plugin renamed: `plugins/chat/` → `plugins/orchestrator/`, ID `snapfzz.orchestrator`
- Plugin SDK extended with `runtimes` field for multi-zone artifact declarations
- Plugin host discovers and spawns plugin-declared Python runtimes at activation
- Generic `PluginProcessFactory` replaced hardcoded `AgentScopeFactory` — removed `factories/agentscope.rs` and `packs/agentscope/`
- 9-block scaffolding design **replaced** by QwenPaw extraction into `intelligence/` package structure
- Orchestrator binary compiled by `install_plugin_runtime` (pip install via uv, binary copied to `runtime/bin/`)
- System plugins follow the same install flow as user plugins

## What Remains Planned

- PostgreSQL `memory` database (Phase 2)
- RAG pipeline with pgvector embeddings (Phase 6)

---

## Plugin Structure — The Complete Unit

```
plugins/orchestrator/                 ← THE SELF-CONTAINED PLUGIN (renamed from plugins/chat/)
│
├── manifest.json                     # Plugin manifest (id: snapfzz.orchestrator)
│                                     #   runtimes.python[] — intelligence runtime declaration
│                                     #   main: dist/index.js
│
├── src/                              # TypeScript — browser (Zone 3)
│   ├── index.ts                      # definePlugin()
│   │                                 #   leftPanelTabs[], statusItems[]
│   │                                 #   commands[], shortcuts[]
│   ├── contributions/
│   │   ├── ChatPanel.tsx             # Main chat UI
│   │   ├── ConnectionStatus.tsx      # Status bar — agent health
│   │   └── TokenCounter.tsx          # Status bar — token usage
│   ├── components/                   # ContentBlock renderers
│   │   ├── ThinkingCallout.tsx
│   │   ├── ToolUseCard.tsx
│   │   ├── ToolResultInline.tsx
│   │   ├── ImageContent.tsx
│   │   ├── AudioPlayer.tsx
│   │   ├── VideoPlayer.tsx
│   │   ├── ScrollPill.tsx
│   │   └── ThinkingIndicator.tsx
│   ├── hooks/
│   │   └── use-chat.ts
│   └── types.ts
│
├── dist/                             # Compiled TypeScript bundle (built output)
│   ├── index.js                      # Plugin entry point
│   ├── ChatPanel-*.js
│   ├── ConnectionStatus-*.js
│   ├── TokenCounter-*.js
│   └── use-chat-*.js
│
├── intelligence/                     # Python intelligence package (Zone 1)
│   │                                 # QwenPaw extraction — NOT the 9-block scaffolding
│   ├── agent/                        # ReAct agent loop, hooks
│   ├── config/                       # Models, configuration
│   ├── memory/                       # PostgresMemory adapter, remelight manager
│   ├── mission/                      # Handler, prompts, runner, state
│   ├── security/                     # File guard, skill scanner, tool guard
│   ├── src/orchestrator/             # CLI entry point
│   │   ├── app.py
│   │   └── cli.py
│   ├── tools/                        # File I/O, shell, browser, media, agent ops
│   ├── pyproject.toml
│   └── requirements.txt
│
├── runtime/                          # Runtime artifacts (populated at install time)
│   └── bin/                          # Compiled binary (copied by install_plugin_runtime)
│       └── orchestrator              # Executable — installed from venv/bin/
│
├── pack/                             # Declarative configuration — no code
│   ├── pack.yaml                     # Agent configuration
│   └── prompts/
│       ├── system.md                 # Orchestrator system prompt
│       └── contexts/                 # Context-specific prompt fragments
│
├── __tests__/
├── SPEC.md
├── package.json
├── vite.config.ts
└── vitest.config.ts
```

---

## Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│             ORCHESTRATOR PLUGIN (plugins/orchestrator/)           │
│                                                                  │
│  src/ (Zone 3)                   intelligence/ (Zone 1)          │
│  ├── ChatPanel.tsx               ├── agent/    (ReAct loop)      │
│  ├── Composer                    ├── mission/  (handler, state)  │
│  ├── ContentBlock renderers      ├── memory/   (PostgresMemory)  │
│  └── use-chat.ts                 ├── tools/    (file, shell, web)│
│                                  ├── security/ (guards)          │
│                                  └── src/orchestrator/app.py     │
│                                                                  │
│  manifest.json declares:         pack/ (pure config)             │
│  ├── runtimes.python[]           ├── pack.yaml                   │
│  │   └── command: "orchestrator  └── prompts/ (system + context) │
│  │         app"                                                  │
│  └── main: dist/index.js         runtime/bin/orchestrator        │
│                                  (compiled by install_plugin_    │
│                                   runtime — pip install + copy)  │
└──────────────┬──────────────────────────┬────────────────────────┘
               │ Tauri IPC                │ HTTP SSE
               ▼                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                                │
│                                                                  │
│  Rust Bridge (src-tauri/src/commands/)                           │
│  ├── stream.rs         send_message, stop, session CRUD          │
│  └── plugin_runtime.rs install_system_plugin,                    │
│                         install_plugin_runtime,                  │
│                         register_plugin_runtime,                 │
│                         spawn_plugin_runtime,                    │
│                         unregister_plugin_runtime,               │
│                         list_installed_plugins, get_plugin_info  │
│                                                                  │
│  Rust Crates                                                     │
│  ├── snapfzz-stream    SSE parsing + batching                    │
│  ├── snapfzz-packs     Python + PostgreSQL infrastructure        │
│  └── snapfzz-kernel    Boot, budget, process, settings           │
│                                                                  │
│  src-tauri/src/factories/                                        │
│  ├── plugin_runtime.rs  PluginProcessFactory (generic, DONE)    │
│  └── litellm.rs         LiteLLMFactory (existing)               │
│                                                                  │
│  PostgreSQL (embedded)                                           │
│  └── litellm DB         LLM proxy state (existing)              │
│  (memory DB — PLANNED Phase 2)                                   │
│                                                                  │
│  LiteLLM Proxy          Multi-provider LLM gateway (existing)   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Intelligence Layer — QwenPaw Extraction

> **Note:** The original 9-block scaffolding design was not implemented. It was replaced by QwenPaw extraction, which produces the `intelligence/` package at `plugins/orchestrator/intelligence/`.

The intelligence layer is a Python package installed via `uv pip install --editable` during `install_plugin_runtime`. It exposes a CLI entry point (`orchestrator app`) that the `PluginProcessFactory` spawns as a managed process.

### Package Structure

```
intelligence/
├── agent/
│   ├── __init__.py
│   ├── react_agent.py   # ReAct agent loop
│   └── hooks/           # Agent lifecycle hooks
├── config/
│   ├── __init__.py
│   └── models.py        # Configuration models
├── memory/
│   ├── __init__.py
│   ├── base.py          # Memory base class
│   ├── postgres.py      # PostgresMemory adapter
│   ├── agent_md.py      # Markdown-based agent memory
│   └── remelight_manager.py
├── mission/
│   ├── __init__.py
│   ├── handler.py       # Mission request handler
│   ├── prompts.py       # Prompt construction
│   ├── runner.py        # Mission execution
│   └── state.py         # Mission state
├── security/
│   ├── __init__.py
│   ├── file_guard.py
│   ├── skill_scanner/
│   └── tool_guard/
├── src/orchestrator/
│   ├── __init__.py
│   ├── app.py           # Entry point: starts HTTP server
│   └── cli.py           # CLI definition
├── tools/
│   ├── __init__.py
│   ├── file_io.py
│   ├── shell.py
│   ├── browser.py
│   ├── media.py
│   └── agent_ops.py
├── pyproject.toml       # Package definition — exposes `orchestrator` binary
└── requirements.txt
```

### Install Flow

```
1. install_system_plugin("snapfzz.orchestrator")
   → dev: symlink plugins/orchestrator → ~/.snapfzz/plugins/snapfzz.orchestrator
   → prod: copy bundled artifacts

2. install_plugin_runtime(declaration)
   → uv pip install --editable ~/.snapfzz/plugins/snapfzz.orchestrator/intelligence/
   → copies venv/bin/orchestrator → ~/.snapfzz/plugins/snapfzz.orchestrator/runtime/bin/orchestrator

3. register_plugin_runtime(declaration)
   → creates PluginProcessFactory from manifest declaration
   → registers in ProcessFactoryRegistry

4. spawn_plugin_runtime("chat.orchestrator")
   → PluginProcessFactory.can_start() checks runtime/bin/orchestrator exists
   → builds Command: runtime/bin/orchestrator app --host 127.0.0.1 --port {dynamic}
   → BudgetedProcess created, health check loop begins at /health
```

---

## Multi-Zone Plugin Artifact Discovery

### The Problem

Plugins currently only declare TypeScript contributions (Zone 3). But a plugin like `plugins/chat/` ships artifacts across all zones:

- **Zone 3** (Browser): TypeScript UI components
- **Zone 1** (Python process): AgentScope Runtime
- **Zone 2** (Web Worker): Future — syntax highlighting, state management

The app needs to **discover and wire** these at boot/activation time.

### Solution: Extend `definePlugin()` with `runtimes`

```typescript
// New types in plugin-sdk/src/types.ts

export interface PluginPythonRuntime {
  id: string;                    // "chat.agentscope"
  module?: string;               // "app" (for python -m app)
  entrypoint: string;            // "runtime/app.py"
  workingDir: string;            // "runtime"
  healthPath: string;            // "/health"
  healthIntervalMs?: number;     // 2000
  dependencies?: string;         // "runtime/requirements.txt"
  resources?: {
    maxMemoryMb?: number;        // 512
    maxRestarts?: number;        // 10
  };
  env?: Record<string, string>;  // extra env vars
  requiresDatabase?: boolean;    // needs MEMORY_DATABASE_URL
}

export interface PluginWorkerScript {
  id: string;                    // "chat.syntax-highlighter"
  entrypoint: string;            // "workers/highlighter.ts"
  type: 'dedicated' | 'shared';
}

export interface PluginRuntimes {
  python?: PluginPythonRuntime[];
  workers?: PluginWorkerScript[];
}

// Extended PluginManifest
export interface PluginManifest {
  // ... existing fields ...
  runtimes?: PluginRuntimes;     // NEW
}
```

### Orchestrator Plugin Manifest — With Runtime Declaration

The plugin uses `manifest.json` (not `definePlugin`) for the runtime declaration. The actual runtime registration is driven from this manifest by the plugin host.

```json
{
  "id": "snapfzz.orchestrator",
  "name": "Orchestrator",
  "version": "0.1.0",
  "description": "Text conversation channel for AgentScope agents",
  "surface": ["project"],
  "activationEvents": ["onStartupFinished"],
  "runtimes": {
    "python": [
      {
        "id": "chat.orchestrator",
        "packageDir": "intelligence",
        "command": "orchestrator app",
        "healthCheck": "/health",
        "healthIntervalMs": 2000,
        "resources": { "maxMemoryMb": 512, "maxRestarts": 10 },
        "requiresDatabase": true,
        "hostFlag": "--host",
        "portFlag": "--port"
      }
    ]
  },
  "main": "dist/index.js"
}
```

### Discovery Flow

```
T=0    App launch → main.rs
       ├── Register SYSTEM factories (LiteLLM — hardcoded, compiled)
       ├── Phase 1: Python install ─── ✓
       ├── Phase 2: PostgreSQL start, create litellm DB ─── ✓
       └── Phase 3: spawn system services (LiteLLM)

T=200ms  Frontend boots
       ├── PluginHost calls install_system_plugin("snapfzz.orchestrator")
       │   → dev: symlinks plugins/orchestrator → ~/.snapfzz/plugins/snapfzz.orchestrator
       │   → prod: copies bundled artifacts
       ├── PluginHost reads manifest.json, finds runtimes.python[] declarations
       ├── Calls install_plugin_runtime(declaration)
       │   → uv pip install --editable intelligence/
       │   → copies orchestrator binary to runtime/bin/
       └── activateByEvent('onStartupFinished')

T=200ms+ Plugin activation (per plugin)
       ├── host.activate('snapfzz.orchestrator')
       │   ├── ensurePluginRuntimes(plugin)
       │   │   ├── rust.invoke('register_plugin_runtime', declaration)
       │   │   │   → Rust creates PluginProcessFactory
       │   │   │   → Registers in ProcessFactoryRegistry
       │   │   └── rust.invoke('spawn_plugin_runtime', { runtimeId: 'chat.orchestrator' })
       │   │       → BudgetedProcess created, child process started
       │   │       → Health check loop begins at /health (2s interval)
       │   ├── createPluginContext()
       │   └── plugin.activate(ctx)

T=steady  All zones wired
       ├── Zone 3: ChatPanel renders
       ├── Zone 1 (Rust): send_message handles IPC
       └── Zone 1 (Python): chat.orchestrator running, health-checked
```

### Why Activation-Time, Not Boot-Time

- **Disabled plugins don't spawn processes** — no wasted 512MB RAM
- **Dependency ordering** — plugin activation has topological sort
- **Graceful degradation** — runtime spawn failure → plugin error state, not boot crash
- **Hot reload** — deactivate kills runtime, reactivate respawns it

### Generic PluginProcessFactory (DONE)

Replaces the removed `AgentScopeFactory`. Implemented at `src-tauri/src/factories/plugin_runtime.rs`:

- Created from manifest `PluginRuntimeDeclaration` at activation time
- `can_start()` checks `runtime/bin/{binary}` exists (set by `install_plugin_runtime`)
- `build_command()` resolves binary from `plugins_dir/{plugin_id}/runtime/bin/`, injects host/port as CLI flags and env vars, injects `DATABASE_URL` if `requiresDatabase: true`
- Working dir: `plugins_dir/{plugin_id}/data/` (auto-created)
- Port settings keys derived from runtime ID: `{runtimeId}Host`, `{runtimeId}Port`

### Tauri Commands (DONE)

All commands implemented in `src-tauri/src/commands/plugin_runtime.rs`:

| Command | What It Does |
|---------|-------------|
| `install_system_plugin` | Symlinks (dev) or copies (prod) plugin into `~/.snapfzz/plugins/` |
| `install_plugin_runtime` | `uv pip install --editable {packageDir}`, copies binary to `runtime/bin/` |
| `register_plugin_runtime` | Creates `PluginProcessFactory`, registers in `ProcessFactoryRegistry` |
| `spawn_plugin_runtime` | Calls `registry.spawn(runtime_id)` |
| `unregister_plugin_runtime` | Removes factory from registry on deactivation |
| `list_installed_plugins` | Scans `~/.snapfzz/plugins/` for manifests |
| `get_plugin_info` | Returns install status (has_dist, has_manifest, has_runtime) for a plugin |

---

## pack.yaml — Full Configuration

```yaml
id: snapfzz.orchestrator
name: Project Orchestrator
version: 0.1.0
domain: general

agent:
  type: ReActAgent
  model: ${SNAPFZZ_MODEL}
  prompt: prompts/system.md
  memory: postgresql
  max_iterations: 10

tools:
  auto_select: true
  max_parallel: 3
  require_approval: [shell.exec, files.delete]
  available:
    - files.read
    - files.write
    - files.search
    - shell.exec
    - memory.store
    - memory.query
    - web.search
    - web.fetch
    - project.structure
    - project.deps

sub_agents:
  topology: delegation
  max_concurrent: 3
  agents:
    - id: clarify
      type: ReActAgent
      role: Interviewer — extracts requirements
      model_tier: fast
      tools: [memory.store, memory.query]
    - id: build
      type: ReActAgent
      role: Engineer — writes code, runs tests
      model_tier: capable
      tools: [files.read, files.write, shell.exec, memory.query]
    - id: ship
      type: ReActAgent
      role: Deployer — deploys, monitors
      model_tier: fast
      tools: [shell.exec, web.search, memory.query]

context:
  strategy: sliding_window
  max_tokens: 128000
  memory_retrieval:
    top_k: 10
    recency_boost: 0.2

recovery:
  strategy: retry_then_fallback
  max_retries: 2
  on_tool_error: retry_once
  on_context_overflow: summarize

security:
  require_approval: [files.delete, deploy, shell.exec]
  blocked: [vault_access, system_settings, process_management]

state:
  backend: postgresql
  persist: [conversations, extracted_facts, agent_state]
  ttl_days: 90
  auto_extract: true

sentiment:
  detect: true
  adapt: true
  default: professional
```

---

## Memory Architecture (PostgreSQL)

```
DATABASE: memory (alongside existing litellm DB)

TABLES:
  conversations
    ├── id (uuid PK)
    ├── session_id (text, indexed)
    ├── project_id (text, indexed)
    ├── role (text)
    ├── content (jsonb — ContentBlock[])
    ├── metadata (jsonb)
    ├── created_at (timestamptz)
    └── embedding (vector(1536), pgvector)

  memory_entries
    ├── id (uuid PK)
    ├── project_id (text, indexed)
    ├── category (text: fact/decision/preference/context)
    ├── content (text)
    ├── source (text)
    ├── relevance_score (float)
    ├── created_at (timestamptz)
    ├── expires_at (timestamptz, nullable)
    └── embedding (vector(1536), pgvector)

  agent_state
    ├── id (uuid PK)
    ├── agent_id (text, indexed)
    ├── project_id (text, indexed)
    ├── state (jsonb)
    ├── updated_at (timestamptz)
    └── version (integer)

INDEXES:
  conversations_session_idx ON conversations(session_id, created_at)
  memory_embedding_idx USING ivfflat (embedding vector_cosine_ops)
```

---

## RAG Pipeline

```
User sends message
  → PostgresMemory.retrieve(query):
    1. Current conversation (last N from session)
    2. Embedding similarity: memory_entries ORDER BY embedding <=> query LIMIT 10
    3. Injected into agent context window
  → AgentScope ReActAgent processes
  → PostgresMemory.persist(response):
    1. Store messages in conversations
    2. Extract facts/decisions → memory_entries (async)
    3. Generate embeddings via LiteLLM /embeddings
```

---

## New Rust Crate

```
src-tauri/crates/snapfzz-memory/    (domain logic — two-layer rule)
├── src/
│   ├── lib.rs          re-exports
│   ├── store.rs        MemoryManager: CRUD against PostgreSQL
│   ├── schema.rs       table definitions, migrations
│   └── embedding.rs    embedding generation via LiteLLM /embeddings
└── Cargo.toml          deps: sqlx, pgvector
```

---

## Implementation Phases

### Phase 1: Plugin Artifact Discovery — DONE

- [x] Plugin renamed `plugins/chat/` → `plugins/orchestrator/`, ID `snapfzz.orchestrator`
- [x] `AgentScopeFactory` / `AgentScopeService` removed
- [x] `PluginProcessFactory` implemented (`src-tauri/src/factories/plugin_runtime.rs`)
- [x] All plugin runtime Tauri commands implemented (`src-tauri/src/commands/plugin_runtime.rs`)
- [x] System plugins use same install flow as user plugins (whitelisted in `SYSTEM_PLUGINS`)
- [x] Orchestrator binary installed by `install_plugin_runtime`, not a build hook
- [x] Intelligence layer delivered via QwenPaw extraction into `intelligence/` package
- [x] `manifest.json` with `runtimes.python[]` declaration

### Phase 2: Memory Database Foundation — PLANNED
- Add `pg.create_database("memory")` to boot Phase 2
- Create `snapfzz-memory` Rust crate (MemoryManager, schema, migrations)
- Add `memory_store`, `memory_query` Tauri commands
- Wire `DATABASE_URL` through boot → plugin runtimes for memory DB

### Phase 3: Intelligence Integration — PLANNED
- Wire `pack/pack.yaml` into intelligence runtime startup
- Integrate `prompts/system.md` into mission handler
- End-to-end: frontend send → orchestrator runtime → LiteLLM → SSE response

### Phase 4: Orchestrator UI — Intelligence Contributions — PLANNED
- Add `agentTools[]` and `agentSkills[]` contributions to plugin manifest
- Add `chat.uploadFile`, `chat.switchSession` commands

### Phase 5: Chat UI — Rich Input — PLANNED
- File upload (drag-drop + button)
- Session switcher (conversation history)
- Memory indicator (RAG status)
- Clean up dead code

### Phase 6: RAG Pipeline — PLANNED
- PostgresMemory embedding generation via LiteLLM
- pgvector similarity search
- Async fact extraction post-response
- Context assembly

---

## Critical Files

| Area | File | Action |
|------|------|--------|
| Plugin SDK | `frontend/packages/plugin-sdk/src/types.ts` | Modify — add PluginRuntimes types |
| Plugin Host | `frontend/packages/plugin-host/src/plugin-host.ts` | Modify — ensurePluginRuntimes() |
| Plugin commands | `src-tauri/src/commands/plugins.rs` | New — register/spawn runtime |
| Plugin factory | `src-tauri/src/factories/plugin_runtime.rs` | New — PluginProcessFactory |
| Main | `src-tauri/src/main.rs` | Modify — register new commands |
| Boot | `src-tauri/src/boot.rs` | Modify — add memory DB |
| Memory crate | `src-tauri/crates/snapfzz-memory/` | New |
| Memory commands | `src-tauri/src/commands/memory.rs` | New |
| Block scaffolding | `plugins/chat/runtime/blocks/` | New — 9 blocks |
| Plugin runtime | `plugins/chat/runtime/app.py` | New (from intelligence/) |
| Plugin memory | `plugins/chat/runtime/memory.py` | New |
| Plugin tools | `plugins/chat/runtime/tools/` | New |
| Pack config | `plugins/chat/pack/pack.yaml` | New |
| Pack prompt | `plugins/chat/pack/prompts/system.md` | New |
| Plugin manifest | `plugins/chat/src/index.ts` | Modify — runtimes + intelligence |
| Chat UI | `plugins/chat/src/contributions/ChatPanel.tsx` | Modify — file upload, sessions |
| Old intelligence | `intelligence/` | Remove |
| Old AS factory | `src-tauri/src/factories/agentscope.rs` | Remove (replaced by generic) |
| Old AS service | `src-tauri/crates/snapfzz-packs/src/agentscope/` | Remove |
