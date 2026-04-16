"""Orchestrator — FastAPI application factory.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/app/_app.py

Started via CLI:
    orchestrator app --host 127.0.0.1 --port 9150

Environment variables (injected by Snapfzz process manager):
    SNAPFZZ_HOST         — bind address (redundant with --host, for compat)
    SNAPFZZ_PORT         — bind port (redundant with --port, for compat)
    MEMORY_DATABASE_URL  — PostgreSQL connection string
    LITELLM_BASE_URL     — LiteLLM gateway for LLM provider routing
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # TODO: Initialize MultiAgentManager, load agent configs, start services
    yield
    # TODO: Graceful shutdown — stop agents, close connections


def create_app() -> FastAPI:
    """Application factory — called by uvicorn via `orchestrator app`."""
    app = FastAPI(
        title="Snapfzz Orchestrator",
        version="0.1.0",
        lifespan=_lifespan,
    )

    @app.get("/health")
    async def health():
        return JSONResponse({"status": "healthy", "version": "0.1.0"})

    # TODO: Mount agent routes (/process SSE, /chats, etc.)
    # TODO: Extracted from QwenPaw DynamicMultiAgentRunner

    return app
