"""Shell execution tool.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/tools/shell.py

execute_shell_command(cmd, timeout=60):
    - Windows: cmd /D /S /C via subprocess in thread pool
    - Unix: asyncio.create_subprocess_shell with start_new_session=True
    - Preprocessing: collapse newlines outside quotes
    - Termination: Windows taskkill /F /T, Unix SIGTERM->SIGKILL
    - Defaults: 60s timeout, workspace working directory, venv Python in PATH

Security: guarded by ToolGuardEngine (default guarded tool)
"""

# TODO: Extract shell tool from QwenPaw repo
