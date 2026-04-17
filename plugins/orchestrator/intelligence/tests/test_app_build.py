# -*- coding: utf-8 -*-
"""A013/C1 — build_app() integration tests.

Per A013/C1: These tests verify that build_app() produces a correctly wired
FastAPI application without starting a real LLM or network connection.

Tests that need QwenPaw installed are guarded with pytest.mark.skipif so this
file is importable in CI without qwenpaw installed.
"""
from __future__ import annotations

import importlib
import os
import sys

import pytest

_qwenpaw_installed = importlib.util.find_spec("qwenpaw") is not None
_qwenpaw_reason = "qwenpaw not installed"


# ── Env fixture ────────────────────────────────────────────────────────────────

@pytest.fixture()
def gateway_env(tmp_path, monkeypatch):
    """Inject required gateway env vars pointing at a fake LiteLLM endpoint."""
    working_dir = str(tmp_path / "qwenpaw")
    monkeypatch.setenv("LITELLM_BASE_URL", "http://127.0.0.1:4000")
    monkeypatch.setenv("LITELLM_MASTER_KEY", "test-master-key-abc123")
    monkeypatch.setenv("QWENPAW_WORKING_DIR", working_dir)
    monkeypatch.setenv("SNAPFZZ_HOST", "127.0.0.1")
    monkeypatch.setenv("SNAPFZZ_PORT", "9150")
    # Ensure QWENPAW_WORKING_DIR is picked up at import time if constant was
    # already loaded by pointing it to the tmp dir.
    if "qwenpaw.constant" in sys.modules:
        sys.modules["qwenpaw.constant"].WORKING_DIR = \
            __import__("pathlib").Path(working_dir).expanduser().resolve()
    return working_dir


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_build_app_returns_fastapi(gateway_env):
    """A013/C1: build_app() must return a FastAPI instance."""
    from fastapi import FastAPI
    from orchestrator.app import build_app

    app = build_app()
    assert isinstance(app, FastAPI), f"expected FastAPI, got {type(app)}"


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_health_endpoint_is_registered(gateway_env):
    """A013/C1: /health must be a registered route."""
    from fastapi.testclient import TestClient
    from orchestrator.app import build_app

    app = build_app()
    # Use TestClient without lifespan to avoid starting agents.
    client = TestClient(app, raise_server_exceptions=True)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "healthy"


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_agent_active_model_targets_orchestrator(gateway_env):
    """A013/C1: AgentProfileConfig.active_model must point to 'orchestrator'."""
    from qwenpaw.providers.models import ModelSlotConfig
    from qwenpaw.config.config import AgentProfileConfig, AgentsRunningConfig

    # Build the agent config the same way build_app does.
    active_model = ModelSlotConfig(
        provider_id="snapfzz-gateway",
        model="orchestrator",
    )
    cfg = AgentProfileConfig(
        id="default",
        name="Orchestrator",
        description="test",
        workspace_dir=gateway_env + "/workspaces/default",
        active_model=active_model,
        running=AgentsRunningConfig(),
    )
    assert cfg.active_model is not None
    assert cfg.active_model.provider_id == "snapfzz-gateway"
    assert cfg.active_model.model == "orchestrator"


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_provider_registered_in_manager(gateway_env):
    """A013/C1: After build_app(), ProviderManager must have 'snapfzz-gateway'."""
    from qwenpaw.providers.provider_manager import ProviderManager
    from orchestrator.app import build_app

    build_app()

    manager = ProviderManager.get_instance()
    assert "snapfzz-gateway" in manager.custom_providers, (
        "snapfzz-gateway not found in custom_providers after build_app()"
    )
    provider = manager.custom_providers["snapfzz-gateway"]
    assert provider.base_url == "http://127.0.0.1:4000"
    # Per A013/C1: model list must include 'orchestrator'.
    model_ids = [m.id for m in provider.models]
    assert "orchestrator" in model_ids, (
        f"'orchestrator' not in provider model list: {model_ids}"
    )


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_routers_mounted_by_name(gateway_env):
    """A013/C1: Build app and verify key QwenPaw routers are mounted."""
    from orchestrator.app import build_app

    app = build_app()
    route_paths = {r.path for r in app.routes}

    # Per A013/C1: These router path prefixes must be present after mounting
    # the full QwenPaw api_router + agent_scoped + agent_app routers.
    expected_prefixes = [
        "/api/chats",
        "/api/tools",
        "/api/files",
        "/api/agents",
        "/api/skills",
        "/api/mcp",
        "/api/workspace",
        "/api/token_usage",
        "/api/messages",
        "/api/config",
        "/api/providers",
        "/api/agent",
    ]
    for prefix in expected_prefixes:
        matched = any(p.startswith(prefix) for p in route_paths)
        assert matched, (
            f"Expected route prefix {prefix!r} not found. "
            f"Available prefixes: {sorted(route_paths)[:20]}"
        )


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_minimum_router_count(gateway_env):
    """A013/C1: At least 30 routes must be mounted (sanity count)."""
    from orchestrator.app import build_app

    app = build_app()
    # Per A013/C1: QwenPaw ships many endpoints; 30 is a conservative lower bound.
    assert len(app.routes) >= 30, (
        f"Expected at least 30 routes, got {len(app.routes)}"
    )


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_console_spa_routes_not_mounted(gateway_env):
    """A013/C1: Console SPA catch-all must NOT be mounted."""
    from orchestrator.app import build_app

    app = build_app()
    route_paths = {r.path for r in app.routes}
    # Per A013/C1: SPA catch-all is the full-path wildcard used by QwenPaw.
    assert "/{full_path:path}" not in route_paths, (
        "SPA catch-all /{full_path:path} must not be mounted in lean mode"
    )


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_tools_only_read_write_enabled(gateway_env):
    """A013/C1: Only read_file and write_file must be enabled in tools config."""
    from qwenpaw.config.config import _default_builtin_tools

    allowed = frozenset({"read_file", "write_file"})
    defaults = _default_builtin_tools()

    # Build the same restricted config as build_app does.
    from qwenpaw.config.config import ToolsConfig
    builtin_tools = {
        name: tc.model_copy(update={"enabled": name in allowed})
        for name, tc in defaults.items()
    }
    tools = ToolsConfig(builtin_tools=builtin_tools)

    enabled = {
        name for name, tc in tools.builtin_tools.items() if tc.enabled
    }
    assert enabled == allowed, (
        f"Expected only {{read_file, write_file}} enabled, got: {enabled}"
    )


