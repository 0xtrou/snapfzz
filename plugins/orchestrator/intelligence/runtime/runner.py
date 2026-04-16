"""Runner — request routing and SSE streaming.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/app/runner/

DynamicMultiAgentRunner:
    - Routes by X-Agent-Id header
    - stream_query() wraps agent execution as SSE generator
    - query_handler() tracks active tasks for graceful shutdown

Request flow:
    HTTP POST -> ChatManager -> Session -> Runner -> QwenPawAgent
    -> stream_printing_messages() -> SSE chunks -> client

Integration point for Snapfzz:
    - SSE output -> snapfzz-stream parser (existing Rust crate)
    - Session -> via Tauri IPC, not direct HTTP
"""

# TODO: Extract Runner from QwenPaw repo
