---
title: "Plugin Architecture — Core + System Plugins + Third-Party"
type: feat
date: 2026-04-02
source: "Oracle consultation + founder refinement"
---

# Plugin Architecture

Core is the bones. Everything else is a plugin. JS-only plugins (Worker-hosted). No Rust plugins — simplicity over power.

## Design Principles

1. **Core is tiny.** Window management, plugin loader, event bus, bridge. No features.
2. **System plugins = third-party plugins.** Same API. No shortcuts. If we can't build a feature as a plugin, the plugin API is wrong.
3. **JS-only plugins.** All plugins are TypeScript/React, hosted in Web Workers. No Rust plugin runtime. Rust is core-only.
4. **Plugins provide everything.** Not just UI tabs — also mini apps, generic components, intelligence assets (agent skills, tools, eval benchmarks).
5. **Bus-only communication.** Plugins never import from each other. EventBus + CommandBus + ApiBroker.
6. **Crash isolation.** Plugin crashes show fallback UI. Core never goes down.
7. **Lazy everything.** < 500ms startup. Plugins load on demand.

---

## What A Plugin Can Provide

| Contribution Type | Category | Example |
|---|---|---|
| **Workspace Tab** | UI | Knowledge Base tab, Code tab, Deployments tab |
| **Left Panel Tab** | UI | Chat tab, Team tab |
| **Bottom Panel Section** | UI | Agent Network panel |
| **Status Bar Item** | UI | Token counter, connection indicator |
| **Command** | UI | "Send message", "Deploy to Vercel", "Run eval" |
| **Keyboard Shortcut** | UI | ⌘+Enter to send, ⌘+1-6 for tabs |
| **Settings Section** | UI | LLM config, model routing |
| **Mini App** | UI + Logic | Revenue dashboard, tax calculator, architecture diagram |
| **Generic Component** | UI | Custom card type, custom list renderer, chart widget |
| **Agent Skill** | Intelligence | ClarifyAgent interview protocol, BuildAgent code patterns |
| **Agent Tool** | Intelligence | GitHub search tool, Stripe API tool, file writer tool |
| **Eval Benchmark** | Intelligence | Code quality benchmark, requirements completeness benchmark |
| **Eval Grader** | Intelligence | Custom OpenJudge grader for domain-specific quality |
| **Deploy Target** | Intelligence | Vercel adapter, Fly.io adapter, Railway adapter |
| **Identity Provider** | Intelligence | Stripe connector, GitHub connector, Cloudflare connector |
| **Compliance Template** | Intelligence | SG Pte. Ltd. checklist, GDPR checklist, SOC 2 checklist |

---

## Plugin Manifest

Every plugin declares what it provides via a manifest:

```typescript
// plugin.manifest.ts
import { definePlugin } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.code',
  name: 'Code Editor',
  version: '1.0.0',
  description: 'Monaco editor, file explorer, git inspector',
  
  // Which window(s) this plugin lives in
  surface: ['project'],
  
  // When to activate (lazy by default)
  activationEvents: [
    'onViewVisible:code',        // activate when Code tab is first opened
  ],
  
  // What this plugin depends on
  dependencies: {
    'snapfzz.mini-app-runtime': '^1.0',  // needs mini app host for quality report
  },
  
  // What this plugin provides
  contributes: {
    // UI contributions
    workspaceTabs: [{
      id: 'code',
      label: 'Code',
      icon: '📁',
      component: () => import('./CodePanel'),  // lazy React component
    }],
    commands: [
      { id: 'code.openFile', title: 'Open File' },
      { id: 'code.diff', title: 'Show Diff' },
      { id: 'code.blame', title: 'Show Blame' },
      { id: 'code.commit', title: 'Commit Changes' },
    ],
    shortcuts: [
      { command: 'code.openFile', key: '⌘+P' },
      { command: 'code.diff', key: '⌘+Shift+D' },
    ],
    settings: [{
      id: 'code.editor',
      label: 'Editor',
      schema: {
        fontSize: { type: 'number', default: 14 },
        tabSize: { type: 'number', default: 2 },
        wordWrap: { type: 'boolean', default: false },
      },
    }],
    statusItems: [{
      id: 'code.fileCount',
      position: 'right',
      component: () => import('./FileCountStatus'),
    }],
    
    // Intelligence contributions
    agentTools: [{
      id: 'code.writeFile',
      name: 'Write File',
      description: 'Write content to a file in the project',
      schema: { path: 'string', content: 'string' },
      handler: () => import('./tools/writeFile'),
    }, {
      id: 'code.readFile',
      name: 'Read File',
      description: 'Read a file from the project',
      schema: { path: 'string' },
      handler: () => import('./tools/readFile'),
    }],
  },
});
```

