# Engineering Guide

Every line of code traces back to a spec. Every test verifies a spec requirement. No orphan code.

## Spec Traceability — The Three Layers

### Layer 1: Test Names Reference Specs

Every test name starts with the spec ID and section it verifies:

```typescript
// Good — traces to spec
describe('A005/PluginHost', () => {
  it('A005/resolve: sorts plugins by dependency order', () => { ... });
  it('A005/activate: calls plugin.activate with PluginContext', () => { ... });
  it('A005/isolation: plugin crash does not crash host', () => { ... });
});

describe('A001/StreamPipeline', () => {
  it('A001/batching: flushes every 16ms for 60fps budget', () => { ... });
  it('A001/zones: SSE parsing runs in Rust, not JS', () => { ... });
});

// Bad — no traceability
describe('PluginHost', () => {
  it('sorts plugins correctly', () => { ... });
});
```

Format: `{spec-number}/{section}: {what it verifies}`

Spec numbers:
- `A001` = Performance Architecture
- `A002` = State Management
- `A003` = Instant Loading
- `A004` = Workspace Architecture
- `A005` = Plugin Architecture
- `A006` = Core Runtime
- `A007` = Multi-Layout Architecture
- `A008` = Budget Registry
- `A011` = Secret Vault
- `A012` = Preflight Service
- `A013` = LLM Providers
- `A014` = Kernel Architecture

### Layer 2: Inline Code Comments Reference Specs

Every non-obvious technical decision in source code references the spec that mandated it:

```typescript
// Per A001/Performance: use CSS flexbox resize, not JS pixel manipulation
// react-resizable-panels gives 60fps via flexGrow, no React re-renders during drag
<PanelResizeHandle />

// Per A002/Zone1: SSE parsing happens in Rust, not JS main thread
// Data arrives pre-parsed via Tauri Channel API
const bridge = createTauriBridge();

// Per A005/Isolation: each plugin's UI wrapped in ErrorBoundary
// Plugin crash shows fallback, does not crash the shell
<PluginErrorBoundary fallback={...}>
  <PluginComponent />
</PluginErrorBoundary>

// Per A003/InstantLoading: only activate critical plugins at startup
// Others lazy-load on first tab open via onViewVisible activation event
if (event === 'onStartupFinished') { ... }

// Per A005/Communication: plugins never import from each other
// All cross-plugin communication goes through EventBus
ctx.bus.emit('topic', payload);
```

**When to add a spec reference:**
- Architectural decisions (why this library, why this pattern)
- Performance-critical code (batching, zones, containment)
- Security boundaries (isolation, sandboxing, permissions)
- Non-obvious constraints (why NOT doing something)

**When NOT needed:**
- Self-explanatory code (variable names, simple logic)
- Standard patterns (React hooks, Ant Design usage)
- Test files (spec reference is in the test name instead)

### Layer 3: Tests ARE the Traceability

Tests with spec-prefixed names (`A005/resolve: sorts by deps`) are the living traceability matrix. If the test passes, the spec is implemented. If it doesn't, CI fails. No separate document needed.

Updated every time code or specs change.

---

## TDD — Non-Negotiable

### The Rule

Write the failing test FIRST. Then implement. Then refactor. No exceptions.

### Test Structure

```
frontend/packages/<package>/src/
├── feature.ts              # Implementation
├── feature.test.ts         # Tests (same directory, .test.ts suffix)
```

### Test Naming Convention

```
{spec-number}/{section}: {specific behavior being tested}
```

Examples:
```
A005/PluginHost/resolve: returns plugins in dependency order
A005/PluginHost/resolve: throws when dependency is missing
A005/PluginHost/activate: calls plugin.activate with PluginContext
A005/ContributionStore/register: adds tab to store
A005/ContributionStore/dispose: removes tab from store
A001/Performance/batching: flushes token batch every 16ms
A002/StateManagement/zones: SSE consumer runs in Rust not JS
A003/InstantLoading/boot: critical plugins activate within 200ms
```

### What Every Test File Must Have

```typescript
// @vitest-environment jsdom  ← only for React tests

// Spec: 009-feat-plugin-architecture.md
// Section: Plugin Lifecycle — Activation
// Verifies: plugins activate in dependency order with correct context

import { describe, it, expect } from 'vitest';

describe('A005/PluginHost/activate', () => {
  it('A005/activate: calls plugin.activate with PluginContext', () => {
    // arrange → act → assert
  });
});
```

