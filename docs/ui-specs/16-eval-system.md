# Eval System — Intelligence Quality Gate

Eval lives in two places: **Launcher** (cross-project, global scores) and **Project** (per-agent, per-project scores). Both powered by AgentScope's eval framework + OpenJudge LLM-as-judge + a hosted benchmark database that accumulates over time.

---

## Two Eval Types

| Type | What | How | Example |
|---|---|---|---|
| **Hard Eval** | Deterministic. Binary pass/fail or exact match. No LLM involved. | AgentScope `MetricBase` — custom code checks | Exit code 0? File exists? JSON valid? 3 viewports pass? Response time < 2s? |
| **LLM-as-Judge** | Semantic. Quality, relevance, correctness, safety. LLM grades the output. | OpenJudge 50+ graders via `OpenJudgeMetric` | Is the requirements doc complete? Is the code idiomatic? Is the UI accessible? Does the deploy config make sense? |

Both types produce a score (0-1). Both are tracked over time. Both accumulate as benchmarks.

---

## Benchmark Database — Context Accumulation (P3 Moat)

Benchmarks aren't static test files. They're a **living database** that grows with every project.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  BENCHMARK SOURCES:                                             │
│                                                                 │
│  1. BUILT-IN (ship with app)                                    │
│     Curated benchmarks per agent type.                          │
│     10-20 test cases per agent. Updated with app releases.      │
│                                                                 │
│  2. COMMUNITY (hosted database — api.snapfzz.com/benchmarks)   │
│     Open-source benchmark registry.                             │
│     Users contribute benchmarks. Categorized by domain.         │
│     Agent/human can browse, search, and pull benchmarks.        │
│     Think: npm for eval datasets.                               │
│                                                                 │
│  3. PROJECT-LOCAL (accumulates per project)                     │
│     Every agent interaction generates eval data.                │
│     "User corrected the agent" = negative example.              │
│     "User approved first try" = positive example.               │
│     Auto-extracted. Grows with every session.                   │
│                                                                 │
│  4. CUSTOM (human-authored)                                     │
│     User writes test cases manually.                            │
│     "Given this input, agent should produce this output."       │
│     Full control.                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**The moat:** Every project you run through the launcher generates eval data. The more you use it, the better the benchmarks, the better the agents perform. Leaving means losing your accumulated benchmarks — your agents get dumber.

---

## Eval in the Launcher Window (📊 Global)

Click [📊] in the Launcher → inline panel replaces project list.

