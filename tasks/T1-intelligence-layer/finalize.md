# Finalize: T1 — Intelligence Layer

## Review Findings Disposition

| # | Finding | Decision | Rationale |
|---|---------|----------|-----------|
| 1 | OrchestratorAgent not extending AgentBase | DEFER | Ugly phase — synthetic responses prove the SSE pipeline works. Real AgentBase integration when agentscope is actually installed. |
| 2 | Custom SSE wrapper not native Msg | DEFER | Wrapper works for proving the stream. Will align to native Msg.to_dict() when real agent executes. |
| 3 | Custom in-memory session | DEFER | Ugly phase — proves session create/load flow. AgentScope Session backend in production. |
| 4 | Synthetic response chunks | ACCEPT FOR UGLY | This IS the ugly phase. Synthetic chunks prove SSE→Rust→frontend pipeline. Real pipeline when agentscope installed. |
| 5 | Hardcoded agentscope.init() | DEFER | Template-driven config in production. |
| 6 | Missing /memory, /tool, /eval | DEFER | Not needed for Alpha chat loop. Add stubs in production. |
| 7 | SnapfzzUserInput fallback | ACCEPT | Graceful degradation when agentscope not installed. |
| 8 | Missing spec comments | DEFER | Will add during production migration. |
| 9 | P1 scalability risk | ACCEPT FOR UGLY | Interfaces are correct. Internals swap without plugin changes. |

## Fixes Applied

- Fixed uv command: `uvicorn server:app` instead of `agentscope.server` (in main.rs)

## Deferred

All 9 findings deferred — the intelligence layer currently serves synthetic responses to prove the pipeline works. Real AgentScope integration is the production migration.