The header comment identifies WHICH spec and WHICH section this test file covers. A human or agent can find the spec and verify the test matches.

---

## UI Stack — Non-Negotiable

All UI code uses this stack consistently. No exceptions.

### Allowed

- **Ant Design 5** — primary component library (Button, Input, Form, Select, Table, etc.)
- **Ant Design Icons** — all icons via `@ant-design/icons` (e.g., `SettingOutlined`, `MessageOutlined`)
- **Tailwind CSS** — utility classes for layout, spacing, responsive
- **CSS variables** — theme tokens from `tokens.css` (colors, fonts)
- **Bare HTML/CSS/JS** — when no Ant component fits the need

### Virtualization

- **PretextList** — for single-column scrolling lists with text content (chat messages, log lines). Uses arithmetic height via `@chenglou/pretext`. Per A001: replaces react-virtuoso for chat.
- **react-virtuoso** — allowed for grid virtualization (`VirtuosoGrid`) and variable-height lists where PretextList's fixed `estimateHeight` doesn't work (e.g., card grids with wrapping text). Per A001 exception: PretextList is preferred but react-virtuoso is acceptable when PretextList's single-column fixed-height model doesn't fit.
- **CSS grid + max-height + overflow-y: auto** — acceptable for lists under ~200 items where virtualization overhead isn't justified. Use `contain: layout paint` for rendering isolation.

### Forbidden

- **Emoji in UI** — never use emoji as icons, labels, or decorators. Use Ant Design Icons.
- **Hardcoded colors** — always use CSS variables (`var(--text-primary)`, `var(--bg-default)`)
- **Inline hex/rgb** — no `#22c55e` or `rgb(...)` in component code. Define tokens in `tokens.css`.
- **Other icon libraries** — no Heroicons, Lucide, Feather. Only `@ant-design/icons`.
- **Other component libraries** — no shadcn/ui, Radix, MUI, Chakra. Only Ant Design.

### Plugin Icon Convention

Plugin manifests declare `icon` as a string matching an Ant Design Icon name:

```typescript
contributes: {
  leftPanelTabs: [{ id: 'chat', icon: 'MessageOutlined', ... }],
  settingsSections: [{ id: 'runtime', icon: 'CloudServerOutlined', ... }],
}
```

The shell renders it via `@ant-design/icons` component lookup. Never emoji.

---

## Test Coverage — Non-Negotiable

### The Rule

Every plugin and core package must achieve **≥90% test coverage**. Contract-driven design means the contract is verified, not assumed.

### What Must Be Tested

| Layer | What to Test | Coverage Target |
|---|---|---|
| Plugin manifest | `definePlugin()` returns valid manifest, budget declared, surface correct | 100% |
| Plugin activate/deactivate | activate returns PluginHandle, deactivate cleans up | 100% |
| Plugin contributions | Components render, Tauri commands called correctly | ≥90% |
| Plugin state hooks | State transitions, error handling, edge cases | ≥90% |
| Core packages | All public API methods | ≥90% |
| Rust crates | All public functions | ≥90% |

### How to Measure

```bash
# Frontend (vitest)
pnpm --filter @snapfzz/plugin-host exec npx vitest run --coverage

# Rust (cargo-llvm-cov — enforced ≥90% line coverage in CI)
cd src-tauri && cargo llvm-cov test -p snapfzz-kernel --lib --summary-only
cd src-tauri && cargo llvm-cov test -p snapfzz-stream --lib --summary-only
```

### Naming Convention

```
{spec-number}/{section}: {specific behavior}
```

### What Counts as Coverage

- Branch coverage, not just line coverage
- Error paths tested (what happens when Tauri invoke fails?)
- Edge cases (empty state, max values, corrupt data)
- Contract verification (does the manifest match what the shell expects?)

### What Does NOT Count

- Snapshot tests (they test nothing)
- Tests that only check "renders without crashing" (insufficient)
- Tests with no assertions

---

## User-Facing Copy — Non-Negotiable

