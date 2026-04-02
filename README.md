<p align="center">
  <img src="assets/logo.svg" width="128" height="128" alt="Snapfzz" />
  <h1 align="center">Snapfzz</h1>
  <p align="center">
    <strong>Your startup bootstrapping intelligence.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/0xtrou/snapfzz/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
  </p>
</p>

---

An agent-first desktop app that helps you go from idea to shipped business. You talk to an orchestrator agent — it interviews you, finds existing solutions, builds what you need, and ships it live with deploy, payments, and legal.

The orchestrator delegates to specialized agents. Each agent runs in its own isolated micro-VM. You see their work in real-time, steer with natural language, and approve before anything ships.

Built with [Tauri](https://tauri.app/), [AgentScope](https://github.com/agentscope-ai/agentscope), and [BoxLite](https://github.com/boxlite-ai/boxlite). macOS desktop. Plugin-based architecture — every feature is a plugin.

## Getting Started

```bash
git clone https://github.com/0xtrou/snapfzz.git
cd snapfzz

# Frontend
cd frontend && pnpm install && cd ..

# Run (requires Rust + Tauri CLI)
cargo tauri dev
```

**Prerequisites:** Node.js >= 20, pnpm >= 9, Rust, `cargo install tauri-cli`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE)

---

<p align="center">
  <sub>Part of the <a href="https://github.com/0xtrou">Snapfzz</a> ecosystem.</sub>
</p>
