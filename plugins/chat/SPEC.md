---
title: "Chat Plugin — Text Conversation Channel for AgentScope"
type: spec
date: 2026-04-04
traces: [A001, A002, A003, A005, A006, A008, U009, MILESTONES/Alpha]
---

# Chat Plugin

The text conversation channel. Renders AgentScope's `Msg` and `ContentBlock` types as a ChatGPT-quality chat interface. The first plugin — proves the entire architecture works.

---

## Budget Registration (A008)

```
class: "plugin.chat"
zone: zone3 (render only)

Controlled resources:
  reliability: 3 strikes, 300s window → auto-disable
  network: max 2 concurrent ctx.rust.invoke() calls
  frame: metered via PerformanceObserver (16ms target)

Capabilities declared:
  rust.invoke, rust.listen, bus.emit, commands.register,
  settings.read, storage.read, logger

Does NOT acquire:
  CpuPermit — Zone 3 only, no compute
  Memory — AgentScope owns agent memory
  Storage — AgentScope Session owns persistence
```

### Budget × Zone × User Map

| Action | User | Zone | Budget | Registry Role |
|---|---|---|---|---|
| Render message thread | plugin.chat | Zone 3 | Frame (16ms) | Meter |
| Composer auto-resize | plugin.chat | Zone 3 | Frame (16ms) | Meter (Pretext arithmetic) |
| Send message to Rust | plugin.chat | Zone 3→1 | Network | Gate (try_acquire) |
| Parse SSE from AgentScope | stream-pipeline | Zone 1 | CPU | Gate (CpuPermit) |
| Batch tokens at 16ms | stream-pipeline | Zone 1 | Network | Rate limiter |
| AgentScope LLM call | agentscope | External | Memory | Supervisor (RSS check) |
| AgentScope health | agentscope | External | Reliability | Supervisor (health poll) |
| Plugin crash | plugin.chat | Zone 3 | Reliability | Gate (3 strikes → deny) |
| Height calculation | plugin.chat | Zone 3 | Frame | None (arithmetic, zero cost) |

---

## What This Plugin IS

A **rendering channel** for AgentScope's agent conversation. It:

- Renders the `Msg` stream from AgentScope (text, thinking, tool_use, tool_result, image, audio, video)
- Provides user input to AgentScope's `UserAgent` via the Rust bridge
- Displays streaming tokens at 60fps
- Persists nothing — AgentScope Session handles persistence

## What This Plugin IS NOT

- NOT an LLM gateway (AgentScope routes LLM calls)
- NOT a session manager (AgentScope Session handles persistence)
- NOT a message store (AgentScope Memory owns conversation state)
- NOT an agent orchestrator (AgentScope Pipelines coordinate agents)

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

The chat plugin renders ALL of these. A `Msg` with `content: ContentBlock[]` renders each block in sequence — text, then a thinking callout, then a tool call card, then the tool result, then more text.

---

## Architecture Resonance

```
User types message, hits ⌘+Enter
  │
  ▼  Zone 3 — Main thread (A002)
  Chat plugin calls ctx.rust.invoke('send_message', {text, sessionId})
  │
  ▼  Rust bridge (A005 — PluginContext.rust)
  Tauri command → HTTP POST to AgentScope localhost:8000/chat
  │
  ▼  Intelligence layer (AgentScope)
  SnapfzzUserInput feeds UserAgent → Pipeline → LLM → Tools → Memory
  AgentScope streams Msg with ContentBlocks back as SSE
  │
  ▼  Zone 1 — Rust (A002)
  snapfzz-stream-pipeline: consume SSE, parse ContentBlocks, 16ms batch
  Tauri Channel API pushes batches to frontend (< 8KB = direct eval)
  │
  ▼  Zone 3 — Main thread receives pre-parsed batch (A002)
  Chat plugin renders Msg: text → markdown, thinking → callout,
  tool_use → card, tool_result → inline result, image → rendered
  react-virtuoso, contain: content, 60fps (A001)
  │
  ▼  User sees streaming response
```

