---
title: "Plugin Architecture — System Plugins + User Plugins (Webhook)"
type: feat
date: 2026-04-02
source: "Oracle consultation + founder refinement"
updated: 2026-04-08
---

# Plugin Architecture

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Core is the bones. Everything else is a plugin.

## Design Principles

1. **Core is tiny.** Window management, plugin loader, event bus, bridge. No features.
2. **Two tiers.** System plugins (in-process, TypeScript) + User plugins (process-isolated, any language).
3. **System plugins = our features.** Chat, KB, Code, Preview, Settings — all system plugins using the same SDK.
4. **User plugins = webhooks.** Third-party plugins communicate via loopback HTTP. Process isolation. Language agnostic.
5. **Plugins provide everything.** Not just UI tabs — also mini apps, intelligence assets (agent skills, tools, eval benchmarks).
6. **Crash isolation.** System plugin crash → ErrorBoundary fallback. User plugin crash → process dies alone, core unaffected.
7. **Lazy everything.** < 500ms startup. Plugins load on demand.

---

## Two Plugin Tiers

| | System Plugins | User Plugins |
|---|---|---|
| **Who** | Snapfzz team | Third-party developers, marketplace |
| **Language** | TypeScript/React only | Any (Python, Go, Rust, Node, etc.) |
| **Isolation** | In-process, ErrorBoundary | Process-isolated, loopback webhook |
| **Communication** | EventBus + CommandBus (in-memory) | Incoming/outgoing webhooks (HTTP on 127.0.0.1) |
| **Latency** | ~0ms | <1ms (loopback) |
| **Trust** | Trusted (ships with app) | Untrusted (sandboxed, capability-gated) |
| **Crash impact** | ErrorBoundary catches, 3-strike disable | Process dies alone, core unaffected |
| **UI** | Direct React rendering | Mini app iframe OR webhook-only (headless) |
| **Install** | Built into app | Downloaded to ~/.snapfzz/plugins/{id}/ |
| **Security** | No capability checks (trusted) | HMAC signed webhooks, capability enforcement |

---

## What A Plugin Can Provide

| Contribution Type | Category | System | User |
|---|---|---|---|
| **Workspace Tab** | UI | Yes | Via mini app iframe |
| **Left Panel Tab** | UI | Yes | Via mini app iframe |
| **Bottom Panel Section** | UI | Yes | Via mini app iframe |
| **Status Bar Item** | UI | Yes | No |
| **Command** | UI | Yes | Via incoming webhook |
| **Keyboard Shortcut** | UI | Yes | No |
| **Settings Section** | UI | Yes | Via mini app iframe |
| **Mini App** | UI + Logic | Yes | Yes (primary UI for user plugins) |
| **Generic Component** | UI | Yes | No |
| **Agent Skill** | Intelligence | Yes | Yes (webhook handler) |
| **Agent Tool** | Intelligence | Yes | Yes (webhook handler) |
| **Eval Benchmark** | Intelligence | Yes | Yes (webhook handler) |
| **Eval Grader** | Intelligence | Yes | Yes (webhook handler) |
| **Deploy Target** | Intelligence | Yes | Yes (webhook handler) |
| **Identity Provider** | Intelligence | Yes | Yes (webhook handler) |
| **Compliance Template** | Intelligence | Yes | Yes (manifest-only) |
| **Incoming Webhook** | Communication | No (uses EventBus) | Yes |
| **Outgoing Webhook** | Communication | No (uses EventBus) | Yes |

---

## System Plugin Manifest

System plugins use the TypeScript SDK — same as today:

```typescript
import { definePlugin } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.code',
  name: 'Code Editor',
  version: '1.0.0',
  description: 'Monaco editor, file explorer, git inspector',
  surface: ['project'],
  activationEvents: ['onViewVisible:code'],

  contributes: {
    workspaceTabs: [{
      id: 'code',
      label: 'Code',
      icon: 'FileOutlined',
      component: () => import('./CodePanel'),
    }],
    commands: [
      { id: 'code.openFile', title: 'Open File' },
      { id: 'code.diff', title: 'Show Diff' },
    ],
    agentTools: [{
      id: 'code.writeFile',
      name: 'Write File',
      schema: { path: 'string', content: 'string' },
      handler: () => import('./tools/writeFile'),
    }],
  },
});
```

### System Plugin Communication (In-Process)

