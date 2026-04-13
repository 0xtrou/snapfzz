"""StateBlock — configure persistence backend for AgentScope Memory."""

from __future__ import annotations

import os
from typing import Any

from agentscope.memory import InMemoryMemory

from blocks.base import Block, BlockResult, Scorecard


class StateBlock(Block):
    """Wraps AgentScope's Memory interface with the configured backend.

    For 'postgresql', imports PostgresMemory from runtime/memory.py.
    For 'memory' (default), uses AgentScope's InMemoryMemory.

    pack.yaml keys:
        state.backend: 'postgresql' | 'memory' (default 'memory')
        state.persist: list of what to persist (conversations, facts, agent_state)
        state.ttl_days: how long to keep entries (default 90)
        state.auto_extract: auto-extract facts from conversations (default false)
    """

    name = "state"

    def _defaults(self) -> dict[str, Any]:
        return {
            "backend": "memory",
            "persist": ["conversations"],
            "ttl_days": 90,
            "auto_extract": False,
        }

    def _validate(self, config: dict[str, Any]) -> None:
        backend = config.get("backend")
        if backend not in ("memory", "postgresql"):
            raise ValueError(f"Unsupported state backend: {backend}")
        if backend == "postgresql" and not os.environ.get("MEMORY_DATABASE_URL"):
            raise ValueError("state.backend=postgresql requires MEMORY_DATABASE_URL env var")

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        backend = cfg["backend"]

        if backend == "postgresql":
            from memory import PostgresMemory
            memory = PostgresMemory(
                dsn=os.environ["MEMORY_DATABASE_URL"],
                ttl_days=cfg["ttl_days"],
                auto_extract=cfg["auto_extract"],
            )
        else:
            memory = InMemoryMemory()

        return BlockResult(
            primitive=memory,
            meta={
                "state": memory,
                "state_backend": backend,
                "state_persist": cfg["persist"],
            },
        )

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        card.checks["backend_valid"] = self._config.get("backend") in ("memory", "postgresql")
        card.checks["ttl_reasonable"] = 1 <= self._config.get("ttl_days", 0) <= 365
        if self._config.get("backend") == "memory":
            card.notes.append("Using in-memory storage — conversations lost on restart")
        return card
