<p align="center">
  <img src="assets/logo.svg" width="128" height="128" alt="Snapfzz" />
  <h1 align="center">Snapfzz</h1>
  <p align="center">
    <strong>The resource-budgeted desktop environment for AI agents.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml"><img src="https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/0xtrou/snapfzz/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-SCL%201.0-blue.svg" alt="License"></a>
  </p>
</p>

---

A desktop operating system for [AgentScope](https://github.com/agentscope-ai/agentscope) agents. Every resource is budgeted. Every plugin is sandboxed. Every frame is protected. Nine budgets govern the architecture — from 16ms frame targets to process memory limits.

Built with [Tauri](https://tauri.app/) + [AgentScope Runtime](https://runtime.agentscope.io/) + [Pretext](https://github.com/chenglou/pretext). macOS desktop. Plugin-based architecture — every feature is a plugin.

## Test Coverage

Coverage ≥90% enforced by CI on every push. Rust coverage via `cargo-llvm-cov`, frontend via Vitest v8. Badges update automatically from CI coverage data.

| Package | Coverage | CI |
|---|---|---|
| [`snapfzz-kernel`](src-tauri/crates/snapfzz-kernel/) | [![](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/0xtrou/snapfzz/main/.badges/kernel.json)](src-tauri/crates/snapfzz-kernel/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=kernel)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| [`snapfzz-stream`](src-tauri/crates/snapfzz-stream/) | [![](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/0xtrou/snapfzz/main/.badges/stream.json)](src-tauri/crates/snapfzz-stream/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=stream)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| [`@snapfzz/plugin-host`](frontend/packages/plugin-host/) | — | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=plugin-host)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| [`plugins/chat`](plugins/chat/) | [![](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/0xtrou/snapfzz/main/.badges/chat.json)](plugins/chat/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=chat)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| [`plugins/settings-general`](plugins/settings-general/) | [![](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/0xtrou/snapfzz/main/.badges/settings-general.json)](plugins/settings-general/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=general)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| [`plugins/settings-performance`](plugins/settings-performance/) | [![](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/0xtrou/snapfzz/main/.badges/settings-performance.json)](plugins/settings-performance/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=performance)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| [`plugins/settings-plugins`](plugins/settings-plugins/) | [![](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/0xtrou/snapfzz/main/.badges/settings-plugins.json)](plugins/settings-plugins/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=plugins)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| [`plugins/settings-advanced`](plugins/settings-advanced/) | [![](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/0xtrou/snapfzz/main/.badges/settings-advanced.json)](plugins/settings-advanced/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=advanced)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |
| [`plugins/settings-processes`](plugins/settings-processes/) | [![](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/0xtrou/snapfzz/main/.badges/settings-processes.json)](plugins/settings-processes/) | [![](https://img.shields.io/github/actions/workflow/status/0xtrou/snapfzz/ci.yml?label=processes)](https://github.com/0xtrou/snapfzz/actions/workflows/ci.yml) |

## Architecture

Resource-budgeted. Nine budgets govern the app:

| Budget | What It Protects | Enforcement |
|---|---|---|
| Streaming | Data throughput | 16ms/33ms batch interval, SSE coalescing |
| CPU | Processing power | 3-zone model (Rust/Worker/Main), semaphore permits |
| Memory | RAM | Per-process RSS limits, auto-kill |
| Startup | User attention | < 200ms visible, < 500ms interactive |
| Network | Bandwidth | Per-plugin invoke concurrency limits |
| Reliability | User trust | Plugin 3-strike auto-disable |
| Window | Multitasking | Independent frame budgets per window |
| Storage | Disk | Append-only logs, cleanup thresholds |
| Engineering | Maintenance cost | Agent delegation, thin boundaries |

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

[Snapfzz Community License (SCL) 1.0](LICENSE) — Source-available. Free for personal, education, nonprofit, and small business use. Commercial users pay what they want. Converts irrevocably to Apache 2.0 after 3 years per version.

[Support the project →](https://snapfzz.com/sponsor)

---

<p align="center">
  <sub>The user's machine is borrowed, not owned. We budget what we take.</sub>
</p>
