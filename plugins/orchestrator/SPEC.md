---
title: "Orchestrator Plugin — Text Conversation Channel with Intelligence Runtime"
type: spec
date: 2026-04-05
updated: 2026-04-15
traces: [A001, A002, A003, A005, A006, A007, A008, A020, U009, MILESTONES/Alpha]
---

# Orchestrator Plugin

Plugin ID: `snapfzz.orchestrator`

The text conversation channel. Renders the agent conversation as a ChatGPT-quality chat interface. Ships both the TypeScript UI (Zone 3) and the Python intelligence runtime (Zone 1) as a self-contained unit. The first system plugin — proves the entire budgeted plugin architecture including runtime lifecycle management.

---

## Budget Registration (A008)

```
class: "plugin.chat"
zone: zone3 (render only)

Controlled resources:
  reliability: 3 strikes, 300s window → auto-disable
  network: max 2 concurrent ctx.rust.invoke() calls
  frame: metered via PerformanceObserver (16ms/33ms from preset)

Capabilities declared:
  rust.invoke, rust.listen, bus.emit, commands.register,
  settings.read, storage.read, logger

Does NOT acquire:
  CpuPermit — Zone 3 only, no compute
  Memory — AgentScope Runtime owns agent memory
  Storage — AgentScope Runtime Session owns persistence
```

### Budget × Zone × User Map

| Action | User | Zone | Budget | Registry Role |
|---|---|---|---|---|
| Render message thread | plugin.chat | Zone 3 | Frame | Meter — PerformanceObserver reports violations |
| Composer auto-resize | plugin.chat | Zone 3 | Frame | Meter — Pretext arithmetic, zero cost |
| Send message to Rust | plugin.chat | Zone 3→1 | Network | Gate — `try_acquire("plugin.chat", NetworkOp)` |
| Parse SSE from AgentScope Runtime | stream-pipeline | Zone 1 | CPU | Gate — `try_acquire("stream-pipeline", CpuPermit)` |
| Batch tokens at preset rate | stream-pipeline | Zone 1 | Network | Rate limiter — `batch_rate_ms` from preset |
| AgentScope Runtime LLM call | agentscope | External | Memory | Supervisor — RSS check via sysinfo (local) |
| AgentScope Runtime health | agentscope | External | Reliability | Supervisor — health poll, restart on failure |
| Plugin crash | plugin.chat | Zone 3 | Reliability | Gate — `reportCrash()` → 3 strikes → `try_acquire` returns None |
| Height calculation | plugin.chat | Zone 3 | Frame | None — Pretext `prepare()`/`layout()` is arithmetic |

---

## What This Plugin IS

A **rendering channel** for AgentScope Runtime's agent conversation. It:

- Renders the `Msg` stream from AgentScope Runtime (text, thinking, tool_use, tool_result, image, audio, video)
- Provides user input via the Rust bridge → AgentScope Runtime `/process` endpoint
- Displays streaming tokens at 60fps using Pretext-powered virtualization
- Persists nothing — AgentScope Runtime Session Service handles persistence

## What This Plugin IS NOT

- NOT an LLM gateway (AgentScope Runtime routes LLM calls)
- NOT a session manager (AgentScope Runtime Session Service handles persistence)
- NOT a message store (AgentScope Runtime Memory Service owns conversation state)
- NOT an agent orchestrator (AgentScope Runtime pipelines coordinate agents)
- NOT a process supervisor (Budget Registry supervises AgentScope Runtime process)

---

## Domain Model — AgentScope Types

The chat plugin renders AgentScope's native types. No custom message format.

```
Msg                                # AgentScope message — the atomic unit
├── id: string                     # Unique message ID
├── name: string                   # Sender name ("Orchestrator", "User", "BuildAgent")
├── role: "user" | "assistant" | "system"
├── content: string | ContentBlock[]
├── metadata: Record<string, any>  # Structured output, tool configs
└── timestamp: string

ContentBlock (union)               # Rich content — rendered by specialized components
├── TextBlock        { type: "text", text: string }
├── ThinkingBlock    { type: "thinking", thinking: string }
├── ToolUseBlock     { type: "tool_use", id, name, input }
├── ToolResultBlock  { type: "tool_result", id, output, name }
├── ImageBlock       { type: "image", source: Base64 | URL }
├── AudioBlock       { type: "audio", source: Base64 | URL }
└── VideoBlock       { type: "video", source: Base64 | URL }
```

---

## Architecture Resonance