### Full Manifest Interface

```typescript
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  
  surface: ('launcher' | 'project')[];
  activationEvents: ActivationEvent[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  requiredCapabilities?: string[];
  
  contributes?: {
    // UI
    workspaceTabs?: TabContribution[];
    leftPanelTabs?: TabContribution[];
    bottomPanels?: PanelContribution[];
    statusItems?: StatusItemContribution[];
    commands?: CommandContribution[];
    shortcuts?: ShortcutContribution[];
    settings?: SettingsContribution[];
    genericComponents?: ComponentContribution[];
    
    // Intelligence
    agentSkills?: SkillContribution[];
    agentTools?: ToolContribution[];
    evalBenchmarks?: BenchmarkContribution[];
    evalGraders?: GraderContribution[];
    deployTargets?: DeployTargetContribution[];
    identityProviders?: IdentityProviderContribution[];
    complianceTemplates?: ComplianceTemplateContribution[];
    
    // Mini Apps
    miniApps?: MiniAppContribution[];
  };
}
```

---

## Intelligence Asset Contributions

### Agent Skills

```typescript
// plugins/compliance/skills/sg-incorporation.ts
export const sgIncorporationSkill: SkillContribution = {
  id: 'compliance.skill.sg-incorporation',
  name: 'Singapore Incorporation Expert',
  description: 'Guides through SG Pte. Ltd. registration process',
  
  // System prompt fragment injected into agent
  systemPrompt: `You are an expert in Singapore company incorporation. 
    You know ACRA BizFile+ process, nominee director requirements,
    corporate secretary obligations, and GST registration thresholds.`,
  
  // Which agents can use this skill
  targetAgents: ['orchestrator', 'compliance-agent'],
  
  // Knowledge base docs this skill references
  knowledgeRefs: ['compliance/sg-incorporation-guide.md'],
};
```

### Agent Tools

```typescript
// plugins/deployments/tools/vercel-deploy.ts
export const vercelDeployTool: ToolContribution = {
  id: 'deployments.tool.vercel-deploy',
  name: 'Deploy to Vercel',
  description: 'Deploy the current project to Vercel',
  
  // JSON schema for tool parameters
  inputSchema: {
    projectName: { type: 'string', required: true },
    framework: { type: 'string', enum: ['nextjs', 'vite', 'remix'] },
    envVars: { type: 'object', additionalProperties: { type: 'string' } },
  },
  
  // The actual tool implementation (runs in Worker)
  handler: async (params, ctx) => {
    const identity = await ctx.apis.get('identities').getProvider('vercel');
    const result = await ctx.rust.invoke('deploy_vercel', {
      token: identity.token,
      ...params,
    });
    return { url: result.url, deployId: result.id };
  },
  
  // Required capabilities
  capabilities: ['identity.vercel.read', 'box.filesystem.read'],
};
```

### Eval Benchmarks

```typescript
// plugins/eval/benchmarks/code-quality.ts
export const codeQualityBenchmark: BenchmarkContribution = {
  id: 'eval.benchmark.code-quality',
  name: 'Code Quality Benchmark',
  description: '35 code samples rated for idiomatic patterns',
  
  type: 'judge',  // 'hard' | 'judge' | 'both'
  targetAgent: 'build-agent',
  grader: 'code-quality-grader',
  
  // Dataset (inline or URL to hosted DB)
  dataset: {
    source: 'built-in',
    cases: [
      { input: 'samples/next-api-route.ts', expectedScore: 0.85 },
      { input: 'samples/flask-handler.py', expectedScore: 0.42 },
      // ...
    ],
  },
};
```

