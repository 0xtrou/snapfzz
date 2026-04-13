"""Block base class — the interface contract for all 9 intelligence blocks."""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class BlockResult:
    """What a block produces after apply(). Carries the configured primitive
    and metadata for downstream blocks or the pipeline."""

    primitive: Any  # The AgentScope object this block configured
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class Scorecard:
    """Evaluation result for a single block. Used for diagnostics, not gating."""

    block_name: str
    score: float  # 0.0 - 1.0
    checks: dict[str, bool] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(self.checks.values()) if self.checks else self.score >= 0.5


class Block(ABC):
    """Base class for intelligence blocks.

    Lifecycle:
        configure(config)  — read pack.yaml section, validate, store params
        apply(context)     — produce a BlockResult wrapping an AgentScope primitive
        evaluate()         — self-check, return a Scorecard

    Blocks are stateless between invocations. Config is stored in configure()
    and consumed in apply(). No hidden state accumulates across calls.
    """

    name: str = "base"

    def __init__(self) -> None:
        self._config: dict[str, Any] = {}
        self._applied: bool = False
        self._apply_ms: float = 0.0

    def configure(self, config: dict[str, Any]) -> None:
        """Validate and store config from the relevant pack.yaml section.

        Subclasses override _validate() and _defaults() — not this method.
        """
        merged = {**self._defaults(), **config}
        self._validate(merged)
        self._config = merged

    def apply(self, context: dict[str, Any]) -> BlockResult:
        """Produce a configured AgentScope primitive.

        Args:
            context: Accumulated state from prior blocks in the pipeline.
                     Keys include 'model', 'toolkit', 'memory', 'agent', etc.
        """
        t0 = time.monotonic()
        result = self._apply(context)
        self._apply_ms = (time.monotonic() - t0) * 1000
        self._applied = True
        return result

    def evaluate(self) -> Scorecard:
        """Self-check. Returns a scorecard with pass/fail checks.

        Default implementation checks that configure() and apply() ran.
        Subclasses extend with domain-specific checks via _evaluate().
        """
        card = Scorecard(block_name=self.name, score=1.0)
        card.checks["configured"] = bool(self._config)
        card.checks["applied"] = self._applied
        card.checks["apply_under_100ms"] = self._apply_ms < 100

        sub_card = self._evaluate()
        if sub_card:
            card.checks.update(sub_card.checks)
            card.notes.extend(sub_card.notes)
            # Recompute score as ratio of passed checks
            total = len(card.checks)
            passed = sum(1 for v in card.checks.values() if v)
            card.score = passed / total if total else 0.0

        return card

    # -- Subclass hooks --

    def _defaults(self) -> dict[str, Any]:
        """Return default config values. Override in subclasses."""
        return {}

    def _validate(self, config: dict[str, Any]) -> None:
        """Raise ValueError if config is invalid. Override in subclasses."""

    @abstractmethod
    def _apply(self, context: dict[str, Any]) -> BlockResult:
        """Core logic. Produce the BlockResult. Must override."""
        ...

    def _evaluate(self) -> Scorecard | None:
        """Additional evaluation checks. Override in subclasses."""
        return None