### Cross-Project Agent Scores

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Snapfzz  ← Projects                           [⚙] [📊◀] [🧠]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 EVAL DASHBOARD                                          │
│                                                             │
│  Overall Health: ████████░░ 82%     Last run: 2 hours ago  │
│                                                             │
│  ┌─ AGENT SCORES (across all projects) ────────────────┐   │
│  │                                                      │   │
│  │  Agent              Hard   Judge  Combined  Trend    │   │
│  │  ─────────────────  ─────  ─────  ────────  ─────   │   │
│  │  🎯 Orchestrator    94%    88%    91%       ▲ +2    │   │
│  │  💬 ClarifyAgent    92%    90%    91%       ━ 0     │   │
│  │  📑 SpecsAgent      96%    85%    90%       ▲ +1    │   │
│  │  🔍 DiscoverAgent   88%    82%    85%       ━ 0     │   │
│  │  ⚖ RateAgent       80%    75%    78%       ▼ -2    │   │
│  │  🔨 BuildAgent      78%    70%    74%       ▲ +5    │   │
│  │  🚀 ShipAgent       90%    86%    88%       ▲ +1    │   │
│  │                                                      │   │
│  │  [Run Full Suite] [Run Failed Only]                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ SCORE HISTORY (last 30 runs) ──────────────────────┐   │
│  │                                                      │   │
│  │  100│                                                │   │
│  │     │         ·  · ·  ·                              │   │
│  │   80│  ·  · ·       ·  · · ·  · ·                   │   │
│  │     │ ·                          · ·                 │   │
│  │   60│                                ·               │   │
│  │     └──────────────────────────────────              │   │
│  │       ← 30 runs ago          now →                   │   │
│  │                                                      │   │
│  │  ── Hard  ·· Judge  -- Combined                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ BENCHMARK DATABASE ────────────────────────────────┐   │
│  │                                                      │   │
│  │  Built-in:  84 benchmarks │ v1.2.0                  │   │
│  │  Community: 312 benchmarks │ Last synced: 1h ago    │   │
│  │  Local:     47 benchmarks │ From 4 projects         │   │
│  │  Custom:    3 benchmarks │ User-authored             │   │
│  │                                                      │   │
│  │  Total: 446 benchmarks                              │   │
│  │                                                      │   │
│  │  [Browse Community DB] [Sync Now] [Create Custom]   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ ● Ready │ 446 benchmarks │ Last eval: 2h ago                │
└─────────────────────────────────────────────────────────────┘
```

### Agent Detail (Click any agent row)

```
│  📊 EVAL: RateAgent                              Combined: 78% │
│                                                                 │
│  ┌─ HARD EVAL METRICS ────────────────────────────────────┐   │
│  │                                                        │   │
│  │  Metric                    Score   Status              │   │
│  │  ───────────────────────── ─────── ──────              │   │
│  │  Scoring consistency       85%     ●                   │   │
│  │  (same project → same                                  │   │
│  │   scores across runs)                                  │   │
│  │  P1-P4 all present         100%    ●                   │   │
│  │  JSON schema valid         100%    ●                   │   │
│  │  Calibration accuracy      72%     ⚠                  │   │
│  │  (known-bad project                                    │   │
│  │   scores low?)                                         │   │
│  │  Response time < 30s       90%     ●                   │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ LLM-AS-JUDGE METRICS ─────────────────────────────────┐  │
│  │                                                         │  │
│  │  Grader                    Score   Status   Model       │  │
│  │  ───────────────────────── ─────── ──────── ──────      │  │
│  │  Relevance                 82%     ●        haiku       │  │
│  │  (are scores relevant                                   │  │
│  │   to the requirements?)                                 │  │
│  │  Correctness               68%     ⚠       sonnet      │  │
│  │  (are the P1-P4 scores                                  │  │
│  │   actually correct?)                                    │  │
│  │  Hallucination             72%     ⚠       haiku       │  │
│  │  (does agent invent                                     │  │
│  │   features that don't                                   │  │
│  │   exist in the repo?)                                   │  │
│  │  Reasoning quality         78%     ●        sonnet      │  │
│  │  (is the explanation                                    │  │
│  │   logically sound?)                                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ FAILED CASES ─────────────────────────────────────────┐   │
│  │                                                         │   │
│  │  Case          Input              Hard  Judge  Issue    │   │
│  │  ───────────── ──────────────── ───── ─────── ──────── │   │
│  │  rate_007      Ruby CLI tool     ✓     ✗ 0.3   P3 score│   │
│  │                                                inflated│   │
│  │  rate_009      Firebase wrapper  ✓     ✗ 0.2   Missed  │   │
│  │                                                vendor  │   │
│  │                                                lock-in │   │
│  │                                                         │   │
│  │  [View Details] [Re-run Failed] [Add to Benchmarks]    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ JUDGE REASONING (rate_007) ───────────────────────────┐   │
│  │                                                         │   │
│  │  OpenJudge CorrectnessGrader (cc/claude-sonnet):       │   │
│  │                                                         │   │
│  │  "The agent scored P3 (Infrastructure) at 7/10 for a   │   │
│  │  Ruby CLI tool with no data persistence, no recurring   │   │
│  │  revenue model, and no lock-in mechanism. Expected      │   │
│  │  score: 2-3/10. The agent over-weighted 'open source    │   │
│  │  community' as an infrastructure signal, which is       │   │
│  │  incorrect per the P3 definition."                      │   │
│  │                                                         │   │
│  │  Verdict: INCORRECT (0.3/1.0)                          │   │
│  │                                                         │   │
│  │  [Add Correction to Benchmarks]                        │   │
│  │  ↑ This failure becomes a new benchmark case.          │   │
│  │    Next eval run, the agent must get this right.       │   │
│  └─────────────────────────────────────────────────────────┘   │
```

---

## Eval in the Project Window

Per-project eval lives in the left panel Chat or Team tabs. Agents report their own eval scores. The orchestrator can trigger full eval runs.

### In Chat

```
│ ┌─ 👤 You ─────────────────────┐ │
│ │ How are our agents performing │ │
│ │ on this project?              │ │
│ └───────────────────────────────┘ │
│                                    │
│ ┌─ 🎯 Orchestrator ────────────┐ │
│ │ Here's the eval report for    │ │
│ │ SEA Atlas:                    │ │
│ │                                │ │
│ │ Agent          Hard  Judge    │ │
│ │ ClarifyAgent   95%   92%     │ │
│ │ SpecsAgent     100%  88%     │ │
│ │ DiscoverAgent  90%   80%     │ │
│ │ RateAgent      82%   72% ⚠  │ │
│ │ BuildAgent     85%   78%     │ │
│ │                                │ │
│ │ RateAgent has a calibration   │ │
│ │ issue — it over-scores P3     │ │
│ │ for projects without infra.   │ │
│ │                                │ │
│ │ Want me to run the full eval  │ │
│ │ suite or fix the RateAgent?   │ │
│ └────────────────────────────────┘ │
```

### In Team Tab (Per-Agent Badge)

```
│ ┌─────────────────────────────┐ │
│ │ ⚖ RateAgent        ● active │ │
│ │ "Scoring candidates..."     │ │
│ │ Eval: Hard 82% │ Judge 72% ⚠│ │
│ │                     [→ Chat]│ │
│ └─────────────────────────────┘ │
```

---

## Benchmark Database UI — Browse & Search

Accessible from Launcher [📊] → [Browse Community DB]:

```
┌─────────────────────────────────────────────────────────────┐
│ ← Eval Dashboard                                            │
│                                                             │
│ 📊 BENCHMARK DATABASE                                       │
│                                                             │
│ ┌─ SEARCH ─────────────────────────────────────────────┐   │
│ │ 🔍 Search benchmarks...                              │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ [All] [Built-in] [Community] [Local] [Custom]              │
│ [Hard Eval] [LLM-as-Judge] [Both]                          │
│                                                             │
│ ┌─ CATEGORIES ─────────────────────────────────────────┐   │
│ │                                                       │   │
│ │ 📂 Code Generation                     127 benchmarks │   │
│ │    ├── Code correctness (hard)         42             │   │
│ │    ├── Code quality (judge)            35             │   │
│ │    ├── Test coverage (hard)            28             │   │
│ │    └── Security scan (hard + judge)    22             │   │
│ │                                                       │   │
│ │ 📂 Requirements & Specs                89 benchmarks  │   │
│ │    ├── Completeness (judge)            34             │   │
│ │    ├── Consistency (judge)             25             │   │
│ │    └── Schema validation (hard)        30             │   │
│ │                                                       │   │
│ │ 📂 OSS Discovery & Rating              63 benchmarks  │   │
│ │    ├── Recall (hard)                   20             │   │
│ │    ├── Ranking quality (judge)         18             │   │
│ │    ├── P1-P4 calibration (hard+judge)  25             │   │
│ │                                                       │   │
│ │ 📂 Deployment & Ops                    44 benchmarks  │   │
│ │    ├── Deploy success (hard)           15             │   │
│ │    ├── Health check (hard)             12             │   │
│ │    └── Config correctness (judge)      17             │   │
│ │                                                       │   │
│ │ 📂 Responsive & A11y                   38 benchmarks  │   │
│ │    ├── Viewport overflow (hard)        15             │   │
│ │    ├── Touch targets (hard)            8              │   │
│ │    └── WCAG compliance (hard+judge)    15             │   │
│ │                                                       │   │
│ │ 📂 Domain-Specific                     85 benchmarks  │   │
│ │    ├── SaaS (community)                30             │   │
│ │    ├── E-commerce (community)          25             │   │
│ │    ├── API services (community)        18             │   │
│ │    └── Mobile apps (community)         12             │   │
│ │                                                       │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ [Import Selection] [Export My Benchmarks] [Contribute ↑]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Benchmark Detail