### Eval Graders

```typescript
// plugins/eval/graders/requirements-completeness.ts
export const requirementsCompletenessGrader: GraderContribution = {
  id: 'eval.grader.requirements-completeness',
  name: 'Requirements Completeness Grader',
  description: 'Evaluates if a requirements doc covers all necessary sections',
  
  type: 'judge',
  model: 'cheap',  // uses the cheap model from settings
  
  // The LLM-as-judge prompt
  judgePrompt: `Evaluate the following requirements document for completeness.
    Check for: Problem statement, Target users, Core features, Constraints,
    Differentiator, Revenue model, Success criteria.
    Score 0-1 where 1 = all sections present and substantive.`,
  
  // Structured output schema
  outputSchema: {
    score: { type: 'number', min: 0, max: 1 },
    missingSections: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
};
```

### Deploy Targets

```typescript
// plugins/deployments/targets/vercel.ts
export const vercelTarget: DeployTargetContribution = {
  id: 'deployments.target.vercel',
  name: 'Vercel',
  icon: '▲',
  description: 'Deploy to Vercel (Next.js, Vite, Remix)',
  
  supportedFrameworks: ['nextjs', 'vite', 'remix', 'static'],
  
  requiredIdentity: 'vercel',  // must have Vercel identity connected
  
  // Config schema shown in Deployments tab
  configSchema: {
    projectName: { type: 'string', required: true },
    framework: { type: 'string', enum: ['nextjs', 'vite', 'remix'] },
    buildCommand: { type: 'string', default: 'npm run build' },
    outputDir: { type: 'string', default: '.next' },
    envVars: { type: 'object' },
  },
  
  // Deploy, rollback, health check handlers
  handlers: {
    deploy: () => import('./handlers/deploy'),
    rollback: () => import('./handlers/rollback'),
    healthCheck: () => import('./handlers/healthCheck'),
    logs: () => import('./handlers/logs'),
  },
};
```

### Identity Providers

```typescript
// plugins/identities/providers/stripe.ts
export const stripeProvider: IdentityProviderContribution = {
  id: 'identities.provider.stripe',
  name: 'Stripe',
  icon: '💳',
  description: 'Payment processing',
  
  authType: 'api-key',  // 'oauth' | 'api-key' | 'token'
  
  configSchema: {
    apiKey: { type: 'string', secret: true, label: 'API Key' },
    mode: { type: 'string', enum: ['test', 'live'], default: 'test' },
  },
  
  // Validate connection
  testConnection: () => import('./handlers/testConnection'),
  
  // What this identity unlocks
  provides: ['payments.stripe', 'deployments.stripe-billing'],
};
```

### Compliance Templates

```typescript
// plugins/compliance/templates/sg-pte-ltd.ts
export const sgPteLtdTemplate: ComplianceTemplateContribution = {
  id: 'compliance.template.sg-pte-ltd',
  name: 'Singapore Pte. Ltd.',
  jurisdiction: 'SG',
  description: 'Company incorporation checklist for Singapore',
  
  areas: [{
    name: 'Corporate Entity',
    items: [
      { label: 'Register company name with ACRA', link: 'https://acra.gov.sg' },
      { label: 'Appoint local resident director' },
      { label: 'Open corporate bank account (DBS, OCBC, UOB)' },
      { label: 'Register for GST (if revenue > S$1M)' },
      { label: 'Appoint corporate secretary' },
    ],
  }, {
    name: 'Privacy & Data (PDPA)',
    items: [
      { label: 'Generate Privacy Policy' },
      { label: 'Appoint Data Protection Officer' },
      { label: 'Implement data breach notification process' },
    ],
  }],
};
```

### Mini Apps

```typescript
// plugins/deployments/miniapps/traffic-dashboard.ts
export const trafficDashboard: MiniAppContribution = {
  id: 'deployments.miniapp.traffic-dashboard',
  name: 'Traffic Dashboard',
  description: 'Real-time traffic visualization',
  
  targetTab: 'deployments',  // which workspace tab hosts this
  
  // Self-contained HTML (agent can also generate these on the fly)
  source: () => import('./miniapps/traffic-dashboard.html?raw'),
  
  // What data the mini app can query
  dataAccess: ['deployments.analytics', 'identities.plausible'],
};
```

