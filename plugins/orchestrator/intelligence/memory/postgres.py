"""PostgresMemory — pgvector-backed memory for RAG (Phase 6).

NOT from QwenPaw — net-new for Snapfzz.

Extends BaseMemoryManager with:
    - PostgreSQL storage (conversations, memory_entries, agent_state)
    - pgvector embeddings via LiteLLM /embeddings endpoint
    - Similarity search: embedding <=> query ORDER BY cosine distance
    - Async fact extraction post-response
    - Context assembly (recent conversation + top-k similar memories)

Schema (from A020):
    conversations: id, session_id, project_id, role, content(jsonb), embedding(vector(1536))
    memory_entries: id, project_id, category, content, relevance_score, embedding(vector(1536))
    agent_state: id, agent_id, project_id, state(jsonb), version
"""

# TODO: Implement in Phase 6 (RAG Pipeline)
