# Screen: Discover (OSS Search)

Agent searches GitHub, presents ranked candidates as cards.

## Searching State

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  DISCOVER                                  Step 2 of 6   │
│ SIDEBAR  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│          │  ✓───────●───────○───────○───────○───────○               │
│          │  Clarify  Discover  Rate   Build   Ship                 │
│          │                                                          │
│          │  🔍 Searching GitHub for matching projects...            │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │ Searching "company incorporation platform"...    │   │
│          │  │ ████████████░░░░░░░░                             │   │
│          │  │                                                  │   │
│          │  │ ✓ Keyword extraction from requirements           │   │
│          │  │ ✓ GitHub search: 847 repos found                 │   │
│          │  │ ● Filtering by license + activity...             │   │
│          │  │ ○ Ranking by match score                         │   │
│          │  │ ○ Summarizing top candidates                     │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 5.8K      │
└─────────────────────────────────────────────────────────────────────┘
```

## Results: Card Grid

```
│          │  DISCOVER                         5 matches  Step 2 of 6 │
│          │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│          │  ✓───────●───────○───────○───────○───────○               │
│          │                                                          │
│          │  Filter: [License ▾] [Stars ▾] [Language ▾] [Activity ▾]│
│          │                                                          │
│          │  ┌────────────────────────────┐ ┌─────────────────────┐ │
│          │  │ ⭐ 2.3K  📜 MIT            │ │ ⭐ 890  📜 Apache    │ │
│          │  │ opencorporates/register    │ │ startupsg/incorp    │ │
│          │  │ ──────────────────────     │ │ ─────────────────── │ │
│          │  │ Open-source company        │ │ Singapore company   │ │
│          │  │ registration platform.     │ │ registration tool.  │ │
│          │  │ Multi-jurisdiction.        │ │ ACRA integration.   │ │
│          │  │                            │ │                     │ │
│          │  │ Match: ████████░░ 78%      │ │ Match: ██████████ 94%│ │
│          │  │ Lang: Ruby  Updated: 2w    │ │ Lang: TS  Updated: 3d│ │
│          │  │                            │ │                     │ │
│          │  │ [Expand ▾]    [Select ✓]   │ │ [Expand ▾] [Select]│ │
│          │  └────────────────────────────┘ └─────────────────────┘ │
│          │                                                          │
│          │  ┌────────────────────────────┐ ┌─────────────────────┐ │
│          │  │ ⭐ 450  📜 MIT              │ │ ⭐ 12.1K  📜 MIT     │ │
│          │  │ asean-tools/bizsetup       │ │ stripe/stripe-atlas  │ │
│          │  │ ──────────────────────     │ │ ─────────────────── │ │
│          │  │ ASEAN business setup       │ │ Stripe Atlas docs   │ │
│          │  │ automation toolkit.        │ │ & API reference.    │ │
│          │  │                            │ │ (reference only)    │ │
│          │  │ Match: ███████░░░ 68%      │ │ Match: ████░░░░░░ 35%│ │
│          │  │ Lang: Python  Updated: 1mo │ │ Lang: -  Updated: 6mo│ │
│          │  │                            │ │                     │ │
│          │  │ [Expand ▾]    [Select]     │ │ [Expand ▾] [Select]│ │
│          │  └────────────────────────────┘ └─────────────────────┘ │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │ 🏗️ Build from scratch (no existing project)       │   │
│          │  │ Estimated effort: High — full custom build        │   │
│          │  │                                     [Select]      │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  [← Back to Requirements]         [→ Rate Selected (2)] │
│          │                                                          │
```

## Expanded Card

```
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │ ⭐ 890  📜 Apache 2.0   Lang: TypeScript          │   │
│          │  │ startupsg/incorp                                  │   │
│          │  │ ──────────────────────────────────────────────    │   │
│          │  │ Match: ██████████ 94%                             │   │
│          │  │                                                   │   │
│          │  │ ## README Summary                                 │   │
│          │  │ Singapore-focused company incorporation platform. │   │
│          │  │ Handles ACRA BizFile+ submission, nominee         │   │
│          │  │ director setup, and corporate secretary matching. │   │
│          │  │ Built with Next.js + Prisma + PostgreSQL.         │   │
│          │  │                                                   │   │
│          │  │ ## Match Analysis                                 │   │
│          │  │ ✓ SG company registration       (core feature)   │   │
│          │  │ ✓ ACRA integration              (core feature)   │   │
│          │  │ ✗ Multi-country (SG only)       (needs work)     │   │
│          │  │ ✗ Bank account setup            (missing)        │   │
│          │  │ ✗ Tax compliance dashboard      (missing)        │   │
│          │  │                                                   │   │
│          │  │ ## Tech Stack                                     │   │
│          │  │ Next.js 14 · Prisma · PostgreSQL · Tailwind      │   │
│          │  │ Last commit: 3 days ago · 14 contributors        │   │
│          │  │                                                   │   │
│          │  │ [🔗 View on GitHub]                [Select ✓]    │   │
│          │  │                                  [Collapse ▴]    │   │
│          │  └──────────────────────────────────────────────────┘   │
```
