---
name: Phase C1 QwenPaw boot
description: build_app() factory mounts QwenPaw against internal LiteLLM gateway; DynamicMultiAgentRunner inlined; Rust injects 3 new env vars
type: project
---

Phase C1 wires QwenPaw into the orchestrator plugin as a pip-installed dependency (qwenpaw==1.1.2). Key decisions:

**Why:** Slice 1 of streaming chat backend — Python runtime must boot from qwenpaw pip package and expose `/process` SSE plus all QP routers/channels.

**How to apply:** When adding features to the orchestrator Python backend, the entry point is `plugins/orchestrator/intelligence/src/orchestrator/app.py::build_app()`. All env vars come from Rust via `register_plugin_runtime`.

Architecture decisions:
- `DynamicMultiAgentRunner` is inlined in `app.py` (not imported from `qwenpaw.app._app`) because `_app.py` has module-level side effects (load_envs_into_environ, module-level agent_app construction).
- Telemetry opt-out via `_write_telemetry_optout()` — writes `.telemetry_collected` JSON marker into WORKING_DIR before QP imports.
- `QWENPAW_WORKING_DIR` must be set in env before any qwenpaw import (module-level constant resolution in qwenpaw/constant.py).
- Three new env var constants in `snapfzz-packs/src/core/constants.rs::env_vars`: LITELLM_BASE_URL, LITELLM_MASTER_KEY, QWENPAW_WORKING_DIR.
- `register_plugin_runtime` Tauri command now accepts SettingsManager + vault State to inject gateway creds.
- Skipped routers: auth_router, local_models_router, console_router, plugins_router (per spec).
- Two tools enabled: read_file, write_file only.
