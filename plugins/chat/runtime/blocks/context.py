"""ContextBlock — manage context window strategy and memory retrieval."""

from __future__ import annotations

from typing import Any

from blocks.base import Block, BlockResult, Scorecard


class ContextBlock(Block):
    """Context window strategy and memory retrieval parameters."""

    name = "context"

    def _defaults(self) -> dict[str, Any]:
        return {
            "strategy": "sliding_window",
            "max_tokens": 128_000,
            "memory_retrieval": {
                "top_k": 10,
                "recency_boost": 0.2,
            },
        }

    def _validate(self, config: dict[str, Any]) -> None:
        strategy = config.get("strategy")
        if strategy not in ("sliding_window", "summarize", "rag"):
            raise ValueError(f"Unknown context strategy: {strategy}")
        max_tokens = config.get("max_tokens", 0)
        if not (1000 <= max_tokens <= 2_000_000):
            raise ValueError(f"max_tokens out of range: {max_tokens}")

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        retrieval = cfg.get("memory_retrieval", {})

        # These parameters are consumed by StateBlock's memory and AgentLoopBlock
        return BlockResult(
            primitive=None,  # No AgentScope primitive — pure config injection
            meta={
                "context_strategy": cfg["strategy"],
                "context_max_tokens": cfg["max_tokens"],
                "memory_top_k": retrieval.get("top_k", 10),
                "memory_recency_boost": retrieval.get("recency_boost", 0.2),
            },
        )

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        card.checks["strategy_valid"] = self._config.get("strategy") in (
            "sliding_window", "summarize", "rag",
        )
        max_t = self._config.get("max_tokens", 0)
        card.checks["tokens_reasonable"] = 4_000 <= max_t <= 2_000_000
        if max_t > 200_000:
            card.notes.append(f"Large context window ({max_t}) — monitor cost")
        return card