```typescript
// EventBus — fire and forget
ctx.bus.emit('build.complete', { url: 'https://...' });
ctx.bus.on('build.complete', (payload) => { ... });

// CommandBus — request/response
ctx.commands.register('code.openFile', async (args) => { ... });
const result = await ctx.commands.execute('code.openFile', { path: 'src/main.rs' });

// ApiBroker — structured API sharing (Backstage-style)
ctx.apis.provide('identities', { getProvider, listProviders });
const identities = ctx.apis.get<IdentitiesAPI>('identities');
```

---

## User Plugin Manifest

User plugins use a JSON manifest. No TypeScript SDK required — any language.

```json
{
  "id": "community.supabase",
  "name": "Supabase Integration",
  "version": "0.1.0",
  "description": "Supabase database tools and schema expert",
  "author": "community",
  "license": "MIT",

  "runtime": {
    "command": "python server.py",
    "port": 0,
    "healthCheck": "/health",
    "language": "python",
    "requirements": ["supabase>=2.0"]
  },

  "capabilities": [
    "identity.write",
    "filesystem.read",
    "agent.invoke"
  ],

  "webhooks": {
    "incoming": [
      {
        "event": "agent.tool.call",
        "path": "/tools/query",
        "description": "Execute a Supabase query"
      },
      {
        "event": "agent.tool.call",
        "path": "/tools/schema",
        "description": "Get database schema"
      }
    ],
    "outgoing": [
      {
        "event": "supabase.migration.complete",
        "description": "Fired when a migration runs"
      }
    ]
  },

  "contributes": {
    "agentTools": [
      {
        "id": "supabase.query",
        "name": "Query Supabase",
        "description": "Execute a query against the database",
        "inputSchema": {
          "table": "string",
          "filter": "object",
          "select": "string"
        },
        "webhookPath": "/tools/query"
      }
    ],
    "agentSkills": [
      {
        "id": "supabase.schema-design",
        "name": "Supabase Schema Expert",
        "systemPrompt": "You are an expert in Supabase database design..."
      }
    ],
    "miniApps": [
      {
        "id": "supabase.dashboard",
        "name": "Supabase Dashboard",
        "source": "miniapps/dashboard.html"
      }
    ]
  }
}
```

---

## User Plugin Webhook Communication

### How It Works

```
Snapfzz Core                              User Plugin Process
(Rust + React)                             (any language, 127.0.0.1)
┌──────────────────────┐                   ┌──────────────────────┐
│                      │                   │                      │
│ 1. Agent needs tool  │                   │ HTTP server          │
│    "supabase.query"  │                   │ Listening on :PORT   │
│                      │   OUTGOING        │                      │
│ 2. POST /tools/query │──HTTP POST───────→│ 3. Receive request   │
│    127.0.0.1:{port}  │  HMAC signed      │    Verify HMAC       │
│    JSON payload      │                   │    Execute query      │
│                      │                   │                      │
│ 5. Parse response    │←─HTTP 200────────│ 4. Return result     │
│    Return to agent   │  JSON payload     │    JSON response     │
│                      │                   │                      │
│                      │   INCOMING        │                      │
│ 7. Route to EventBus │←─HTTP POST───────│ 6. Plugin fires event│
│    POST /hooks/{id}  │  127.0.0.1:CORE  │    "migration done"  │
│    Verify plugin key │                   │                      │
└──────────────────────┘                   └──────────────────────┘
```

### Webhook Security

```
Every outgoing webhook from Snapfzz includes:

Headers:
  X-Snapfzz-Signature: sha256=HMAC(secret, body)
  X-Snapfzz-Plugin-Id: community.supabase
  X-Snapfzz-Timestamp: 1712567890
  Content-Type: application/json

Plugin verifies:
  1. Compute HMAC(shared_secret, raw_body) with SHA-256
  2. Compare with X-Snapfzz-Signature
  3. Check timestamp within 5 minute window (replay protection)
  4. Reject if any check fails
```

```
Every incoming webhook TO Snapfzz includes:

Headers:
  X-Plugin-Key: {plugin_api_key}
  Content-Type: application/json

Snapfzz verifies:
  1. Plugin key matches registered plugin
  2. Event type is in plugin's declared outgoing webhooks
  3. Rate limit: max 100 requests/minute per plugin
  4. Payload size: max 1MB
```

### Webhook Payload Format

