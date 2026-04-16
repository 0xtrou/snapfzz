"""Pydantic configuration models for all intelligence subsystems.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/config/config.py

Top-level: config.json
    agents: AgentsConfig
    security: SecurityConfig
    tools: ToolsConfig
    mcp: MCPConfig

Per-agent: AgentProfileConfig
    active_model: ModelSlotConfig {provider_id, model}
    llm_routing: AgentsLLMRoutingConfig (local_first/cloud_first)
    system_prompt_files: list[str]
    running: AgentsRunningConfig (memory, retry, rate-limit)
    heartbeat: HeartbeatConfig (cron + target channel)
    tools: ToolsConfig (per-agent overrides)
    security: SecurityConfig (per-agent overrides)
    mcp: MCPConfig (per-agent MCP clients)

Security:
    ToolGuardConfig: enabled, guarded_tools, denied_tools, custom_rules
    FileGuardConfig: enabled, sensitive_files
    SkillScannerConfig: mode (block/warn/off), timeout, whitelist

Memory (in AgentsRunningConfig):
    memory_compact_ratio: 0.75 (0.3-0.9)
    memory_reserve_ratio: 0.1 (0.05-0.3)
    tool_result_compact: ToolResultCompactConfig
    memory_summary_enabled: true
    dream_cron: "0 23 * * *"
    memory_manager_backend: "remelight"
    max_input_length: 131072

LLM retry:
    llm_max_retries, llm_backoff_base, llm_backoff_cap,
    llm_max_concurrent, llm_max_qpm
"""

# TODO: Extract Pydantic models from QwenPaw repo
# Snapfzz adaptations:
#   - Model routing -> LiteLLM gateway (strip direct provider configs)
#   - Strip channel configs (Discord, Telegram, etc.) — Snapfzz is the channel
#   - Strip CLI configs — launched by PluginProcessFactory
#   - Add Snapfzz-specific: vault integration, plugin manifest bridge
