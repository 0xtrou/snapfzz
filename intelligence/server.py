from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from sse_starlette.sse import EventSourceResponse

from agents.orchestrator import OrchestratorAgent
from input.snapfzz_input import SnapfzzUserInput

app = FastAPI(title="snapfzz-intelligence", version="0.1.0")


@dataclass(slots=True)
class SessionState:
    session_id: str
    stop_event: asyncio.Event


orchestrator = OrchestratorAgent(model_config_name="default")
user_input = SnapfzzUserInput()
sessions: dict[str, SessionState] = {}


def ensure_session(session_id: str) -> SessionState:
    session = sessions.get(session_id)
    if session is None:
        session = SessionState(session_id=session_id, stop_event=asyncio.Event())
        sessions[session_id] = session
        user_input.ensure_queue(session_id)
    return session


@app.post("/session")
async def create_session(payload: dict[str, Any] | None = None) -> dict[str, str]:
    session_id = str(uuid4())
    ensure_session(session_id)
    return {"session_id": session_id}


@app.get("/session/{session_id}")
async def load_session(session_id: str) -> dict[str, Any]:
    ensure_session(session_id)
    return {"session_id": session_id, "messages": orchestrator.get_history(session_id)}


@app.post("/stop")
async def stop_generation(payload: dict[str, Any]) -> dict[str, bool]:
    session_id = str(payload.get("session_id", ""))
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    session = sessions.get(session_id)
    if session is not None:
        session.stop_event.set()

    return {"stopped": True}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "connected"}


@app.get("/agents")
async def list_agents() -> dict[str, Any]:
    return {
        "agents": [
            {
                "name": orchestrator.name,
                "model_config_name": orchestrator.model_config_name,
            },
        ],
    }


@app.post("/chat")
async def chat(payload: dict[str, Any]) -> EventSourceResponse:
    session_id = str(payload.get("session_id", ""))
    text = str(payload.get("text", ""))

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    session = ensure_session(session_id)
    session.stop_event.clear()
    await user_input.push(session_id=session_id, text=text)

    async def event_stream():
        block_order = 0

        # Per plugins/chat/SPEC domain model: stream ContentBlocks as typed SSE events.
        async for block in orchestrator.stream(
            session_id=session_id,
            user_input=user_input,
            stop_event=session.stop_event,
        ):
            block_type = str(block.get("type", "text"))
            if block_type not in {
                "text",
                "thinking",
                "tool_use",
                "tool_result",
                "image",
                "audio",
                "video",
            }:
                block_type = "text"

            payload_obj = {
                "session_id": session_id,
                "block_index": block_order,
                "content_block": block,
            }
            block_order += 1

            yield {
                "event": block_type,
                "data": json.dumps(payload_obj),
            }

        yield {
            "event": "done",
            "data": json.dumps({"finish_reason": "stop", "session_id": session_id}),
        }
        yield {"data": "[DONE]"}

    return EventSourceResponse(event_stream())
