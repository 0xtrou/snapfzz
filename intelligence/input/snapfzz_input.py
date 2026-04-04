from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

AgentScopeUserInputBase: type[Any]
AgentScopeUserInputData: type[Any]
AgentScopeTextBlock: type[Any]

try:
    from agentscope.agent import UserInputBase as AgentScopeUserInputBase
    from agentscope.agent import UserInputData as AgentScopeUserInputData
    from agentscope.message import TextBlock as AgentScopeTextBlock
except ImportError:
    AgentScopeUserInputBase = object

    @dataclass
    class _FallbackTextBlock:
        type: str = "text"
        text: str = ""

    @dataclass
    class _FallbackUserInputData:
        blocks_input: list[Any] = field(default_factory=list)

    AgentScopeTextBlock = _FallbackTextBlock
    AgentScopeUserInputData = _FallbackUserInputData


class SnapfzzUserInput(AgentScopeUserInputBase):
    def __init__(self) -> None:
        # Per plugins/chat/SPEC architecture resonance: HTTP input is queued for UserInputBase pull semantics.
        self._queues: dict[str, asyncio.Queue[str]] = {}

    def ensure_queue(self, session_id: str) -> asyncio.Queue[str]:
        queue = self._queues.get(session_id)
        if queue is None:
            queue = asyncio.Queue()
            self._queues[session_id] = queue
        return queue

    async def push(self, session_id: str, text: str) -> None:
        queue = self.ensure_queue(session_id)
        await queue.put(text)

    def drop(self, session_id: str) -> None:
        self._queues.pop(session_id, None)

    async def __call__(
        self,
        agent_id: str,
        agent_name: str,
        *args: Any,
        structured_model: Any = None,
        **kwargs: Any,
    ) -> Any:
        session_id = str(kwargs.get("session_id", "default"))
        queue = self.ensure_queue(session_id)
        text = await queue.get()
        return AgentScopeUserInputData(
            blocks_input=[AgentScopeTextBlock(type="text", text=text)],
        )