| Spec | What Chat Proves |
|---|---|
| A001 | 60fps streaming, `contain: content`, react-virtuoso, GPU-only animations |
| A002 | Zone 1 (Rust SSE parse + batch), Zone 3 (render only) |
| A003 | < 200ms shell, chat input active < 500ms |
| A005 | Plugin registers leftPanelTab, uses ctx.rust bridge, crash isolation |
| A006 | Boot: skeleton → host → discover → activate → chat tab renders |
| U009 | Zinc theme, dark/light, Inter, Ant components |

---

## Plugin Manifest

```typescript
import { definePlugin } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.chat',
  name: 'Chat',
  version: '0.1.0',
  description: 'Text conversation channel for AgentScope agents',
  surface: ['project'],
  activationEvents: ['onStartupFinished'],

  contributes: {
    leftPanelTabs: [{
      id: 'chat',
      label: 'Chat',
      icon: '💬',
      component: () => import('./contributions/ChatPanel'),
    }],
    statusItems: [{
      id: 'chat.connection',
      position: 'left',
      component: () => import('./contributions/ConnectionStatus'),
    }, {
      id: 'chat.tokens',
      position: 'right',
      component: () => import('./contributions/TokenCounter'),
    }],
    commands: [
      { id: 'chat.send', title: 'Send Message' },
      { id: 'chat.stop', title: 'Stop Generation' },
      { id: 'chat.clear', title: 'Clear Conversation' },
    ],
    shortcuts: [
      { command: 'chat.send', key: '⌘+Enter' },
      { command: 'chat.stop', key: 'Escape' },
    ],
  },

  async activate(ctx) {
    // Register command handlers
    ctx.commands.register('chat.send', async (args) => {
      // ctx.rust.invoke('send_message', ...) → AgentScope
    });

    ctx.commands.register('chat.stop', async () => {
      // ctx.rust.invoke('stop_generation', ...) → abort SSE stream
    });

    ctx.commands.register('chat.clear', async () => {
      // ctx.rust.invoke('create_session', ...) → new AgentScope session
    });

    return {
      deactivate: async () => {
        // Cleanup listeners
      },
    };
  },
});
```

---

## Components

### ChatPanel (leftPanelTab contribution)

The primary interface. Message thread + composer.

```
┌─ Chat ──────────────────────────────────────────┐
│                                                  │
│  ┌─ 🎯 Orchestrator ─────────────────────────┐  │
│  │ I've created the project structure.        │  │
│  │                                            │  │
│  │ ┌─ 💭 Thinking ─────────────────────────┐ │  │
│  │ │ I need to set up Next.js with App     │ │  │
│  │ │ Router and configure TypeScript...     │ │  │
│  │ └───────────────────────────────────────┘ │  │
│  │                                            │  │
│  │ ┌─ 🔧 write_file ──────────────────────┐ │  │
│  │ │ app/page.tsx                          │ │  │
│  │ │ ✓ Created (24 lines)                 │ │  │
│  │ └──────────────────────────────────────┘ │  │
│  │                                            │  │
│  │ ┌─ app/page.tsx ────────────────────────┐ │  │
│  │ │ export default function Home() {     │  │  │
│  │ │   return <main>Hello</main>          │  │  │
│  │ │ }                               [Copy]  │  │
│  │ └──────────────────────────────────────┘ │  │
│  │                                  10:35 AM │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│ ┌───────────────────────────────────────┬──────┐ │
│ │ Ask the orchestrator anything...       │ Send │ │
│ │                                       │  ⌘↵  │ │
│ └───────────────────────────────────────┴──────┘ │
└──────────────────────────────────────────────────┘
```

**ContentBlock rendering map:**

| ContentBlock | Component | Rendering |
|---|---|---|
| `TextBlock` | `TextContent` | Markdown: headings, lists, bold, italic, links, inline code |
| `ThinkingBlock` | `ThinkingCallout` | Collapsible callout with 💭 icon, muted text |
| `ToolUseBlock` | `ToolUseCard` | Tool name + input preview, status indicator (running/done/error) |
| `ToolResultBlock` | `ToolResultInline` | Inline result under the tool card, expandable |
| `ImageBlock` | `ImageContent` | Rendered image with lightbox on click |
| `AudioBlock` | `AudioPlayer` | Inline audio player |
| `VideoBlock` | `VideoPlayer` | Inline video player |

