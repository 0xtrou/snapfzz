"""MultiAgentBlock — configure sub-agent topology and delegation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from blocks.base import Block, BlockResult, Scorecard


@dataclass
class SubAgentSpec:
    """Declaration of a sub-agent that the orchestrator can delegate to."""

    id: str
    type: str
    role: str
    model_tier: str  # 'fast' | 'capable' | 'premium'
    tools: list[str] = field(default_factory=list)


@dataclass
class MultiAgentTopology:
    """Sub-agent configuration consumed by the agent loop.

    The orchestrator uses this to know which sub-agents exist,
    how to delegate, and concurrency limits.
    """

    topology: str  # 'delegation' | 'parallel' | 'single'
    max_concurrent: int
    agents: list[SubAgentSpec]

    def get_agent(self, agent_id: str) -> SubAgentSpec | None:
        return next((a for a in self.agents if a.id == agent_id), None)


class MultiAgentBlock(Block):
    """Sub-agent topology — produces a spec, not live agents."""

    name = "multi_agent"

    def _defaults(self) -> dict[str, Any]:
        return {
            "topology": "delegation",
            "max_concurrent": 3,
            "agents": [],
        }

    def _validate(self, config: dict[str, Any]) -> None:
        if config["topology"] not in ("delegation", "parallel", "single"):
            raise ValueError(f"Unknown topology: {config['topology']}")
        for agent in config.get("agents", []):
            if not agent.get("id") or not agent.get("role"):
                raise ValueError(f"Sub-agent missing id or role: {agent}")

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        agents = [
            SubAgentSpec(
                id=a["id"],
                type=a.get("type", "ReActAgent"),
                role=a["role"],
                model_tier=a.get("model_tier", "fast"),
                tools=a.get("tools", []),
            )
            for a in cfg.get("agents", [])
        ]
        topology = MultiAgentTopology(
            topology=cfg["topology"],
            max_concurrent=cfg["max_concurrent"],
            agents=agents,
        )
        return BlockResult(
            primitive=topology,
            meta={"multi_agent_topology": topology},
        )

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        agents = self._config.get("agents", [])
        card.checks["has_agents"] = len(agents) > 0
        card.checks["concurrent_bounded"] = 1 <= self._config.get("max_concurrent", 0) <= 10
        # Check all agents have unique IDs
        ids = [a.get("id") for a in agents]
        card.checks["unique_ids"] = len(ids) == len(set(ids))
        if not card.checks["unique_ids"]:
            card.notes.append("Duplicate sub-agent IDs detected")
        return card