---

## Plugin Context API

Every plugin receives a `PluginContext` on activation — the only way to interact with the system:

```typescript
export interface PluginContext {
  // Communication
  bus: EventBus;                   // Typed pub/sub
  commands: CommandRegistry;       // Execute and register commands
  
  // Registration
  registry: ContributionRegistry;  // Register UI + intelligence contributions at runtime
  
  // Data
  settings: SettingsRegistry;      // Read/write settings (namespaced to plugin)
  storage: PluginStorage;          // Persistent key-value store (namespaced)
  
  // Cross-plugin API
  apis: ApiBroker;                 // Request another plugin's API by token
  
  // Rust bridge
  rust: RustBridge;                // Call Rust core capabilities
  
  // Runtime info
  surface: 'launcher' | 'project';
  projectPath?: string;            // .snapfzz/ path for project plugins
  logger: Logger;
}

// EventBus — typed, namespaced
interface EventBus {
  emit<T>(topic: string, payload: T): void;
  on<T>(topic: string, handler: (payload: T) => void): Disposable;
}

// CommandBus — execute commands from any plugin
interface CommandRegistry {
  execute<T>(commandId: string, args?: unknown): Promise<T>;
  register(commandId: string, handler: CommandHandler): Disposable;
}

// ApiBroker — Backstage-style API tokens
interface ApiBroker {
  get<T>(token: string): T;        // e.g. apis.get('identities') → IdentitiesAPI
  provide<T>(token: string, impl: T): void;
}

// RustBridge — call core Rust capabilities
interface RustBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Disposable;
  channel<T>(): Channel<T>;        // High-frequency streaming
}
```

---

## Plugin Lifecycle

```
DISCOVERED  → manifest read from registry
RESOLVED    → dependencies validated, topological sort
LOADED      → JS chunk imported (not activated yet)
ACTIVATED   → activate() called, contributions registered
RUNNING     → plugin operational, handling events
DEACTIVATED → deactivate() called, contributions removed
UNLOADED    → JS chunk garbage collected
```

### Activation Events (Lazy Loading)

```typescript
activationEvents: [
  'onStartupFinished',         // after core is ready
  'onViewVisible:code',        // when Code tab is first opened
  'onCommand:code.openFile',   // when someone executes this command
  'onEvent:build.complete',    // when another plugin emits this event
  'onWorkspaceOpened',         // when a project window opens
]
```

### Startup Budget

```
0ms     Core shell + theme + manifest index
~100ms  First paint (skeleton)
~200ms  Activate: chat + agent-network (critical plugins)
~300ms  User sees Chat, can type
~500ms  Background preload via requestIdleCallback
        Other plugins load on first tab open
```

---

## Isolation

| What | How |
|---|---|
| Plugin logic | Runs in Web Worker via plugin host. Main thread never executes plugin code. |
| Plugin UI | Rendered in main thread BUT wrapped in React ErrorBoundary. Crash → fallback UI. |
| Plugin state | Namespaced storage. Plugin A cannot read Plugin B's storage. |
| Plugin communication | Bus only. No direct imports. No shared mutable state. |
| Plugin capabilities | Must declare `requiredCapabilities`. Core checks before granting access. |
| Crash recovery | 3 strikes → plugin auto-disabled. User notified. Manual re-enable in settings. |

---

## Core vs Plugin — Complete Mapping

### Core (Rust crates)

```
snapfzz-core/               # Manifest schema, lifecycle contracts, bus types
snapfzz-tauri-shell/        # Window/WebView management, IPC
snapfzz-plugin-host/        # Resolver, loader, supervisor, crash containment
snapfzz-plugin-bridge/      # Rust↔JS bridge, schema validation (serde + zod)
snapfzz-agent-supervisor/   # Spawn AgentScope Runtime via uv, PID file, cleanup on exit. Runtime handles health/restart/sandbox.
snapfzz-stream-pipeline/    # SSE consume from AgentScope Runtime, 16ms batch, Channel emit
```

