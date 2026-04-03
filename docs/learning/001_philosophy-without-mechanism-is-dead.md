---
title: "Philosophy Without Mechanism Is Dead"
type: learning
date: 2026-04-03
tags: [paperclip, agent-lifecycle, heartbeat, workflow]
---

# Philosophy Without Mechanism Is Dead

## Context

We built the Snapfzz agent workforce with rich philosophy (DoThingsRight P1-P4), 16 architecture/UI specs, engineering guides, and review guides. Yet when Spark's first review task ran, it completed in ~90 seconds with zero output — no checkout, no comments, no status change.

## What Happened

### The Failure Chain

1. **SNA-4 (Bolt)** completed — built shell layout, opened PR #1, mentioned @Spark
2. **SNA-27 created** — assigned to Spark for PR review
3. **Spark's first run** (`096fb55b`) — ran 90s, did nothing, exited silently
4. **Root cause discovered** — All agents' AGENTS.md files contained 167 lines of engineering philosophy and specs, but zero instructions on how to interact with Paperclip itself

### Why Bolt Worked

Bolt's task description had explicit step-by-step build instructions that accidentally compensated for the missing heartbeat procedure. The agent didn't need to know how to check its inbox because the task told it exactly what to do.

### Why Spark Failed

Spark's review task had no scaffolding. It received only "review PR #1" — but didn't know the Paperclip workflow (inbox → checkout → work → update → comment). So it did nothing.

## Learnings

### 1. Philosophy Without Mechanism Is Dead

Agents can know every spec, every architectural decision, every quality standard — and still do nothing because they don't know how to check their inbox.

**The four layers must resonate:**
```
Philosophy (why)  →  Specs (what)  →  Mechanism (how)  →  Action (now)
```

Break any link and the system fails silently. Not with errors. With agents that run and produce nothing.

**Rule**: Every agent instruction file MUST include the tool/workflow it operates within, not just domain knowledge. Philosophy + specs are necessary but insufficient.

### 2. PR Review Shouldn't Create New Issues

When Spark found blockers on PR #1, the instinct was to create SNA-32 as a new issue for Bolt to fix them. This fragments the work unit.

**Why it's wrong:**
- Creates issue sprawl
- Loses context linkage between build and review
- Makes the board noisy
- Breaks the natural build→review→fix→re-review loop

**Rule**: Review feedback flows back to the original issue/agent. No new issues for fix iterations. The PR is the unit of work.

### 3. opencode_local Adapter Doesn't Auto-Trigger on Assignment

Assigning a task to Spark didn't trigger a heartbeat. The agent sat idle until manually triggered via CLI.

**Why**: Bolt has a scheduled routine (`0 * * * *`) that polls for work. Spark has no routine. The `opencode_local` adapter is passive — it only runs when invoked.

**Implication**: Every agent that should respond to assignments needs either:
- A scheduled routine (like Bolt's hourly trigger)
- Event-driven webhook on assignment
- Manual heartbeat trigger

**Rule**: If you assign work to an agent, ensure it has a trigger mechanism. Otherwise it's dead weight.

### 4. The Build→Review→Fix Loop Works (Once Wiring Is Right)

Spark's review was excellent — found 3 real blockers:
- Core/plugin boundary violation (test-plugin imported directly in shell)
- plugin-sdk modified without approval
- TRACEABILITY.md not updated

This proves the system works when:
- Builder has clear specs AND heartbeat procedure
- Reviewer has REVIEW_GUIDE AND heartbeat procedure
- Feedback flows back to the original builder
- Both agents share the same managed workspace

### 5. Shared AGENTS.md Is Both Good and Bad

**Good**: All agents share the same engineering philosophy, specs, and rules. Consistent behavior across the workforce.

**Bad**: AGENTS.md is 200+ lines of philosophy before the heartbeat procedure. Agents burn tokens reading philosophy before getting to "what do I do right now."

**Better approach**: Split into two concerns:
- `AGENTS.md` — heartbeat procedure, critical rules (short, actionable, first)
- Spec files — referenced on demand, not loaded upfront

## What Changed

1. **Added heartbeat procedure to all 8 agents' AGENTS.md** — inbox → checkout → work → update → comment
2. **Cancelled SNA-32** (the anti-pattern issue) — reopened SNA-4 with review feedback instead
3. **Established the loop**: Build → Review → Fix flows through the original issue, not new ones

## The Test

Any feature, any agent, any process we add must pass this test:

**Does it resonate?**
- Does the philosophy drive the decision?
- Does the spec encode the decision?
- Does the mechanism enable the action?
- Does the action close the loop?

If any answer is no, the system will fail silently.

## What We're Actually Building

Not an IDE. A **living system where philosophy becomes executable**.

The agents aren't tools. They're embodiments of the philosophy. Each one should be able to:
- Know why it exists (philosophy)
- Know what to build (specs)
- Know how to work (mechanism)
- Know when it's done (feedback)

When all four resonate, you don't manage agents. You manage philosophy. The rest follows.
