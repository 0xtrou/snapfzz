"""File I/O tools — read, write, edit, append, search.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/tools/file_io.py

Tools:
    read_file(path)              — read with encoding detection (UTF-8-SIG for CSV/TSV/TXT/LOG)
    write_file(path, content)    — write with path resolution
    edit_file(path, old, new)    — precise string replacement
    append_file(path, content)   — append to existing file
    glob_search(pattern)         — file pattern matching
    grep_search(pattern, path)   — content search with regex

Path resolution: absolute -> relative from workspace -> WORKING_DIR fallback
"""

# TODO: Extract file tools from QwenPaw repo