```
│ ← Benchmarks > Code Generation > Code Quality              │
│                                                             │
│ 📊 Code Quality Benchmark Set                               │
│                                                             │
│ Source: Community │ Author: @levelsio │ ⭐ 234               │
│ Type: LLM-as-Judge │ Grader: CodeQualityGrader              │
│ Agent: BuildAgent │ Framework: Any                          │
│                                                             │
│ DESCRIPTION:                                                │
│ 35 code samples rated for idiomatic patterns, naming,       │
│ error handling, and readability. Covers Next.js, Python      │
│ Flask, and Go HTTP servers. Each sample has a ground-truth  │
│ quality score from 3 senior engineers.                      │
│                                                             │
│ CASES:                                                      │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ #  Input (code sample)          Expected  Grader      │  │
│ │ ── ────────────────────────── ────────── ─────────── │  │
│ │ 1  next-api-route-basic.ts     0.85      CodeQuality │  │
│ │ 2  flask-auth-handler.py       0.42      CodeQuality │  │
│ │ 3  go-http-middleware.go       0.91      CodeQuality │  │
│ │ 4  react-form-validation.tsx   0.38      CodeQuality │  │
│ │ ... (35 total)                                        │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
│ [Import to My Benchmarks] [Preview Run (3 samples)]        │
│                                                             │
│ IMPORT OPTIONS:                                             │
│ ○ Import all 35 cases                                       │
│ ○ Import Next.js cases only (12)                            │
│ ○ Import Python cases only (11)                             │
│ ○ Custom selection                                          │
│                                                             │
│ [Import Selected]                                           │
```

