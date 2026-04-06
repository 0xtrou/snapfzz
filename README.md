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

Coverage ≥90% enforced by CI on every push. Threshold assertion fails the build if any package drops below.

### Core Infrastructure

| Layer | Package | CI |
|---|---|---|
| Rust | [`snapfzz-budget`](src-tauri/crates/snapfzz-budget/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=budget)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Rust | [`main.rs`](src-tauri/src/main.rs) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=runtime)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Frontend | [`@snapfzz/plugin-host`](frontend/packages/plugin-host/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=plugin-host)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |

### Plugins

| Plugin | Package | CI |
|---|---|---|
| Chat | [`plugins/chat`](plugins/chat/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=chat)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings General | [`plugins/settings-general`](plugins/settings-general/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=general)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Runtime | [`plugins/settings-runtime`](plugins/settings-runtime/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=runtime)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Performance | [`plugins/settings-performance`](plugins/settings-performance/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=performance)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Plugins | [`plugins/settings-plugins`](plugins/settings-plugins/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=plugins)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Advanced | [`plugins/settings-advanced`](plugins/settings-advanced/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=advanced)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| Settings Processes | [`plugins/settings-processes`](plugins/settings-processes/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=processes)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |

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

## Docs

- **Architecture specs**: [`docs/plans/`](docs/plans/)
- **Compounded learnings**: [`docs/learning/`](docs/learning/)
- **Release plan**: [`docs/MILESTONES.md`](docs/MILESTONES.md)

## Getting Started

```bash
git clone https://github.com/0xtrou/snapfzz.git
cd snapfzz
pnpm install
cargo tauri dev
```

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 10, Rust, `cargo install tauri-cli`

## License

[Apache License 2.0](LICENSE)

---

<p align="center">
  <sub>The user's machine is borrowed, not owned. We budget what we take.</sub>
</p>
