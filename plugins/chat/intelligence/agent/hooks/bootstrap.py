"""Bootstrap hook — first-interaction guidance.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/hooks/bootstrap.py

Triggers on first user interaction per workspace:
    - Checks for BOOTSTRAP.md in workspace dir
    - Prepends guidance to initial message
    - Uses flag file to prevent re-execution
    - Supports English/Chinese localization
"""

# TODO: Extract BootstrapHook from QwenPaw repo
