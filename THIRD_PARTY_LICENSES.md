# Third-Party Licenses

Snapfzz bundles and depends on open-source software. This file lists the licenses for all third-party components distributed with the application.

The Snapfzz source code itself is licensed under the [Snapfzz Community License (SCL) 1.0](LICENSE).

---

## Rust Crates

### Tauri
- **License:** Apache 2.0 / MIT
- **URL:** https://github.com/tauri-apps/tauri
- **Used for:** Desktop application framework, window management, IPC

### ring
- **License:** ISC / OpenSSL / MIT
- **URL:** https://github.com/briansmith/ring
- **Used for:** AES-256-GCM encryption in Secret Vault (A011)

### keyring
- **License:** Apache 2.0 / MIT
- **URL:** https://github.com/hwchen/keyring-rs
- **Used for:** OS keychain access for vault master key storage

### reqwest
- **License:** Apache 2.0 / MIT
- **URL:** https://github.com/seanmonstar/reqwest
- **Used for:** HTTP client for AgentScope runtime communication

### reqwest-eventsource
- **License:** MIT
- **URL:** https://github.com/jpopesculian/reqwest-eventsource
- **Used for:** SSE (Server-Sent Events) streaming from AgentScope

### serde / serde_json
- **License:** Apache 2.0 / MIT
- **URL:** https://github.com/serde-rs/serde
- **Used for:** Serialization/deserialization of settings, metrics, and IPC payloads

### tokio
- **License:** MIT
- **URL:** https://github.com/tokio-rs/tokio
- **Used for:** Async runtime for process management, streaming, and health checks

### sysinfo
- **License:** MIT
- **URL:** https://github.com/GuillaumeGomez/sysinfo
- **Used for:** Hardware detection (CPU cores, RAM, battery status) for budget presets

### postgresql_embedded
- **License:** Apache 2.0 / MIT
- **URL:** https://github.com/theseus-rs/postgresql-embedded
- **Used for:** Embedded PostgreSQL server lifecycle (download, initdb, start, stop, database provisioning) for LiteLLM's Prisma database backend

### dashmap
- **License:** MIT
- **URL:** https://github.com/xacrimon/dashmap
- **Used for:** Concurrent hash maps in budget registry and process supervision

### dirs
- **License:** Apache 2.0 / MIT
- **URL:** https://github.com/dirs-dev/dirs-rs
- **Used for:** Home directory resolution for `~/.snapfzz/` data directory

---

## CEF (Chromium Embedded Framework)

### cef-rs
- **License:** Apache 2.0 / MIT
- **URL:** https://github.com/tauri-apps/cef-rs
- **Used for:** Rust bindings to CEF for mini app browser windows

### Chromium Embedded Framework (CEF)
- **License:** BSD 3-Clause
- **URL:** https://bitbucket.org/chromiumembedded/cef
- **Copyright:** Copyright (c) 2008-2026 Marshall A. Greenblatt. Portions Copyright (c) 2006-2009 Google Inc. All rights reserved.
- **Used for:** Full Chromium browser engine for mini app rendering

### Chromium
- **License:** BSD 3-Clause + third-party licenses
- **URL:** https://chromium.googlesource.com/chromium/src/
- **Used for:** Browser engine bundled within CEF
- **Note:** Chromium includes ~50 third-party components with their own licenses (all permissive: BSD, MIT, Apache 2.0, ISC, zlib, etc.). The full Chromium license and credits are included in the CEF distribution at `cef/LICENSE.txt` and `cef/CREDITS.html`.

---

## Frontend Dependencies

### React
- **License:** MIT
- **URL:** https://github.com/facebook/react
- **Used for:** UI rendering framework

### Ant Design
- **License:** MIT
- **URL:** https://github.com/ant-design/ant-design
- **Used for:** UI component library (buttons, tables, forms, modals)

### Vite
- **License:** MIT
- **URL:** https://github.com/vitejs/vite
- **Used for:** Frontend build tooling and dev server

### mitt
- **License:** MIT
- **URL:** https://github.com/developit/mitt
- **Used for:** EventBus implementation for cross-component communication

### zod
- **License:** MIT
- **URL:** https://github.com/colinhacks/zod
- **Used for:** Schema validation for settings, manifests, and form inputs

---

## Python Runtime

### LiteLLM
- **License:** MIT
- **URL:** https://github.com/BerriAI/litellm
- **PyPI:** https://pypi.org/project/litellm/
- **Used for:** Unified LLM gateway proxy — routes requests to 100+ providers (OpenAI, Anthropic, Ollama, Azure, Bedrock, etc.), virtual API key management, per-key budget enforcement, model routing/combos, spend tracking, request logging
- **Note:** Only the MIT-licensed core is used (`pip install litellm[proxy]`). Code under the `enterprise/` directory of the LiteLLM repository is under a separate enterprise license and is NOT used by Snapfzz.

