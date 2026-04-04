# Review: T1 — Intelligence Layer

## Verdict: FAIL

## Checklist

| # | Check | Status | Evidence (file:line) | Spec |
|---|-------|--------|---------------------|------|
| 1 | Server exposes required endpoints | PASS | /chat, /health, /agents, /session, /session/{id}, /stop present (server.py:38-134) | chat/SPEC |
| 2 | SSE stream emits all ContentBlock types | PASS | text, thinking, tool_use, tool_result, image, audio, video event names (server.py:104-113) | chat/SPEC:34-55 |
| 3 | SnapfzzUserInput implements UserInputBase | PARTIAL | Falls back to `object` on import failure — conditional conformance (snapfzz_input.py:16,31) | A005 |
| 4 | SnapfzzUserInput uses asyncio.Queue | PASS | Queue-based bridging (snapfzz_input.py:34-45) | chat/SPEC |
| 5 | OrchestratorAgent extends AgentBase | FAIL | Plain class, not AgentBase subclass (orchestrator.py:13) | A005 |
| 6 | agentscope.init() called with config | PARTIAL | Hardcoded project/name constants (orchestrator.py:26) | A005 |
| 7 | Templates are YAML config | PASS | blank.yaml exists (templates/blank.yaml) | learning 007 |
| 8 | No hardcoded API keys | PASS | Clean | AGENTS.md |
| 9 | Thin wrapper (not reimplementation) | FAIL | Custom session management, synthetic response chunks (server.py:18-36, orchestrator.py:62-76) | learning 007 |
| 10 | Full AgentScope API exposed | FAIL | Missing /memory, /tool, /eval endpoints (server.py:38-134) | learning 007:41-52 |
| 11 | Native Msg/ContentBlock types | FAIL | Custom SSE wrapper instead of native AgentScope Msg envelope (server.py:116-126) | chat/SPEC:34-55 |
| 12 | Session delegates to AgentScope Session | FAIL | Custom in-memory dict instead of AgentScope Session (server.py:18-36) | chat/SPEC:21-28 |
| 13 | Inline spec comments | PARTIAL | Only 2 comments exist, many decisions uncited | ENGINEERING_GUIDE |
| 14 | No TODO/FIXME/HACK | PASS | Clean | AGENTS.md |
| 15 | Scales to 100 agents without rewrite | FAIL | In-memory per-session queues/history (P1 violation) | AGENTS.md P1 |

## What's Good

- All required endpoints present
- SSE event names cover all 7 ContentBlock types
- Queue-based UserInput bridge pattern correct
- Template is YAML
- No hardcoded keys, no TODOs

## What Needs Fixing

| # | Severity | Finding | Fix Instructions |
|---|----------|---------|-----------------|
| 1 | High | OrchestratorAgent must extend AgentBase | Inherit from agentscope.agent.AgentBase, implement reply() properly |
| 2 | High | Custom session management — must delegate to AgentScope Session | Use agentscope.session.JsonSession or in-memory AgentScope session backend |
| 3 | High | Synthetic response chunks — must use real AgentScope pipeline execution | Call agent.reply() / agent.stream_reply() instead of hardcoded chunks |
| 4 | High | Custom SSE wrapper — must stream native Msg/ContentBlock | Serialize Msg.to_dict() directly as SSE data |
| 5 | Medium | Missing /memory, /tool, /eval endpoints | Add stubs that proxy to AgentScope APIs |
| 6 | Medium | agentscope.init() hardcoded | Drive from template config at runtime |
| 7 | Medium | SnapfzzUserInput import fallback to object | Fail fast if agentscope not installed |
| 8 | Medium | Missing inline spec comments | Add # Per A00X/... on architectural decisions |
