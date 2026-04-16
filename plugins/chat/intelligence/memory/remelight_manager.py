"""ReMeLightMemoryManager — default memory backend.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/memory/remelight_manager.py

Features:
    - Conversation compaction and summarization
    - Vector + full-text search (local or Chroma storage)
    - Storage selection based on OS/dependencies
    - "Dream optimization" — autonomous memory reorganization (nightly cron)
    - Config hierarchy: agent config > environment variables
    - Async lifecycle: start, restart, close

Config consumed:
    - running.memory_manager_backend = "remelight"
    - running.dream_cron (default "0 23 * * *")
    - running.force_memory_search (default false)
    - running.memory_summary_enabled (default true)
"""

# TODO: Extract ReMeLightMemoryManager from QwenPaw repo
