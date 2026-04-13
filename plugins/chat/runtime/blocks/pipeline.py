"""BlockPipeline — composes blocks, reads pack.yaml, builds an AgentScope agent."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

from blocks.base import Block, BlockResult, Scorecard

# Canonical execution order — earlier blocks feed context to later ones.
BLOCK_ORDER = [
    "state", "context", "tools", "security", "recovery",
    "plan_mode", "sentiment", "multi_agent", "agent_loop",
]


class BlockPipeline:
    """Reads pack.yaml, runs blocks in order, produces an AgentScope agent."""

    def __init__(self, blocks: list[Block], pack_config: dict[str, Any]) -> None:
        self._blocks = blocks
        self._pack = pack_config
        self._context: dict[str, Any] = {}
        self._results: dict[str, BlockResult] = {}

    @classmethod
    def from_pack(cls, pack_path: str | Path) -> BlockPipeline:
        """Load pack.yaml and instantiate the block implementations."""
        pack_path = Path(pack_path)
        with open(pack_path) as f:
            raw = yaml.safe_load(f)

        # Resolve prompt file paths relative to pack directory
        raw["_pack_dir"] = str(pack_path.parent)

        # Resolve env vars in config values (${VAR} syntax)
        raw = _resolve_env(raw)

        blocks = _instantiate_blocks(raw)
        return cls(blocks=blocks, pack_config=raw)

    def build(self) -> Any:
        """Run all blocks in order, return the final AgentScope agent."""
        self._context = {
            "pack": self._pack,
            "pack_dir": self._pack.get("_pack_dir", "."),
        }

        for block in self._blocks:
            section = self._pack.get(block.name, {})
            if isinstance(section, str):
                section = {"value": section}
            elif not isinstance(section, dict):
                section = {}
            block.configure(section)
            result = block.apply(self._context)
            self._results[block.name] = result
            # Each block can inject into context for downstream blocks
            if result.meta:
                self._context.update(result.meta)
            # Also store the primitive under the block name
            self._context[block.name] = result.primitive

        return self._context.get("agent")

    def evaluate(self) -> list[Scorecard]:
        """Run evaluate() on all blocks, return scorecards."""
        return [block.evaluate() for block in self._blocks]

    def get_block(self, name: str) -> Block | None:
        """Retrieve a block by name for inspection or replacement."""
        for block in self._blocks:
            if block.name == name:
                return block
        return None

    def replace_block(self, name: str, replacement: Block) -> None:
        """Swap a block implementation. Raises KeyError if not found."""
        for i, block in enumerate(self._blocks):
            if block.name == name:
                self._blocks[i] = replacement
                return
        raise KeyError(f"No block named '{name}'")


def _instantiate_blocks(config: dict[str, Any]) -> list[Block]:
    """Create block instances in canonical order for present config keys."""
    from blocks.agent_loop import AgentLoopBlock
    from blocks.context import ContextBlock
    from blocks.multi_agent import MultiAgentBlock
    from blocks.plan_mode import PlanModeBlock
    from blocks.recovery import RecoveryBlock
    from blocks.security import SecurityBlock
    from blocks.sentiment import SentimentBlock
    from blocks.state import StateBlock
    from blocks.tools import ToolsBlock

    registry: dict[str, type[Block]] = {
        "agent_loop": AgentLoopBlock,
        "multi_agent": MultiAgentBlock,
        "plan_mode": PlanModeBlock,
        "context": ContextBlock,
        "tools": ToolsBlock,
        "recovery": RecoveryBlock,
        "security": SecurityBlock,
        "state": StateBlock,
        "sentiment": SentimentBlock,
    }

    # Map pack.yaml top-level keys to block names
    KEY_MAP = {
        "agent": "agent_loop",
        "sub_agents": "multi_agent",
        "plan_mode": "plan_mode",
        "context": "context",
        "tools": "tools",
        "recovery": "recovery",
        "security": "security",
        "state": "state",
        "sentiment": "sentiment",
    }

    # Determine which blocks to include
    active = set()
    for yaml_key, block_name in KEY_MAP.items():
        if yaml_key in config:
            active.add(block_name)

    # agent_loop is always required
    active.add("agent_loop")

    # Instantiate in canonical order
    blocks = []
    for name in BLOCK_ORDER:
        if name in active:
            blocks.append(registry[name]())

    return blocks


def _resolve_env(obj: Any) -> Any:
    """Recursively resolve ${VAR} references in config values."""
    if isinstance(obj, str) and obj.startswith("${") and obj.endswith("}"):
        var = obj[2:-1]
        return os.environ.get(var, obj)
    if isinstance(obj, dict):
        return {k: _resolve_env(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_resolve_env(v) for v in obj]
    return obj