```json
{
  "event": "agent.tool.call",
  "timestamp": 1712567890,
  "requestId": "req_abc123",
  "data": {
    "toolId": "supabase.query",
    "input": {
      "table": "users",
      "filter": {"id": 123},
      "select": "id, name, email"
    }
  }
}
```

Response:
```json
{
  "requestId": "req_abc123",
  "status": "success",
  "data": {
    "rows": [{"id": 123, "name": "Alice", "email": "alice@example.com"}]
  }
}
```

Error:
```json
{
  "requestId": "req_abc123",
  "status": "error",
  "error": {
    "code": "QUERY_FAILED",
    "message": "Table 'users' not found"
  }
}
```

---

## User Plugin Lifecycle

### Process Management

User plugins are managed as child processes by snapfzz-runtime:

```
INSTALL → REGISTERED → STARTING → HEALTHY → RUNNING → STOPPING → STOPPED
                                     ↕
                                  UNHEALTHY → auto-restart (3 max)
                                                    ↓
                                                 DISABLED
```

```
Install:
  1. Validate manifest.json (Zod schema)
  2. Create ~/.snapfzz/plugins/{id}/
  3. Copy plugin files to dist/
  4. User approves capabilities
  5. Register with PluginHost

Start:
  1. Allocate random port (port 0 → OS assigns)
  2. Run: {runtime.command} with CWD = plugin dir
  3. Inject env: SNAPFZZ_PORT={allocated}, SNAPFZZ_PLUGIN_ID={id}, SNAPFZZ_WEBHOOK_SECRET={hmac_secret}
  4. Health check: GET {runtime.healthCheck} until 200
  5. Register webhook routes
  6. Status → RUNNING

Stop:
  1. SIGTERM to process group
  2. Wait 5s for graceful shutdown
  3. SIGKILL if still alive
  4. Deregister webhook routes
  5. Status → STOPPED
```

### Port Allocation

```rust
// Each user plugin gets a random port on loopback
fn allocate_plugin_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}
```

All plugin ports bound to `127.0.0.1` only — never exposed to network.

---

## Plugin Directory Structure

### System Plugins (in-app)

```
plugins/
├── orchestrator/           system plugin (TypeScript + Python runtime, snapfzz.orchestrator)
├── settings-general/       system plugin
├── settings-vault/         system plugin
└── ...
```

### User Plugins (installed)

```
~/.snapfzz/plugins/
├── community.supabase/
│   ├── manifest.json        validated on install (Zod)
│   ├── dist/                plugin code (read-only after install)
│   │   ├── server.py        HTTP server entrypoint
│   │   ├── tools/           tool handlers
│   │   └── miniapps/        mini app HTML files
│   ├── data/                plugin's namespaced storage
│   ├── cache/               temp files, expendable
│   └── permissions.json     granted capabilities
├── community.stripe/
│   ├── manifest.json
│   ├── dist/
│   │   ├── main.go          Go plugin
│   │   └── ...
│   └── ...
```

### Sandbox Rules

1. **CWD locked** to `~/.snapfzz/plugins/{id}/` — no escape
2. **Read-only bundle** — `dist/` immutable after install
3. **Namespaced storage** — `data/` scoped per plugin
4. **Network** — plugin can only reach 127.0.0.1 (Snapfzz core + own port)
5. **No vault access** — plugins manage their own secrets
6. **No system settings** — plugins get namespaced config only

---

## System Plugin Context API

System plugins receive `PluginContext` on activation:

```typescript
export interface PluginContext {
  bus: EventBus;
  commands: CommandRegistry;
  registry: ContributionRegistry;
  settings: SettingsRegistry;
  storage: PluginStorage;
  apis: ApiBroker;
  rust: RustBridge;
  surface: HostSurface;
  projectPath?: string;
  logger: Logger;
}
```

User plugins DON'T get PluginContext — they communicate via webhooks only.

---

## Intelligence Asset Contributions

Both system and user plugins can provide intelligence assets:

### Agent Skills

```json
{
  "agentSkills": [{
    "id": "supabase.schema-design",
    "name": "Supabase Schema Expert",
    "systemPrompt": "You are an expert in Supabase database design...",
    "targetAgents": ["orchestrator", "build-agent"]
  }]
}
```

### Agent Tools (User Plugin — webhook-backed)

```json
{
  "agentTools": [{
    "id": "supabase.query",
    "name": "Query Supabase",
    "inputSchema": { "table": "string", "filter": "object" },
    "webhookPath": "/tools/query"
  }]
}
```

