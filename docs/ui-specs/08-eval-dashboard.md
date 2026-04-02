# Screen: Eval Dashboard

Benchmark scores across all agents. Regression detection. Quality trends over time.

## Overview

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  📊 EVAL DASHBOARD                                       │
│ SIDEBAR  │                                                          │
│          │  Overall Health: ████████░░ 82%   Last run: 2 hours ago  │
│          │                                                          │
│          │  ┌─ AGENT SCORES ───────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Agent           Score  Trend  Status              │  │
│          │  │  ─────────────── ─────  ─────  ──────              │  │
│          │  │  ClarifyAgent    91%    ▲ +3   ● Healthy           │  │
│          │  │  DiscoverAgent   85%    ━ 0    ● Healthy           │  │
│          │  │  RateAgent       78%    ▼ -2   ⚠ Watch             │  │
│          │  │  BuildAgent      72%    ▲ +5   ⚠ Watch             │  │
│          │  │  ShipAgent       88%    ▲ +1   ● Healthy           │  │
│          │  │                                                    │  │
│          │  │  [Run Full Suite]  [Run Failed Only]               │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌─ SCORE HISTORY (last 30 runs) ───────────────────┐   │
│          │  │                                                    │  │
│          │  │  100│                                              │  │
│          │  │     │         ·  · ·  ·                            │  │
│          │  │   80│  ·  · ·       ·  · · ·  · ·                 │  │
│          │  │     │ ·                          · ·               │  │
│          │  │   60│                                ·             │  │
│          │  │     │                                              │  │
│          │  │   40│                                              │  │
│          │  │     └──────────────────────────────────            │  │
│          │  │       ← 30 runs ago          now →                │  │
│          │  │                                                    │  │
│          │  │  ── ClarifyAgent  ·· DiscoverAgent  -- RateAgent  │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 0         │
└─────────────────────────────────────────────────────────────────────┘
```

## Agent Detail (Click any agent row)

```
│          │  📊 EVAL: RateAgent                          Score: 78%  │
│          │                                                          │
│          │  ┌─ METRICS BREAKDOWN ──────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Metric                Type        Score  Status   │  │
│          │  │  ───────────────────── ──────────  ─────  ──────  │  │
│          │  │  Scoring Consistency   Native      85%    ●       │  │
│          │  │  Reasoning Quality     OpenJudge   72%    ⚠       │  │
│          │  │  Calibration           Native      80%    ●       │  │
│          │  │  P1-P4 Coverage        Native      90%    ●       │  │
│          │  │  Hallucination Check   OpenJudge   65%    ⚠       │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌─ FAILED CASES ───────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Task ID       Input              Score  Issue     │  │
│          │  │  ─────────     ─────────────────  ─────  ──────── │  │
│          │  │  rate_007      Ruby CLI tool       0.0   P3 score │  │
│          │  │                                          inflated │  │
│          │  │  rate_009      Firebase wrapper     0.0   Missed  │  │
│          │  │                                          vendor   │  │
│          │  │                                          lock-in  │  │
│          │  │                                                    │  │
│          │  │  [View Details ▾]  [Re-run Failed]                │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌─ GRADER REASONING (rate_007) ─────────────────────┐  │
│          │  │                                                    │  │
│          │  │  OpenJudge CorrectnessGrader:                      │  │
│          │  │                                                    │  │
│          │  │  "The agent scored P3 (Infrastructure) at 7/10    │  │
│          │  │  for a Ruby CLI tool with no data persistence,    │  │
│          │  │  no recurring revenue model, and no lock-in       │  │
│          │  │  mechanism. Expected score: 2-3/10. The agent     │  │
│          │  │  over-weighted 'open source community' as an      │  │
│          │  │  infrastructure signal, which is incorrect per    │  │
│          │  │  the P3 definition."                               │  │
│          │  │                                                    │  │
│          │  │  Score: 0.0 (Incorrect)                            │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
```

## Running State

```
│          │  📊 EVAL RUNNING                                         │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │                                                  │   │
│          │  │  Running full benchmark suite...                  │   │
│          │  │                                                  │   │
│          │  │  ClarifyBenchmark   ████████████████████ 10/10   │   │
│          │  │  DiscoverBenchmark  ████████████░░░░░░░░  6/10   │   │
│          │  │  RateBenchmark      ░░░░░░░░░░░░░░░░░░░░  0/10   │   │
│          │  │  BuildBenchmark     waiting...                    │   │
│          │  │  ShipBenchmark      waiting...                    │   │
│          │  │                                                  │   │
│          │  │  Evaluator: GeneralEvaluator (sequential)        │   │
│          │  │  Elapsed: 1m 42s                                  │   │
│          │  │                                                  │   │
│          │  │  [Cancel]                                         │   │
│          │  └──────────────────────────────────────────────────┘   │
```
