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

## Python Runtime (AgentScope)

### AgentScope
- **License:** Apache 2.0
- **URL:** https://github.com/modelscope/agentscope
- **Used for:** Agent runtime, tool execution, session management

### uvicorn
- **License:** BSD 3-Clause
- **URL:** https://github.com/encode/uvicorn
- **Used for:** ASGI server for AgentScope runtime

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
