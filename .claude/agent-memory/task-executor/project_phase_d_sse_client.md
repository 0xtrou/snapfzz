---
name: Phase D SSE client
description: Phase D wired use-chat.ts to real AgentScope SSE; key stop endpoint path and event translations
type: project
---

Phase D replaced the Phase-A mock stream with a real fetch+ReadableStream SSE client.

Key decisions:
- `configureChatRuntime(ctx)` calls `get_plugin_runtime_url('chat.orchestrator')` once and caches the URL at module scope.
- Session id: client-generated UUID per conversation, reset on `clearConversationSession()`.
- Stop endpoint: `POST /api/console/chat/stop?chat_id=<sessionId>` (X-Agent-Id: 'default'). Discovered in `qwenpaw/src/qwenpaw/app/routers/console.py:180`, mounted via `api_router` at `/api` in `build_app()`. AgentApp/InterruptMixin has no exposed HTTP stop route.
- `sse-contracts.ts` holds `AgentRequest` and `AgentSseEnvelope` types (contract-driven per feedback).
- MessageType translations: `message`→TextBlock, `reasoning`→ThinkingBlock, `function_call`→ToolUseBlock(running), `function_call_output`→ToolResultBlock, `heartbeat`→no-op, `error`→toast+disconnect, unknown→console.warn+skip.
- Token count sourced from `envelope.usage.total_tokens` on completed frames.
- 239 tests pass (29 files).

**Why:** Chat must be end-to-end real after Phase C1 landed the Python runtime.
**How to apply:** The stop route path `/api/console/chat/stop` is stable; any future stop/interrupt work should use this endpoint, not InterruptMixin.stop_chat() which is Python-internal only.
