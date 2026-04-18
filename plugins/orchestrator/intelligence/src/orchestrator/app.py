# -*- coding: utf-8 -*-
"""Orchestrator — lean FastAPI application factory.

Per A013/C1: This module builds a FastAPI app that mounts QwenPaw's full
feature surface (routers, channels, /process SSE) against our internal
LiteLLM gateway, without the console SPA, AuthMiddleware, Cloudflare tunnel,
local model loaders, or skill_scanner (ONNX).

The DynamicMultiAgentRunner class is inlined here (not imported from
qwenpaw.app._app) because qwenpaw.app._app has module-level side effects
(load_envs_into_environ(), module-level agent_app construction) that we must
avoid — our app wires everything explicitly in build_app().

Environment variables (injected by Rust PluginProcessFactory):
    LITELLM_BASE_URL     — LiteLLM gateway base URL (required)
    LITELLM_MASTER_KEY   — LiteLLM master key for auth (required)
    QWENPAW_WORKING_DIR  — Isolated agent data directory (required)
    SNAPFZZ_HOST         — Bind address (passed as --host too)
    SNAPFZZ_PORT         — Bind port (passed as --port too)
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

# ── Prompt file resolution ─────────────────────────────────────────────────────
_PACK_DIR = Path(__file__).resolve().parent.parent.parent.parent / "pack"
_SYSTEM_PROMPT_FILE = _PACK_DIR / "prompts" / "system.md"

_PLACEHOLDER_SYSTEM_PROMPT = (
    "You are an intelligent assistant powered by the Snapfzz orchestrator."
)


def _read_system_prompt() -> str:
    """Read system prompt from pack/prompts/system.md if it exists."""
    if _SYSTEM_PROMPT_FILE.exists():
        try:
            return _SYSTEM_PROMPT_FILE.read_text(encoding="utf-8").strip()
        except OSError:
            pass
    return _PLACEHOLDER_SYSTEM_PROMPT


# ── Env validation ─────────────────────────────────────────────────────────────

def _require_env(name: str) -> str:
    """Read a required env var; raise loudly if missing."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"[orchestrator] Required environment variable {name!r} is not set. "
            "Ensure the Rust PluginProcessFactory injects it before spawning."
        )
    return value


def _read_env() -> tuple[str, str, str, str, str]:
    """Return (litellm_base_url, litellm_master_key, working_dir, host, port)."""
    litellm_base_url = _require_env("LITELLM_BASE_URL")
    litellm_master_key = _require_env("LITELLM_MASTER_KEY")
    # Per A013/C1: working_dir may already be set before import; still validate.
    working_dir = _require_env("QWENPAW_WORKING_DIR")
    host = os.environ.get("SNAPFZZ_HOST", "127.0.0.1")
    port = os.environ.get("SNAPFZZ_PORT", "9150")
    return litellm_base_url, litellm_master_key, working_dir, host, port


# ── DynamicMultiAgentRunner (inlined from qwenpaw.app._app) ───────────────────
# Per A013/C1: Inlined instead of imported to avoid qwenpaw.app._app module-level
# side effects (load_envs_into_environ, module-level agent_app construction).

