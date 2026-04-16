"""QwenPawAgent — core reasoning engine.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/react_agent.py

QwenPawAgent(ToolGuardMixin, ReActAgent):
    - Auto-continuation when model returns text-only mid-task
    - Command handling (/compact, /new, etc.)
    - Media normalization (proactive stripping, passive fallback, request-time)
    - Error recovery (bad-request vs media-related failures)
    - Dynamic tool registration with namesake_strategy (override/skip/raise/rename)
    - MCP client registration with recovery
    - Memory compaction hooks triggered at context capacity

Integration points for Snapfzz:
    - Model config -> LiteLLM gateway (not direct provider)
    - Tool registration -> security.tool_guard for gating
    - Memory -> memory.remelight_manager (default) or memory.postgres (Phase 6)
"""

# TODO: Extract QwenPawAgent from QwenPaw repo
# Key methods to preserve:
#   __init__(agent_profile_config) — tool registration, skill loading, memory setup
#   _acting() / _reasoning() — ToolGuardMixin intercepts
#   command handling — /compact, /new, /mission
#   error recovery — bad-request vs media failure distinction
#   auto-continuation — text-only mid-task detection
