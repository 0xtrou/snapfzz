# Engineering Guide

Every line of code traces back to a spec. Every test verifies a spec requirement. No orphan code.

## Spec Traceability — The Three Layers

### Layer 1: Test Names Reference Specs

Every test name starts with the spec ID and section it verifies:

```typescript
// Good — traces to spec
describe('009/PluginHost', () => {
  it('009/resolve: sorts plugins by dependency order', () => { ... });
  it('009/activate: calls plugin.activate with PluginContext', () => { ... });
  it('009/isolation: plugin crash does not crash host', () => { ... });
});

describe('002/StreamPipeline', () => {
  it('002/batching: flushes every 16ms for 60fps budget', () => { ... });
  it('002/zones: SSE parsing runs in Rust, not JS', () => { ... });
});

// Bad — no traceability
describe('PluginHost', () => {
  it('sorts plugins correctly', () => { ... });
});
```

Format: `{spec-number}/{section}: {what it verifies}`

Spec numbers:
- `002` = Performance Architecture
- `003` = State Management
- `006` = Instant Loading
- `007` = Workspace Architecture
- `009` = Plugin Architecture
- `010` = Core Runtime

### Layer 2: Inline Code Comments Reference Specs

Every non-obvious technical decision in source code references the spec that mandated it:

```typescript
// Per 002/Performance: use CSS flexbox resize, not JS pixel manipulation
// react-resizable-panels gives 60fps via flexGrow, no React re-renders during drag
<PanelResizeHandle />

// Per 003/Zone1: SSE parsing happens in Rust, not JS main thread
// Data arrives pre-parsed via Tauri Channel API
const bridge = createTauriBridge();

// Per 009/Isolation: each plugin's UI wrapped in ErrorBoundary
// Plugin crash shows fallback, does not crash the shell
<PluginErrorBoundary fallback={...}>
  <PluginComponent />
</PluginErrorBoundary>

// Per 006/InstantLoading: only activate critical plugins at startup
// Others lazy-load on first tab open via onViewVisible activation event
if (event === 'onStartupFinished') { ... }

// Per 009/Communication: plugins never import from each other
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

### Layer 3: Traceability Matrix

File: `docs/TRACEABILITY.md` — maps every spec requirement to its implementation and tests.

```markdown
## 009 Plugin Architecture

| Requirement | Code | Tests |
|---|---|---|
| Manifest-driven plugin discovery | plugin-host/src/plugin-host.ts:resolve() | plugin-host.test.ts:009/resolve |
| Topological dependency sort | plugin-host/src/plugin-host.ts:resolve() | plugin-host.test.ts:009/resolve:sorts by deps |
| Lazy activation on events | plugin-host/src/plugin-host.ts:activate() | plugin-host.test.ts:009/activate |
| PluginContext with all fields | plugin-host/src/plugin-context-factory.ts | plugin-context-factory.test.ts:009/context |
| Crash isolation via ErrorBoundary | plugin-host/src/plugin-error-boundary.tsx | plugin-host-react.test.tsx:009/isolation |
| Bus-only communication | plugin-host/src/plugin-context-factory.ts:EventBus | plugin-context-factory.test.ts:009/EventBus |
| ContributionStore reactive | plugin-host/src/contribution-store.ts | contribution-store.test.ts:009/store |
```

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
009/PluginHost/resolve: returns plugins in dependency order
009/PluginHost/resolve: throws when dependency is missing
009/PluginHost/activate: calls plugin.activate with PluginContext
009/ContributionStore/register: adds tab to store
009/ContributionStore/dispose: removes tab from store
002/Performance/batching: flushes token batch every 16ms
003/StateManagement/zones: SSE consumer runs in Rust not JS
006/InstantLoading/boot: critical plugins activate within 200ms
```

### What Every Test File Must Have

```typescript
// @vitest-environment jsdom  ← only for React tests

// Spec: 009-feat-plugin-architecture.md
// Section: Plugin Lifecycle — Activation
// Verifies: plugins activate in dependency order with correct context

import { describe, it, expect } from 'vitest';

describe('009/PluginHost/activate', () => {
  it('009/activate: calls plugin.activate with PluginContext', () => {
    // arrange → act → assert
  });
});
```

The header comment identifies WHICH spec and WHICH section this test file covers. A human or agent can find the spec and verify the test matches.

---

## Agent Delegation — Spec Enforcement

When delegating work to an agent, ALWAYS include:

1. **Spec file paths** — every relevant spec the agent must read
2. **Traceability requirement** — "test names must start with spec number"
3. **Inline comment requirement** — "reference specs for architectural decisions"
4. **Verification step** — "update docs/TRACEABILITY.md after implementation"

### Agent Prompt Template

```
## SPEC REFERENCES (read before coding)
- /path/to/spec1.md (sections X, Y, Z are relevant)
- /path/to/spec2.md (section A is relevant)

## TRACEABILITY REQUIREMENTS
- Test names: {spec-number}/{section}: {behavior}
- Inline comments: // Per {spec-number}/{section}: {why}
- Update docs/TRACEABILITY.md after implementation

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
3. **TRACEABILITY.md is updated** — new code is mapped to specs
4. **No spec violations** — code matches what specs describe
5. **Tests pass** — `npx vitest run`
6. **App boots** — `pnpm dev:launcher` serves 200 OK

---

## File Naming

```
docs/plans/YYYY-MM-DD-NNN-feat-<name>.md     # Specs (architecture decisions)
docs/ui-specs/NN-<name>.md                    # UI specs
docs/TRACEABILITY.md                          # Spec → Code → Test mapping
ENGINEERING_GUIDE.md                          # This file (how to build)
CONTRIBUTING.md                               # How to contribute
```

## Spec Numbers (Quick Reference)

| Number | Spec | Key Decisions |
|---|---|---|
| `002` | Performance Architecture | 60fps, child WebViews, react-resizable-panels, Monaco, HMR, CSS containment |
| `003` | State Management | 3 zones: Rust SSE → Web Workers → Main thread render. 16ms batch budget. |
| `006` | Instant Loading | BoxLite <50ms boot, snapshots, lazy agent boot, <500ms to interactive |
| `007` | Workspace Architecture | .snapfzz/ folder-first, human-readable JSON/MD, append-only logs |
| `009` | Plugin Architecture | Core + system plugins + third-party. JS-only. Manifest-driven. Bus-only communication. |
| `010` | Core Runtime | Plugin host, shell layout, Rust IPC. Boot sequence. What's core vs plugin. |
