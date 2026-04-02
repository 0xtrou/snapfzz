# Screen: Rate (P1-P4 Scoring + Comparison)

Side-by-side comparison of selected candidates scored against DoThingsRight philosophy.

## Comparison View

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  RATE                                      Step 3 of 6   │
│ SIDEBAR  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│          │  ✓───────✓───────●───────○───────○───────○               │
│          │  Clarify  Discover  Rate   Build   Ship                 │
│          │                                                          │
│          │  Comparing 2 candidates against your requirements        │
│          │                                                          │
│          │  ┌─────────────────────┬──────────────────────┐          │
│          │  │ startupsg/incorp    │ opencorporates/reg    │          │
│          │  │ ⭐ 890  Apache 2.0  │ ⭐ 2.3K  MIT           │          │
│          │  ├─────────────────────┼──────────────────────┤          │
│          │  │                     │                      │          │
│          │  │ P1 SCALABLE    8/10 │ P1 SCALABLE    6/10  │          │
│          │  │ ████████░░         │ ██████░░░░           │          │
│          │  │ Next.js + Prisma.  │ Ruby monolith.       │          │
│          │  │ Clean data model.  │ Would need rewrite   │          │
│          │  │ API-first.         │ at scale.            │          │
│          │  │                     │                      │          │
│          │  │ P2 CONVICTION  9/10 │ P2 CONVICTION  7/10  │          │
│          │  │ █████████░         │ ███████░░░           │          │
│          │  │ SG-focused = exact │ Multi-jurisdiction   │          │
│          │  │ match for your     │ = broader but less   │          │
│          │  │ conviction.        │ focused.             │          │
│          │  │                     │                      │          │
│          │  │ P3 INFRA       7/10 │ P3 INFRA       5/10  │          │
│          │  │ ███████░░░         │ █████░░░░░           │          │
│          │  │ ACRA integration   │ No data lock-in.     │          │
│          │  │ = regulatory moat. │ Pure software.       │          │
│          │  │                     │                      │          │
│          │  │ P4 DURABILITY  8/10 │ P4 DURABILITY  8/10  │          │
│          │  │ ████████░░         │ ████████░░           │          │
│          │  │ Company formation  │ Company formation    │          │
│          │  │ is permanent need. │ is permanent need.   │          │
│          │  │                     │                      │          │
│          │  ├─────────────────────┼──────────────────────┤          │
│          │  │ TOTAL        32/40 │ TOTAL        26/40   │          │
│          │  │ ██████████████████ │ █████████████░░░░░   │          │
│          │  ├─────────────────────┼──────────────────────┤          │
│          │  │ CUSTOM FIT    72%  │ CUSTOM FIT    45%    │          │
│          │  │ Needs: multi-      │ Needs: full SG       │          │
│          │  │ country, bank,     │ rewrite, bank,       │          │
│          │  │ tax dashboard      │ tax, ACRA, rewrite   │          │
│          │  ├─────────────────────┼──────────────────────┤          │
│          │  │                     │                      │          │
│          │  │   [★ Pick This]    │    [Pick This]       │          │
│          │  │                     │                      │          │
│          │  └─────────────────────┴──────────────────────┘          │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────┐       │
│          │  │ 🏗️ Or build from scratch                      │       │
│          │  │ Custom fit: 100% but effort: High             │       │
│          │  │                               [Pick This]     │       │
│          │  └──────────────────────────────────────────────┘       │
│          │                                                          │
│          │  [← Back to Discover]            [→ Build with Winner]  │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 9.4K      │
└─────────────────────────────────────────────────────────────────────┘
```

## Expanded Reasoning (click any score)

```
│          │  ┌──────────────────────────────────────────────┐       │
│          │  │ P1: SCALABLE-READY — startupsg/incorp  8/10  │       │
│          │  │ ──────────────────────────────────────────── │       │
│          │  │                                              │       │
│          │  │ +3  API-first: Next.js API routes with       │       │
│          │  │     clear REST endpoints for each step       │       │
│          │  │ +2  Horizontal: Prisma + PostgreSQL can      │       │
│          │  │     shard by country/tenant                   │       │
│          │  │ +2  Clean data model: Company, Director,     │       │
│          │  │     Filing entities well-separated            │       │
│          │  │ +1  No-rewrite path: adding VN/TH is new     │       │
│          │  │     routes, not architectural change          │       │
│          │  │ -0  Minor: no queue system for async filings  │       │
│          │  │                                              │       │
│          │  │                              [Collapse ▴]    │       │
│          │  └──────────────────────────────────────────────┘       │
```
