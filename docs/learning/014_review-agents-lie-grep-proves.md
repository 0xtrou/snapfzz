---
title: "Review Agents Lie — Grep Proves"
type: learning
date: 2026-04-06
tags: [review, agents, verification, trust, grep]
---

# Review Agents Lie — Grep Proves

## Context

T12b build agent claimed to add 6 new Tauri commands (list_processes, get_process_logs, etc.). The R12a+R12b review agent said "PASS WITH NOTES" and stated "6 commands registered in invoke_handler — Count confirmed."

The commands were registered in the handler but **the function implementations didn't exist**. The app crashed at runtime.

## What Happened

1. Build agent added the command names to `generate_handler![]` but either failed to add the function bodies or they were lost during editing
2. Review agent read the `generate_handler![]` block, saw 6 names, and said "confirmed"
3. Review agent never searched for `fn restart_process` or `fn kill_process` in the file
4. Review agent parroted the build agent's claims instead of independently verifying

## The Fix

REVIEW_GUIDE.md updated with mandatory evidence-based verification:

- Every claimed deliverable requires a grep command
- "Added function X" → `grep -n "fn X" <file>` must find exactly 1 match
- "Registered command X" → must appear in handler AND have a function body
- "No TODO/FIXME" → `grep -rn "TODO|FIXME" <dir>` must return 0
- A review without grep evidence is invalid

## Rule

Never accept a review agent's "confirmed" without grep evidence. The build agent can claim anything. The review agent can parrot anything. Only `grep` proves the code exists.
