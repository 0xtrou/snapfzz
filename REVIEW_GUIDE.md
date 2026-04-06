# Review Guide

The ENGINEERING_GUIDE.md tells builders how to implement. This guide tells reviewers how to verify. Both are grounded in the same specs. The specs rule everything.

---

## The Reviewer's Job

You receive code from a builder agent. Your job is NOT to rewrite it. Your job is to answer ONE question:

**Does this code implement what the specs describe, and nothing else?**

If yes → approve. If no → reject with the specific spec violation.

---

## Review Checklist — Run In Order

### 1. Spec Compliance

For every file changed, identify which spec it implements. Then verify:

| Question | How to Check | Reject If |
|---|---|---|
| Does the code do what the spec says? | Read the spec section. Read the code. Compare. | Code does something the spec doesn't describe, or skips something it does. |
| Is it in the right zone? | Per A002: computation → Zone 1 (Rust) or Zone 2 (Worker). Rendering → Zone 3 (Main thread). | Computation on main thread. Rendering in Worker. Browser globals in core logic. |
| Is it core or plugin? | Per A005: feature-specific code = plugin. Infrastructure = core. | Feature code in `@snapfzz/shared`, `@snapfzz/plugin-host`, `@snapfzz/launcher`, or `@snapfzz/project`. |
| Does it follow the plugin contract? | Per A005: plugins use `definePlugin()`, register via ContributionStore, communicate via bus only. | Direct imports between plugins. Bypassing the bus. Modifying plugin-sdk. |
| Does it respect performance constraints? | Per A001: 60fps, CSS containment, GPU-only animations, lazy loading. | Layout animations (width/height/top/left). Eager loading of heavy resources. Main thread computation. |
| Does it respect the UI spec? | Read the matching U-series spec. Compare layout, components, behavior. | UI doesn't match spec. Missing responsive breakpoints. Wrong components. |
| Does it use the correct UI stack? | Per ENGINEERING_GUIDE/UI Stack: Ant Design + Ant Icons + Tailwind + CSS variables only. | Emoji as icons. Hardcoded hex/rgb colors. Non-Ant icon libraries. Non-Ant component libraries. |

### 2. Zone Verification

**This is the most common violation.** Check every new/modified file:

```
FILES THAT MUST BE ZONE-2 SAFE (no window/document/localStorage/react):
  plugin-host/src/plugin-host.ts
  plugin-host/src/contribution-store.ts
  plugin-host/src/plugin-context-factory.ts
  Any file in a /workers/ directory
  Any file that does computation/state management

FILES THAT ARE ZONE-3 (React allowed):
  plugin-host/src/use-*.ts
  plugin-host/src/plugin-error-boundary.tsx
  Any file in /app/ directories
  Any file that renders UI

VERIFICATION:
  grep -n "window\.\|document\.\|localStorage\.\|from 'react'" <zone-2-file>
  Must return nothing (excluding comments).
```

### 3. Test Traceability

Every test must trace to a spec. Every spec requirement must have a test.

| Question | How to Check | Reject If |
|---|---|---|
| Do all test names start with a spec reference? | `grep "it('" *.test.ts` — every `it()` starts with `A00X/` or `U00X/` | Test name has no spec prefix. |
| Does each test file have a header comment? | First lines should be `// Spec: A00X-...` | Missing header identifying which spec this file covers. |
| Are there untested spec requirements? | Compare TRACEABILITY.md "Code" and "Tests" columns. | A requirement has code but no test. |
| Do tests actually verify the claimed behavior? | Read the test. Does it assert what the test name says? | Test name says one thing, assertion checks something else. |

### 4. Inline Comments

Architectural decisions must cite specs. Self-explanatory code needs no comments.

| Question | How to Check | Reject If |
|---|---|---|
| Do architectural decisions have spec references? | Look for `// Per A00X/...` on non-obvious code. | A pattern choice, library choice, zone decision, or constraint has no spec comment. |
| Are there unnecessary comments? | Look for comments that describe WHAT the code does (not WHY). | `// increment counter` on `counter++`. Comments on self-explanatory code. |
| Are there TODOs? | `grep -rn "TODO\|FIXME\|HACK\|XXX"` | Any TODO, FIXME, HACK, or XXX found. |

### 5. Code Quality

Standard code review concerns, grounded in specs:

