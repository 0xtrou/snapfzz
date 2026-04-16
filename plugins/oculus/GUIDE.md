# Plugin Development Guide

How to build, test, and ship plugins for Snapfzz.

---

## Quick Start

```bash
# Create a new system plugin
./scripts/create-plugin.sh --system my-feature

# Create a new user plugin (process-isolated)
./scripts/create-plugin.sh --user community.my-tool

# Interactive mode
./scripts/create-plugin.sh
```

---

## Plugin Types

| Type | Location | Runtime | UI | Backend |
|------|----------|---------|-----|---------|
| **System** | `plugins/{name}/` in source tree | In-process (same React) | UMD bundle loaded via `asset://` | Python intelligence process |
| **User** | `~/.snapfzz/plugins/{id}/` | Process-isolated | Webhooks only (no React UI) | Any language (HTTP server) |

---

## System Plugin Structure

```
plugins/my-feature/
├── manifest.json              # Plugin metadata (discovery)
├── package.json               # npm package (@snapfzz/my-feature-plugin)
├── vite.config.ts             # UMD build config (shared React)
├── vitest.config.ts           # Test config
├── tsconfig.json
│
├── src/                       # TypeScript UI (Zone 3)
│   ├── index.ts               # definePlugin() — manifest + activate
│   ├── types.ts               # Plugin-specific types
│   ├── contributions/         # UI panels, status items
│   ├── components/            # React components
│   ├── hooks/                 # React hooks
│   └── __tests__/             # Tests
│
├── intelligence/              # Python backend (Zone 1)
│   ├── pyproject.toml         # pip package definition
│   ├── __init__.py
│   ├── src/{module}/          # Python package
│   │   ├── __init__.py
│   │   ├── app.py             # FastAPI factory + /health
│   │   └── cli.py             # CLI: {module} app --host --port
│   └── pack/                  # Configuration (optional)
│       ├── pack.yaml
│       └── prompts/
│
└── dist/                      # Built output (gitignored)
    └── index.js               # UMD bundle
```

---

## Development Workflow

### 1. Create the plugin

```bash
./scripts/create-plugin.sh --system my-feature
cd plugins/my-feature
pnpm install
```

### 2. Develop the UI

Edit `src/index.ts` to define your plugin manifest:

```typescript
import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.my-feature',
  name: 'My Feature',
  version: '0.1.0',
  surface: ['project'],
  activationEvents: ['onStartupFinished'],

  // Budget controls what the plugin can do
  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 2 },
    capabilities: ['rust.invoke', 'bus.emit', 'commands.register', 'logger'],
  },

  // Python runtime declaration (optional)
  runtimes: {
    python: [{
      id: 'my-feature.runtime',
      packageDir: 'intelligence',
      command: 'my_feature app',
      healthCheck: '/health',
      hostFlag: '--host',
      portFlag: '--port',
    }],
  },

  // UI contributions
  contributes: {
    leftPanelTabs: [{
      id: 'my-tab',
      label: 'My Feature',
      icon: 'AppstoreOutlined',
      component: () => import('./contributions/MyPanel'),
    }],
    commands: [
      { id: 'my-feature.do-thing', title: 'Do Thing' },
    ],
  },

  async activate(ctx: PluginContext): Promise<PluginHandle> {
    // Called when plugin is activated — register commands, start services
    const unreg = ctx.commands.register('my-feature.do-thing', async () => {
      // ...
    });

    return {
      async deactivate() {
        unreg();
      },
    };
  },
});
```

### 3. Develop the backend

Edit `intelligence/src/{module}/app.py`:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse

@asynccontextmanager
async def _lifespan(app: FastAPI):
    # startup logic here
    yield
    # shutdown logic here

def create_app() -> FastAPI:
    app = FastAPI(title="My Feature", version="0.1.0", lifespan=_lifespan)

    @app.get("/health")
    async def health():
        return JSONResponse({"status": "healthy", "version": "0.1.0"})

    @app.post("/api/do-thing")
    async def do_thing(request: dict):
        # Your logic here
        return {"result": "done"}

    return app
```

The CLI entry point (`cli.py`) is already scaffolded — it starts uvicorn with `--host` and `--port` flags that the process manager injects.

### 4. Run tests

```bash
# TypeScript tests
pnpm test

# With coverage
pnpm test:coverage

