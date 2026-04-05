from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from agentscope.agent import ReActAgent
from agentscope.memory import InMemoryMemory
from agentscope.model import OpenAIChatModel
from agentscope.pipeline import stream_printing_messages
from agentscope.tool import Toolkit, execute_python_code

from agentscope_runtime.engine import AgentApp
from agentscope_runtime.engine.schemas.agent_schemas import AgentRequest


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


agent_app = AgentApp(
    app_name="Snapfzz",
    app_description="AI-powered project builder",
    lifespan=lifespan,
)


@agent_app.query(framework="agentscope")
async def query_func(
    self,
    msgs,
    request: AgentRequest = None,
    **kwargs,
):
    toolkit = Toolkit()
    toolkit.register_tool_function(execute_python_code)

    agent = ReActAgent(
        name="Orchestrator",
        model=OpenAIChatModel(
            os.getenv("SNAPFZZ_MODEL", "gpt-4o"),
            api_key=os.getenv("SNAPFZZ_API_KEY", ""),
            stream=True,
        ),
        sys_prompt="You are a senior fullstack engineer helping the user build their project.",
        toolkit=toolkit,
        memory=InMemoryMemory(),
    )
    agent.set_console_output_enabled(enabled=False)

    async for msg, last in stream_printing_messages(
        agents=[agent],
        coroutine_task=agent(msgs),
    ):
        yield msg, last


if __name__ == "__main__":
    agent_app.run(host="127.0.0.1", port=8090)
