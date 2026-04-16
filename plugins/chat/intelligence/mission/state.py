"""Mission state — directory structure and git context detection.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/mission/state.py

Directory: {workspace}/missions/{loop_id}/
    loop_config.json  — git context, paths, environment
    prd.json          — task list with pass/fail tracking
    progress.txt      — append-only iteration log
    task.md           — original task description (read-only)

detect_git_context()       — async git probe (installed, repo, branch, root)
get_active_loop_dir()      — matches session_id with fallback to latest
read_prd() / write_prd()   — task list CRUD
"""

# TODO: Extract mission state from QwenPaw repo
