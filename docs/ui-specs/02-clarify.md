# Screen: Clarify (Interview)

Chat-based interview. ClarifyAgent asks questions, user answers. Produces a requirements doc.

## Interview In Progress

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  CLARIFY                                   Step 1 of 6   │
│ SIDEBAR  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│          │  ●───────○───────○───────○───────○───────○               │
│ ▸ SEA    │  Clarify  Discover  Rate   Build   Ship                 │
│   Atlas  │                                                          │
│   [active]│ ┌────────────────────────────────────────────────────┐  │
│          │ │ 🤖 ClarifyAgent                                    │  │
│          │ │                                                     │  │
│          │ │ I see you want to build a Stripe Atlas alternative  │  │
│          │ │ for Southeast Asia. Let me understand this better.  │  │
│          │ │                                                     │  │
│          │ │ **Who is the primary user?**                        │  │
│          │ │ a) First-time founders incorporating a company      │  │
│          │ │ b) Existing businesses expanding to new countries   │  │
│          │ │ c) Freelancers formalizing their business           │  │
│          │ │ d) All of the above                                 │  │
│          │ └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │ ┌────────────────────────────────────────────────────┐  │
│          │ │ 👤 You                                              │  │
│          │ │                                                     │  │
│          │ │ Mainly (a) — first-time founders who want to       │  │
│          │ │ incorporate in Singapore but are based in Vietnam   │  │
│          │ │ or Thailand.                                        │  │
│          │ └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │ ┌────────────────────────────────────────────────────┐  │
│          │ │ 🤖 ClarifyAgent                                    │  │
│          │ │                                                     │  │
│          │ │ Got it — cross-border incorporation.                │  │
│          │ │                                                     │  │
│          │ │ **What's the core differentiator vs Stripe Atlas?**│  │
│          │ │ Stripe Atlas focuses on US Delaware C-Corps.        │  │
│          │ │ What makes yours different for SEA?                 │  │
│          │ └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │ ┌──────────────────────────────────────────────┬─────┐  │
│          │ │ Type your answer...                          │ Send│  │
│          │ └──────────────────────────────────────────────┴─────┘  │
│          │                                     Question 2 of ~5    │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 2.1K      │
└─────────────────────────────────────────────────────────────────────┘
```

## Requirements Generated

```
│          │  CLARIFY                                   Step 1 of 6   │
│          │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│          │  ●───────○───────○───────○───────○───────○               │
│          │                                                          │
│          │  ┌────────────────────────────────────────────────────┐  │
│          │  │ 📋 REQUIREMENTS DOCUMENT                           │  │
│          │  │ ────────────────────────                           │  │
│          │  │                                                    │  │
│          │  │ ## Problem                                         │  │
│          │  │ SEA founders need to incorporate in Singapore      │  │
│          │  │ but existing tools (Stripe Atlas) only support     │  │
│          │  │ US entities.                                       │  │
│          │  │                                                    │  │
│          │  │ ## Target Users                                    │  │
│          │  │ First-time founders in VN, TH, ID incorporating   │  │
│          │  │ in Singapore.                                      │  │
│          │  │                                                    │  │
│          │  │ ## Core Features                                   │  │
│          │  │ 1. SG company registration wizard                  │  │
│          │  │ 2. Bank account setup (DBS, OCBC)                  │  │
│          │  │ 3. Tax compliance dashboard (GST, CIT)             │  │
│          │  │ 4. Document management (ACRA filings)              │  │
│          │  │                                                    │  │
│          │  │ ## Constraints                                     │  │
│          │  │ - Must comply with SG MAS regulations              │  │
│          │  │ - Multi-language (EN, VI, TH, ID)                  │  │
│          │  │                                                    │  │
│          │  │ ## Differentiator                                  │  │
│          │  │ SEA-native, cross-border focus, local bank         │  │
│          │  │ partnerships vs US-only Stripe Atlas.              │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  [✏️ Edit Requirements]    [→ Find Existing Solutions]   │
│          │                                                          │
```
