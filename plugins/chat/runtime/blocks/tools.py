"""ToolsBlock — configure AgentScope Toolkit from pack.yaml tool declarations."""

from __future__ import annotations

import importlib
from typing import Any, Callable

from agentscope.tool import Toolkit

from blocks.base import Block, BlockResult, Scorecard

# Tool ID -> module_path:function_name mapping.
TOOL_REGISTRY: dict[str, str] = {
    "files.read": "tools.files:read_file",
    "files.write": "tools.files:write_file",
    "files.search": "tools.files:search_files",
    "files.delete": "tools.files:delete_file",
    "shell.exec": "tools.shell:exec_command",
    "web.search": "tools.web:web_search",
    "web.fetch": "tools.web:web_fetch",
    "memory.store": "tools.project:memory_store",
    "memory.query": "tools.project:memory_query",
    "project.structure": "tools.project:project_tree",
    "project.deps": "tools.project:project_deps",
}


def resolve_tool(tool_id: str) -> Callable:
    """Resolve a tool ID like 'files.read' to its Python callable."""
    path = TOOL_REGISTRY.get(tool_id)
    if not path:
        raise ValueError(f"Unknown tool: {tool_id}")
    module_path, func_name = path.rsplit(":", 1)
    module = importlib.import_module(module_path)
    return getattr(module, func_name)


class ToolsBlock(Block):
    """Builds an AgentScope Toolkit from the pack's tool configuration.

    pack.yaml keys:
        tools.available: list of tool IDs to register
        tools.auto_select: whether agent picks tools automatically (default true)
        tools.max_parallel: max concurrent tool calls (default 1)
        tools.require_approval: tool IDs that need user confirmation
    """

    name = "tools"

    def _defaults(self) -> dict[str, Any]:
        return {
            "available": [],
            "auto_select": True,
            "max_parallel": 1,
            "require_approval": [],
        }

    def _validate(self, config: dict[str, Any]) -> None:
        available = config.get("available", [])
        unknown = [t for t in available if t not in TOOL_REGISTRY]
        if unknown:
            raise ValueError(f"Unknown tools: {unknown}")

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        toolkit = Toolkit()

        registered = []
        for tool_id in cfg["available"]:
            fn = resolve_tool(tool_id)
            toolkit.register_tool_function(fn)
            registered.append(tool_id)

        return BlockResult(
            primitive=toolkit,
            meta={
                "tools": toolkit,
                "tools_registered": registered,
                "tools_require_approval": cfg["require_approval"],
                "tools_max_parallel": cfg["max_parallel"],
            },
        )

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        card.checks["has_tools"] = len(self._config.get("available", [])) > 0
        card.checks["parallel_bounded"] = 1 <= self._config.get("max_parallel", 0) <= 10
        approval = self._config.get("require_approval", [])
        dangerous = {"shell.exec", "files.delete"}
        card.checks["dangerous_tools_gated"] = dangerous.issubset(set(approval))
        if not card.checks["dangerous_tools_gated"]:
            card.notes.append(f"Ungated dangerous tools: {dangerous - set(approval)}")
        return card