---

## Auto-Generated Benchmarks (Context Accumulation)

Every agent interaction generates eval data automatically:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  INTERACTION → BENCHMARK EXTRACTION                         │
│                                                             │
│  Human approves agent output on first try:                  │
│  → Positive benchmark case (input + output + score: 1.0)   │
│                                                             │
│  Human corrects agent output:                               │
│  → Negative case (input + original output + score: 0.0)    │
│  → Positive case (input + corrected output + score: 1.0)   │
│                                                             │
│  Human rejects and agent retries successfully:              │
│  → Negative case (first attempt)                            │
│  → Positive case (successful retry)                         │
│                                                             │
│  Agent proposes spec change, human modifies before approve: │
│  → Partial case (input + original + score: 0.5)            │
│  → Positive case (input + modified version + score: 1.0)   │
│                                                             │
│  These accumulate in .snapfzz/eval/auto-benchmarks.jsonl   │
│  and sync to ~/.snapfzz-global/eval/ for cross-project use │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Auto-Benchmark Format

```jsonl
{"ts":"2026-04-02T10:31:00Z","agent":"clarify","type":"judge","input":"describe target users","output":"First-time founders in VN/TH","score":1.0,"grader":"completeness","source":"user_approved"}
{"ts":"2026-04-02T10:45:00Z","agent":"rate","type":"judge","input":"score P3 for ruby-cli","output":"7/10","score":0.0,"grader":"correctness","source":"user_corrected","correction":"2/10 — no infra layer"}
{"ts":"2026-04-02T10:46:00Z","agent":"rate","type":"judge","input":"score P3 for ruby-cli","output":"2/10 — CLI tool with no data persistence or recurring revenue","score":1.0,"grader":"correctness","source":"user_corrected_positive"}
```

---

## Eval Runner Modes

| Mode | Where | How | Speed |
|---|---|---|---|
| **Per-change** | Automatically after agent writes code | Hard eval only (fast checks) | < 5s |
| **Per-checkpoint** | When agent proposes quality gate | Hard + Judge (full quality report) | 30-60s |
| **On-demand** | User clicks [Run Full Suite] | All benchmarks, all agents | 2-5 min |
| **CI** | On every agent code change (dev workflow) | `RayEvaluator` parallel across all benchmarks | 1-3 min |

### Eval Runner Config

```json
{
  "eval": {
    "per_change": {
      "enabled": true,
      "type": "hard_only",
      "timeout_ms": 5000
    },
    "per_checkpoint": {
      "enabled": true,
      "type": "hard_and_judge",
      "judge_model": "cc/claude-haiku-3",
      "timeout_ms": 60000
    },
    "full_suite": {
      "type": "all",
      "judge_model": "cc/claude-sonnet-4-6",
      "parallel": true,
      "use_ray": true
    },
    "benchmark_sources": ["built-in", "community", "local", "custom"],
    "auto_extract": true,
    "sync_to_global": true
  }
}
```

---

## Hard Eval Examples (Per Agent)