### Prisma (prisma-client-py)
- **License:** Apache 2.0
- **URL:** https://github.com/RobertCraiworthy/prisma-client-py
- **PyPI:** https://pypi.org/project/prisma/
- **Used for:** Database schema management and ORM for LiteLLM's PostgreSQL backend (`prisma generate`, `prisma db push`)

### QwenPaw (Extracted and Modified)
- **License:** Apache 2.0
- **Copyright:** Copyright 2025 The QwenPaw Authors
- **URL:** https://github.com/agentscope-ai/QwenPaw
- **Used for:** Intelligence layer of the Orchestrator plugin
- **Modification notice:** The Snapfzz intelligence layer (`plugins/orchestrator/intelligence/`) is a derivative work of QwenPaw. We extracted, modified, and redistribute the following components as part of our internal distribution:
  - **Agent core** (`agents/react_agent.py`) → `intelligence/agent/react_agent.py` — QwenPawAgent with ToolGuardMixin, auto-continuation, media normalization
  - **Memory** (`agents/memory/`) → `intelligence/memory/` — BaseMemoryManager, ReMeLightMemoryManager, AgentMdManager
  - **Tools** (`agents/tools/`) → `intelligence/tools/` — file I/O, shell exec, browser automation, media, agent ops (16 tools)
  - **Security** (`security/`) → `intelligence/security/` — ToolGuardEngine, FileGuard, SkillScanner with severity-based findings
  - **Mission mode** (`agents/mission/`) → `intelligence/mission/` — PRD generation, phased execution, master/worker/verifier separation
  - **Runtime** (`app/`) → `intelligence/runtime/` — MultiAgentManager, Workspace isolation, DynamicMultiAgentRunner, ServiceManager
  - **Config** (`config/`) → `intelligence/config/` — Pydantic models for all subsystems
  - **Hooks** (`agents/hooks/`) → `intelligence/agent/hooks/` — BootstrapHook, MemoryCompactionHook
- **Removed components:** CLI entry points, provider configs, local model support, tokenizer — replaced by Snapfzz equivalents (LiteLLM gateway, PluginProcessFactory)
- **Kept as-is:** Channel adapters (Discord, Telegram, Slack, DingTalk, Feishu, QQ, Mattermost, iMessage, MQTT, Matrix, Voice, WeCom) — core communication layer for reaching users beyond the desktop UI
- **Added components:** `src/orchestrator/cli.py` (Snapfzz CLI entry point), `src/orchestrator/app.py` (FastAPI factory with /health), `memory/postgres.py` (pgvector adapter, planned)

### AgentScope
- **License:** Apache 2.0
- **Copyright:** Copyright 2024 The AgentScope Authors
- **URL:** https://github.com/agentscope-ai/agentscope
- **Used for:** Agent framework engine — ReActAgent, Toolkit, Memory, pipeline coordination. Consumed as pip dependency (`agentscope>=1.0.18`), not modified.

### AgentScope Runtime
- **License:** Apache 2.0
- **Copyright:** Copyright 2024 The AgentScope Authors
- **URL:** https://github.com/agentscope-ai/agentscope-runtime
- **Used for:** Multi-agent distributed coordination, SSE streaming, health endpoints. Consumed as pip dependency (`agentscope-runtime>=1.1.3`), not modified.

### uvicorn
- **License:** BSD 3-Clause
- **URL:** https://github.com/encode/uvicorn
- **Used for:** ASGI server for AgentScope runtime and LiteLLM proxy

### uv
- **License:** Apache 2.0 / MIT
- **URL:** https://github.com/astral-sh/uv
- **Used for:** Python package management and virtual environment

---

## Fonts

### Inter
- **License:** SIL Open Font License 1.1
- **URL:** https://github.com/rsms/inter
- **Used for:** Default UI font

### JetBrains Mono
- **License:** SIL Open Font License 1.1
- **URL:** https://github.com/JetBrains/JetBrainsMono
- **Used for:** Monospace font for code display

---

## Full License Texts

The full text of each license referenced above is available at:
- Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
- MIT: https://opensource.org/licenses/MIT
- BSD 3-Clause: https://opensource.org/licenses/BSD-3-Clause
- ISC: https://opensource.org/licenses/ISC
- SIL OFL 1.1: https://scripts.sil.org/OFL

For the complete Chromium third-party license list, see `cef/CREDITS.html` in the CEF distribution bundled with this application.
