# Review: T2 — Rust Bridge + Supervisor

## Verdict: FAIL

## Checklist

| # | Check | Status | Evidence (file:line) | Spec |
|---|-------|--------|---------------------|------|
| 1 | Every Tauri command matches chat/SPEC.md contract | FAIL | `send_message` signature drift; `load_session` returns untyped Value | chat/SPEC:302-324 |
| 2 | `send_message` uses `Channel<ContentBlockBatch>` | PASS | Channel arg present (main.rs:78) | A002:69-72 |
| 3 | SSE parsing in Rust | PASS | Line buffering/parsing in Rust (main.rs:101-191) | A002:69-72 |
| 4 | 16ms batch budget enforced | PASS | `TOKEN_BATCH_MS = 16` with elapsed gate (main.rs:15,168-170) | A001, A002:37 |
| 5 | uv supervisor starts AgentScope | PASS | `uv run python -m agentscope.server` (main.rs:497-505) | A005:516-517 |
| 6 | Settings at ~/.snapfzz-global/settings.json | FAIL | Uses settings.json but A004 specifies config.json | A004:118-119 |
| 7 | Zone 1 purity | PASS | All computation in Rust backend | A002 |
| 8 | No frontend modified | PASS | Diff limited to src-tauri/ | — |
| 9 | Inline spec comments | PARTIAL | Good comments exist but some decisions uncited | ENGINEERING_GUIDE |
| 10 | No TODO/FIXME/HACK | PASS | Clean | AGENTS.md |
| 11 | No hardcoded API keys | PASS | Defaults to empty string | AGENTS.md |
| 12 | Error propagation | PARTIAL | Commands propagate via Result, but startup failure only logged | A006 |
| 13 | Types match plugin expectations | FAIL | HealthStatus/SessionInfo aligned, but send_message/load_session contract diverges | chat/SPEC:305-320 |
| 14 | cargo check passes | PASS | Clean | — |

## What's Good

- 16ms batching correctly implemented in Zone 1
- SSE parsing entirely in Rust — no JS parsing overhead
- uv supervisor wired on app startup
- No TODOs, no hardcoded keys
- cargo check clean

## What Needs Fixing

| # | Severity | Finding | Fix Instructions |
|---|----------|---------|-----------------|
| 1 | High | Rust bridge contract drift — signatures don't match chat/SPEC | Align send_message args/return and load_session return type to exact spec |
| 2 | High | Settings path settings.json vs A004 config.json | Rename to config.json or update A004 spec |
| 3 | Medium | Supervisor is fire-and-forget — no health poll or restart | Add basic health poll loop per A005 (can be simple for ugly phase) |
