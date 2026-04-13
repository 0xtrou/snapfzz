"""AgentLoopBlock — configure the ReAct cycle and assemble the final agent."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from agentscope.agent import ReActAgent
from agentscope.model import OpenAIChatModel

from blocks.base import Block, BlockResult, Scorecard


class AgentLoopBlock(Block):
    """Assembles the AgentScope ReActAgent from accumulated pipeline context.

    Consumes: model config, toolkit, memory, system prompt (from prior blocks).
    Produces: a fully configured ReActAgent ready to process messages.

    pack.yaml keys:
        agent.type: ReActAgent (only supported type for now)
        agent.model: model name or ${ENV_VAR}
        agent.prompt: path to system prompt file
        agent.max_iterations: ReAct loop cap (default 10)
        agent.verify: whether to run a verification step (default false)
    """

    name = "agent_loop"

    def _defaults(self) -> dict[str, Any]:
        return {
            "type": "ReActAgent",
            "max_iterations": 10,
            "verify": False,
        }

    def _validate(self, config: dict[str, Any]) -> None:
        if config.get("type") not in ("ReActAgent",):
            raise ValueError(f"Unsupported agent type: {config.get('type')}")

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        pack_dir = context.get("pack_dir", ".")

        # Load system prompt — may have been modified by sentiment block
        sys_prompt = context.get("sys_prompt", "")
        if not sys_prompt and cfg.get("prompt"):
            prompt_path = Path(pack_dir) / cfg["prompt"]
            if prompt_path.exists():
                sys_prompt = prompt_path.read_text()

        # Resolve model — use context override if sentiment/recovery set one
        model_name = context.get("model_name", cfg.get("model", "gpt-4o"))
        model = OpenAIChatModel(
            model_name,
            api_key=context.get("api_key", ""),
            stream=True,
        )

        # Build agent with everything accumulated from prior blocks
        agent = ReActAgent(
            name=context.get("agent_name", "Orchestrator"),
            model=model,
            sys_prompt=sys_prompt,
            toolkit=context.get("tools"),  # From ToolsBlock
            memory=context.get("state"),   # From StateBlock
            max_iters=cfg["max_iterations"],
        )
        agent.set_console_output_enabled(enabled=False)

        return BlockResult(
            primitive=agent,
            meta={"agent": agent},
        )

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        card.checks["type_supported"] = self._config.get("type") == "ReActAgent"
        card.checks["iterations_bounded"] = 1 <= self._config.get("max_iterations", 0) <= 50
        return card
