"""Mission command handler — /mission entry point.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/mission/handler.py

Detects: /mission <task> [--verify CMD] [--max-iterations N]
Sub-commands: status (progress), list (all missions), help
Validation: task >= 5 chars, blocks meta-questions
Initializes: loop directory, git context, configuration
Constraints: 1-100 max iterations
"""

# TODO: Extract MissionHandler from QwenPaw repo