#### snapfzz-agent-supervisor

Spawns AgentScope Runtime via `uv run python app.py`. Manages PID file for orphan cleanup. Kills process on app exit via `RunEvent::ExitRequested`.

AgentScope Runtime (agentscope-runtime package) provides everything else:
- **AgentApp** — FastAPI server with SSE streaming, health endpoint, session management
- **LocalDeployManager** — health checks, monitoring, lifecycle management, graceful shutdown
- **Sandbox Service** — browser, filesystem, GUI, cloud, mobile sandboxes for code execution
- **Session Service** — Redis, JSON, Tablestore session persistence
- **Memory Service** — InMemory, Redis, SQLAlchemy memory backends
- **A2A Protocol** — agent-to-agent communication
- **OpenAI SDK compatible** — clients can call via standard OpenAI SDK

Our Rust crate does ~50 LOC: spawn, PID file, wait for health, cleanup on exit.

### Core (Frontend packages)

```
@snapfzz/plugin-sdk/        # TS manifest types, definePlugin(), contribution types
@snapfzz/plugin-host/       # Plugin loader, bus client, ContributionStore, ErrorBoundary
@snapfzz/shared/            # Entities, components/ui, lib, hooks, workers, theme
@snapfzz/launcher/          # Thin shell: plugin host + launcher layout
@snapfzz/project/           # Thin shell: plugin host + project layout
```

### System Plugins (JS packages)

```
plugins/
├── chat/                    # Orchestrator conversation
├── team/                    # Agent dashboard + 1:1 drill-in
├── knowledge-base/          # Notion-like docs, versioning
│   ├── contributes:
│   │   ├── workspaceTab: "Knowledge Base"
│   │   ├── agentSkills: [document-writer, spec-manager]
│   │   ├── agentTools: [create-doc, update-doc, version-doc]
│   │   ├── genericComponents: [doc-tree, doc-editor, diff-viewer]
│   │   └── evalBenchmarks: [spec-completeness, spec-consistency]
├── code/                    # Monaco + file explorer + git
│   ├── contributes:
│   │   ├── workspaceTab: "Code"
│   │   ├── agentTools: [read-file, write-file, search-files]
│   │   └── genericComponents: [file-tree, monaco-editor, diff-editor]
├── preview/                 # Live dev server + triple viewport
│   ├── contributes:
│   │   ├── workspaceTab: "Preview"
│   │   ├── agentTools: [start-dev-server, check-responsive, capture-screenshot]
│   │   └── evalBenchmarks: [viewport-overflow, touch-targets, lighthouse]
├── deployments/             # Deploy targets + monitoring
│   ├── contributes:
│   │   ├── workspaceTab: "Deployments"
│   │   ├── deployTargets: [vercel, fly-io, railway]
│   │   ├── agentTools: [deploy, rollback, health-check]
│   │   ├── miniApps: [traffic-dashboard, cost-calculator]
│   │   └── evalBenchmarks: [deploy-success, health-response-time]
├── identities/              # Third-party connections
│   ├── contributes:
│   │   ├── workspaceTab: "Identities"
│   │   ├── identityProviders: [stripe, github, vercel, cloudflare, plausible]
│   │   ├── agentTools: [connect-provider, get-credentials]
│   │   └── genericComponents: [identity-card, connect-flow]
├── compliance/              # Legal, tax, regulatory
│   ├── contributes:
│   │   ├── workspaceTab: "Compliance"
│   │   ├── complianceTemplates: [sg-pte-ltd, us-llc, gdpr, pdpa]
│   │   ├── agentSkills: [sg-incorporation-expert, tax-advisor]
│   │   ├── agentTools: [create-checklist, update-status, generate-policy]
│   │   ├── miniApps: [tax-calculator, gdpr-audit]
│   │   └── evalBenchmarks: [checklist-completeness]
├── agent-network/           # Bottom panel MsgHub log
│   ├── contributes:
│   │   ├── bottomPanel: "Agent Network"
│   │   └── genericComponents: [message-log, filter-bar, intervention-input]
├── eval/                    # Eval dashboard + benchmark runner
│   ├── contributes:
│   │   ├── settings: [eval-config, benchmark-sources]
│   │   ├── evalGraders: [relevance, correctness, hallucination, code-quality, safety]
│   │   ├── genericComponents: [score-chart, benchmark-browser, grader-reasoning]
│   │   └── commands: [run-eval-suite, run-failed-only]
└── mini-app-runtime/        # Sandboxed iframe host for mini apps
    ├── contributes:
    │   ├── genericComponents: [miniapp-host, miniapp-sandbox]
    │   └── agentTools: [create-miniapp, update-miniapp]
```

