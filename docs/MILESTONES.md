# Release Milestones

Three releases. Each is shippable. Each builds on the last.

```
Alpha:   Single agent. Clean chat. Build a project.
Beta:    Multi agent. Team coordination. Agent network.
V1:      Workflow. Ship button. Eval. Memory. The full promise.
```

---

## Non-Negotiable — Every Release

These apply to Alpha, Beta, and V1. Not deferred. Not "good enough for now."

### Performance (A001)

- 60fps. No frame drops during scroll, resize, or streaming.
- GPU-only animations (`transform`, `opacity`). Never layout properties.
- `contain: strict` on independent panels.
- `react-resizable-panels` for splits. CSS flexbox, zero JS pixel math.
- No main-thread compute during render.

### State Zones (A002)

- Zone 1 (Rust): SSE parsing, token batching (16ms frame budget), file watching.
- Zone 2 (Worker-safe): State mutations, plugin lifecycle. No `window`/`document`/`localStorage`.
- Zone 3 (Main): React rendering. Nothing else.
- Violation = bug. Enforced by test.

### Instant Loading (A003)

- < 200ms to visible shell.
- < 500ms to interactive chat input.
- Static skeleton at 0ms (HTML, not React).
- `requestIdleCallback` for background preload.
- Measured on every boot: LCP, TTI, long tasks.

### Plugin Architecture (A005)

- Core is infrastructure. Features are plugins.
- System plugins = third-party plugins. Same API.
- Crash isolation: ErrorBoundary → reportCrash → 3-strike auto-disable → Retry.
- Activation events gate when plugins load.

### Design System (U009)

- Ant Design 5 + shadcn zinc aesthetic.
- Inter (400/500/600/700) + JetBrains Mono.
- Dark/light. System preference. Manual toggle. No flash.
- Component overrides: Button, Input, Card, Tabs.

### Quality Floor

- No `// TODO` / `// FIXME` / `// HACK` in code.
- Every test traces to a spec.
- Every architectural decision has an inline spec comment.
- TRACEABILITY.md updated with every change.
- 0 type errors. All tests pass.

---

## Alpha — Single Agent Chat

**The experience:** Open app → type your idea → agent interviews you, writes specs, writes code, shows preview. One conversation. One agent. Clean interface.

**The bar:** The chat must feel as good as Claude.ai. Streaming tokens, markdown rendering, code blocks with copy, smooth auto-scroll, instant send. No jank.

### What the user sees

```
LAUNCHER                           PROJECT
┌──────────────────────┐           ┌─────────────────────────────────┐
│ ⚡ Snapfzz            │           │ Project Name                    │
│                      │           ├────────┬────────────────────────┤
│ What do you want     │           │        │                        │
│ to build?            │   ──►     │  Chat  │  [ KB | Code | 👁 ]   │
│                      │           │        │                        │
│ [░░░░░░░░░] [Start]  │           │        │                        │
│                      │           ├────────┴────────────────────────┤
│ Recent projects...   │           │ Status                          │
└──────────────────────┘           └─────────────────────────────────┘
```

### Launcher Window

| Feature | Included | Deferred |
|---|---|---|
| Splash → fade → launcher | ✓ | |
| Idea input + [Start] | ✓ | |
| Recent project list (name + last opened + stage) | ✓ | |
| [Open] / [Resume] → project window | ✓ | |
| Settings panel (LLM config, API key, theme) | ✓ | |
| Empty state (first launch) | ✓ | |
| Status bar (connection status, model name) | ✓ | |
| Search/filter | | Beta |
| Templates (SaaS, Landing, API...) | | Beta |
| Card states (Live/Building/Paused/Error) | | Beta |
| Card metrics (revenue, health, progress) | | Beta |
| Context menu [···] | | Beta |
| Eval panel [📊] | | V1 |
| Memory panel [🧠] | | V1 |
| Keyboard shortcuts | | Beta |

### Project Window — Chat-First Layout

Left panel is the conversation. Right panel shows the agent's work. Right panel is optional — collapses when chat is the focus.

| Feature | Included | Deferred |
|---|---|---|
| **Chat** | | |
| Message thread (user + agent) | ✓ | |
| Streaming token display (SSE, 16ms batched) | ✓ | |
| Markdown rendering (headings, lists, bold, italic, links) | ✓ | |
| Code blocks with syntax highlighting + copy button | ✓ | |
| Auto-scroll during streaming, pause on user scroll-up | ✓ | |
| Composer input (multiline, shift+enter, ⌘+enter send) | ✓ | |
| Thinking/reasoning indicator | ✓ | |
| Message timestamps | ✓ | |
| Session persistence (close → reopen → conversation intact) | ✓ | |
| **Right Panel** | | |
| Tab bar: KB / Code / Preview | ✓ | |
| Knowledge Base: document tree + markdown viewer | ✓ | |
| Code: file explorer + Monaco editor (read/write) | ✓ | |
| Preview: single viewport, live dev server | ✓ | |
| Console panel (errors + warnings from preview) | ✓ | |
| Right panel collapse/expand toggle | ✓ | |
| **Status Bar** | | |
| Connection status (● Connected / ○ Disconnected) | ✓ | |
| Model name | ✓ | |
| Token count (session) | ✓ | |
| **Deferred** | | |
| Team tab | | Beta |
| Agent Network bottom panel | | Beta |
| Deployments / Identities / Compliance tabs | | Beta |
| Triple viewport preview | | Beta |
| Quality gate | | V1 |
| Mini apps | | Beta |
| Keyboard shortcuts (⌘+1-3, ⌘+B, etc.) | | Beta |
| Git sub-views (diff, log, branches, blame) | | Beta |

