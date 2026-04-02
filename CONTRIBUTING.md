# Contributing to Snapfzz Startup Launcher

Thank you for your interest. This project is built by AI agents and reviewed by humans. Your contributions follow the same pattern.

## How to Contribute

### 1. Understand the Plan

Read the [milestone plan](docs/plans/2026-04-02-001-feat-milestone-plan.md) first. Every contribution should advance an unchecked implementation unit in the current milestone.

### 2. Pick Your Work

- Check which milestone is currently active (marked `status: active` in the plan)
- Find an unchecked `- [ ]` implementation unit
- Comment on the relevant issue or create one to claim it

### 3. Set Up Your Environment

```bash
# Clone
git clone https://github.com/0xtrou/snapfzz-startup-launcher.git
cd snapfzz-startup-launcher

# Prerequisites
# - Node.js >= 20
# - pnpm >= 9
# - Python >= 3.10
# - Rust (for Tauri)
```

### 4. Branch and Build

```bash
# Create a branch from main
git checkout -b feat/your-feature-name

# Work on your implementation unit
# ...

# Run eval benchmarks for the agent you touched
# (specific commands will be documented per milestone)
```

### 5. Submit a PR

- **Title:** `[M0] feat: description` (prefix with milestone number)
- **Body:** Reference the implementation unit from the plan
- **Eval coverage:** Every PR that touches an agent must include or update its benchmark
- **Tests:** If you wrote agent code, include eval metrics. If you wrote UI code, include visual verification.

## Code Standards

### Python (AgentScope agents)

- Python 3.10+
- Type hints on all public functions
- Docstrings on all agents and tools
- Follow AgentScope patterns: `ReActAgent`, `Toolkit`, `Msg`
- Every agent gets a benchmark in `benchmarks/`

### TypeScript/React (UI)

- Use `@agentscope-ai/design` and `@agentscope-ai/chat` components first
- Fall back to Ant Design 5 only when Spark components don't cover the need
- Tailwind CSS for custom styling
- No `any` types. No `@ts-ignore`.

### Rust (Tauri)

- Follow Tauri v2 conventions
- Minimal Rust — only for system integration (process spawning, secure storage, IPC)
- The intelligence lives in Python, not Rust

## Eval-First Development

This project treats evaluation as a first-class concern. The rule:

> **No agent ships without a benchmark. No benchmark ships without eval coverage.**

When contributing an agent:

1. Define the benchmark dataset (curated inputs + expected outputs)
2. Define metrics (`MetricBase` for structural checks, `OpenJudgeMetric` for semantic quality)
3. Run `GeneralEvaluator` locally to verify
4. Include eval results in your PR description

When modifying an existing agent:

1. Run the existing benchmark first — establish baseline
2. Make your changes
3. Run the benchmark again — no regressions
4. If behavior changed intentionally, update the benchmark dataset

## What We Value

- **Density over volume** — small, focused PRs beat large sweeping changes
- **Evidence over claims** — show eval results, not "it works on my machine"
- **Existing patterns over new inventions** — follow AgentScope conventions, follow Spark Design patterns
- **Questions over assumptions** — if something in the plan is unclear, ask before building

## What We Don't Want

- PRs that skip eval coverage
- New frameworks or dependencies without discussion
- Refactors disguised as features
- Placeholder code ("TODO", "implement later")

## Reporting Issues

- **Bugs:** Include steps to reproduce, expected vs actual behavior, eval output if relevant
- **Feature requests:** Reference which milestone or implementation unit it relates to
- **Questions:** Use GitHub Discussions, not Issues

## License

By contributing, you agree that your contributions will be licensed under [Apache License 2.0](LICENSE).