class _DynamicMultiAgentRunner:
    """Runner wrapper that dynamically routes to the correct workspace runner.

    Mirrors qwenpaw.app._app.DynamicMultiAgentRunner exactly — see that file
    for the canonical docstrings. We copy to avoid module-level side effects.
    """

    def __init__(self):
        self.framework_type = "agentscope"
        self._multi_agent_manager = None

    def set_multi_agent_manager(self, manager) -> None:
        """Set the MultiAgentManager instance after initialization."""
        self._multi_agent_manager = manager

    async def _get_workspace(self, request):
        from qwenpaw.app.agent_context import get_current_agent_id
        from agentscope_runtime.engine.schemas.exception import AppBaseException

        agent_id = get_current_agent_id()
        logger.debug("_get_workspace: agent_id=%s", agent_id)

        if not self._multi_agent_manager:
            raise RuntimeError("MultiAgentManager not initialized")

        try:
            workspace = await self._multi_agent_manager.get_agent(agent_id)
            logger.debug(
                "Got workspace: %s, runner: %s",
                workspace.agent_id,
                workspace.runner,
            )
            return workspace
        except (ValueError, AppBaseException) as exc:
            logger.error("Agent not found: %s", exc)
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("Error getting workspace: %s", exc, exc_info=True)
            raise

    async def _get_workspace_runner(self, request):
        workspace = await self._get_workspace(request)
        return workspace.runner

    async def stream_query(self, request, *args, **kwargs):
        """Dynamically route to the correct workspace runner."""
        logger.debug("_DynamicMultiAgentRunner.stream_query called")
        workspace = None
        run_key = None
        try:
            workspace = await self._get_workspace(request)
            runner = workspace.runner
            run_key = f"ext-{uuid.uuid4().hex}"
            await workspace.task_tracker.register_external_task(run_key)
            count = 0
            async for item in runner.stream_query(request, *args, **kwargs):
                count += 1
                yield item
            logger.debug("stream_query completed, yielded %d items", count)
        except Exception as exc:  # noqa: BLE001
            logger.error("Error in stream_query: %s", exc, exc_info=True)
            yield {"error": str(exc), "type": "error"}
        finally:
            if workspace is not None and run_key is not None:
                await workspace.task_tracker.unregister_external_task(run_key)

    async def query_handler(self, request, *args, **kwargs):
        """Dynamically route to the correct workspace runner."""
        workspace = None
        run_key = None
        try:
            workspace = await self._get_workspace(request)
            runner = workspace.runner
            run_key = f"ext-{uuid.uuid4().hex}"
            await workspace.task_tracker.register_external_task(run_key)
            async for item in runner.query_handler(request, *args, **kwargs):
                yield item
        finally:
            if workspace is not None and run_key is not None:
                await workspace.task_tracker.unregister_external_task(run_key)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return None


# ── App factory ────────────────────────────────────────────────────────────────