All text visible to users (tooltips, labels, descriptions, error messages, notifications) must be **generic and implementation-agnostic**. Never expose internal infrastructure.

### Forbidden in user-facing text

- Internal paths (`~/.snapfzz/`, `src-tauri/`, `node_modules/`)
- Framework names (`Tauri`, `Rust`, `AgentScope`, `React`, `Vite`, `tokio`)
- Architecture terms (`Zone 1`, `Zone 2`, `Zone 3`, `sysinfo`, `DashMap`, `Channel API`)
- Internal API names (`ctx.rust.invoke()`, `BudgetRegistry`, `ContributionStore`)

### Use instead

| Forbidden | Use Instead |
|---|---|
| "Tauri invoke" | "backend call" |
| "Rust SSE consumer" | "streaming pipeline" |
| "AgentScope Runtime" | "agent runtime" |
| "Zone 1 (Rust)" | "the backend" |
| "~/.snapfzz/" | "the app data directory" |
| "sysinfo RSS monitoring" | "monitored every 2s" |
| "Channel API push" | "update" |
| "ctx.rust.invoke()" | "plugin command" |

### Where this applies

- Plugin UI text (labels, tooltips, placeholders, descriptions)
- Error messages shown to users
- Notification toasts
- Status bar text
- About dialog

### Where this does NOT apply

- Code comments (spec references are required)
- Log output (stderr, console.log in dev mode)
- Test names
- Documentation in docs/ folder

---

## Plugin Loading UX — Non-Negotiable

Every plugin UI must either load instantly or show a loading skeleton. No blank white screens.

### Rules

- **< 100ms load**: no skeleton needed — render directly
- **≥ 100ms load**: show a loading skeleton that matches the layout shape of the loaded content
- **Suspense fallback**: every `lazy()` component wrapped in `<Suspense fallback={<Skeleton />}>`
- **Skeleton style**: use `var(--bg-subtle)` rectangles matching the expected content layout (header bar, form fields, cards)
- **Spinner**: for inline loading (e.g., chat streaming), use a minimal spinner (border animation, GPU-only)
- **Never**: blank white, "Loading..." text without structure, layout shift after load

### Pattern

```tsx
<Suspense fallback={<SettingsSkeleton />}>
  <PluginErrorBoundary>
    <LazyComponent />
  </PluginErrorBoundary>
</Suspense>
```

---

## Settings Propagation — Non-Negotiable

All user-facing settings (theme, font, font size, and any future appearance/behavior settings) flow through a single propagation pipeline. No plugin applies settings to the DOM directly.

### The Flow

```
Plugin saves settings
  → tauriInvoke('save_settings', { settings: merged })
      └─ Rust: persist to settings.json + app.emit("settings-changed")  // ALL webviews
  → emitSettingsChanged()
      └─ window.dispatchEvent(CustomEvent('snapfzz:settings-changed'))  // same window instant
                    ↓
  useAppSettings() (mounted in WindowShell + Launcher App)
      → invoke('get_settings')        // fresh read from Rust
      → applyDomSettings(settings)    // theme, font-family, font-size → DOM
```

### Rules

- **Single source of truth**: `use-app-settings.ts → applyDomSettings()` is the ONLY function that applies settings to the DOM.
- **Plugins never apply settings locally**: after `save_settings`, call `emitSettingsChanged()` and let the pipeline handle application. No `document.body.style.fontFamily = ...` in plugin code.
- **Dual-event delivery**: `save_settings` in Rust emits `settings-changed` to ALL webviews via `app.emit()`. The frontend `emitSettingsChanged()` dispatches a DOM `CustomEvent` for same-window instant response. Both trigger `useAppSettings` to re-apply.
- **All windows participate**: every window must mount `useAppSettings()` at its top-level component. `WindowShell` does this automatically. If a window doesn't use `WindowShell` (e.g., Launcher), it must call `useAppSettings()` directly.
- **Theme resolution**: the settings value `'system'` is resolved to `'light'` or `'dark'` at application time via `matchMedia`. Never pass `'system'` to `data-theme` or `localStorage`.
- **Font override**: CSS `!important` is injected via `<style id="snapfzz-font-override">` to override Ant Design's `ConfigProvider` scoped styles. Both `font-family` and `font-size` are forced globally.

### Adding a New Setting

