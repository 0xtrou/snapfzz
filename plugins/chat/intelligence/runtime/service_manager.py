"""ServiceManager — priority-based component lifecycle.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/app/workspace/service_manager.py

ServiceManager:
    - Priority-based startup/shutdown (higher priority = starts first)
    - ServiceDescriptor: init args, post-init hooks, dependencies, concurrency flags
    - Reusable services transfer across hot-reloads without re-instantiation
    - start_all() spawns services in priority tiers:
        Priority 10: Runner
        Priority 5: Core services (memory, MCP, channels) — concurrent
        Priority 0: Cron scheduler
"""

# TODO: Extract ServiceManager from QwenPaw repo
