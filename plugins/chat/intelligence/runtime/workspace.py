"""Workspace — isolated runtime per agent.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/app/workspace/

Workspace houses:
    - Runner (processes queries)
    - MCPClientManager (MCP server connections)
    - TaskTracker (active task lifecycle)
    - ServiceManager (priority-based component startup/shutdown)

Isolation guarantees:
    - Process-level: separate Runner, memory manager, MCP clients
    - File-level: agent-specific config dir and workspace dir
    - State-level: session keyed by (user_id, session_id)
    - Reload safety: preserves reusable services during hot-reload
"""

# TODO: Extract Workspace from QwenPaw repo