When an agent calls this tool:
1. Snapfzz sends webhook POST to plugin's `/tools/query`
2. Plugin processes and returns result
3. Snapfzz returns result to agent

### Eval Benchmarks + Graders

```json
{
  "evalBenchmarks": [{
    "id": "supabase.rls-coverage",
    "name": "RLS Coverage Benchmark",
    "webhookPath": "/eval/rls-coverage"
  }]
}
```

### Deploy Targets

```json
{
  "deployTargets": [{
    "id": "supabase.deploy",
    "name": "Deploy to Supabase",
    "configSchema": { "projectRef": "string" },
    "handlers": {
      "deploy": "/deploy/push",
      "rollback": "/deploy/rollback",
      "healthCheck": "/deploy/health"
    }
  }]
}
```

---

## Capability Model

### System Plugins — No enforcement (trusted)

System plugins ship with the app. No capability checks needed.

### User Plugins — Approve once, enforce always

On install, user sees:
```
"Supabase Integration" requests:
  ✓ identity.write     — connect third-party accounts
  ✓ filesystem.read    — read project files
  ✗ vault.read         — BLOCKED (plugins cannot access vault)

[Approve] [Cancel]
```

Stored in `~/.snapfzz/plugins/{id}/permissions.json`.

### Capability → Webhook Mapping

| Capability | What Plugin Can Do | Enforcement |
|---|---|---|
| `agent.invoke` | Receive tool call webhooks | Core only sends if capability granted |
| `filesystem.read` | Request file contents via webhook | Core validates path scope |
| `filesystem.write` | Write files via webhook | Core validates path scope |
| `identity.read` | Request identity info via webhook | Core strips secrets |
| `identity.write` | Connect/disconnect providers | Requires user confirmation |
| `budget.read` | Request budget info | Read-only |

### Blocked (no plugin can ever do)

- Vault access (vault_store, vault_read, etc.)
- System settings (save_settings)
- Process management (spawn, kill, restart)
- Other plugin storage access

---

## Crash Supervision

### System Plugins

```
ErrorBoundary catches React error
  → increment crash count
  → if 3 crashes in 5 minutes → auto-disable, show notification
  → else → show fallback UI with [Retry] button
```

### User Plugins

```
Process health check fails
  → mark UNHEALTHY
  → attempt restart (max 3)
  → if 3 restarts fail → auto-disable
  → webhook routes deregistered
  → user notified
```

---

## Plugin Settings UI

The `settings-plugins` plugin shows all plugins:

```
PLUGINS                                    [Reload All]

SYSTEM PLUGINS
┌─────────────────────────────────────────────────────┐
│ Orchestrator                         ● Running      │
│ snapfzz.orchestrator v0.1.0                        │
│ [Reload]                                            │
├─────────────────────────────────────────────────────┤
│ Knowledge Base                       ◌ Lazy         │
│ snapfzz.knowledge-base v1.0.0                      │
│ Activates: onViewVisible:kb                        │
│ [Reload]                                            │
└─────────────────────────────────────────────────────┘

USER PLUGINS
┌─────────────────────────────────────────────────────┐
│ Supabase Integration                 ● Running      │
│ community.supabase v0.1.0           port: 54321    │
│ Language: Python  Health: OK                        │
│ [Disable] [Restart] [Uninstall]                     │
├─────────────────────────────────────────────────────┤
│ SOC2 Compliance                      ○ Disabled     │
│ community.soc2 v0.2.0                               │
│ [Enable] [Uninstall]                                │
└─────────────────────────────────────────────────────┘
```

---

## Activation Events (System Plugins Only)

```typescript
activationEvents: [
  'onStartupFinished',         // after core ready
  'onViewVisible:code',        // when tab first opened
  'onCommand:code.openFile',   // when command executed
  'onEvent:build.complete',    // when EventBus topic fires
  'onWorkspaceOpened',         // when project window opens
]
```

User plugins don't have activation events — they're either running or stopped.

---

## Mini App Sandbox

Both system and user plugins can provide mini apps. Mini apps run in iframes:

```html
<iframe
  sandbox="allow-scripts"
  src="..."
></iframe>
```

Communication: `postMessage` only with strict origin validation.

NOT allowed: `allow-same-origin`, `allow-forms`, `allow-popups`.

---

## Code Signature Verification (Beta)

Third-party plugin packages include detached Ed25519 signatures:

