from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

try:
    from agentscope import init as agentscope_init
except ImportError:
    agentscope_init = None


class OrchestratorAgent:
    def __init__(self, model_config_name: str = "default") -> None:
        self.model_config_name = model_config_name
        self.name = "Orchestrator"
        self._initialized = False
        self._history: dict[str, list[dict[str, Any]]] = {}

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return

        # Per A006/CoreRuntime: stable AgentScope sidecar identity is snapfzz/alpha.
        if agentscope_init is not None:
            agentscope_init(project="snapfzz", name="alpha")

        self._initialized = True

    def get_history(self, session_id: str) -> list[dict[str, Any]]:
        return list(self._history.get(session_id, []))

    async def stream(
        self,
        *,
        session_id: str,
        user_input: Any,
        stop_event: asyncio.Event | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        self._ensure_initialized()

        input_data = await user_input(
            agent_id="user",
            agent_name="User",
            session_id=session_id,
        )
        blocks = list(getattr(input_data, "blocks_input", []))

        text = ""
        if blocks:
            text = str(getattr(blocks[0], "text", ""))

        session_history = self._history.setdefault(session_id, [])
        session_history.append(
            {
                "role": "user",
                "name": "User",
                "content": [{"type": "text", "text": text}],
            },
        )

        chunks = [
            "I got it. ",
            "I will help you break this down into an actionable build plan, ",
            "then implement step by step with fast feedback.",
        ]

        assistant_blocks: list[dict[str, Any]] = []
        for chunk in chunks:
            if stop_event is not None and stop_event.is_set():
                break

            block = {"type": "text", "text": chunk}
            assistant_blocks.append(block)
            yield block
            await asyncio.sleep(0.02)

        session_history.append(
            {
                "role": "assistant",
                "name": self.name,
                "content": assistant_blocks,
                "model_config_name": self.model_config_name,
            },
        )
