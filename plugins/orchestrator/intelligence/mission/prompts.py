"""Mission prompt templates — master/worker/verifier separation.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/mission/prompts.py

build_master_prompt(loop_dir, agent_id, max_iterations, git_context)
    — orchestrator template, strict controller/worker separation

build_verifier_prompt(...)
    — adversarial verification (test empirically, not via code review)

_build_git_sections()
    — three-level git degradation (installed/repo/no-git)
"""

# TODO: Extract mission prompts from QwenPaw repo
