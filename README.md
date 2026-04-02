<p align="center">
  <h1 align="center">Snapfzz Startup Launcher</h1>
  <p align="center">
    <strong>Intelligence Startup Builder. From idea to shipped business.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/0xtrou/snapfzz-startup-launcher/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
    <a href="https://github.com/0xtrou/snapfzz-startup-launcher/issues"><img src="https://img.shields.io/github/issues/0xtrou/snapfzz-startup-launcher" alt="Issues"></a>
    <a href="https://github.com/0xtrou/snapfzz-startup-launcher/pulls"><img src="https://img.shields.io/github/issues-pr/0xtrou/snapfzz-startup-launcher" alt="PRs"></a>
  </p>
</p>

---

You have an idea. You shouldn't have to spend weeks figuring out what exists, how to build it, and how to ship it. The Startup Launcher does that for you — powered by multi-agent intelligence that clarifies your vision, finds the best starting point, builds it to your spec, and ships it live with payments and legal.

```
IDEA  →  CLARIFY  →  DISCOVER  →  RATE  →  BUILD  →  SHIP
 You      Agent       Agent       Agent     Agents    Agents
describe  interviews  searches    scores    clone,    deploy,
 it       you         GitHub      P1-P4     customize legal,
                                            harden    payments
```

## How It Works

| Step | What Happens | Who Does It |
|---|---|---|
| **Idea** | You describe what you want to build | You |
| **Clarify** | Agent interviews you, produces structured requirements | ClarifyAgent |
| **Discover** | Searches GitHub for OSS projects that match your needs | DiscoverAgent |
| **Rate** | Scores each candidate on architecture, conviction fit, infrastructure potential, durability | RateAgent |
| **Build** | Clones the best-fit project, customizes it with a multi-agent team (scaffold, customize, harden, test) | BuildAgent + workers |
| **Ship** | Deploys to your hosting provider, sets up legal entity, adds Stripe payments | ShipAgent |

Every step streams progress in real time. You approve or steer at every checkpoint.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Tauri Desktop App                               │
│  ┌────────────────────────────────────────────┐  │
│  │  React UI (Spark Design + Spark Chat)      │  │
│  │  Idea → Discover → Rate → Build → Ship     │  │
│  └──────────────────┬─────────────────────────┘  │
│                     │ localhost HTTP/SSE          │
│  ┌──────────────────▼─────────────────────────┐  │
│  │  AgentScope Runtime (Python)               │  │
│  │  Multi-agent pipelines + MCP tools         │  │
│  │  Eval: benchmarks + OpenJudge graders      │  │
│  │  Memory: context accumulation across runs  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Tauri** = desktop shell. **Spark Design** = UI components purpose-built for LLM apps. **AgentScope** = the intelligence layer — multi-agent coordination, tool orchestration, evaluation, tracing.

## Tech Stack

| Layer | Technology | License |
|---|---|---|
| Desktop shell | [Tauri v2](https://tauri.app/) | MIT |
| UI components | [@agentscope-ai/design](https://github.com/agentscope-ai/agentscope-spark-design) | MIT |
| Chat components | [@agentscope-ai/chat](https://github.com/agentscope-ai/agentscope-spark-design) | Apache 2.0 |
| Base UI | [Ant Design 5](https://ant.design/) | MIT |
| Styling | [Tailwind CSS](https://tailwindcss.com/) | MIT |
| Agent runtime | [AgentScope](https://github.com/agentscope-ai/agentscope) | Apache 2.0 |
| Evaluation | [OpenJudge](https://github.com/agentscope-ai/OpenJudge) (50+ graders) | Apache 2.0 |
| LLM | Your gateway (default) or bring your own key | — |

## Philosophy

This project is built on four principles:

- **P1: Scalable-ready from day one.** API-first, stateless agents, horizontal scaling. No "v2 rewrite."
- **P2: Build from conviction, let the market discover you.** This tool exists because its creator uses this exact workflow every day. The conviction is authentic.
- **P3: Sell infrastructure, software is narrative.** Context accumulation across projects is the moat. The more you ship through it, the harder it is to leave.
- **P4: Product lives for 10 years.** "I have an idea and want it to exist" is a permanent human need.

## Evaluation

Every agent is benchmarked. Intelligence without measurement is a guess.

| System | Purpose |
|---|---|
| `agentscope.evaluate` | Structural checks — exit codes, completeness, consistency, file existence |
| [OpenJudge](https://github.com/agentscope-ai/OpenJudge) | Semantic quality — relevance, correctness, hallucination, safety, code quality |

`RayEvaluator` runs the full benchmark suite on every agent change. Regressions are caught before they ship.

## Milestones

| # | Milestone | What Ships |
|---|---|---|
| **M0** | Foundation | Tauri + Spark UI + AgentScope sidecar, first round-trip |
| **ME** | Eval | Benchmark infrastructure, per-agent quality gates |
| **M1** | Clarify | Agent interviews user → structured requirements |
| **M2** | Discover | GitHub OSS search → ranked candidate cards |
| **M3** | Rate | P1-P4 scoring + side-by-side comparison |
| **M4** | Build | Multi-agent team: scaffold → customize → harden → test |
| **M5** | Ship | Deploy + legal entity + Stripe payments |
| **M6** | Memory | Context accumulation across projects (the moat) |
| **M7** | Revenue | Free/Pro/Team tiers + gateway metering |

Full details: [Milestone Plan](docs/plans/2026-04-02-001-feat-milestone-plan.md)

## Getting Started

> **Status: Pre-M0.** The project is in planning. Contributors welcome.

```bash
# Clone
git clone https://github.com/0xtrou/snapfzz-startup-launcher.git
cd snapfzz-startup-launcher

# Read the plan
cat docs/plans/2026-04-02-001-feat-milestone-plan.md
```

Prerequisites for M0 (when development starts):
- Node.js >= 20
- pnpm >= 9
- Python >= 3.10
- Rust (for Tauri)
- An OpenAI-compatible LLM gateway or API key

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick version:**
1. Read the [milestone plan](docs/plans/2026-04-02-001-feat-milestone-plan.md)
2. Pick an unchecked implementation unit from the current milestone
3. Fork, branch, implement, test, PR
4. Every PR must include eval coverage for the agent it touches

## Community

- [GitHub Issues](https://github.com/0xtrou/snapfzz-startup-launcher/issues) — bugs and feature requests
- [GitHub Discussions](https://github.com/0xtrou/snapfzz-startup-launcher/discussions) — ideas and questions

## License

[Apache License 2.0](LICENSE) — use it, fork it, build on it, sell it. Just include the license.

---

<p align="center">
  <sub>Part of the <a href="https://github.com/0xtrou">Snapfzz</a> ecosystem.</sub>
</p>