**Message thread:**
- `react-virtuoso` with `followOutput="smooth"` (A001)
- `contain: content` on panel container (A001)
- `content-visibility: auto` on off-screen messages (A001)
- Variable-height messages (ContentBlocks vary per message)
- Scroll up → auto-scroll pauses → "↓ New messages" pill
- Grouped by sender — consecutive messages from same agent collapse

**Streaming:**
- Tokens arrive as batched ContentBlocks from Rust Channel API (A002 Zone 1)
- Append to current Msg.content array
- Each ContentBlock type renders incrementally
- TextBlock: markdown rendered progressively (not full re-parse per batch)
- ThinkingBlock: appears live, shows reasoning in real-time
- ToolUseBlock: appears when agent calls tool, shows spinner → result when ToolResultBlock arrives

**Composer:**
- Multiline textarea: Shift+Enter = newline, ⌘+Enter = send
- Auto-resize up to 6 lines, then scroll
- During streaming: Send becomes Stop button
- Placeholder: "Ask the orchestrator anything..."
- Focus on mount

**Thinking indicator:**
- `● ● ●` animated dots with `Thinking...`
- Appears on send, replaced by first ContentBlock
- GPU-only animation (opacity pulse, A001)

### ConnectionStatus (statusItem, left)

```
● Connected    or    ○ Reconnecting...
```

Reads AgentScope health via `ctx.rust.invoke('agent_health')`.

### TokenCounter (statusItem, right)

```
1,247 tokens
```

Accumulated from Msg metadata (AgentScope tracks token usage per invocation).

---

## File Structure

```
plugins/chat/
├── SPEC.md                          # This file
├── package.json                     # deps: @snapfzz/plugin-sdk, react-virtuoso
├── tsconfig.json
│
├── src/
│   ├── index.ts                     # definePlugin() — manifest + activate()
│   │
│   ├── contributions/               # Declared in manifest, lazy-loaded by shell
│   │   ├── ChatPanel.tsx            # leftPanelTab — thread + composer
│   │   ├── ConnectionStatus.tsx     # statusItem (left)
│   │   └── TokenCounter.tsx         # statusItem (right)
│   │
│   ├── components/                  # Internal UI — renders AgentScope types
│   │   ├── MessageBubble.tsx        # Renders one Msg — dispatches to content renderers
│   │   ├── TextContent.tsx          # TextBlock → markdown
│   │   ├── ThinkingCallout.tsx      # ThinkingBlock → collapsible callout
│   │   ├── ToolUseCard.tsx          # ToolUseBlock → tool call card with status
│   │   ├── ToolResultInline.tsx     # ToolResultBlock → inline result
│   │   ├── ImageContent.tsx         # ImageBlock → rendered image
│   │   ├── AudioPlayer.tsx          # AudioBlock → audio player
│   │   ├── VideoPlayer.tsx          # VideoBlock → video player
│   │   ├── CodeBlock.tsx            # Code in TextBlock markdown → syntax highlight + copy
│   │   ├── Composer.tsx             # Input textarea + send/stop button
│   │   ├── ThinkingIndicator.tsx    # ● ● ● streaming indicator
│   │   └── ScrollPill.tsx           # "↓ New messages" floating pill
│   │
│   ├── hooks/
│   │   └── use-chat.ts             # State: Msg[], send(), stop(), streaming status
│   │
│   └── types.ts                     # Frontend mirror of AgentScope Msg + ContentBlock types
│
└── __tests__/
    ├── index.test.ts                # Manifest validates, activate returns handle
    ├── ChatPanel.test.tsx           # Renders messages, handles streaming
    ├── MessageBubble.test.tsx       # Dispatches ContentBlocks to correct renderers
    ├── Composer.test.tsx            # Send, stop, multiline, shortcuts
    └── use-chat.test.ts            # State transitions, message append, streaming
```

