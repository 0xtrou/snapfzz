# Screen: Ship (Deploy + Legal + Payments)

Three-lane dashboard. Each lane is optional and skippable. Horizontal flow.

## Ship Dashboard

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  SHIP                                      Step 5 of 6   │
│ SIDEBAR  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│          │  ✓───────✓───────✓───────✓───────●───────○               │
│          │  Clarify  Discover  Rate   Build   Ship                 │
│          │                                                          │
│          │  ┌─ 🚀 DEPLOY ─────────┬─ 📜 LEGAL ──────┬─ 💳 PAY ──┐ │
│          │  │                     │                  │           │ │
│          │  │ Where to deploy?    │ Business entity  │ Payments  │ │
│          │  │                     │                  │           │ │
│          │  │ ○ Vercel (Next.js)  │ ○ Stripe Atlas   │ ○ Stripe  │ │
│          │  │ ○ Fly.io (Docker)   │   ($500 + fees)  │   Checkout│ │
│          │  │ ○ Railway           │ ○ Manual setup    │ ○ Lemon   │ │
│          │  │ ○ Self-hosted       │   (checklist)    │   Squeezy │ │
│          │  │                     │ ○ Skip for now   │ ○ Skip    │ │
│          │  │ [Start Deploy →]    │ [Start Legal →]  │ [Start →] │ │
│          │  │                     │                  │           │ │
│          │  └─────────────────────┴──────────────────┴───────────┘ │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 28.1K     │
└─────────────────────────────────────────────────────────────────────┘
```

## Deploy Lane — In Progress

```
│          │  ┌─ 🚀 DEPLOY ──────────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Deploying to Vercel...                            │  │
│          │  │                                                    │  │
│          │  │  ✓ Created GitHub repo: 0xtrou/sea-atlas          │  │
│          │  │  ✓ Pushed code (22 files)                         │  │
│          │  │  ✓ Connected to Vercel project                    │  │
│          │  │  ● Building... (Next.js)                          │  │
│          │  │    ████████████████░░░░  78%                      │  │
│          │  │  ○ Assigning domain                               │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
```

## Deploy Lane — Complete

```
│          │  ┌─ 🚀 DEPLOY ──────────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  ✓ DEPLOYED                                       │  │
│          │  │                                                    │  │
│          │  │  URL:  https://sea-atlas.vercel.app               │  │
│          │  │  Repo: https://github.com/0xtrou/sea-atlas        │  │
│          │  │  Build: 47s  Status: ● Live                       │  │
│          │  │                                                    │  │
│          │  │  [🔗 Open Live Site]  [⚙ Configure Domain]        │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
```

## Legal Lane — Checklist Mode

```
│          │  ┌─ 📜 LEGAL ───────────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Manual Setup Checklist (Singapore)                │  │
│          │  │                                                    │  │
│          │  │  - [ ] Register company name with ACRA             │  │
│          │  │        → https://www.acra.gov.sg/                  │  │
│          │  │  - [ ] Appoint local resident director             │  │
│          │  │        → Agent can help find nominee services      │  │
│          │  │  - [ ] Open corporate bank account                 │  │
│          │  │        → DBS, OCBC, or UOB recommended             │  │
│          │  │  - [ ] Register for GST (if revenue > S$1M)       │  │
│          │  │        → https://www.iras.gov.sg/                  │  │
│          │  │  - [ ] Get corporate secretary                     │  │
│          │  │                                                    │  │
│          │  │  [💬 Ask Agent for Help]                           │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
```

## Payments Lane — Stripe Setup

```
│          │  ┌─ 💳 PAYMENTS ────────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Adding Stripe to your app...                      │  │
│          │  │                                                    │  │
│          │  │  ✓ Created Stripe products (3 tiers)              │  │
│          │  │  ✓ Generated pricing page component               │  │
│          │  │  ✓ Added checkout session API route                │  │
│          │  │  ● Wiring webhook handler...                      │  │
│          │  │  ○ Adding customer portal link                    │  │
│          │  │                                                    │  │
│          │  │  Needs from you:                                   │  │
│          │  │  ┌────────────────────────────────────────────┐   │  │
│          │  │  │ Stripe API Key: sk_live_...                │   │  │
│          │  │  │ [Paste Key]                    [Connect]   │   │  │
│          │  │  └────────────────────────────────────────────┘   │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
```

## All Lanes Complete — Summary

```
│          │  SHIP COMPLETE                              Step 5 of 6  │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │                                                  │   │
│          │  │  🎉 Your startup is live!                        │   │
│          │  │                                                  │   │
│          │  │  🚀 DEPLOY                                      │   │
│          │  │  URL: https://sea-atlas.vercel.app   ● Live     │   │
│          │  │  Repo: github.com/0xtrou/sea-atlas              │   │
│          │  │                                                  │   │
│          │  │  📜 LEGAL                                       │   │
│          │  │  Status: Manual checklist in progress (2/5)     │   │
│          │  │  Entity: Not yet registered                     │   │
│          │  │                                                  │   │
│          │  │  💳 PAYMENTS                                    │   │
│          │  │  Stripe: Connected ✓                            │   │
│          │  │  Products: 3 tiers configured                   │   │
│          │  │  Checkout: https://sea-atlas.vercel.app/pricing │   │
│          │  │                                                  │   │
│          │  │  ────────────────────────────────────────────── │   │
│          │  │                                                  │   │
│          │  │  WHAT'S LEFT:                                   │   │
│          │  │  • Complete legal registration (manual steps)   │   │
│          │  │  • Configure custom domain                      │   │
│          │  │  • Set up monitoring / analytics                │   │
│          │  │                                                  │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  [🏠 Back to Projects]         [⚡ Launch Another]      │
│          │                                                          │
```
