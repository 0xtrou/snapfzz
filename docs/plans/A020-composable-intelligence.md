---
title: "A020 — Composable Intelligence Architecture"
type: architecture
date: 2026-04-13
derives-from: [A005, A008, A014]
budget: [cpu, memory, network]
---

# A020 — Composable Intelligence Architecture

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Intelligence is a whitebox shipped via the plugin architecture. The chat plugin is a **self-contained unit** — it owns both the frontend (TypeScript, Zone 3) and the backend intelligence runtime (Python, Zone 1). AgentScope + AgentScope Runtime is the execution engine. A thin 9-block scaffolding layer configures AgentScope from declarative pack config. The app discovers and wires plugin artifacts across all zones automatically.

---

## Design Principles

1. **Plugin ships everything.** UI, runtime, pack config, system prompt, tools — all inside `plugins/chat/`. No separate `intelligence/` directory.
2. **AgentScope is the engine.** ReActAgent, Toolkit, Memory, pipeline coordination — we use them directly.
3. **9-block scaffolding, not framework.** A thin composition layer (~1000 lines Python) reads pack.yaml and configures AgentScope. Each block wraps one AgentScope primitive. Blocks are independently swappable and evaluable.
4. **Multi-zone artifact discovery.** Plugins declare runtimes (Python processes, Web Workers) in their manifest. The app discovers and spawns them at activation time.
5. **PostgreSQL for memory.** Swap AgentScope's `InMemoryMemory` for a `PostgresMemory` adapter.

---

## What Stays

- **AgentScope + AgentScope Runtime** = execution engine (ReActAgent, Toolkit, stream_printing_messages)
- **LiteLLM gateway** = LLM provider routing (already managed)
- **snapfzz-stream** = SSE parsing + batching (Rust Zone 1)
- **Pretext components** = chat rendering (Zone 3)
- **Plugin architecture** (A005) = contribution types, lifecycle, crash supervision

## What Changes

- `intelligence/` directory **removed** — contents move into `plugins/chat/runtime/`
- Plugin SDK extended with `runtimes` field for multi-zone artifact declarations
- Plugin host discovers and spawns plugin-declared Python runtimes at activation
- Generic `PluginProcessFactory` replaces hardcoded `AgentScopeFactory`
- 9-block scaffolding composes AgentScope agents from pack.yaml
- PostgreSQL gets a dedicated `memory` database

---

## Plugin Structure — The Complete Unit

```
plugins/chat/                         ← THE SELF-CONTAINED PLUGIN
│
├── src/                              # TypeScript — browser (Zone 3)
│   ├── index.ts                      # Plugin manifest (definePlugin)
│   │                                 #   runtimes.python[] (NEW)
│   │                                 #   agentTools[], agentSkills[]
│   │                                 #   leftPanelTabs[], statusItems[]
│   │                                 #   commands[], shortcuts[]
│   ├── contributions/
│   │   ├── ChatPanel.tsx             # Main chat UI
│   │   ├── ConnectionStatus.tsx      # Status bar — agent health
│   │   └── TokenCounter.tsx          # Status bar — token usage
│   ├── components/                   # ContentBlock renderers
│   │   ├── MessageBubble.tsx
│   │   ├── ThinkingCallout.tsx
│   │   ├── ToolUseCard.tsx
│   │   ├── ToolResultInline.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── TextContent.tsx
│   │   ├── InlineRenderer.tsx
│   │   ├── ImageContent.tsx
│   │   ├── AudioPlayer.tsx
│   │   ├── VideoPlayer.tsx
│   │   ├── FileAttachment.tsx        # NEW
│   │   ├── ScrollPill.tsx
│   │   └── ThinkingIndicator.tsx
│   ├── hooks/
│   │   ├── use-chat.ts
│   │   └── markdown.ts
│   └── types.ts
│
├── runtime/                          # Python — managed process (Zone 1)
│   ├── app.py                        # AgentScope Runtime entry point
│   ├── requirements.txt              # Python dependencies
│   ├── memory.py                     # PostgresMemory(Memory) adapter
│   ├── tools/                        # Tool functions for Toolkit
│   │   ├── files.py
│   │   ├── shell.py
│   │   ├── web.py
│   │   └── project.py
│   └── blocks/                       # 9-block scaffolding (~995 lines)
│       ├── __init__.py               # Public API: Block, BlockPipeline
│       ├── base.py                   # Block ABC, BlockResult, Scorecard
│       ├── pipeline.py              # BlockPipeline: from_pack(), build()
│       ├── agent_loop.py             # Wraps ReActAgent
│       ├── multi_agent.py            # Sub-agent topology
│       ├── plan_mode.py              # Plan vs react threshold
│       ├── context.py                # Context window config
│       ├── tools.py                  # Wraps Toolkit
│       ├── recovery.py               # Failure handling
│       ├── security.py               # Action authorization
│       ├── state.py                  # Wraps Memory → PostgresMemory
│       └── sentiment.py              # Tone adaptation
│
├── pack/                             # Pure configuration — no code
│   ├── pack.yaml                     # 9-block config
│   └── prompts/
│       ├── system.md                 # Orchestrator system prompt
│       └── contexts/
│           ├── onboarding.md
│           ├── building.md
│           ├── debugging.md
│           └── shipping.md
│
├── __tests__/
├── SPEC.md
├── package.json
└── vitest.config.ts
```