---

## Rust Bridge Commands (what chat plugin calls)

```typescript
// Send user message → AgentScope UserAgent → pipeline → SSE stream back
ctx.rust.invoke('send_message', { text: string, sessionId: string })
  → Channel<ContentBlockBatch> (streaming response)

// Stop current generation
ctx.rust.invoke('stop_generation', { sessionId: string })
  → void

// Create new session
ctx.rust.invoke('create_session', { templateId?: string })
  → { sessionId: string }

// Load existing session
ctx.rust.invoke('load_session', { sessionId: string })
  → { messages: Msg[] }

// Check AgentScope health
ctx.rust.invoke('agent_health')
  → { status: 'connected' | 'reconnecting' | 'disconnected' }
```

These commands are implemented in Rust, which proxies to AgentScope's HTTP API. The chat plugin doesn't know about AgentScope — it only knows the Rust bridge.

---

## Ugly vs Production — Interface Parity

| Component | Ugly (now) | Production (later) | Plugin interface changes? |
|---|---|---|---|
| AgentScope server | Inline FastAPI | Structured `intelligence/` project | No — same HTTP/SSE API |
| SSE consumer | Inline in `main.rs` | `snapfzz-stream-pipeline` crate | No — same `Channel<ContentBlockBatch>` |
| Agent supervisor | Inline `Command::new("uv")` | `snapfzz-agent-supervisor` crate | No — same health check |
| Plugin discovery | Hardcoded in `discoverPlugins()` | Rust reads `.snapfzz/plugins/` | No — same `DiscoveredManifest[]` |
| State management | Direct `useState` | `use-workerized-reducer` (Zone 2) | No — same state shape |
| Syntax highlighting | Inline `shiki` import | Comlink + HighlightWorker | No — same API |
| Session persistence | AgentScope JsonSession | AgentScope Redis/TableStore Session | No — chat plugin doesn't manage sessions |

---

## Build Tasks

```
T1: Intelligence — AgentScope server + SnapfzzUserInput + orchestrator agent
    Files: intelligence/pyproject.toml, intelligence/server.py, intelligence/input/snapfzz_input.py, intelligence/agents/orchestrator.py
    Proves: AgentScope runs, user input → agent → SSE stream
    Parallel: yes
    Review: R1

T2: Rust — main.rs with Tauri commands + uv supervisor + SSE consumer
    Files: src-tauri/src/main.rs, src-tauri/Cargo.toml
    Proves: Zone 1 works, uv starts AgentScope, Channel API pipes ContentBlocks
    Parallel: yes
    Review: R2

T3: Chat plugin — manifest + all components (renders all ContentBlock types)
    Files: plugins/chat/src/*, plugins/chat/package.json
    Proves: Plugin registers contributions, renders AgentScope Msg types, streaming UI
    Parallel: yes (mock ctx.rust for development)
    Review: R3

T4: Wire integration — discovery returns chat manifest, full loop live
    Files: frontend/packages/plugin-host/src/plugin-discovery.ts
    Proves: boot → discover → activate → AgentScope → stream → render at 60fps
    Depends: T1 + T2 + T3
    Review: R4
```

---

## Exit Criteria

- [ ] `cargo tauri dev` opens project window with Chat tab in left panel
- [ ] Type message → ⌘+Enter → AgentScope orchestrator processes → streams response
- [ ] TextBlock renders as markdown with code blocks + copy button
- [ ] ThinkingBlock renders as collapsible callout
- [ ] ToolUseBlock shows tool name + input, spinner during execution
- [ ] ToolResultBlock shows inline result under tool card
- [ ] Streaming at 60fps (no frame drops during token rendering)
- [ ] Auto-scroll follows output, pauses on user scroll-up
- [ ] Connection status in status bar reflects AgentScope health
- [ ] Token count accumulates in status bar
- [ ] Dark/light theme works on all chat components
- [ ] Plugin crash → ErrorBoundary catches → host.reportCrash()
- [ ] All existing 61 tests pass + new chat plugin tests pass