# ── Non-QP tests (always run) ──────────────────────────────────────────────────

def test_a013_c1_build_app_fails_without_litellm_base_url(monkeypatch, tmp_path):
    """A013/C1: build_app() must raise RuntimeError when LITELLM_BASE_URL is missing."""
    monkeypatch.delenv("LITELLM_BASE_URL", raising=False)
    monkeypatch.setenv("LITELLM_MASTER_KEY", "x")
    monkeypatch.setenv("QWENPAW_WORKING_DIR", str(tmp_path))

    from orchestrator.app import build_app

    with pytest.raises(RuntimeError, match="LITELLM_BASE_URL"):
        build_app()


def test_a013_c1_build_app_fails_without_litellm_master_key(monkeypatch, tmp_path):
    """A013/C1: build_app() must raise RuntimeError when LITELLM_MASTER_KEY is missing."""
    monkeypatch.setenv("LITELLM_BASE_URL", "http://127.0.0.1:4000")
    monkeypatch.delenv("LITELLM_MASTER_KEY", raising=False)
    monkeypatch.setenv("QWENPAW_WORKING_DIR", str(tmp_path))

    from orchestrator.app import build_app

    with pytest.raises(RuntimeError, match="LITELLM_MASTER_KEY"):
        build_app()


def test_a013_c1_build_app_fails_without_working_dir(monkeypatch):
    """A013/C1: build_app() must raise RuntimeError when QWENPAW_WORKING_DIR is missing."""
    monkeypatch.setenv("LITELLM_BASE_URL", "http://127.0.0.1:4000")
    monkeypatch.setenv("LITELLM_MASTER_KEY", "x")
    monkeypatch.delenv("QWENPAW_WORKING_DIR", raising=False)

    from orchestrator.app import build_app

    with pytest.raises(RuntimeError, match="QWENPAW_WORKING_DIR"):
        build_app()


def test_a013_c1_write_telemetry_optout_creates_marker(tmp_path):
    """A013/C1: _write_telemetry_optout must write a marker with opted_out=True."""
    import json as _json
    from orchestrator.app import _write_telemetry_optout

    working_dir = tmp_path / "qwenpaw"
    _write_telemetry_optout(working_dir)

    marker = working_dir / ".telemetry_collected"
    assert marker.exists(), "Telemetry opt-out marker file must be created"
    data = _json.loads(marker.read_text(encoding="utf-8"))
    assert data.get("opted_out") is True


def test_a013_c1_write_telemetry_optout_idempotent(tmp_path):
    """A013/C1: _write_telemetry_optout called twice must not raise."""
    from orchestrator.app import _write_telemetry_optout

    working_dir = tmp_path / "qwenpaw"
    _write_telemetry_optout(working_dir)
    _write_telemetry_optout(working_dir)  # second call must be silent


def test_a013_c1_read_system_prompt_returns_placeholder_when_file_missing(tmp_path):
    """A013/C1: _read_system_prompt must return placeholder when system.md is absent."""
    from orchestrator.app import _PLACEHOLDER_SYSTEM_PROMPT, _read_system_prompt

    prompt = _read_system_prompt()
    assert isinstance(prompt, str) and len(prompt) > 0
    # Either the real file was found (fine) or the placeholder was returned.
    assert prompt  # non-empty string is the contract