```
User types message, hits ⌘+Enter
  │
  ▼  Zone 3 — Main thread (A002)
  Chat plugin calls ctx.rust.invoke('send_message', {text, sessionId})
  │
  ▼  SDK boundary — PluginContext tags with plugin_id: "plugin.chat"
  │
  ▼  Budget gate (A008)
  Registry: try_acquire("plugin.chat", Resource::NetworkOp)
  │  → if None: return BudgetExhausted to plugin
  │  → if Some(permit): proceed
  │
  ▼  Zone 1 — Rust (A002)
  HTTP POST to AgentScope Runtime localhost:8090/process
  AgentScope Runtime: agent processes message (LLM call, tools, memory)
  AgentScope Runtime streams SSE response (sequence-numbered events)
  │
  ▼  Zone 1 — Rust SSE consumer (A002)
  Registry: try_acquire("stream-pipeline", Resource::CpuPermit(1))
  Parse SSE events, extract ContentBlocks
  Batch at preset.batch_rate_ms (16ms Performance, 33ms Battery)
  Push ContentBlockBatch via Tauri Channel API
  drop(permit) → CPU permit returned to pool
  │
  ▼  Zone 3 — Main thread receives pre-parsed batch (A002)
  Chat plugin appends ContentBlocks to message state
  PretextList: binary search O(log n) for visible range
  PretextBubble: contentVisibility: auto on off-screen messages
  PretextMarkdown: renders text blocks with cached parseBlocks (useMemo)
  Height cache: prepare()/layout() cached per message ID
  │
  ▼  Frame budget metered
  PerformanceObserver detects longtask > target_ms
  → invoke('budget_report_violation', {class: "plugin.chat", actual_ms, target_ms})
  │
  ▼  User sees streaming response at 60fps
```

| Spec | What Chat Proves |
|---|---|
| A001 | 60fps streaming, `contain: strict`, Pretext arithmetic layout, GPU-only animations |
| A002 | Zone 1 (Rust SSE parse + batch), Zone 3 (render only — Pretext, no DOM measurement) |
| A003 | < 200ms shell visible, chat input active < 500ms |
| A005 | Plugin registers leftPanelTab via manifest, uses ctx.rust bridge, crash isolation |
| A006 | Boot: skeleton → host → discover → activate → chat tab renders |
| A007 | Project window has independent frame budget from launcher/preferences |
| A008 | Every invoke gated by registry, plugin budget declared in manifest, violations metered |
| U009 | Zinc theme, dark/light, Inter/JetBrains Mono (bundled offline), CSS variables |

---

## Plugin Manifest

The plugin uses a `manifest.json` file (not TypeScript `definePlugin`) to declare the intelligence runtime. The TypeScript entry point (`src/index.ts`) handles UI contributions.

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

---

## Components — Pretext-Powered

All layout uses Pretext shared components from `@snapfzz/shared`. Zero DOM measurement in hot path.

### ChatPanel (leftPanelTab contribution)

```
┌─ Chat ──────────────────────────────────────────┐
│                                                  │
│  ┌─ 🎯 Orchestrator ─────────────────────────┐  │
│  │ I've created the project structure.        │  │
│  │ ┌─ 💭 Thinking ─────────────────────────┐ │  │
│  │ │ Setting up Next.js with App Router... │ │  │
│  │ └───────────────────────────────────────┘ │  │
│  │ ┌─ 🔧 write_file ──────────────────────┐ │  │
│  │ │ app/page.tsx  ✓ Created (24 lines)   │ │  │
│  │ └──────────────────────────────────────┘ │  │
│  │ ┌─ app/page.tsx ────────────────────────┐ │  │
│  │ │ export default function Home() {     │  │  │
│  │ │   return <main>Hello</main>     [Copy]  │  │
│  │ └──────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│ ┌───────────────────────────────────────┬──────┐ │
│ │ Ask the orchestrator anything...       │ Send │ │
│ └───────────────────────────────────────┴──────┘ │
└──────────────────────────────────────────────────┘
```

**Rendering stack (all from @snapfzz/shared):**

| Component | Shared Pretext Component | What It Does |
|---|---|---|
| Message thread | `PretextList` | Binary search O(log n), exact heights, contain:strict, smooth followOutput |
| Message bubble | `PretextBubble` | contentVisibility:auto, variant styles (user/assistant) |
| Text content | `PretextMarkdown` | Markdown: headings, code blocks, lists, inline formatting |
| Composer | `PretextInput` | Auto-resize via Pretext line count, ⌘+Enter submit |

**ContentBlock rendering map:**

| ContentBlock | Component | Rendering |
|---|---|---|
| `TextBlock` | `PretextMarkdown` | Markdown with code blocks (copy button, monospace) |
| `ThinkingBlock` | `ThinkingCallout` | Collapsible muted callout with 💭 |
| `ToolUseBlock` | `ToolUseCard` | Tool name + input preview, spinner → ✓ done |
| `ToolResultBlock` | `ToolResultInline` | Inline result under tool card |
| `ImageBlock` | `ImageContent` | Rendered image |
| `AudioBlock` | `AudioPlayer` | Inline player |
| `VideoBlock` | `VideoPlayer` | Inline player |

---

## Rust Bridge Commands

Every command gated by Budget Registry before execution.