| Question | Reject If |
|---|---|
| Does it modify `@snapfzz/plugin-sdk`? | Any change to plugin-sdk files without explicit approval. |
| Does it add new dependencies? | New npm/cargo dependency without justification. |
| Are there circular imports? | Package A imports from Package B which imports from Package A. |
| Does it break existing tests? | `npx vitest run` has failures. |
| Does the app still boot? | `pnpm dev:launcher` doesn't serve 200 OK. |
| Is TRACEABILITY.md updated? | New code exists but no new rows in traceability matrix. |

### 6. Boundary Check

The most important structural review — are things in the right place?

```
CORE PACKAGES (infrastructure only):
  @snapfzz/shared        → entities, lib, hooks, theme
  @snapfzz/plugin-sdk    → stable contract, NEVER modified
  @snapfzz/plugin-host   → plugin loader, ContributionStore
  @snapfzz/launcher      → thin shell, reads from store
  @snapfzz/project       → thin shell, reads from store

PLUGIN PACKAGES (features):
  plugins/chat/           → Chat UI, orchestrator conversation
  plugins/team/           → Agent dashboard
  plugins/knowledge-base/ → Notion-like docs
  plugins/code/           → Monaco editor, file explorer, git
  plugins/preview/        → Live dev server preview
  plugins/deployments/    → Deploy management
  plugins/identities/     → Third-party connections
  plugins/compliance/     → Legal, tax, regulatory
  plugins/agent-network/  → MsgHub log panel
  plugins/eval/           → Benchmark runner + dashboard
  plugins/mini-app-runtime/ → Sandboxed iframe host

REJECT IF:
  Feature code is in a core package
  Core infrastructure is in a plugin
  A plugin imports from another plugin (bus-only communication)
  A plugin modifies core behavior directly
```

---

## Spec Quick Reference

Use this to find the right spec for any code you're reviewing:

| If the code does... | Check spec... |
|---|---|
| Plugin registration, activation, lifecycle | A005 Plugin Architecture |
| Plugin contributions (tabs, commands, tools) | A005 Plugin Architecture |
| ContributionStore, PluginHost | A006 Core Runtime |
| Split pane, resize, layout | A001 Performance + U006 Project Window |
| Streaming, SSE, batching | A002 State Management |
| Worker vs main thread decision | A002 State Management (Zone diagram) |
| BoxLite, micro-VM, sandboxing | A003 Instant Loading |
| Lazy loading, startup timing | A003 Instant Loading + A005 Lifecycle |
| .snapfzz/ folder, config files | A004 Workspace Architecture |
| Dark/light theme, Ant Design, Inter | U009 Design System |
| Responsive breakpoints, mobile | U002 Responsive |
| Chat, Team, Agent Network | U006 Project Window |
| Project list, settings, eval | U005 Launcher Window |
| Live preview, HMR, triple viewport | U007 Preview & Build Engine |
| Eval benchmarks, graders | U008 Eval System |
| Git diff, blame, log, branches | U010 Git Inspector |
| Quality standards (13 checks) | U003 Perfectly From Day 1 |

---

## Review Output Format

For each PR reviewed, produce:

```
## Review: [branch name]

### Spec Compliance
- [PASS/FAIL] A00X: [what was checked]
- [PASS/FAIL] U00X: [what was checked]

### Zone Verification
- [PASS/FAIL] Zone 2 files have no browser/React deps
- [PASS/FAIL] Zone 3 files are rendering only

### Test Traceability
- [PASS/FAIL] All test names have spec prefixes
- [PASS/FAIL] TRACEABILITY.md updated
- [X] new tests added, [Y] existing tests pass

### Code Quality
- [PASS/FAIL] No TODOs
- [PASS/FAIL] No new deps without justification
- [PASS/FAIL] App boots
- [PASS/FAIL] All tests pass

### Boundary Check
- [PASS/FAIL] No feature code in core
- [PASS/FAIL] No cross-plugin imports

### Verdict: APPROVE / REJECT
[If reject: specific spec violations with file:line references]
```

---

## The Rule

The specs are the law. The ENGINEERING_GUIDE.md tells builders how to follow the law. This REVIEW_GUIDE.md tells reviewers how to enforce it. Neither guide invents rules — they both point to the specs.

If a reviewer and builder disagree, the spec is the tiebreaker. If the spec is ambiguous, escalate to the human (founder). If the spec is wrong, update the spec FIRST — then the code follows.