# Python tests (if you add them)
cd intelligence && python -m pytest
```

### 5. Build the plugin

```bash
pnpm build
```

This produces `dist/index.js` — a UMD bundle that:
- Uses shared React from `window.__snapfzz_shared` (no duplicate React)
- Bundles all `@snapfzz/*` dependencies inline
- Single file, no code splitting
- CSS inlined

### 6. Run the app

```bash
# From project root
cargo tauri dev
```

The `beforeDevCommand` in `tauri.conf.json` automatically runs `pnpm build` for the orchestrator plugin before starting.

---

## How Plugin Loading Works

### Boot sequence

```
1. Rust boot:
   - Start PostgreSQL, LiteLLM
   - install_system_plugin → copies dist/, intelligence/, pack/,
     manifest.json to ~/.snapfzz/plugins/{plugin_id}/

2. Frontend loads:
   - discoverPlugins() → list_installed_plugins (Rust scans ~/.snapfzz/plugins/)
   - For each plugin: read manifest.json (inline from Rust)
   - Filter by surface match

3. Plugin activation:
   - Load UMD dist/index.js via <script> tag + asset:// URL
   - Plugin reads React from window.__snapfzz_shared (host's React)
   - ensurePluginRuntimes():
     - Check if runtime/bin/ exists (get_plugin_info)
     - If not: install_plugin_runtime (pip install → binary)
     - register_plugin_runtime (create ProcessFactory)
     - spawn_plugin_runtime (start managed process)
   - plugin.activate(ctx) → register commands, contributions

4. Plugin deactivation:
   - handle.deactivate() → cleanup commands
   - cleanupPluginRuntimes() → kill process, unregister factory
```

### File locations at runtime

```
~/.snapfzz/plugins/snapfzz.my-feature/
├── dist/index.js          # Compiled UI (copied from source)
├── intelligence/           # Python source (for pip install)
├── pack/                   # Config
├── manifest.json           # Metadata
├── runtime/bin/my_feature  # Compiled binary (produced by pip install)
└── data/                   # Working directory for the process
```

---

## Key Concepts

### Shared React

Plugins MUST use the host app's React instance. Bundling a separate React causes hook errors (duplicate reconciler).

The build config handles this automatically:
- **Format**: UMD (supports `output.globals`)
- **External**: `react`, `react-dom`, `react/jsx-runtime`
- **Globals**: mapped to `window.__snapfzz_shared.React` etc.
- The host app (`frontend/packages/project/src/main.tsx`) exposes React on this global

### Plugin Budget

Every plugin declares a budget that controls:
- **Zone**: `zone3` (browser), `zone1` (Rust/Python)
- **Reliability**: crash tolerance (strikes + window)
- **Network**: max concurrent Tauri invokes
- **Capabilities**: what APIs the plugin can access

### manifest.json vs definePlugin()

| Field | manifest.json | definePlugin() |
|-------|--------------|----------------|
| Purpose | Discovery (Rust reads it) | Runtime (JS loads it) |
| Contains | id, name, surface, runtimes, umdName | Everything + activate(), components |
| Location | Plugin root | src/index.ts |

Both must agree on `id`, `surface`, and `runtimes`. The manifest.json is the source of truth for discovery.

### Process Management

Python runtimes are managed by the Snapfzz process supervisor:
- Health checks every 2s (configurable via `healthIntervalMs`)
- Auto-restart on crash (up to `maxRestarts`)
- Memory monitoring (up to `maxMemoryMb`)
- Graceful shutdown (SIGTERM → 5s → SIGKILL)
- PID tracking + orphan cleanup at boot

---

## Adding to Tauri Resources (Production)

For production builds, add your plugin artifacts to `src-tauri/tauri.conf.json`:

```json
"resources": {
  "../plugins/my-feature/dist": "plugins/snapfzz.my-feature/dist",
  "../plugins/my-feature/intelligence": "plugins/snapfzz.my-feature/intelligence",
  "../plugins/my-feature/manifest.json": "plugins/snapfzz.my-feature/manifest.json"
}
```

And register it in the whitelist (`src-tauri/src/commands/plugin_runtime.rs`):

```rust
const SYSTEM_PLUGINS: &[(&str, &str)] = &[
    ("snapfzz.orchestrator", "orchestrator"),
    ("snapfzz.my-feature", "my-feature"),  // ← add here
];
```

---

## User Plugins

User plugins are simpler — process-isolated, any language, no React UI:

```bash
./scripts/create-plugin.sh --user community.my-tool
```

This creates:
```
~/.snapfzz/plugins/community.my-tool/
├── manifest.json       # Plugin metadata
├── dist/server.py      # HTTP server (FastAPI)
├── data/               # Storage
├── cache/              # Temp files
└── permissions.json    # Granted capabilities
```

User plugins communicate via HTTP webhooks on `127.0.0.1`. They receive `SNAPFZZ_HOST`, `SNAPFZZ_PORT`, and `SNAPFZZ_PLUGIN_ID` environment variables.

---

## Troubleshooting

### "No tabs available — install plugins to see content"
- Check `~/.snapfzz/plugins/` has plugin directories with `manifest.json`
- Check browser console for discovery errors
- Run `pnpm build` in the plugin directory to generate `dist/`

### "Module name 'react' does not resolve"
- The plugin dist is bundled as ES module instead of UMD
- Check `vite.config.ts` uses `formats: ['umd']` with `output.globals`

### "null is not an object (evaluating useSyncExternalStore)"
- Duplicate React instances — the plugin bundles its own React
- Check `vite.config.ts` externalizes `react`, `react-dom`, `react/jsx-runtime`

### "Failed to load resource: 403 (Forbidden)"
- Asset protocol scope doesn't include `~/.snapfzz/plugins/`
- Check `tauri.conf.json` `security.assetProtocol.scope`

### "unsupported settings key"
- Plugin runtime uses a dynamic settings key not in the Settings struct
- This is handled gracefully (unknown keys are silently skipped)

### Activation budget exceeded
- `install_plugin_runtime` (pip install) is slow on first boot
- Subsequent boots skip it if `runtime/bin/` exists
- Use "Reset/Reinstall" in settings to force reinstall