When adding a new user-facing setting that affects visual appearance:

1. Add the field to `GeneralSettings` form (or the relevant settings plugin)
2. Include it in the `save_settings` merge object
3. Handle it in `applyDomSettings()` in `use-app-settings.ts`
4. Call `emitSettingsChanged()` after save — done. All windows update automatically.

Do NOT:
- Apply the setting to the DOM in the plugin's save handler
- Create a separate propagation mechanism per setting
- Read the setting from localStorage (use Tauri `get_settings` as the source of truth)

### Key Files

| File | Role |
|---|---|
| `shared/src/hooks/use-app-settings.ts` | Single source of truth for DOM application + theme state |
| `shared/src/components/shell/WindowShell.tsx` | Mounts `useAppSettings()` for preferences + project |
| `launcher/src/app/App.tsx` | Mounts `useAppSettings()` for launcher window |
| `plugins/settings-general/src/GeneralSettings.tsx` | Saves settings + emits change event |

## Tauri IPC — Single Bridge Pattern (Non-Negotiable)

All frontend-to-Rust communication goes through `TauriBridge` from `@snapfzz/shared`. No exceptions.

### The Pattern

```typescript
import { createTauriBridge } from '@snapfzz/shared';
const bridge = createTauriBridge();

// Invoke a Tauri command
const result = await bridge.invoke<ReturnType>('command_name', { arg1, arg2 });

// Listen to a Tauri event
const unlisten = await bridge.listen<PayloadType>('event-name', (payload) => { ... });
```

### Rules

- **Single import**: always `createTauriBridge` from `@snapfzz/shared`. Never access `__TAURI_INTERNALS__` directly.
- **Module-level bridge**: create the bridge once at module scope, not inside components or hooks.
- **Typed returns**: always specify the generic type parameter: `bridge.invoke<Settings>(...)`, not `bridge.invoke(...)`.
- **Cached imports**: TauriBridge internally caches `@tauri-apps/api/core` and `@tauri-apps/api/event` imports. First call pays the dynamic import cost, subsequent calls are instant.
- **Test mocking**: mock `createTauriBridge` via `vi.mock('@snapfzz/shared')`, never mock `window.__TAURI_INTERNALS__`.

### Do NOT

- Access `window.__TAURI_INTERNALS__` directly in any plugin or shared code
- Create per-plugin `tauriInvoke()` wrapper functions
- Use `import('@tauri-apps/api/core')` directly in plugin code

---

## Agent Delegation — Spec Enforcement

When delegating work to an agent, ALWAYS include:

1. **Spec file paths** — every relevant spec the agent must read
2. **Traceability requirement** — "test names must start with spec number"
3. **Inline comment requirement** — "reference specs for architectural decisions"
4. **Verification step** — "run tests, verify coverage ≥90%"

### Agent Prompt Template

```
## SPEC REFERENCES (read before coding)
- /path/to/spec1.md (sections X, Y, Z are relevant)
- /path/to/spec2.md (section A is relevant)

## SPEC TRACEABILITY
- Test names: {spec-number}/{section}: {behavior}
- Inline comments: // Per {spec-number}/{section}: {why}

## TDD
- Write failing test first referencing the spec
- Implement to pass
- Refactor
```

---

## No TODOs — Ever

Never write `// TODO`, `// FIXME`, `// HACK`, `// XXX`, or any placeholder comment in code.

- If it's within the scope of current work → **implement it now**
- If it's genuinely out of scope → **don't mention it in code**. It belongs in a spec or a task, not a code comment.
- If you're unsure whether it's in scope → **ask**, don't defer with a TODO

Verification: `grep -rn "TODO\|FIXME\|HACK\|XXX" frontend/packages/ || echo "Clean"` must return clean.

---

## Code Review Checklist

Before any PR merges:

1. **Every test name starts with a spec reference** — no orphan tests
2. **Architectural decisions have inline spec comments** — no unexplained choices
3. **No spec violations** — code matches what specs describe
5. **Tests pass** — `npx vitest run`
6. **App boots** — `pnpm dev:launcher` serves 200 OK

---

## File Naming

```
docs/plans/YYYY-MM-DD-NNN-feat-<name>.md     # Specs (architecture decisions)
docs/ui-specs/NN-<name>.md                    # UI specs
ENGINEERING_GUIDE.md                          # This file (how to build)
CONTRIBUTING.md                               # How to contribute
```

