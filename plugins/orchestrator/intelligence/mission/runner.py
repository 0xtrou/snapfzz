"""Mission runner — PRD generation and execution phases.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/mission/mission_runner.py

Phase 1 — PRD Generation:
    - All tools active, agent explores codebase
    - Creates prd.json: {userStories: [{id, title, description, acceptanceCriteria, priority}]}
    - validate_prd() with up to 2 auto-correction attempts

Phase 2 — Execution:
    - Restricts to worker agents via mission_impl_group deactivation
    - Forces delegation to sub-agents
    - Iterates checking story passes flag
    - Max iterations limit

Tool groups: mission_impl_group = [edit_file, browser_use, desktop_screenshot]
"""

# TODO: Extract MissionRunner from QwenPaw repo
