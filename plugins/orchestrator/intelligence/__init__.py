"""Snapfzz Intelligence Layer — extracted from QwenPaw (agentscope-ai/QwenPaw).

This package contains the intelligence architecture:

    agent/       — QwenPawAgent (ReActAgent) core reasoning loop + hooks
    memory/      — Memory backends (ReMeLight, AgentMd, PostgresMemory)
    tools/       — Tool registry and execution (file, shell, browser, search)
    security/    — ToolGuard engine, file guard, skill scanner
    mission/     — Mission mode (PRD generation -> execution phases)
    runtime/     — Workspace isolation, agent lifecycle, request routing
    channels/    — Multi-channel communication (Discord, Telegram, Slack, iMessage, MQTT, etc.)
    config/      — Pydantic configuration models

Entry point:
    orchestrator app --host 127.0.0.1 --port 9150
"""