def build_app() -> FastAPI:  # noqa: C901
    """Build and return the lean orchestrator FastAPI application.

    Per A013/C1:
    - Reads env vars before importing QwenPaw (WORKING_DIR is module-level).
    - Registers a single OpenAIProvider pointing at the LiteLLM gateway.
    - Builds an AgentProfileConfig with active_model targeting 'orchestrator'.
    - Mounts all QwenPaw API routers and channel routes.
    - Does NOT mount: console SPA, AuthMiddleware, tunnel, local_models, skill_scanner.
    """
    litellm_base_url, litellm_master_key, working_dir, _host, _port = _read_env()

    # Per A013/C1: Set QWENPAW_WORKING_DIR before any qwenpaw import so
    # qwenpaw.constant.WORKING_DIR is resolved to our isolated data dir.
    os.environ.setdefault("QWENPAW_WORKING_DIR", working_dir)

    # Per A013/C1: Opt out of QwenPaw telemetry by writing the marker file
    # into the working dir before the lifespan tries to collect.
    _write_telemetry_optout(Path(working_dir))

    # Now it is safe to import QwenPaw symbols.
    from qwenpaw.providers.models import ModelSlotConfig
    from qwenpaw.providers.openai_provider import OpenAIProvider
    from qwenpaw.providers.provider import ModelInfo
    from qwenpaw.providers.provider_manager import ProviderManager
    from qwenpaw.config.config import (
        AgentProfileConfig,
        AgentsRunningConfig,
        ToolsConfig,
        _default_builtin_tools,
    )
    from qwenpaw.app.multi_agent_manager import MultiAgentManager
    from qwenpaw.app.routers import router as api_router, create_agent_scoped_router
    from qwenpaw.app.routers.agent_scoped import AgentContextMiddleware
    from qwenpaw.app.routers.voice import voice_router
    from qwenpaw.app.channels.registry import register_custom_channel_routes
    from agentscope_runtime.engine.app import AgentApp

    # ── Provider setup ─────────────────────────────────────────────────────────
    # Per A013/C1: Single provider — id="snapfzz-gateway", OpenAI-compatible,
    # pointing at our internal LiteLLM gateway. Model list: ["orchestrator"].

    gateway_provider = OpenAIProvider(
        id="snapfzz-gateway",
        name="Snapfzz Gateway (LiteLLM)",
        base_url=litellm_base_url,
        api_key=litellm_master_key,
        require_api_key=True,
        # Per A013/C1: disable pre-flight connection check — gateway is internal.
        support_connection_check=False,
        models=[
            ModelInfo(
                id="orchestrator",
                name="Orchestrator (LiteLLM combo)",
                supports_image=False,
                supports_video=False,
                probe_source="documentation",
            )
        ],
    )

    # ── Agent config ───────────────────────────────────────────────────────────
    # Per A013/Tools: enable QwenPaw's full builtin tool suite with one carve-out.
    #
    # `browser_use` is DISABLED — QwenPaw's implementation drives Playwright
    # against a user-installed system Chrome, and Snapfzz is a bundled app that
    # only ships the embedded CEF runtime (`snapfzz-cef`). Letting the agent
    # call `browser_use` under this assumption fails with
    #   "Open failed: 'NoneType' object has no attribute 'new_page'"
    # because neither the managed CDP launcher nor the fallback
    # `_action_start(private_mode=True)` can find a launchable browser binary.
    #
    # The CEF-backed browser tool (that calls into our Rust `cef_*` Tauri
    # commands) will re-enable this slot; tracked as a follow-up.
    _builtin_tools = _default_builtin_tools()
    _builtin_tools["browser_use"].enabled = False
    _tools_config = ToolsConfig(builtin_tools=_builtin_tools)

    # Per A013/C1: workspace_dir inside the plugin's isolated data dir.
    workspace_dir = str(Path(working_dir) / "workspaces" / "default")

    agent_config = AgentProfileConfig(
        id="default",
        name="Orchestrator",
        description="Snapfzz orchestrator agent — single-agent mode",
        workspace_dir=workspace_dir,
        active_model=ModelSlotConfig(
            provider_id="snapfzz-gateway",
            model="orchestrator",
        ),
        running=AgentsRunningConfig(),
        tools=_tools_config,
        # Per A013/C1: No channels, no MCP, no heartbeat, no security overrides.
        channels=None,
        mcp=None,
        heartbeat=None,
        security=None,
    )

    # ── AgentApp + runner setup ────────────────────────────────────────────────
    # Per A013/C1: _DynamicMultiAgentRunner is required by QwenPaw's runner chain
    # (MultiAgentManager orchestrates workspaces, AgentApp routes SSE /process
    # through the runner). Inlined to avoid qwenpaw.app._app module-level effects.
    runner = _DynamicMultiAgentRunner()

    # Per A013/C1: enable_stream_task=False keeps the task queue disabled;
    # stream=True enables SSE streaming on /process.
    agent_app = AgentApp(
        app_name="Snapfzz Orchestrator",
        app_description="Snapfzz orchestrator — single-agent mode",
        runner=runner,
        enable_stream_task=False,
        stream=True,
    )

    # ── Lifespan ───────────────────────────────────────────────────────────────

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # noqa: ANN001
        """Startup: register provider, seed agent config, launch MultiAgentManager.
        Shutdown: stop all agents cleanly.
        """
        # Per A013/C1: Register single provider in the singleton ProviderManager.
        provider_manager = ProviderManager.get_instance()
        provider_manager.custom_providers["snapfzz-gateway"] = gateway_provider

        multi_agent_manager = MultiAgentManager()
        app.state.multi_agent_manager = multi_agent_manager
        app.state.provider_manager = provider_manager
        # Per A013/C1: local_model_manager is None — we don't load local models.
        app.state.local_model_manager = None
        app.state.plugin_loader = None
        app.state.plugin_registry = None

        # Per A013/C1: Pre-populate the default agent config on disk so
        # MultiAgentManager finds it without migration.
        _seed_agent_config(agent_config, workspace_dir)

        async def _get_agent_by_id(agent_id: Optional[str] = None):
            if agent_id is None:
                agent_id = "default"
            return await multi_agent_manager.get_agent(agent_id)

        app.state.get_agent_by_id = _get_agent_by_id

        runner.set_multi_agent_manager(multi_agent_manager)

        logger.info("[orchestrator] startup complete — gateway: %s", litellm_base_url)
        yield

        # Shutdown
        multi_agent_mgr = getattr(app.state, "multi_agent_manager", None)
        if multi_agent_mgr is not None:
            with suppress(Exception):
                await multi_agent_mgr.stop_all()
        logger.info("[orchestrator] shutdown complete")

    # ── FastAPI assembly ───────────────────────────────────────────────────────

    app = FastAPI(
        title="Snapfzz Orchestrator",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    # Per A013/C1: AgentContextMiddleware routes requests to the correct workspace
    # via X-Agent-Id header — required by agent-scoped endpoints.
    app.add_middleware(AgentContextMiddleware)

    # Per A013/C1: CORS — frontend SSE client runs on a different origin.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    # /health — required by PluginProcessFactory health check.
    @app.get("/health")
    async def health() -> JSONResponse:
        return JSONResponse({"status": "healthy"})

    # Per A013/C1: Mount the full QwenPaw api_router (includes chats, tools,
    # files, agents, skills, mcp, workspace, token_usage, messages, config,
    # providers, crons, runner, envs, settings, auth, voice endpoints, and
    # local_models + plugins endpoints).
    # NOTE: We do NOT add AuthMiddleware (the middleware class itself is excluded);
    # the auth_router (CRUD endpoints) and local_models_router (API surface) are
    # included because their heavy deps are lazy-imported inside handlers, not at
    # module level. The SPA static file mounts and the console push-store are
    # excluded by not running QwenPaw's own app factory.
    app.include_router(api_router, prefix="/api")

    # Per A013/C1: Agent-scoped router — /api/agents/{agentId}/chats etc.
    agent_scoped_router = create_agent_scoped_router()
    app.include_router(agent_scoped_router, prefix="/api")

    # Per A013/C1: AgentApp routes — /api/agent/process (SSE) + /api/agent/health.
    app.include_router(
        agent_app.router,
        prefix="/api/agent",
        tags=["agent"],
    )

    # Per A013/C1: Voice channel at root level (Twilio-facing, not under /api/).
    app.include_router(voice_router, tags=["voice"])

    # Per A013/C1: Custom channel HTTP routes (webhook handlers, QR login pages).
    register_custom_channel_routes(app)

    return app


# ── Helpers ────────────────────────────────────────────────────────────────────

def _write_telemetry_optout(working_dir: Path) -> None:
    """Write QwenPaw telemetry opt-out marker into the working dir.

    Per A013/C1: QwenPaw's telemetry checks for a JSON marker file at
    {working_dir}/.telemetry_collected. Writing opted_out=true prevents
    any telemetry upload without monkey-patching QwenPaw code.
    """
    working_dir.mkdir(parents=True, exist_ok=True)
    marker = working_dir / ".telemetry_collected"
    if not marker.exists():
        try:
            marker.write_text(
                json.dumps({"opted_out": True, "versions": []}),
                encoding="utf-8",
            )
        except OSError:
            pass


def _seed_agent_config(agent_config, workspace_dir: str) -> None:
    """Write agent.json into the workspace so QwenPaw finds it on first start.

    Per A013/C1: MultiAgentManager reads agent.json from workspace_dir.
    If missing, it falls back to build_fallback_agent_profile_config which
    requires a populated root config.json — seeding avoids that dependency.
    """
    ws = Path(workspace_dir).expanduser()
    ws.mkdir(parents=True, exist_ok=True)
    agent_json = ws / "agent.json"
    if not agent_json.exists():
        try:
            agent_json.write_text(
                agent_config.model_dump_json(exclude_none=True, indent=2),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("[orchestrator] could not write agent.json: %s", exc)
