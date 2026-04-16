"""Snapfzz Intelligence Layer — extracted from QwenPaw (agentscope-ai/QwenPaw).

This package contains the 9-block intelligence architecture:

    1. AgentLoop   — QwenPawAgent (ReActAgent) core reasoning loop
    2. State       — Memory management (ReMeLight, PostgresMemory)
    3. Context     — Token tracking, compaction, context window management
    4. Tools       — Tool registry and execution (file, shell, browser, search)
    5. Security    — ToolGuard engine, file guard, skill scanner
    6. Recovery    — Error handling, retry, backoff (distributed across modules)
    7. PlanMode    — Mission mode (PRD generation -> execution phases)
    8. MultiAgent  — Workspace isolation, agent lifecycle, request routing
    9. Sentiment   — Tone adaptation (net-new, not from QwenPaw)

Entry point:
    python -m intelligence.app
"""