| Agent | Hard Eval Metric | Check |
|---|---|---|
| **Orchestrator** | Task delegation accuracy | Did it assign the right agent? (match against labeled test set) |
| **ClarifyAgent** | Requirements schema valid | Does output match required JSON schema? All sections present? |
| **SpecsAgent** | Version consistency | No broken references between spec versions? |
| **DiscoverAgent** | Recall against known set | Given 10 requirements, does it find the known-good repos? |
| **RateAgent** | Score consistency | Same project → same scores (± 0.5) across 3 runs? |
| **RateAgent** | Calibration | Known-bad project scores < 4/10? Known-good > 7/10? |
| **BuildAgent** | App starts | `npm run dev` → exit code 0? |
| **BuildAgent** | Tests pass | All test files pass? |
| **BuildAgent** | No overflow | All 3 viewports, no horizontal scrollbar? |
| **BuildAgent** | Bundle size | JS initial load < 200KB gzipped? |
| **ShipAgent** | Deploy success | HTTP 200 on live URL? |
| **ShipAgent** | Stripe webhook | Test mode webhook fires? |

## LLM-as-Judge Examples (Per Agent)

| Agent | Judge Metric | Grader | What It Evaluates |
|---|---|---|---|
| **ClarifyAgent** | Question relevance | `RelevanceGrader` | Are interview questions relevant to the idea? |
| **ClarifyAgent** | Requirements completeness | `CompletenessGrader` | Does the doc cover problem, users, features, constraints? |
| **SpecsAgent** | Cross-spec consistency | `ConsistencyGrader` | Do Business Spec and Data Model agree? |
| **DiscoverAgent** | README summary quality | `CorrectnessGrader` | Does the summary accurately represent the repo? |
| **RateAgent** | Reasoning quality | `CorrectnessGrader` | Is the P1-P4 analysis logically sound? |
| **RateAgent** | Hallucination check | `HallucinationGrader` | Does agent claim features that don't exist? |
| **BuildAgent** | Code quality | `CodeQualityGrader` | Is the code idiomatic, readable, well-structured? |
| **BuildAgent** | Safety check | `SafetyGrader` | Any XSS, injection, hardcoded secrets? |
| **ShipAgent** | Config correctness | `CorrectnessGrader` | Does the deploy config match the project requirements? |

---

## Benchmark Storage

```
~/.snapfzz-global/eval/
├── datasets/
│   ├── built-in/                    # Ships with app
│   │   ├── clarify-benchmark.json
│   │   ├── discover-benchmark.json
│   │   ├── rate-benchmark.json
│   │   ├── build-benchmark.json
│   │   └── ship-benchmark.json
│   ├── community/                   # Synced from api.snapfzz.com
│   │   ├── code-quality-levelsio.json
│   │   ├── saas-deploy-patterns.json
│   │   └── ...
│   ├── local/                       # Auto-extracted from projects
│   │   ├── auto-benchmarks.jsonl    # Append-only
│   │   └── curated.json             # Human-reviewed subset
│   └── custom/                      # User-authored
│       └── my-benchmarks.json
├── history/
│   └── scores.jsonl                 # All eval run results over time
└── config.json                      # Eval runner configuration

.snapfzz/eval/                       # Per-project
├── auto-benchmarks.jsonl            # Project-specific extractions
├── latest-report.json               # Most recent eval run
└── benchmark-history.jsonl          # Score history for this project
```

---

## Key Design Decisions

1. **Hard eval + LLM-as-judge, always both.** Hard catches structural failures. Judge catches semantic failures. Neither alone is sufficient.
2. **Benchmarks are context accumulation.** Every interaction generates eval data. The more you use the system, the better the benchmarks, the smarter the agents.
3. **Community benchmark database.** Open-source registry hosted at api.snapfzz.com. Users contribute and consume. npm for eval datasets.
4. **Auto-extraction is on by default.** Approval = positive case. Correction = negative + positive case. No manual labeling needed.
5. **Judge model is configurable.** Cheap model (haiku) for per-change checks. Expensive model (sonnet) for full suite. Cost-aware eval.
6. **Failed cases become benchmarks.** Click [Add to Benchmarks] on any failure → it becomes a test case the agent must pass next time.
7. **Cross-project accumulation.** Local benchmarks sync to `~/.snapfzz-global/eval/`. A correction in project A improves agents in project B.
8. **Eval runs at 4 speeds.** Per-change (5s, hard only), per-checkpoint (60s, hard+judge), on-demand (2-5min, everything), CI (parallel via Ray).