---

## Third-Party Plugin Example

A community member creates a "Supabase" plugin:

```typescript
// @community/snapfzz-plugin-supabase
export default definePlugin({
  id: 'community.supabase',
  name: 'Supabase Integration',
  version: '0.1.0',
  surface: ['project'],
  activationEvents: ['onViewVisible:identities'],
  
  dependencies: {
    'snapfzz.identities': '^1.0',
    'snapfzz.deployments': '^1.0',
  },
  
  requiredCapabilities: ['identity.write', 'box.filesystem.read'],
  
  contributes: {
    identityProviders: [{
      id: 'supabase',
      name: 'Supabase',
      icon: '⚡',
      authType: 'api-key',
      configSchema: {
        url: { type: 'string', label: 'Project URL' },
        anonKey: { type: 'string', label: 'Anon Key' },
        serviceKey: { type: 'string', secret: true, label: 'Service Key' },
      },
      testConnection: () => import('./testConnection'),
    }],
    
    agentTools: [{
      id: 'supabase.query',
      name: 'Query Supabase',
      description: 'Execute a query against the Supabase database',
      schema: { table: 'string', filter: 'object', select: 'string' },
      handler: () => import('./tools/query'),
    }],
    
    agentSkills: [{
      id: 'supabase.schema-design',
      name: 'Supabase Schema Expert',
      systemPrompt: 'You are an expert in Supabase database design...',
      targetAgents: ['orchestrator', 'build-agent'],
    }],
    
    complianceTemplates: [{
      id: 'supabase.rls-audit',
      name: 'Supabase RLS Audit',
      jurisdiction: 'global',
      areas: [{
        name: 'Row Level Security',
        items: [
          { label: 'RLS enabled on all tables' },
          { label: 'Policies defined for each role' },
          { label: 'No unrestricted SELECT/INSERT/UPDATE/DELETE' },
        ],
      }],
    }],
    
    miniApps: [{
      id: 'supabase.dashboard',
      name: 'Supabase Dashboard',
      targetTab: 'identities',
      source: () => import('./miniapps/dashboard.html?raw'),
      dataAccess: ['identities.supabase'],
    }],
  },
});
```

One plugin. Provides: identity connector + agent tools + agent skills + compliance checklist + mini app dashboard. All through the standard API. No Rust code needed.

---

## Plugin Lifecycle — Complete Specification

### Lifecycle States

```
REGISTERED → RESOLVED → LOADING → ACTIVATED → RUNNING → DEACTIVATING → DEACTIVATED
                                                 ↕
                                             DISABLED
```

| State | Description |
|---|---|
| `registered` | Manifest read, plugin known to host. Not loaded. |
| `resolved` | Dependencies validated, activation order determined. |
| `loading` | JS chunk being dynamically imported. |
| `activated` | `activate(ctx)` called, contributions registered. |
| `running` | Plugin operational, handling events. |
| `deactivating` | `deactivate()` called, cleaning up contributions. |
| `deactivated` | All contributions removed, resources released. |
| `disabled` | Explicitly disabled by user. Skipped during activation. Persisted across restarts. |

### Activation Events — Lazy Loading

The host MUST respect `activationEvents` from the manifest. A plugin is NOT activated until one of its events fires.

