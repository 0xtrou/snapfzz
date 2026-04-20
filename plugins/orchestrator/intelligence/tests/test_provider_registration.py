# -*- coding: utf-8 -*-
"""A013/C1 — Provider registration tests.

Per A013/C1: These tests verify that the snapfzz-gateway provider is correctly
registered in ProviderManager with the right base_url, api_key (master key), and
model list after build_app() runs.

Tests that need QwenPaw installed are guarded with pytest.mark.skipif so this
file is importable in CI without qwenpaw installed.
"""
from __future__ import annotations

import importlib
import sys

import pytest

_qwenpaw_installed = importlib.util.find_spec("qwenpaw") is not None
_qwenpaw_reason = "qwenpaw not installed"


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture()
def gateway_env(tmp_path, monkeypatch):
    """Provide a clean env with all required gateway vars."""
    working_dir = str(tmp_path / "qwenpaw")
    monkeypatch.setenv("LITELLM_BASE_URL", "http://192.168.1.42:4000")
    monkeypatch.setenv("LITELLM_MASTER_KEY", "sk-gateway-test-key")
    monkeypatch.setenv("QWENPAW_WORKING_DIR", working_dir)
    monkeypatch.setenv("SNAPFZZ_HOST", "127.0.0.1")
    monkeypatch.setenv("SNAPFZZ_PORT", "9150")
    if "qwenpaw.constant" in sys.modules:
        sys.modules["qwenpaw.constant"].WORKING_DIR = \
            __import__("pathlib").Path(working_dir).expanduser().resolve()
    return working_dir


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_snapfzz_gateway_in_custom_providers_after_build_app(gateway_env):
    """A013/C1: After build_app(), 'snapfzz-gateway' must be in custom_providers."""
    from qwenpaw.providers.provider_manager import ProviderManager
    from orchestrator.app import build_app

    build_app()

    manager = ProviderManager.get_instance()
    assert "snapfzz-gateway" in manager.custom_providers, (
        "snapfzz-gateway not registered in ProviderManager.custom_providers"
    )


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_gateway_provider_base_url_matches_env(gateway_env):
    """A013/C1: Registered provider must have base_url == LITELLM_BASE_URL env value."""
    from qwenpaw.providers.provider_manager import ProviderManager
    from orchestrator.app import build_app

    build_app()

    manager = ProviderManager.get_instance()
    provider = manager.custom_providers["snapfzz-gateway"]
    assert provider.base_url == "http://192.168.1.42:4000"


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_gateway_provider_api_key_matches_master_key(gateway_env):
    """A013/C1: Registered provider must have api_key == LITELLM_MASTER_KEY env value."""
    from qwenpaw.providers.provider_manager import ProviderManager
    from orchestrator.app import build_app

    build_app()

    manager = ProviderManager.get_instance()
    provider = manager.custom_providers["snapfzz-gateway"]
    assert provider.api_key == "sk-gateway-test-key"


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_gateway_provider_model_list_contains_orchestrator(gateway_env):
    """A013/C1: Provider model list must include exactly 'orchestrator'."""
    from qwenpaw.providers.provider_manager import ProviderManager
    from orchestrator.app import build_app

    build_app()

    manager = ProviderManager.get_instance()
    provider = manager.custom_providers["snapfzz-gateway"]
    model_ids = [m.id for m in provider.models]
    assert "orchestrator" in model_ids, (
        f"'orchestrator' not in model list: {model_ids}"
    )


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_exactly_one_gateway_provider_registered(gateway_env):
    """A013/C1: Only one custom provider must be registered — no extras."""
    from qwenpaw.providers.provider_manager import ProviderManager
    from orchestrator.app import build_app

    # Reset singleton to avoid pollution from other tests.
    ProviderManager._instance = None  # noqa: SLF001

    build_app()

    manager = ProviderManager.get_instance()
    custom_ids = list(manager.custom_providers.keys())
    assert custom_ids == ["snapfzz-gateway"], (
        f"Expected exactly ['snapfzz-gateway'] in custom_providers, got: {custom_ids}"
    )


@pytest.mark.skipif(not _qwenpaw_installed, reason=_qwenpaw_reason)
def test_a013_c1_gateway_provider_is_openai_provider_type(gateway_env):
    """A013/C1: snapfzz-gateway must be an OpenAIProvider instance."""
    from qwenpaw.providers.openai_provider import OpenAIProvider
    from qwenpaw.providers.provider_manager import ProviderManager
    from orchestrator.app import build_app

    build_app()

    manager = ProviderManager.get_instance()
    provider = manager.custom_providers["snapfzz-gateway"]
    assert isinstance(provider, OpenAIProvider), (
        f"Expected OpenAIProvider, got {type(provider)}"
    )


# ── Non-QP tests (always run) ──────────────────────────────────────────────────

def test_a013_c1_require_env_raises_when_var_missing(monkeypatch):
    """A013/C1: _require_env must raise RuntimeError for missing or empty vars."""
    monkeypatch.delenv("_TEST_MISSING_VAR_XYZ", raising=False)

    from orchestrator.app import _require_env

    with pytest.raises(RuntimeError, match="_TEST_MISSING_VAR_XYZ"):
        _require_env("_TEST_MISSING_VAR_XYZ")


def test_a013_c1_require_env_returns_value_when_set(monkeypatch):
    """A013/C1: _require_env must return the env var value when set."""
    monkeypatch.setenv("_TEST_VAR_XYZ", "hello-world")

    from orchestrator.app import _require_env

    assert _require_env("_TEST_VAR_XYZ") == "hello-world"


def test_a013_c1_require_env_raises_when_var_is_empty_string(monkeypatch):
    """A013/C1: _require_env must raise RuntimeError when var is set to empty string."""
    monkeypatch.setenv("_TEST_EMPTY_VAR_XYZ", "")

    from orchestrator.app import _require_env

    with pytest.raises(RuntimeError, match="_TEST_EMPTY_VAR_XYZ"):
        _require_env("_TEST_EMPTY_VAR_XYZ")
