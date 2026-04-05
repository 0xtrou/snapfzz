# A007 — Multi-Layout Architecture

## Decision

Snapfzz uses multiple independent Tauri windows, each with its own WebView, React tree, plugin host instance, and frame budget. Layouts are not tabs or overlays — they are separate rendering contexts with guaranteed isolation.

## Why

A single window with overlays/modals shares one frame budget. When the chat streams at 60fps AND the user opens preferences, they compete for the same 16ms frame. A preferences form re-render can drop frames in the chat.

Separate windows = separate WebViews = separate frame budgets. Chat streams at 60fps. Preferences renders independently. Neither affects the other.

## Architecture

```
Each Layout:
  - Own Tauri WebviewWindow (own native WebView process)
  - Own Vite entry point (own dev port, own build target)
  - Own React tree (own render cycle)
  - Own PluginHost instance (own ContributionStore)
  - Own frame budget (own requestAnimationFrame loop)
  - Shared @snapfzz/shared (theme, hooks, bridge — imported, not instantiated)
  - Shared @snapfzz/plugin-sdk (contract — types only)
  - Shared Tauri IPC (invoke/listen — cross-window via app handle)
```

## Current Layouts

| Layout | Surface | Purpose | Port | Window Config |
|---|---|---|---|---|
| Launcher | `launcher` | Pick/create projects | 5173 | 900×600, resizable |
| Project | `project` | Work with agent | 5174 | 1200×800, resizable |
| Preferences | `preferences` | Configure system | 5175 | 720×560, resizable |

## Adding New Layouts

To add a new layout (e.g., `eval-dashboard`, `agent-monitor`):

1. Create `frontend/packages/@snapfzz/{name}/` with vite.config.ts, index.html, App.tsx
2. Add `'{name}'` to `HostSurface` union in plugin-sdk
3. Add `settingsSections` or equivalent contribution type to `PluginContributions`
4. Register the window in `tauri.conf.json`
5. Add Tauri command to open the window

Each layout gets full A001/A002/A003 compliance independently. No layout degrades another.

## Plugin SDK Extension

```typescript
// HostSurface — each layout is a surface
export type HostSurface = 'launcher' | 'project' | 'preferences';

// New contribution type for preferences layout
export interface SettingsSectionContribution {
  id: string;
  label: string;
  icon: string;
  order?: number;
  component: () => Promise<{ default: ComponentType }>;
}

// Added to PluginContributions
export interface PluginContributions {
  // ...existing...
  settingsSections?: SettingsSectionContribution[];
}
```

Plugins declare which surface they target. A plugin can target multiple surfaces:

```typescript
definePlugin({
  surface: ['project', 'preferences'],  // renders in both
  contributes: {
    leftPanelTabs: [...],       // project window only
    settingsSections: [...],     // preferences window only
  },
});
```

The ContributionStore in each window only receives contributions from plugins that target that surface.

## Preferences Layout

### Window

- Title: "Snapfzz Preferences" (native macOS title bar with overlay)
- Size: 720×560, min 600×400
- Draggable title bar (same pattern as project window)
- Theme synced with project window (dark/light toggle applies globally)
- ⌘+, opens from any window, ⌘+W closes

### Layout

```
┌─────────────────────────────────────────────────┐
│ ● ● ●                    Snapfzz Preferences    │
├────────────┬────────────────────────────────────┤
│            │                                    │
│  General   │  [Active section content]          │
│  Runtime   │                                    │
│  Perform.  │  Settings controls rendered here   │
│  Plugins   │  from plugin contributions         │
│  Advanced  │                                    │
│            │                                    │
│            │                                    │
│            │                                    │
│            │                                    │
├────────────┴────────────────────────────────────┤
│ ● Connected                          61 fps     │
└─────────────────────────────────────────────────┘
```

Sidebar: reads `settingsSections` from ContributionStore, sorted by `order`.
Content: renders active section's component with Suspense + ErrorBoundary.
Status bar: same pattern as project window (connection status, FPS counter).

### System Settings Plugins

These ship as system plugins — same API as third-party plugins, but registered via `registerAsSystem()` so they can't be uninstalled.

| Plugin | Section | What It Configures |
|---|---|---|
| `snapfzz.settings.general` | General | Theme (dark/light/system), language, startup behavior |
| `snapfzz.settings.runtime` | Runtime | AgentScope host/port, Python/uv path, model config (API key, model, URL), process status + restart |
| `snapfzz.settings.performance` | Performance | Preset (Performance/Balanced/Battery), max Runtime memory, frame budget target, background preload |
| `snapfzz.settings.plugins` | Plugins | Installed list, enable/disable toggle, plugin info, install from path |
| `snapfzz.settings.advanced` | Advanced | Dev tools toggle, log level, data directory, reset to defaults |

### Settings Persistence

All settings stored at `~/.snapfzz-global/settings.json` via Tauri commands (`get_settings`, `save_settings`). Settings are read-only from the frontend — writes go through Rust IPC. This ensures:

- Settings are available before any plugin loads
- Rust process can read settings on startup (for Runtime config)
- No race conditions between windows reading/writing

### Tauri Commands

```rust
#[tauri::command]
async fn open_preferences(app: AppHandle) -> Result<(), String>

#[tauri::command]
async fn get_settings_section(section: String) -> Result<Value, String>

#[tauri::command]
async fn save_settings_section(section: String, data: Value) -> Result<(), String>

#[tauri::command]
async fn restart_runtime() -> Result<(), String>

#[tauri::command]
async fn get_installed_plugins() -> Result<Vec<PluginInfo>, String>

#[tauri::command]
async fn toggle_plugin(plugin_id: String, enabled: bool) -> Result<(), String>

#[tauri::command]
async fn install_plugin_from_path(path: String) -> Result<(), String>
```

## Performance Constraints (Non-Negotiable)

Every layout follows A001/A002/A003:

| Constraint | How It Applies |
|---|---|
| A001: 60fps | Each window has independent requestAnimationFrame. Settings forms don't drop chat frames. |
| A001: CSS containment | `contain: strict` on sidebar and content panels independently. |
| A001: GPU-only animations | Sidebar selection transitions use transform/opacity only. |
| A002: Zone 3 render only | Settings components render values from Rust IPC. No computation in render path. |
| A003: < 200ms visible | Preferences skeleton in HTML, plugin activation on `onStartupFinished`. |
| A003: < 500ms interactive | Settings inputs usable within 500ms of window open. |

## File Structure

```
frontend/packages/
  @snapfzz/preferences/
  ├── package.json
  ├── tsconfig.json
  ├── vite.config.ts          # port 5175
  ├── index.html              # skeleton
  ├── tailwind.config.js
  ├── postcss.config.js
  ├── src/
  │   ├── main.tsx
  │   ├── globals.css
  │   └── app/
  │       ├── App.tsx          # sidebar + content layout, plugin host
  │       └── App.test.tsx

plugins/
  settings-general/            # system plugin
  settings-runtime/            # system plugin
  settings-performance/        # system plugin
  settings-plugins/            # system plugin
  settings-advanced/           # system plugin
```

## Tauri Config

```json
{
  "windows": [
    { "label": "launcher", "url": "launcher.html", "title": "Snapfzz" },
    { "label": "project", "url": "project.html", "title": "Snapfzz" },
    { "label": "preferences", "url": "preferences.html", "title": "Snapfzz Preferences", "visible": false }
  ]
}
```

Preferences window starts hidden. Opened via `open_preferences` command (⌘+,).
