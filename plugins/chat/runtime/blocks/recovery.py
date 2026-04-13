"""RecoveryBlock — failure handling strategy for agent execution."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from blocks.base import Block, BlockResult, Scorecard


@dataclass
class RecoveryStrategy:
    """Policy object for retry/fallback decisions in the agent loop."""

    strategy: str           # 'retry_then_fallback' | 'retry' | 'fail_fast'
    max_retries: int
    on_tool_error: str      # 'retry_once' | 'skip' | 'abort'
    on_context_overflow: str  # 'summarize' | 'truncate' | 'error'
    fallback_model: str | None

    def should_retry(self, attempt: int) -> bool:
        return attempt < self.max_retries

    def tool_error_action(self) -> str:
        return self.on_tool_error

    def overflow_action(self) -> str:
        return self.on_context_overflow


class RecoveryBlock(Block):
    """Failure handling — retry strategy, fallback model, overflow behavior."""

    name = "recovery"

    def _defaults(self) -> dict[str, Any]:
        return {
            "strategy": "retry_then_fallback",
            "max_retries": 2,
            "on_tool_error": "retry_once",
            "on_context_overflow": "summarize",
            "fallback_model": None,
        }

    def _validate(self, config: dict[str, Any]) -> None:
        if config["strategy"] not in ("retry_then_fallback", "retry", "fail_fast"):
            raise ValueError(f"Unknown recovery strategy: {config['strategy']}")
        if config["strategy"] == "retry_then_fallback" and not config.get("fallback_model"):
            pass  # Fallback model is optional — degrades to retry-only

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        strategy = RecoveryStrategy(
            strategy=cfg["strategy"],
            max_retries=cfg["max_retries"],
            on_tool_error=cfg["on_tool_error"],
            on_context_overflow=cfg["on_context_overflow"],
            fallback_model=cfg.get("fallback_model"),
        )
        return BlockResult(
            primitive=strategy,
            meta={"recovery_strategy": strategy},
        )

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        card.checks["retries_bounded"] = 0 <= self._config.get("max_retries", 0) <= 5
        card.checks["overflow_handled"] = self._config.get("on_context_overflow") in (
            "summarize", "truncate", "error",
        )
        if self._config.get("strategy") == "retry_then_fallback":
            has_fallback = bool(self._config.get("fallback_model"))
            card.checks["fallback_configured"] = has_fallback
            if not has_fallback:
                card.notes.append("retry_then_fallback without fallback_model — will retry only")
        return card