```typescript
ctx.rust.invoke('send_message', { text: string, sessionId: string })
  // Registry: try_acquire("plugin.chat", NetworkOp) → gate
  // Rust: POST to AgentScope Runtime /process → SSE stream
  // Rust: 16ms batch → Channel<ContentBlockBatch> back to plugin

ctx.rust.invoke('stop_generation', { sessionId: string })
  // Registry: try_acquire("plugin.chat", NetworkOp) → gate

ctx.rust.invoke('create_session', { templateId?: string })
  → { sessionId: string }

ctx.rust.invoke('load_session', { sessionId: string })
  → { messages: Msg[] }

ctx.rust.invoke('agent_health')
  → { status: 'connected' | 'reconnecting' | 'disconnected' }
```

---

## File Structure

```
plugins/orchestrator/
├── SPEC.md
├── manifest.json                    # Plugin manifest — id, runtimes, main
├── package.json                     # deps: @snapfzz/plugin-sdk, @snapfzz/shared
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
│
├── src/                             # TypeScript — Zone 3 (browser)
│   ├── index.ts                     # definePlugin() — contributions + activate()
│   ├── contributions/
│   │   ├── ChatPanel.tsx            # PretextList + PretextBubble + PretextInput
│   │   ├── ConnectionStatus.tsx     # reads agent_health
│   │   └── TokenCounter.tsx         # accumulated token count
│   ├── components/
│   │   ├── ThinkingCallout.tsx
│   │   ├── ToolUseCard.tsx
│   │   ├── ToolResultInline.tsx
│   │   ├── ImageContent.tsx
│   │   ├── AudioPlayer.tsx
│   │   ├── VideoPlayer.tsx
│   │   ├── ThinkingIndicator.tsx
│   │   └── ScrollPill.tsx
│   ├── hooks/
│   │   └── use-chat.ts              # State: Msg[], send(), stop(), streaming
│   └── types.ts                     # Frontend mirror of Msg + ContentBlock
│
├── dist/                            # Built TypeScript bundle (output of vite build)
│   ├── index.js
│   ├── ChatPanel-*.js
│   ├── ConnectionStatus-*.js
│   ├── TokenCounter-*.js
│   └── use-chat-*.js
│
├── intelligence/                    # Python intelligence package — Zone 1
│   ├── agent/                       # ReAct agent loop, hooks
│   ├── config/                      # Configuration models
│   ├── memory/                      # PostgresMemory, agent_md, remelight
│   ├── mission/                     # Handler, prompts, runner, state
│   ├── security/                    # File guard, skill scanner, tool guard
│   ├── src/orchestrator/            # CLI entry: app.py, cli.py
│   ├── tools/                       # File I/O, shell, browser, media, agent ops
│   ├── pyproject.toml               # Package — exposes `orchestrator` binary
│   └── requirements.txt
│
├── runtime/                         # Populated at install time by install_plugin_runtime
│   └── bin/
│       └── orchestrator             # Binary copied from venv/bin/orchestrator
│
├── pack/                            # Declarative agent configuration
│   ├── pack.yaml                    # Agent config (id: snapfzz.orchestrator)
│   └── prompts/
│       ├── system.md                # System prompt
│       └── contexts/                # Context-specific prompt fragments
│
└── __tests__/
```

### Runtime Lifecycle

```
Plugin host calls:
  1. install_system_plugin("snapfzz.orchestrator")
     → dev: creates ~/.snapfzz/plugins/snapfzz.orchestrator → plugins/orchestrator (symlink)
     → prod: copies bundle from app resources

  2. install_plugin_runtime(declaration)
     → uv pip install --editable ~/.snapfzz/plugins/snapfzz.orchestrator/intelligence/
     → cp venv/bin/orchestrator → ~/.snapfzz/plugins/snapfzz.orchestrator/runtime/bin/orchestrator

  3. register_plugin_runtime(declaration)
     → Creates PluginProcessFactory, registers in ProcessFactoryRegistry

  4. spawn_plugin_runtime("chat.orchestrator")
     → PluginProcessFactory checks runtime/bin/orchestrator exists (can_start)
     → Spawns: runtime/bin/orchestrator app --host 127.0.0.1 --port {dynamic}
     → Health check loop begins at /health every 2s
```

---

## Exit Criteria

- [ ] `cargo tauri dev` opens project window with Chat tab
- [ ] Type message → ⌘+Enter → AgentScope Runtime orchestrator streams response
- [ ] All 7 ContentBlock types render correctly
- [ ] Streaming at 60fps — no frame drops (measured by FPS counter + PerformanceObserver)
- [ ] PretextList virtualizes with exact heights (no scroll jumps)
- [ ] PretextInput auto-resizes via Pretext (no DOM measurement)
- [ ] Auto-scroll follows output, pauses on user scroll-up
- [ ] Budget: send_message gated by try_acquire — verified with logging
- [ ] Budget: plugin crash → 3 strikes → auto-disable — verified with test
- [ ] Connection status reflects AgentScope Runtime health
- [ ] Dark/light theme works (CSS variables, bundled fonts)
- [ ] Plugin crash → ErrorBoundary → host.reportCrash() → budget.record(Strike)
- [ ] All existing tests pass + new chat plugin tests pass