| Event | When It Fires | Use Case |
|---|---|---|
| `onStartupFinished` | After core shell renders | Critical plugins: Chat, Agent Network |
| `onViewVisible:{tabId}` | When user first opens a tab | Most plugins: Code, KB, Preview, Deployments |
| `onCommand:{commandId}` | When a command is executed | Plugins triggered by other plugins or user actions |
| `onEvent:{topic}` | When an EventBus topic fires | Reactive plugins that respond to system events |
| `onWorkspaceOpened` | When a project window opens | Project-scoped plugins |

```
Boot sequence with activation events:

0ms     Shell renders skeleton
50ms    Plugin host reads all manifests, resolves dependencies
100ms   Activate plugins with "onStartupFinished" ONLY
        (e.g., Chat + Agent Network — the minimum viable UI)
200ms   User sees Chat tab, can type. App feels ready.

500ms+  requestIdleCallback: preload JS chunks for "onViewVisible" plugins
        (import the code but don't activate yet)

User clicks "Code" tab:
        → fires onViewVisible:code
        → Code plugin activates
        → registers workspace tab
        → tab renders
```

### Startup Budget Enforcement

The host enforces a budget for startup activation:

```
CRITICAL_BUDGET = 200ms   (plugins with onStartupFinished)
BACKGROUND_PRELOAD = true (use requestIdleCallback for non-critical)
ACTIVATION_TIMEOUT = 5000ms (per plugin — if activate() takes longer, kill it)
```

