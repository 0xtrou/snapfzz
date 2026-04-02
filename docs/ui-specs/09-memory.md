# Screen: Memory (Context Accumulation)

Shows what the system knows about the user across all projects. The moat visualized.

## Memory Overview

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  🧠 MEMORY                                               │
│ SIDEBAR  │                                                          │
│          │  Context from 4 projects · 127 decisions captured        │
│          │                                                          │
│          │  ┌─ YOUR PROFILE ───────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Preferred Stack                                   │  │
│          │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │  │
│          │  │  │Next.js│ │Prisma│ │Vercel│ │Stripe│            │  │
│          │  │  │  4/4  │ │  3/4 │ │  4/4 │ │  3/4 │            │  │
│          │  │  └──────┘ └──────┘ └──────┘ └──────┘            │  │
│          │  │  ↑ Used in 4/4     3/4       4/4      3/4 projects│  │
│          │  │                                                    │  │
│          │  │  Business Entity                                   │  │
│          │  │  Name: Snapfzz Pte. Ltd.                          │  │
│          │  │  Jurisdiction: Singapore                            │  │
│          │  │  Stripe Account: acct_1NqX...   ● Connected        │  │
│          │  │                                                    │  │
│          │  │  Philosophy: DoThingsRight (P1-P4)                 │  │
│          │  │  Default eval threshold: 70%                       │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌─ PROJECTS ───────────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Project         Status   Deploy          Revenue  │  │
│          │  │  ──────────────  ───────  ──────────────  ───────  │  │
│          │  │  SEA Atlas       ● Live   sea-atlas.com   $240/mo │  │
│          │  │  AI Code Review  ● Live   codrev.app      $89/mo  │  │
│          │  │  Landing Builder ● Live   landbuild.io    $0      │  │
│          │  │  API Gateway     ○ Dev    localhost:3000   —       │  │
│          │  │                                                    │  │
│          │  │  [Health Check All]                                │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌─ DECISIONS LOG ──────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Recent decisions captured:                         │  │
│          │  │                                                    │  │
│          │  │  Apr 2  SEA Atlas    Chose startupsg/incorp over   │  │
│          │  │                      opencorporates (P1: 8 vs 6)  │  │
│          │  │  Apr 1  Code Review  Deployed to Vercel over       │  │
│          │  │                      Fly.io (faster for Next.js)  │  │
│          │  │  Mar 28 Landing      Skipped legal setup           │  │
│          │  │                      (side project, no revenue)   │  │
│          │  │  Mar 25 API Gateway  Picked Hono over Express      │  │
│          │  │                      (P1: edge-ready, lighter)    │  │
│          │  │                                                    │  │
│          │  │  [View All 127 Decisions]                          │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌─ ACTIONS ────────────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  [📤 Export as Telos File]                         │  │
│          │  │  [📤 Export as JSON]                               │  │
│          │  │  [🗑  Clear All Memory]                            │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 0         │
└─────────────────────────────────────────────────────────────────────┘
```

## Health Check Running

```
│          │  ┌─ HEALTH CHECK ───────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Checking deployed projects...                     │  │
│          │  │                                                    │  │
│          │  │  SEA Atlas       ● 200 OK   147ms   SSL ✓         │  │
│          │  │  AI Code Review  ● 200 OK   203ms   SSL ✓         │  │
│          │  │  Landing Builder ⚠ 503       —      SSL expired   │  │
│          │  │  API Gateway     — Not deployed                    │  │
│          │  │                                                    │  │
│          │  │  1 issue found: Landing Builder SSL expired        │  │
│          │  │  [💬 Ask Agent to Fix]                             │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
```