### Chat UX — The Details

The chat IS the product. These details matter.

**Message rendering:**
```
┌─ 🎯 Orchestrator ──────────────────────────────────┐
│                                                      │
│  I've created the initial project structure.         │
│  Here's what I set up:                               │
│                                                      │
│  ┌─ app/page.tsx ──────────────────────┐            │
│  │ export default function Home() {    │ [Copy]     │
│  │   return <main>Hello</main>         │            │
│  │ }                                   │            │
│  └─────────────────────────────────────┘            │
│                                                      │
│  The preview is running at localhost:3000.           │
│  Check the **Preview** tab →                         │
│                                                      │
│                                          10:35 AM    │
└──────────────────────────────────────────────────────┘
```

**Streaming behavior:**
- Tokens arrive via SSE from LLM gateway.
- Rust (Zone 1) parses SSE, batches at 16ms intervals.
- Frontend receives pre-parsed batches, appends to message.
- Markdown rendered incrementally (not re-parse entire message each token).
- Auto-scroll pins to bottom during streaming.
- User scrolls up → auto-scroll pauses → "↓ New messages" pill appears.
- User clicks pill or scrolls to bottom → auto-scroll resumes.

**Composer:**
```
┌──────────────────────────────────────────┬────────┐
│ Ask the orchestrator anything...          │  Send  │
│                                          │   ⌘↵   │
└──────────────────────────────────────────┴────────┘
```
- Multiline: Shift+Enter for newline, ⌘+Enter or click Send to submit.
- Auto-resize up to 6 lines, then scroll.
- Disabled during streaming (or allow interrupt with Stop button).
- Empty state: placeholder text. Focus on mount.

**Thinking indicator:**
```
┌─ 🎯 Orchestrator ──────────────────────┐
│  ● ● ●  Thinking...                     │
└──────────────────────────────────────────┘
```
Animated dots. Appears immediately on send. Replaced by first token.

### Backend — Rust Core (Alpha)

The backend must be production-grade from day 1. Not stubs.

| Component | What It Does | Spec |
|---|---|---|
| `snapfzz-kernel` | Boot, budget, process management, settings, shared types. | A008, A012, A014 |
| `snapfzz-stream` | SSE consumer from AgentScope Runtime. Token batching. Channel API to frontend. | A001, A002 |
| `snapfzz-vault` | AES-256-GCM encrypted secret storage. Master key in OS keychain. | A011 |
| `main.rs` | Orchestrator: Tauri commands, window management, event emission, process spawning. | A006, A014 |
| `intelligence/app.py` | AgentScope Runtime AgentApp — ~50 lines configuring agents, tools, memory. | — |

**SSE streaming pipeline (critical path):**
```
AgentScope Runtime (localhost:8090/process)
    ↓ SSE stream (sequence-numbered events)
Rust: reqwest SSE consumer
    ↓ parse events, extract content blocks
Rust: 16ms batcher (frame-budget coalescing)
    ↓ Tauri Channel API
Frontend: append to message, render
    ↓
User sees streaming text at 60fps
```

**Session persistence: handled by AgentScope Runtime Session Service** (Redis/JSON/Tablestore backends). No custom persistence code needed.

### Alpha — What We Build (Ordered)

| # | Work | Depends On | Spec |
|---|---|---|---|
| 1 | `snapfzz-kernel`: boot + budget + process + settings | — | A008, A012, A014 |
| 2 | `snapfzz-stream`: SSE consumer + token batcher + Channel | — | A001, A002 |
| 3 | `main.rs`: orchestrator — wire crates, register commands, create windows | 1, 2 | A006, A014 |
| 4 | Chat plugin: message thread, streaming, markdown, composer | 3 | U006-alpha |
| 5 | KB plugin: document tree + markdown viewer | 3 | U006-alpha |
| 6 | Code plugin: file explorer + Monaco editor | 3 | U006-alpha |
| 7 | Preview plugin: single viewport + console capture | 3 | U007-alpha |
| 8 | Launcher plugin: idea input + project list + settings | 3 | U005-alpha |
| 9 | Session persistence: `.snapfzz/` + chat.jsonl | 4 | A004 |
| 10 | U009 polish: Ant overrides, typography tokens, Monaco theme | 4-8 | U009 |

