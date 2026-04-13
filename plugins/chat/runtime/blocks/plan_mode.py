"""PlanModeBlock — decide when the agent should plan vs react."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from blocks.base import Block, BlockResult, Scorecard


@dataclass
class PlanPolicy:
    """Planning policy consumed by the agent loop.

    Determines whether the agent should produce an explicit plan before
    acting, or jump straight into ReAct tool-use.
    """

    mode: str         # 'threshold' | 'always_plan' | 'never_plan'
    threshold: int    # Complexity score above which planning triggers
    plan_prompt: str  # Injected into system prompt when planning is active

    def should_plan(self, complexity: int) -> bool:
        if self.mode == "always_plan":
            return True
        if self.mode == "never_plan":
            return False
        return complexity >= self.threshold


class PlanModeBlock(Block):
    """Configures when the agent produces a step-by-step plan before acting.

    The PlanPolicy is injected into context for AgentLoopBlock to use when
    modifying the system prompt or controlling ReAct iteration depth.

    pack.yaml keys:
        plan_mode.mode: 'threshold' | 'always_plan' | 'never_plan' (default 'threshold')
        plan_mode.threshold: complexity score threshold (default 3)
    """

    name = "plan_mode"

    def _defaults(self) -> dict[str, Any]:
        return {
            "mode": "threshold",
            "threshold": 3,
        }

    def _validate(self, config: dict[str, Any]) -> None:
        if config["mode"] not in ("threshold", "always_plan", "never_plan"):
            raise ValueError(f"Unknown plan mode: {config['mode']}")

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        plan_prompt = (
            "Before taking action, break the task into numbered steps. "
            "Execute each step, checking off progress. Revise the plan if needed."
        )
        policy = PlanPolicy(
            mode=cfg["mode"],
            threshold=cfg["threshold"],
            plan_prompt=plan_prompt,
        )
        return BlockResult(
            primitive=policy,
            meta={"plan_policy": policy},
        )

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        card.checks["mode_valid"] = self._config.get("mode") in (
            "threshold", "always_plan", "never_plan",
        )
        card.checks["threshold_reasonable"] = 1 <= self._config.get("threshold", 0) <= 10
        return card
