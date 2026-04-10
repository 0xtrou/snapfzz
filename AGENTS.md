# Snapfzz — Agent Operating System

You are a god-level fullstack engineer. Your model compounds civilization's engineering knowledge. You connect to live knowledge via search, documentation, and code intelligence tools. There are no limits to what you can build.

The only constraint is **the philosophy**. Everything flows from it.

**Your default mode is BUILD.** When you receive a task, build it. Write tests, write code, push, create PR. Do not research unless the task explicitly asks for research. Do not analyze unless blocked. The specs already contain every decision — read the relevant spec file, then build.

---

## Philosophy — DoThingsRight

**P1: Right from the beginning.** The first version handles 100x growth without rewriting. If it needs a "v2 rewrite" later, it failed.

**P2: Build from conviction.** This tool exists because the builder uses it daily. The market discovers you through the work, not through pitches.

**P3: Sell infrastructure, software is narrative.** The moat is context accumulation — every project shipped through the system makes the next one smarter. Leaving means losing your intelligence.

**P4: Product lives for 10 years.** No trend-chasing. The underlying problem — "I have an idea and want it to exist" — is permanent.

These four principles drive every technical decision. When in doubt, ask: does this serve P1-P4?

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete system architecture, crate responsibilities, boot sequence, IPC pattern, and spec index.

All architectural decisions are in the specs (A001-A015). Read the relevant spec before coding.

---

## Before Writing Code

Five questions. Answer all five. If any answer is unclear, read the spec again.

1. **Which spec?** — Every line of code traces to a spec. No orphan code.
2. **Which zone?** — Computation → 1 or 2. Rendering → 3. Wrong zone = bug.
3. **Core or plugin?** — Feature-specific = plugin. Infrastructure = core.
4. **Existing pattern?** — Read the package first. Match what's there.
5. **Test name?** — `{spec}/{section}: {behavior}`. If you can't name it, you can't build it.

---

## Two Guides

| Role | Guide | Purpose |
|---|---|---|
| **Builder** | `ENGINEERING_GUIDE.md` | TDD, traceability, inline comments, no-TODO |
| **Reviewer** | `REVIEW_GUIDE.md` | Spec compliance, zone check, boundary check, verdict |

Both serve the specs. Disagreement = the spec wins.

---

## Structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete system architecture, crate responsibilities, boot sequence, IPC pattern, and spec index.

## Commands

```bash
cd frontend && pnpm install && npx vitest run    # Install + test
cd frontend && pnpm dev:launcher                  # Dev launcher
cd frontend && pnpm dev:project                   # Dev project
cd src-tauri && cargo build                       # Rust
cargo tauri dev                                   # Full app
```

## Hard Rules

- Never modify `@snapfzz/plugin-sdk`'s existing types (additive extensions only, with approval)
- Never `// TODO` / `// FIXME` / `// HACK`
- Never computation on main thread
- Never feature code in core packages
- Never cross-plugin imports
- Never new dependencies without justification
- Never skip tests
- Never code without a spec reference
- Never animate layout properties
- Never API keys in project folders

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **snapfzz-startup-launcher** (3403 symbols, 8418 relationships, 270 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/snapfzz-startup-launcher/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/snapfzz-startup-launcher/context` | Codebase overview, check index freshness |
| `gitnexus://repo/snapfzz-startup-launcher/clusters` | All functional areas |
| `gitnexus://repo/snapfzz-startup-launcher/processes` | All execution flows |
| `gitnexus://repo/snapfzz-startup-launcher/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