## Full Spec Registry

### Architecture Specs (`docs/plans/`)

| Number | Spec | Key Decisions |
|---|---|---|
| `A001` | Performance Architecture | 60fps, child WebViews, react-resizable-panels, Monaco, HMR, CSS containment |
| `A002` | State Management | 3 zones: Rust SSE → Web Workers → Main thread render. batch_interval_ms budget |
| `A003` | Instant Loading | BoxLite <50ms boot, snapshots, lazy agent boot, <500ms to interactive |
| `A004` | Workspace Architecture | .snapfzz/ folder-first, human-readable JSON/MD, append-only logs |
| `A005` | Plugin Architecture | Core + system plugins + third-party. JS-only. Manifest-driven. Bus-only communication. Lifecycle: lazy activation, enable/disable, reload, uninstall, crash supervision. Theme is core not plugin. |
| `A006` | Core Runtime | Plugin host, shell layout, Rust IPC. Boot sequence. What's core vs plugin |
| `A007` | Multi-Layout Architecture | Separate Tauri windows. settingsSections. System settings plugins |
| `A008` | Budget Registry | Controlled + Supervised domains. Presets. Hardware scaling (80% rule) |
| `A011` | Secret Vault | AES-256-GCM. Master key in OS keychain. Backend-only |
| `A012` | Preflight Service | 6-phase boot. Hookable lifecycle. <25ms sync budget |
| `A013` | LLM Providers | Multi-provider. Model discovery. Usage metering. Budget enforcement |
| `A014` | Kernel Architecture | main.rs orchestrator. snapfzz-kernel + snapfzz-stream crates |

### UI Specs (`docs/ui-specs/`)

| Number | Spec | Key Decisions |
|---|---|---|
| `U001` | Navigation Index | Two-window model. Spec file map. |
| `U002` | Responsive | 3 breakpoints (mobile/tablet/desktop), touch targets, typography scale |
| `U003` | Perfectly From Day 1 | 13 quality standards. Responsive, 60fps, accessible, fast, secure, SEO, errors, dark mode, i18n, analytics, legal, deploy-ready, instant loading |
| `U004` | User Journey | Launch → splash → launcher → project → agents → ship → back |
| `U005` | Launcher Window | Project list, cards (Live/Progress/Paused), new project, settings, eval, memory |
| `U006` | Project Window | Left panel (Chat+Team), right panel (KB/Code/Preview/Deploy/ID/Compliance), Agent Network, mini apps, orchestrator as co-creator |
| `U007` | Preview & Build Engine | HMR pipeline, triple viewport, console capture, responsive enforcement, quality gate |
| `U008` | Eval System | Hard eval + LLM-as-judge, 4 benchmark sources, auto-extraction, context accumulation |
| `U009` | Design System | Ant Design 5 + shadcn, Inter font, zinc palette, dark/light themes, Monaco theme, logo |
| `U010` | Git Inspector | Git sub-views in Code tab (files/diff/log/branches/blame), git2-rs, Monaco diff |

### How to Reference

```
// Architecture specs — use the number directly
// Per A005/Isolation: plugins wrapped in ErrorBoundary
// Per A001/Performance: CSS flexbox resize for 60fps

// UI specs — prefix with UI-
// Per U006/LeftPanel: Chat and Team as separate tabs
// Per U009/Theme: zinc palette, no custom colors
// Per U003/Standard3: WCAG AA accessible, axe-core 0 violations
```

### Checklist Before Every Code Change

1. Which architecture spec(s) does this code implement? → reference in test names + inline comments
2. Which UI spec(s) does this code render? → reference in component comments
3. Does this code violate any spec? → if yes, update the spec first or don't write the code
4. Are tests named with spec prefixes? → `{spec}/{section}: {behavior}`
5. Are architectural decisions commented? → `// Per {spec}/{section}: {why}`
6. Is test coverage ≥90%? → run with --coverage and verify
7. No TODOs? → `grep -rn "TODO\|FIXME" frontend/packages/` must be clean
8. Tests pass? → `npx vitest run`
9. App boots? → `pnpm dev:launcher` returns 200
