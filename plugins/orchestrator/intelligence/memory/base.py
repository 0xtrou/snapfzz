"""BaseMemoryManager — abstract interface for memory backends.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/agents/memory/base.py

Contract:
    start()            — initialize backend connection
    close()            — cleanup
    compact_memory()   — compress conversation history
    summary_memory()   — generate summaries from history
    memory_search()    — semantic search over stored memories

Async lifecycle:
    add_async_summary_task()  — queue background summarization
    await_summary_tasks()     — wait for pending summaries
"""

# TODO: Extract BaseMemoryManager from QwenPaw repo
