<p align="center">
  <img src="assets/logo.svg" width="128" height="128" alt="Snapfzz" />
  <h1 align="center">Snapfzz</h1>
  <p align="center">
    <strong>The resource-budgeted desktop environment for AI agents.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml"><img src="https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/0xtrou/snapfzz/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
  </p>
</p>

---

A desktop operating system for [AgentScope](https://github.com/agentscope-ai/agentscope) agents. Every resource is budgeted. Every plugin is sandboxed. Every frame is protected. Nine budgets govern the architecture — from 16ms frame targets to process memory limits.

Built with [Tauri](https://tauri.app/) + [AgentScope Runtime](https://runtime.agentscope.io/) + [Pretext](https://github.com/chenglou/pretext). macOS desktop. Plugin-based architecture — every feature is a plugin.

## Test Coverage

Every layer is tested. Coverage ≥90% enforced by CI on every push.

### Core Infrastructure

| Layer | Package | Tests | Coverage | CI |
|---|---|---|---|---|
| Rust | [`snapfzz-budget`](src-tauri/crates/snapfzz-budget/) | 41 | ![](https://img.shields.io/badge/41_tests-passing-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Rust | [`main.rs`](src-tauri/src/main.rs) | 12 | ![](https://img.shields.io/badge/12_tests-passing-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Frontend | [`@snapfzz/plugin-host`](frontend/packages/plugin-host/) | 54 | ![](https://img.shields.io/badge/54_tests-passing-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |

### Plugins

| Plugin | Package | Tests | Coverage | CI |
|---|---|---|---|---|
| Chat | [`plugins/chat`](plugins/chat/) | 154 | ![](https://img.shields.io/badge/96.44%25-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings General | [`plugins/settings-general`](plugins/settings-general/) | 33 | ![](https://img.shields.io/badge/≥90%25-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Runtime | [`plugins/settings-runtime`](plugins/settings-runtime/) | 37 | ![](https://img.shields.io/badge/≥90%25-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Performance | [`plugins/settings-performance`](plugins/settings-performance/) | 37 | ![](https://img.shields.io/badge/≥90%25-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Plugins | [`plugins/settings-plugins`](plugins/settings-plugins/) | 28 | ![](https://img.shields.io/badge/≥90%25-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Advanced | [`plugins/settings-advanced`](plugins/settings-advanced/) | 32 | ![](https://img.shields.io/badge/≥90%25-brightgreen) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |

**Total: 428 tests** across 3 core packages + 6 plugins.

## Architecture

Resource-budgeted. Nine budgets govern the app:

| Budget | What It Protects | Enforcement |
|---|---|---|
| Frame | Visual fluency | 16ms/33ms target, CSS containment, Pretext |
| CPU | Processing power | 3-zone model (Rust/Worker/Main) |
| Memory | RAM | Per-process RSS limits, auto-kill |
| Startup | User attention | < 200ms visible, < 500ms interactive |
| Network | Bandwidth | 16ms SSE batch coalescing |
| Reliability | User trust | Plugin 3-strike auto-disable |
| Window | Multitasking | Independent frame budgets per window |
| Storage | Disk | Append-only logs, cleanup thresholds |
| Engineering | Maintenance cost | AgentScope delegation, thin boundaries |

See [`docs/learning/011_resource-budgeted-architecture.md`](docs/learning/011_resource-budgeted-architecture.md) for the full philosophy.

## Getting Started

```bash
git clone https://github.com/0xtrou/snapfzz.git
cd snapfzz
pnpm install

# Run (requires Rust + Tauri CLI)
cargo tauri dev
```

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 10, Rust, `cargo install tauri-cli`

## Specs

| Spec | File | Summary |
|---|---|---|
| A001 | [`docs/plans/A001-performance-architecture.md`](docs/plans/A001-performance-architecture.md) | Frame budget enforcement |
| A002 | [`docs/plans/A002-state-management.md`](docs/plans/A002-state-management.md) | CPU budget via zones |
| A003 | [`docs/plans/A003-instant-loading.md`](docs/plans/A003-instant-loading.md) | Startup budget |
| A004 | [`docs/plans/A004-workspace-architecture.md`](docs/plans/A004-workspace-architecture.md) | Storage governance |
| A005 | [`docs/plans/A005-plugin-architecture.md`](docs/plans/A005-plugin-architecture.md) | Plugin reliability + SDK |
| A006 | [`docs/plans/A006-core-runtime.md`](docs/plans/A006-core-runtime.md) | Core runtime boot |
| A007 | [`docs/plans/A007-multi-layout-architecture.md`](docs/plans/A007-multi-layout-architecture.md) | Window isolation |
| A008 | [`docs/plans/A008-budget-registry.md`](docs/plans/A008-budget-registry.md) | The kernel |

## Learnings

| # | Title |
|---|---|
| 001 | [Philosophy without mechanism is dead](docs/learning/001_philosophy-without-mechanism-is-dead.md) |
| 002 | [Eight states is a smell](docs/learning/002_eight-states-is-a-smell.md) |
| 003 | [AgentScope already solved orchestration](docs/learning/003_agentscope-already-solved-orchestration.md) |
| 004 | [uv is the Python runtime manager](docs/learning/004_uv-is-the-python-runtime-manager-for-desktop-apps.md) |
| 005 | [Sandbox first, not isolation later](docs/learning/005_sandbox-first-not-isolation-later.md) |
| 006 | [ErrorBoundary without host wiring is theater](docs/learning/006_errorboundary-without-host-wiring-is-theater.md) |
| 007 | [Snapfzz is a desktop environment for AgentScope](docs/learning/007_snapfzz-is-a-desktop-environment-for-agentscope.md) |
| 008 | [AgentScope has zero process management](docs/learning/008_agentscope-has-zero-process-management.md) |
| 009 | [AgentScope Runtime replaces our infra](docs/learning/009_agentscope-runtime-replaces-our-infra.md) |
| 010 | [Pretext eliminates DOM measurement](docs/learning/010_pretext-eliminates-dom-measurement.md) |
| 011 | [Resource-budgeted architecture](docs/learning/011_resource-budgeted-architecture.md) |
| 012 | [Tauri window drag is a minefield](docs/learning/012_tauri-window-drag-is-a-minefield.md) |
| 013 | [Vite cannot dynamic import bare specifiers](docs/learning/013_vite-cannot-dynamic-import-bare-specifiers.md) |

## License

[Apache License 2.0](LICENSE)

---

<p align="center">
  <sub>The user's machine is borrowed, not owned. We budget what we take.</sub>
</p>
