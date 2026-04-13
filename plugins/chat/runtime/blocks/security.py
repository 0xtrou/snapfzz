"""SecurityBlock — action authorization gates for tool execution."""

from __future__ import annotations

from typing import Any

from blocks.base import Block, BlockResult, Scorecard


class SecurityPolicy:
    """Runtime security policy that gates tool execution."""

    def __init__(
        self,
        require_approval: list[str],
        blocked: list[str],
    ) -> None:
        self._require_approval = set(require_approval)
        self._blocked = set(blocked)

    def is_blocked(self, action: str) -> bool:
        return action in self._blocked

    def needs_approval(self, action: str) -> bool:
        return action in self._require_approval

    def check(self, action: str) -> str:
        """Returns 'allow', 'approve', or 'block'."""
        if self.is_blocked(action):
            return "block"
        if self.needs_approval(action):
            return "approve"
        return "allow"


class SecurityBlock(Block):
    """Action authorization gates — require_approval and blocked lists."""

    name = "security"

    def _defaults(self) -> dict[str, Any]:
        return {
            "require_approval": [],
            "blocked": [],
        }

    def _validate(self, config: dict[str, Any]) -> None:
        overlap = set(config.get("require_approval", [])) & set(config.get("blocked", []))
        if overlap:
            raise ValueError(f"Actions in both require_approval and blocked: {overlap}")

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        policy = SecurityPolicy(
            require_approval=cfg["require_approval"],
            blocked=cfg["blocked"],
        )
        return BlockResult(
            primitive=policy,
            meta={"security_policy": policy},
        )

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        blocked = set(self._config.get("blocked", []))
        card.checks["has_blocked_list"] = len(blocked) > 0
        # Check that high-risk system actions are blocked
        system_actions = {"vault_access", "system_settings", "process_management"}
        card.checks["system_actions_blocked"] = system_actions.issubset(blocked)
        if not card.checks["system_actions_blocked"]:
            card.notes.append(f"Unblocked system actions: {system_actions - blocked}")
        return card