If a critical plugin exceeds the budget:
- Log a warning with timing
- Continue activation (don't block other plugins)
- Report in status bar: "Plugin X took Nms to activate"

### Enable / Disable

Users can disable plugins. Disabled plugins:
- Are NOT activated during boot or on events
- Have their contributions removed from the store
- Keep their persistent storage intact (not deleted)
- Can be re-enabled without reinstalling

```typescript
interface PluginHost {
  enable(pluginId: string): void;
  disable(pluginId: string): Promise<void>;
  isEnabled(pluginId: string): boolean;
  getDisabledPlugins(): string[];
}
```

Persistence:

```
// Stored in localStorage (launcher) or .snapfzz/config.json (project)
{
  "disabledPlugins": ["snapfzz.compliance", "community.supabase"]
}
```

Disable flow:
```
User clicks "Disable" on plugin in settings
  → host.disable(pluginId)
  → if running: deactivate (remove all contributions)
  → add to disabledPlugins in storage
  → shell re-renders: plugin's tabs/panels disappear
```

Re-enable flow:
```
User clicks "Enable" on plugin in settings
  → host.enable(pluginId)
  → remove from disabledPlugins in storage
  → activate plugin (respecting its activationEvents)
  → shell re-renders: plugin's tabs/panels appear
```

### Reload

For development and crash recovery. Reload = deactivate → re-import → re-activate.

```typescript
interface PluginHost {
  reload(pluginId: string): Promise<void>;
}
```

Reload flow:
```
host.reload(pluginId)
  → deactivate plugin (remove contributions, call handle.deactivate)
  → invalidate the JS module cache for the plugin's chunk
  → re-import the plugin module (fresh code)
  → re-activate with new PluginContext
  → contributions re-registered, shell re-renders
```

Use cases:
- **Development**: plugin code changed, hot-reload it without restarting the app
- **Crash recovery**: plugin crashed (ErrorBoundary caught it), user clicks "Retry" → reload
- **Update**: new version of plugin downloaded, reload to apply

### Delete / Uninstall

For third-party plugins. System plugins cannot be deleted.

```typescript
interface PluginHost {
  uninstall(pluginId: string): Promise<void>;
  isSystemPlugin(pluginId: string): boolean;
}
```

Uninstall flow:
```
host.uninstall(pluginId)
  → verify not a system plugin (throw if it is)
  → deactivate if running
  → remove plugin's persistent storage
  → remove plugin's manifest from registry
  → remove plugin's JS chunks from disk/cache
  → shell re-renders: all traces of plugin gone
```

### Update

For third-party plugins. Replace a plugin with a new version.

```typescript
interface PluginHost {
  update(pluginId: string, newDefinition: PluginDefinition): Promise<void>;
}
```

Update flow:
```
host.update(pluginId, newDefinition)
  → verify new version satisfies all dependents' version constraints
  → deactivate old version
  → replace manifest in registry
  → activate new version
  → verify contributions are compatible (no missing tabs that others depend on)
```

### Plugin Settings UI

The launcher's settings panel shows all plugins with their state:

```
PLUGINS                                    [Reload All]

SYSTEM PLUGINS
┌─────────────────────────────────────────────────────┐
│ 💬 Chat                              ● Running      │
│ snapfzz.chat v1.0.0                                │
│ [Reload]                                            │
├─────────────────────────────────────────────────────┤
│ 👥 Team                              ● Running      │
│ snapfzz.team v1.0.0                                │
│ [Reload]                                            │
├─────────────────────────────────────────────────────┤
│ 📚 Knowledge Base                    ◌ Lazy         │
│ snapfzz.knowledge-base v1.0.0                      │
│ Activates: onViewVisible:kb                        │
│ [Reload]                                            │
└─────────────────────────────────────────────────────┘

THIRD-PARTY PLUGINS
┌─────────────────────────────────────────────────────┐
│ ⚡ Supabase                           ● Running      │
│ community.supabase v0.1.0                           │
│ [Disable] [Reload] [Uninstall]                      │
├─────────────────────────────────────────────────────┤
│ 🔒 SOC2 Compliance                   ○ Disabled     │
│ community.soc2 v0.2.0                               │
│ [Enable] [Uninstall]                                │
└─────────────────────────────────────────────────────┘
```

### Crash Supervision

Per A005/Isolation, the host supervises plugin health:

```
MAX_CRASH_COUNT = 3
CRASH_WINDOW = 300000ms (5 minutes)

On plugin crash (ErrorBoundary catches):
  → increment crash count for this plugin
  → if crash count >= MAX_CRASH_COUNT within CRASH_WINDOW:
    → auto-disable the plugin
    → show notification: "Plugin X disabled after repeated crashes"
    → user can manually re-enable in settings
  → else:
    → show fallback UI with [Retry] button
    → Retry calls host.reload(pluginId)
```

### Theme

Theme is NOT a plugin. Theme is core infrastructure in `@snapfzz/shared/src/theme/`.

Plugins receive theme tokens via CSS variables (`:root[data-theme="dark"]`). Plugins do NOT control the theme — they consume it.

The `useAppSettings()` hook manages theme state and persists to `settings.json` via Rust. This is core behavior, not pluggable.

Why not a plugin:
- Every plugin depends on theme tokens at render time
- Theme must be available BEFORE any plugin loads (it's in the blocking `<script>` tag)
- Making theme a plugin creates a circular dependency: plugins need theme, but theme would be a plugin

---

## Key Design Decisions

1. **JS-only plugins.** No Rust plugins. Simplicity. Worker-hosted for isolation. If a plugin needs native performance, it calls core Rust capabilities via the bridge.
2. **Intelligence is a contribution type.** Skills, tools, benchmarks, graders are first-class — same as UI tabs and commands.
3. **System plugins use the exact same API.** No privileged system plugins. If we can't build Chat as a plugin, the API is wrong.
4. **Manifest-driven, declarative.** Plugins declare what they provide. Core reads manifests at startup and builds the dependency graph.
5. **Lazy everything.** Plugins load on first use. Only chat + agent-network activate at startup.
6. **Capabilities gate access.** Third-party plugins must declare what they need. Users approve.
7. **Mini apps are a contribution type.** Any plugin can provide mini apps. The mini-app-runtime plugin hosts them.
8. **Generic components are shareable.** A plugin can provide reusable components other plugins consume via the registry.
9. **Activation events are enforced.** Plugins only activate when their declared events fire. Startup budget is 200ms for critical plugins.
10. **Enable/disable persists across restarts.** Disabled plugins are skipped. Storage is preserved.
11. **Reload for dev and crash recovery.** Deactivate → re-import → re-activate without restarting the app.
12. **Crash supervision auto-disables.** 3 crashes in 5 minutes → plugin disabled automatically.
13. **Theme is core, not a plugin.** Available before plugins load. Plugins consume tokens via CSS variables.