---

## Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                  CHAT PLUGIN (plugins/chat/)                      │
│                                                                  │
│  src/ (Zone 3)                   runtime/ (Zone 1)               │
│  ├── ChatPanel.tsx               ├── app.py (AgentScope Runtime) │
│  ├── Composer + file upload      ├── blocks/ (9-block scaffold)  │
│  ├── ContentBlock renderers      ├── memory.py (PostgresMemory)  │
│  └── use-chat.ts                 └── tools/ (Toolkit functions)  │
│                                                                  │
│  manifest declares:              pack/ (pure config)             │
│  ├── runtimes.python[]           ├── pack.yaml (block config)    │
│  ├── agentTools[]                └── prompts/ (system + context) │
│  ├── agentSkills[]                                               │
│  └── commands[]                                                  │
└──────────────┬──────────────────────────┬────────────────────────┘
               │ Tauri IPC                │ HTTP SSE
               ▼                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                                │
│                                                                  │
│  Rust Bridge (src-tauri/src/commands/)                           │
│  ├── stream.rs      send_message, stop, session CRUD            │
│  ├── memory.rs      memory_store, memory_query (NEW)             │
│  └── plugins.rs     register_plugin_runtimes,                    │
│                     spawn_plugin_runtime (NEW)                   │
│                                                                  │
│  Rust Crates                                                     │
│  ├── snapfzz-stream    SSE parsing + batching                   │
│  ├── snapfzz-memory    PostgreSQL memory CRUD (NEW)              │
│  ├── snapfzz-packs     PluginProcessFactory (generic) (MODIFIED)│
│  └── snapfzz-kernel    Boot, budget, process, settings           │
│                                                                  │
│  PostgreSQL (embedded)                                           │
│  ├── litellm DB        LLM proxy state (existing)               │
│  └── memory DB         Conversation + project memory (NEW)       │
│                                                                  │
│  LiteLLM Proxy         Multi-provider LLM gateway (existing)    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9-Block Scaffolding

The scaffolding is a **thin composition layer** (~995 lines Python) that reads pack.yaml and produces a configured AgentScope agent. It is NOT a replacement for AgentScope — each block wraps exactly one AgentScope primitive.

### Block Interface

```python
class Block(ABC):
    def configure(self, config: dict) -> None:
        """Merge pack.yaml section with defaults, validate."""

    def apply(self, context: dict) -> BlockResult:
        """Produce an AgentScope primitive or policy object.
        Receives accumulated context from previous blocks."""

    def evaluate(self) -> Scorecard:
        """Self-check: return named boolean checks + 0-1 score."""
```

### Composition Order

Blocks execute in fixed canonical order. Each injects results into an accumulating context dict:

```
state → context → tools → security → recovery → plan_mode → sentiment → multi_agent → agent_loop
```

### What Each Block Produces

| Block | Wraps | Output |
|-------|-------|--------|
| `StateBlock` | AgentScope `Memory` | `PostgresMemory` or `InMemoryMemory` instance |
| `ContextBlock` | Context window config | Meta injection (max_tokens, retrieval config) |
| `ToolsBlock` | AgentScope `Toolkit` | Configured `Toolkit` with registered functions |
| `SecurityBlock` | Action gates | `SecurityPolicy` with allow/approve/block checks |
| `RecoveryBlock` | Error handling | `RecoveryStrategy` with retry/fallback logic |
| `PlanModeBlock` | Planning threshold | `PlanPolicy` with should_plan(complexity) |
| `SentimentBlock` | Tone adaptation | `SentimentPolicy` (modifies sys_prompt in context) |
| `MultiAgentBlock` | Sub-agent specs | `MultiAgentTopology` with lazy agent instantiation |
| `AgentLoopBlock` | AgentScope `ReActAgent` | Final configured agent (consumes all upstream) |

### Usage in app.py

```python
from blocks import BlockPipeline

pipeline = BlockPipeline.from_pack("../pack/pack.yaml")
agent = pipeline.build()
# AgentScope does the rest — ReAct loop, tool execution, streaming
```

### Block Swapping

```python
pipeline = BlockPipeline.from_pack("../pack/pack.yaml")
pipeline.replace_block("state", CustomStateBlock())
agent = pipeline.build()
```

### Evaluation / Scorecard

```python
for card in pipeline.evaluate():
    print(f"{card.block_name}: {card.score:.0%} — {card.checks}")
# state: 100% — {configured: True, backend_valid: True, ttl_reasonable: True}
# tools: 75% — {has_tools: True, dangerous_tools_gated: False}
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

### Chat Plugin Manifest — With Runtime Declaration

```typescript
export default definePlugin({
  id: 'snapfzz.chat',
  name: 'Chat',
  version: '0.2.0',
  surface: ['project'],
  activationEvents: ['onStartupFinished'],

  runtimes: {
    python: [{
      id: 'chat.agentscope',
      module: 'app',
      entrypoint: 'runtime/app.py',
      workingDir: 'runtime',
      healthPath: '/health',
      healthIntervalMs: 2000,
      dependencies: 'runtime/requirements.txt',
      resources: { maxMemoryMb: 512, maxRestarts: 10 },
      requiresDatabase: true,
    }],
  },

  budget: { /* ... */ },
  contributes: { /* ... */ },
  async activate(ctx) { /* ... */ },
});
```

### Discovery Flow

```
T=0    App launch → main.rs
       ├── Register SYSTEM factories (LiteLLM — hardcoded, compiled)
       ├── Phase 1: Python install ─── ✓
       ├── Phase 2: PostgreSQL start, create litellm + memory DBs ─── ✓
       └── Phase 3: spawn system services (LiteLLM)

T=200ms  Frontend boots
       ├── PluginHost discovers manifests
       ├── Finds runtimes.python[] declarations
       └── activateByEvent('onStartupFinished')

T=200ms+ Plugin activation (per plugin)
       ├── host.activate('snapfzz.chat')
       │   ├── ensurePluginRuntimes(plugin)
       │   │   ├── rust.invoke('register_plugin_runtimes', declarations)
       │   │   │   → Rust creates PluginProcessFactory
       │   │   │   → Registers in ProcessFactoryRegistry
       │   │   └── rust.invoke('spawn_plugin_runtime', { name: 'chat.agentscope' })
       │   │       → BudgetedProcess created, child process started
       │   │       → Health check loop begins
       │   ├── createPluginContext()
       │   └── plugin.activate(ctx)

T=steady  All zones wired
       ├── Zone 3: ChatPanel renders
       ├── Zone 1 (Rust): send_message handles IPC
       └── Zone 1 (Python): chat.agentscope running, health-checked