```
community.supabase/
  ├── dist/bundle.js.sig     Ed25519 signature
  ├── manifest.json.sig
```

On install: verify against Snapfzz registry public key + author public key.

---

## Security Summary

| Layer | Threat | System Plugins | User Plugins |
|---|---|---|---|
| Install | Malformed manifest | Zod validation | Zod validation |
| Runtime | Privilege escalation | Trusted (no checks) | Capability enforcement |
| Runtime | Secret theft | Vault blocked (by convention) | Vault commands blocked |
| Communication | Tampering | In-process (trusted) | HMAC signed webhooks |
| Communication | Replay attack | N/A | Timestamp window (5min) |
| Communication | Rate abuse | N/A | 100 req/min per plugin |
| Filesystem | Jail escape | Ships with app | CWD locked to plugin dir |
| Storage | Cross-plugin theft | Namespaced | Namespaced |
| Network | Data exfiltration | Unrestricted | 127.0.0.1 only (V1: CSP) |
| Process | Resource hogging | ErrorBoundary + 3-strike | Health check + 3-restart |
| Supply chain | Malicious code | Ships with app | Ed25519 signatures (Beta) |

---

## Core vs Plugin — Complete Mapping

### Core (Rust crates)

```
snapfzz-kernel/        Boot, budget, process, settings, components trait
snapfzz-packs/         Runtime lifecycle (LiteLLM, CEF — plugin runtimes managed via PluginProcessFactory)
snapfzz-kernel/        Boot, budget, process, settings
snapfzz-stream/        SSE consumer, token batching
snapfzz-vault/         AES-256-GCM secret vault
snapfzz-llm/           LiteLLM config + key/spend proxy
snapfzz-plugin-bridge/ Plugin→kernel validation, capability checking
snapfzz-stream/        SSE consumer, token batching
snapfzz-vault/         AES-256-GCM secret vault
snapfzz-llm/           LiteLLM config + key/spend proxy
snapfzz-plugin-bridge/ Plugin→kernel validation, capability checking
```

### Core (Frontend)

```
@snapfzz/plugin-sdk/    TS manifest types, definePlugin()
@snapfzz/plugin-host/   Plugin loader, bus, ContributionStore
@snapfzz/shared/        Theme, hooks, components, TauriBridge
@snapfzz/launcher/      Thin shell: launcher layout
@snapfzz/project/       Thin shell: project layout
@snapfzz/preferences/   Thin shell: settings layout
```

### System Plugins (TypeScript, in-process)

```
plugins/
├── chat/               Orchestrator conversation
├── knowledge-base/     Docs, versioning
├── code/               Monaco + file explorer + git
├── preview/            Live dev server + viewport
├── deployments/        Deploy targets + monitoring
├── identities/         Third-party connections
├── compliance/         Legal, tax, regulatory
├── agent-network/      Bottom panel message log
├── eval/               Eval dashboard + benchmarks
├── mini-app-runtime/   Iframe host for mini apps
├── settings-*/         9 settings plugins
└── test-plugin/        Test fixture
```

### User Plugins (any language, process-isolated)

```
~/.snapfzz/plugins/
├── community.supabase/     Python webhook server
├── community.stripe/       Go webhook server
├── community.custom-eval/  Node.js webhook server
└── ...
```

---

## Key Design Decisions

1. **Two tiers, not one.** System plugins are trusted (in-process). User plugins are untrusted (webhook-isolated). Different trust = different communication model.
2. **Webhooks over loopback.** User plugins communicate via HTTP on 127.0.0.1. Process isolation, language agnostic, auditable, HMAC signed.
3. **System plugins keep EventBus.** In-process communication for system plugins — fast, type-safe, zero overhead.
4. **Intelligence is a contribution type.** Skills, tools, benchmarks are first-class in both tiers.
5. **User plugins are processes.** Managed by snapfzz-runtime like AgentScope and LiteLLM. Health checks, restart, auto-disable.
6. **Manifest-driven.** Both tiers declare what they provide. Core reads manifests and builds the routing table.
7. **Mini apps for user plugin UI.** User plugins render via sandboxed iframes, not direct React.
8. **Capabilities gate access.** User plugins must declare what they need. Users approve once.
9. **HMAC signatures.** Every webhook is signed. Replay protection via timestamp window.
10. **Theme is core, not a plugin.** Available before plugins load. Plugins consume tokens via CSS variables.
