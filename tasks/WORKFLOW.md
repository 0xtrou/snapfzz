# Task Workflow

Every implementation task follows 5 phases. Each phase produces a file artifact in `tasks/<task-id>/`.

```
Phase 1: Build       → tasks/<id>/build.md      (sub-agent writes code + documents what was built)
Phase 2: Review      → tasks/<id>/review.md      (review sub-agent audits against specs)
Phase 3: Finalize    → tasks/<id>/finalize.md    (orchestrator reviews, fixes, concludes)
Phase 4: Fix         → code changes applied       (orchestrator or sub-agent fixes review findings)
Phase 5: Handoff     → tasks/<id>/handoff.md     (ready for human review)
```

## Phase 1: Build

**Actor**: Sub-agent (deep category)

The build agent:
1. Reads AGENTS.md, ENGINEERING_GUIDE.md, relevant specs
2. Answers the 5 questions before writing code
3. Builds the implementation
4. Documents what was built in `tasks/<id>/build.md`

**build.md format:**
```markdown
# Build: <task title>

## 5 Questions
1. Which spec? →
2. Which zone? →
3. Core or plugin? →
4. Existing pattern? →
5. Test name? →

## What Was Built
- file list with purpose

## Spec References
- inline comments added

## Verification
- cargo check / vitest / lsp diagnostics results
```

## Phase 2: Review

**Actor**: Review sub-agent (separate agent, fresh eyes)

The review agent:
1. Reads REVIEW_GUIDE.md, AGENTS.md, relevant specs
2. Audits every file against spec requirements
3. Documents findings in `tasks/<id>/review.md`

**review.md format:**
```markdown
# Review: <task title>

## Verdict: PASS / PASS WITH NOTES / FAIL

## Checklist
| # | Check | Status | Evidence (file:line) | Spec |
|---|-------|--------|---------------------|------|

## What's Good

## What Needs Fixing
| # | Severity | Finding | Fix Instructions |
|---|----------|---------|-----------------|
```

## Phase 3: Finalize

**Actor**: Orchestrator (Sisyphus)

The orchestrator:
1. Reads build.md + review.md
2. Verifies review findings by reading actual code
3. Decides what to fix vs what to defer
4. Applies fixes (or delegates fix to sub-agent with session_id)
5. Documents decisions in `tasks/<id>/finalize.md`

**finalize.md format:**
```markdown
# Finalize: <task title>

## Review Findings Disposition
| # | Finding | Decision | Rationale |
|---|---------|----------|-----------|

## Fixes Applied

## Deferred (with reason)

## Verification
- tests pass
- diagnostics clean
```

## Phase 4: Fix

**Actor**: Orchestrator or sub-agent (via session_id continuation)

Code changes applied based on finalize decisions. No separate artifact — changes tracked in git.

## Phase 5: Handoff

**Actor**: Orchestrator

Produces `tasks/<id>/handoff.md` — summary for human review.

**handoff.md format:**
```markdown
# Handoff: <task title>

## What Changed
- file list

## Key Decisions
- architectural choices made

## Known Limitations
- what's ugly, what will be migrated

## How to Verify
- commands to run
- what to look at

## Ready for Review: YES / NO
```

## Task Naming

```
tasks/
├── WORKFLOW.md
├── T1-intelligence-layer/
│   ├── build.md
│   ├── review.md
│   ├── finalize.md
│   └── handoff.md
├── T2-rust-bridge/
│   ├── build.md
│   ├── review.md
│   ├── finalize.md
│   └── handoff.md
└── T3-chat-plugin/
    ├── build.md
    ├── review.md
    ├── finalize.md
    └── handoff.md
```