```

### Why Activation-Time, Not Boot-Time

- **Disabled plugins don't spawn processes** — no wasted 512MB RAM
- **Dependency ordering** — plugin activation has topological sort
- **Graceful degradation** — runtime spawn failure → plugin error state, not boot crash
- **Hot reload** — deactivate kills runtime, reactivate respawns it

### Generic PluginProcessFactory

Replaces the hardcoded `AgentScopeFactory`. Created from manifest declarations at runtime:

```rust
// src-tauri/src/factories/plugin_runtime.rs

pub struct PluginProcessFactory {
    runtime_id: String,
    plugin_id: String,
    module: Option<String>,
    working_dir_relative: String,
    health_path: String,
    max_memory_mb: u64,
    max_restarts: u32,
    requires_database: bool,
    env: HashMap<String, String>,
}

impl ProcessFactory for PluginProcessFactory {
    fn build_command(&self, config: &SpawnConfig, runtime: &PythonRuntime)
        -> Result<Command, ServiceError>
    {
        let mut cmd = Command::new(runtime.venv_python());
        if let Some(ref module) = self.module {
            cmd.arg("-m").arg(module);
        }
        cmd.current_dir(resolve_plugin_dir(&self.plugin_id)
            .join(&self.working_dir_relative));
        cmd.env("SNAPFZZ_HOST", &config.host)
           .env("SNAPFZZ_PORT", config.port.to_string());
        if self.requires_database {
            if let Some(ref url) = config.database_url {
                cmd.env("MEMORY_DATABASE_URL", url);
            }
        }
        for (k, v) in &self.env { cmd.env(k, v); }
        Ok(cmd)
    }
}
```

### New Tauri Commands

```rust
// src-tauri/src/commands/plugins.rs

#[tauri::command]
pub async fn register_plugin_runtimes(
    declarations: Vec<PluginRuntimeDeclaration>,
    registry: State<'_, Arc<Mutex<ProcessFactoryRegistry>>>,
) -> Result<Vec<String>, String>

#[tauri::command]
pub async fn spawn_plugin_runtime(
    name: String,
    registry: State<'_, Arc<Mutex<ProcessFactoryRegistry>>>,
) -> Result<(), String>
```

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

### Phase 1: Plugin Artifact Discovery
- Extend `PluginManifest` with `runtimes?: PluginRuntimes` in plugin-sdk
- Create `PluginProcessFactory` (generic, manifest-driven) in Rust
- Add `register_plugin_runtimes`, `spawn_plugin_runtime` Tauri commands
- Add `ensurePluginRuntimes()` to plugin-host activation flow
- Retire hardcoded `AgentScopeFactory` / `AgentScopeService`

### Phase 2: Memory Database Foundation
- Add `pg.create_database("memory")` to boot Phase 2
- Create `snapfzz-memory` Rust crate (MemoryManager, schema, migrations)
- Add `memory_store`, `memory_query` Tauri commands
- Wire `MEMORY_DATABASE_URL` through boot → plugin runtimes

### Phase 3: 9-Block Scaffolding + Pack
- Create `plugins/chat/runtime/blocks/` (~995 lines Python)
- Create `plugins/chat/pack/pack.yaml` + `prompts/system.md`
- Refactor `runtime/app.py` to use `BlockPipeline.from_pack().build()`
- Create `plugins/chat/runtime/memory.py` (PostgresMemory adapter)
- Create `plugins/chat/runtime/tools/` (file ops, shell, web, project)
- Move `intelligence/app.py` → `plugins/chat/runtime/app.py`
- Remove `intelligence/` directory

### Phase 4: Chat Plugin — Intelligence Contributions
- Add `runtimes.python[]` to chat plugin manifest
- Add `agentTools[]` and `agentSkills[]` contributions
- Add `chat.uploadFile`, `chat.switchSession` commands

### Phase 5: Chat UI — Rich Input
- File upload (drag-drop + button)
- Session switcher (conversation history)
- Memory indicator (RAG status)
- Clean up dead code

### Phase 6: RAG Pipeline
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