**Items 1-3 are Rust. Items 4-10 are frontend plugins. All built on the plugin-host skeleton that's already done.**

### Alpha Exit Criteria

- [ ] User opens app → launcher in < 200ms
- [ ] User types idea → project window opens → chat starts
- [ ] Agent streams response at 60fps (no frame drops during token rendering)
- [ ] Agent creates files → visible in Code tab
- [ ] Agent writes to KB → visible in KB tab
- [ ] Preview shows running app from BoxLite :3000
- [ ] Close app → reopen → conversation + project state intact
- [ ] Dark/light theme works, no flash
- [ ] 0 type errors, all tests pass, TRACEABILITY.md current

---

## Beta — Multi Agent Team

**The experience:** Orchestrator delegates. You see the team. Agents coordinate visibly. The project has a brain, not just a chatbot.

### Additive to Alpha

| Feature | Spec |
|---|---|
| Team tab (agent list + status + 1:1 chat drill-in) | U006 |
| Agent Network bottom panel (MsgHub log + @agent commands) | U006 |
| Full agent journey: Clarify → Specs → Discover → Rate → Build → Ship | U004 |
| All 6 workspace tabs: KB / Code / Preview / Deploy / Identities / Compliance | U006 |
| Tab empty states per spec | U006 |
| Git sub-views: Files / Diff / Log / Branches / Blame | U010 |
| Triple viewport preview + responsive enforcement | U007 |
| Card states in launcher (Live/Building/Paused/Error) | U005 |
| Search + templates in launcher | U005 |
| Keyboard shortcuts (full set from U005 + U006) | U005, U006 |
| Tablet responsive breakpoint | U002 |
| Per-project hard eval (agent badges with scores) | U008 |
| Mini apps in generic tabs | U006 |
| Context menu on project cards | U005 |
| Agent commit labels in git log | U010 |

### Backend Additions

| Component | What It Does |
|---|---|
| AgentScope Runtime multi-agent templates | Multiple agents in pipeline, configured via YAML |
| AgentScope Runtime Sandbox Service | Browser, filesystem, GUI sandboxes for code execution |
| `snapfzz-kernel/plugin_host` | Plugin lifecycle management (activation, crash supervision) |
| `snapfzz-plugin-bridge` | Schema validation, capability checking |
| git2-rs integration | Log, diff, blame, branches — structured Rust data to frontend |

### Beta Exit Criteria

- [ ] Orchestrator delegates to specialist agents visible in Team tab
- [ ] Agent Network shows real-time MsgHub coordination
- [ ] Human can @-mention agents in Network panel
- [ ] All 6 workspace tabs functional with plugin content
- [ ] Git inspector shows commits, diffs, blame from git2-rs
- [ ] Triple viewport preview catches responsive issues
- [ ] Launcher cards show project stage and status
- [ ] Tablet layout works (panel toggle mode)
- [ ] Hard eval scores shown per agent

---

## V1 — Workflow (First Release)

**The experience:** Ship button works. Idea → live product with URL, payments, legal. Eval ensures quality. Memory accumulates across projects. The P3 moat is active.

### Additive to Beta

| Feature | Spec |
|---|---|
| Ship flow: deploy + legal + payments automation | U004 |
| Quality gate: 13/13 standards enforced before ship | U007, U003 |
| Eval dashboard in launcher (global agent scores) | U008 |
| LLM-as-judge eval (semantic quality grading) | U008 |
| Community benchmark database | U008 |
| Auto-benchmark extraction (approval/correction → test cases) | U008 |
| Memory panel in launcher (preferred stack, decisions, Telos) | U005 |
| Project card metrics (revenue, health, response time) | U005 |
| Full A004 workspace: snapshots, eval storage, memory sync | A004 |
| Mobile responsive breakpoint | U002 |
| All 13 quality standards with auto-validation + checkpoint | U003 |
| Cross-project benchmark accumulation (P3 moat) | U008 |

### Backend Additions

| Component | What It Does |
|---|---|
| Eval runner (hard + LLM-as-judge) | Per-change (5s), per-checkpoint (60s), full suite (2-5min) |
| Benchmark database client | Sync with api.snapfzz.com/benchmarks |
| Auto-extraction pipeline | Approval → positive case, correction → negative + positive |
| Memory persistence | `~/.snapfzz/memory/` cross-project accumulation |
| Deploy integrations | Vercel, Fly.io, Railway via agent-organized Deployments tab |

### V1 Exit Criteria

- [ ] User goes from idea → live URL + business entity + payment link
- [ ] Quality gate shows 13/13 standards, blocks ship on failure
- [ ] Eval dashboard tracks agent quality across projects
- [ ] LLM-as-judge grades semantic quality (not just pass/fail)
- [ ] Benchmark database grows with usage (P3 moat active)
- [ ] Memory panel shows accumulated context
- [ ] Mobile layout works
- [ ] Everything from Alpha + Beta still works perfectly
