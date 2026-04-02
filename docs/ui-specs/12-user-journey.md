# User Journey — Complete Flow

Every screen, every state, every transition. From app icon to shipped business.

---

## 1. LAUNCH — App Icon Click

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                                         │
│           ⚡ snapfzz                    │
│                                         │
│           startup launcher              │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
  ↑ Tauri native splash (< 100ms)
  ↑ Just the logo. No spinner. No loading bar.
  ↑ Disappears the moment the shell is ready.
```

---

## 2. FIRST RUN EVER — Setup (One-Time Only)

Only shows on the very first launch. Never again.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│           ⚡ Welcome to Snapfzz Startup Launcher                │
│                                                                 │
│           Setting up your workspace...                          │
│                                                                 │
│           ┌─────────────────────────────────────────────┐      │
│           │                                             │      │
│           │  ✓ Creating workspace directory              │      │
│           │  ✓ Pulling base images (python:slim)         │      │
│           │    ████████████████░░░░  78%   42MB / 54MB  │      │
│           │  ○ Installing AgentScope Runtime              │      │
│           │  ○ Creating agent snapshots                   │      │
│           │  ○ Ready                                      │      │
│           │                                             │      │
│           └─────────────────────────────────────────────┘      │
│                                                                 │
│           This only happens once. Future launches are instant.  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

After setup completes:

```
│           │  ✓ Creating workspace directory              │      │
│           │  ✓ Pulling base images                       │      │
│           │  ✓ Installing AgentScope Runtime              │      │
│           │  ✓ Creating agent snapshots                   │      │
│           │  ✓ Ready!                                     │      │
│           └─────────────────────────────────────────────┘      │
│                                                                 │
│           [→ Get Started]                                       │
```

---

## 3. WORKSPACE — Home Screen (Every Launch After First)

This is what the user sees in < 200ms on every subsequent launch. Workspace data loads from local disk instantly. Intelligence connects silently in background.

### 3a. Empty Workspace (No Projects Yet)

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │                                                          │
│ SIDEBAR  │                                                          │
│          │                                                          │
│ ┌──────┐ │            Welcome back, Khang.                          │
│ │ ⚡   │ │                                                          │
│ │ New  │ │            You haven't launched anything yet.             │
│ └──────┘ │                                                          │
│          │            ┌──────────────────────────────────────┐      │
│ PROJECTS │            │                                      │      │
│ ──────── │            │   ⚡ Launch your first startup       │      │
│          │            │                                      │      │
│ (empty)  │            │   Describe your idea and we'll       │      │
│          │            │   build it together.                 │      │
│          │            │                                      │      │
│          │            │   [→ Start Building]                 │      │
│          │            │                                      │      │
│          │            └──────────────────────────────────────┘      │
│          │                                                          │
│          │            ─── or explore templates ───                  │
│          │                                                          │
│          │            ┌────────┐ ┌────────┐ ┌────────┐             │
│          │            │ 🌐 SaaS│ │ 📄 Land│ │ 🔌 API │             │
│          │            └────────┘ └────────┘ └────────┘             │
│          │            ┌────────┐ ┌────────┐ ┌────────┐             │
│ ──────── │            │ 🤖 CLI │ │ 🛒 Store│ │ 📱 App │             │
│ ⚙ Settings            └────────┘ └────────┘ └────────┘             │
│ 📊 Eval  │                                                          │
│ 🧠 Memory│                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  ● Ready    LLM: claude-sonnet    Tokens: 0    Projects: 0         │
└─────────────────────────────────────────────────────────────────────┘
```

### 3b. Workspace With Projects

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │                                                          │
│ SIDEBAR  │  YOUR PROJECTS                                           │
│          │                                                          │
│ ┌──────┐ │  ┌──────────────────────────────────────────────────┐   │
│ │ ⚡   │ │  │ SEA Atlas                              ● Live    │   │
│ │ New  │ │  │ Company incorporation for SEA founders            │   │
│ └──────┘ │  │ Stage: Shipped │ sea-atlas.vercel.app             │   │
│          │  │ Last touched: 2 hours ago                         │   │
│ PROJECTS │  │                                                    │   │
│ ──────── │  │ [Open] [View Live ↗]                              │   │
│ ● SEA    │  └──────────────────────────────────────────────────┘   │
│   Atlas  │                                                          │
│ ● Code   │  ┌──────────────────────────────────────────────────┐   │
│   Review │  │ AI Code Review                          ● Live    │   │
│ ○ API    │  │ Automated code review for small teams             │   │
│   Gateway│  │ Stage: Shipped │ codrev.app                       │   │
│          │  │ Last touched: Yesterday                           │   │
│          │  │                                                    │   │
│          │  │ [Open] [View Live ↗]                              │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │ API Gateway                             ○ Building│   │
│          │  │ Rate-limited API gateway with analytics           │   │
│          │  │ Stage: Build (72% complete)                       │   │
│          │  │ Last touched: 30 min ago                          │   │
│          │  │                                                    │   │
│          │  │ [Resume Building]                                 │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│ ──────── │                                                          │
│ ⚙ Settings  [⚡ New Project]                                       │
│ 📊 Eval  │                                                          │
│ 🧠 Memory│                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  ● Ready    LLM: claude-sonnet    Tokens: 0    Projects: 3         │
└─────────────────────────────────────────────────────────────────────┘
```

### 3c. Clicking "Open" on a Shipped Project

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │                                                          │
│ SIDEBAR  │  SEA ATLAS                                    ● Live     │
│          │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ ┌──────┐ │  ✓───────✓───────✓───────✓───────✓                     │
│ │ ⚡   │ │  Clarify  Discover  Rate   Build   Ship                 │
│ │ New  │ │                                                          │
│ └──────┘ │  ┌─ PROJECT SUMMARY ────────────────────────────────┐   │
│          │  │                                                    │  │
│ ● SEA    │  │  🚀 https://sea-atlas.vercel.app         ● Live   │  │
│   Atlas ◀│  │  📦 github.com/0xtrou/sea-atlas                   │  │
│ ● Code   │  │  💳 Stripe: 3 products, $240/mo revenue           │  │
│   Review │  │  📜 Legal: SG Pte. Ltd. (registered)              │  │
│ ○ API    │  │                                                    │  │
│   Gateway│  │  Quality: 12/12 ████████████                      │  │
│          │  │  Last health check: 2 min ago — all passing       │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌─ HISTORY ────────────────────────────────────────┐   │
│          │  │                                                    │  │
│          │  │  Apr 2  Shipped to Vercel + Stripe connected      │  │
│          │  │  Apr 2  Built from startupsg/incorp (Score 32/40) │  │
│          │  │  Apr 2  Rated 5 candidates, picked startupsg      │  │
│          │  │  Apr 2  Found 5 OSS matches on GitHub             │  │
│          │  │  Apr 2  Requirements: SG incorporation for SEA    │  │
│          │  │                                                    │  │
│          │  │  [View Full Requirements] [View Build Log]        │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  [🔄 Re-enter Build Mode]  [🏥 Run Health Check]        │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  ● Ready    LLM: claude-sonnet    Tokens: 0    SEA Atlas           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. NEW PROJECT — Idea Input

User clicks "⚡ New" or "Start Building".

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │                                                          │
│ SIDEBAR  │           ⚡ What do you want to build?                   │
│          │                                                          │
│ ┌──────┐ │   ┌──────────────────────────────────────────────┐       │
│ │ ⚡   │ │   │                                              │       │
│ │ New ◀│ │   │  Describe your idea in plain language...     │       │
│ └──────┘ │   │                                              │       │
│          │   │  Examples:                                   │       │
│ PROJECTS │   │  • "A Stripe Atlas alternative for SEA"      │       │
│ ──────── │   │  • "An AI code review tool for small teams"  │       │
│ ● SEA    │   │  • "A landing page builder with payments"    │       │
│   Atlas  │   │                                              │       │
│ ● Code   │   └──────────────────────────────────────────────┘       │
│   Review │                                          [→ Start] btn   │
│ ○ API    │                                                          │
│   Gateway│   ─── or pick a template ───                             │
│          │                                                          │
│          │   ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│          │   │ 🌐 SaaS  │ │ 📄 Landing│ │ 🔌 API   │               │
│          │   │ Starter  │ │ Page     │ │ Service  │               │
│          │   └──────────┘ └──────────┘ └──────────┘               │
│          │   ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│          │   │ 🤖 CLI   │ │ 📱 Mobile│ │ 🛒 Store  │               │
│          │   │ Tool     │ │ App     │ │ Front   │               │
│          │   └──────────┘ └──────────┘ └──────────┘               │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  ● Ready    LLM: claude-sonnet    Tokens: 0                        │
└─────────────────────────────────────────────────────────────────────┘
```

User types and hits Start:

```
│          │   ┌──────────────────────────────────────────────┐       │
│          │   │                                              │       │
│          │   │  I want to build a Stripe Atlas alternative  │       │
│          │   │  for Southeast Asian founders. Should handle │       │
│          │   │  company registration, bank accounts, and    │       │
│          │   │  tax compliance for SG, VN, TH, ID.         │       │
│          │   │                                              │       │
│          │   └──────────────────────────────────────────────┘       │
│          │                                    [→ Start Clarify] btn │
```

---

## 5. CLARIFY — Agent Interview

Sidebar updates: new project appears. Stage progress bar starts. Chat opens.

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  CLARIFY                                   Step 1 of 6   │
│ SIDEBAR  │  ●───────○───────○───────○───────○───────○               │
│          │  Clarify  Discover  Rate   Build   Ship                 │
│ ┌──────┐ │                                                          │
│ │ ⚡   │ │  ┌── 🤖 ClarifyAgent ──────────────────────────────┐   │
│ │ New  │ │  │                                                  │   │
│ └──────┘ │  │ I see you want to build a Stripe Atlas           │   │
│          │  │ alternative for SEA. Let me understand better.    │   │
│ PROJECTS │  │                                                  │   │
│ ──────── │  │ **Who is the primary user?**                     │   │
│ ● SEA    │  │ a) First-time founders incorporating             │   │
│   Atlas  │  │ b) Existing businesses expanding                 │   │
│ ● Code   │  │ c) Freelancers formalizing                       │   │
│   Review │  │ d) All of the above                              │   │
│ ○ API    │  └──────────────────────────────────────────────────┘   │
│   Gateway│                                                          │
│ ○ New    │  ┌── 👤 You ───────────────────────────────────────┐   │
│   Project│  │ Mainly first-time founders based in VN/TH        │   │
│  [active]│  │ who want to incorporate in Singapore.            │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  ┌── 🤖 ClarifyAgent ──────────────────────────────┐   │
│          │  │ Got it — cross-border incorporation.              │   │
│          │  │                                                  │   │
│          │  │ **What's the core differentiator vs Stripe       │   │
│          │  │ Atlas?** They focus on US Delaware C-Corps.       │   │
│          │  │ What makes yours different for SEA?              │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  ┌────────────────────────────────────────┬──────┐      │
│          │  │ Type your answer...                    │ Send │      │
│          │  └────────────────────────────────────────┴──────┘      │
│          │                                     Question 2 of ~5    │
├──────────┴──────────────────────────────────────────────────────────┤
│  ● ClarifyAgent    LLM: claude-sonnet    Tokens: 2.1K              │
└─────────────────────────────────────────────────────────────────────┘
```

After ~5 questions, agent generates requirements:

```
│          │  ┌── 📋 REQUIREMENTS ──────────────────────────────┐    │
│          │  │                                                  │    │
│          │  │  ## Problem                                      │    │
│          │  │  SEA founders need to incorporate in SG but      │    │
│          │  │  existing tools only support US entities.        │    │
│          │  │                                                  │    │
│          │  │  ## Target Users                                 │    │
│          │  │  First-time founders in VN, TH, ID → SG.        │    │
│          │  │                                                  │    │
│          │  │  ## Core Features                                │    │
│          │  │  1. SG company registration wizard               │    │
│          │  │  2. Bank account setup (DBS, OCBC)               │    │
│          │  │  3. Tax compliance dashboard                     │    │
│          │  │  4. Document management                          │    │
│          │  │                                                  │    │
│          │  │  ## Constraints                                  │    │
│          │  │  MAS compliance, multi-language (EN, VI, TH, ID) │    │
│          │  │                                                  │    │
│          │  └──────────────────────────────────────────────────┘    │
│          │                                                          │
│          │  [✏️ Edit]              [→ Find Existing Solutions]      │
```

---

## 6. DISCOVER — OSS Search

User clicks "Find Existing Solutions". Stage bar advances.

```
│          │  DISCOVER                                  Step 2 of 6   │
│          │  ✓───────●───────○───────○───────○───────○               │
│          │                                                          │
│          │  🔍 DiscoverAgent is searching GitHub...                 │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │ ✓ Extracted keywords from requirements           │   │
│          │  │ ✓ GitHub search: 847 repos found                 │   │
│          │  │ ● Filtering by license + activity...             │   │
│          │  │ ○ Ranking by match score                         │   │
│          │  └──────────────────────────────────────────────────┘   │
```

Results appear as cards:

```
│          │  5 matches found                                         │
│          │                                                          │
│          │  ┌───────────────────────┐ ┌───────────────────────┐    │
│          │  │ ⭐ 890  📜 Apache      │ │ ⭐ 2.3K  📜 MIT        │    │
│          │  │ startupsg/incorp      │ │ opencorporates/reg    │    │
│          │  │ Match: ██████████ 94% │ │ Match: ████████░░ 78% │    │
│          │  │ [Select ✓]            │ │ [Select]              │    │
│          │  └───────────────────────┘ └───────────────────────┘    │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │ 🏗️ Build from scratch — no existing project       │   │
│          │  │                                     [Select]      │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  [← Back]                        [→ Rate Selected (2)]  │
```

---

## 7. RATE — P1-P4 Scoring

Side-by-side comparison:

```
│          │  RATE                                      Step 3 of 6   │
│          │  ✓───────✓───────●───────○───────○───────○               │
│          │                                                          │
│          │  ┌──────────────────┬───────────────────┐               │
│          │  │ startupsg/incorp │ opencorporates/reg │               │
│          │  ├──────────────────┼───────────────────┤               │
│          │  │ P1 SCALABLE 8/10 │ P1 SCALABLE 6/10  │               │
│          │  │ P2 CONVICT. 9/10 │ P2 CONVICT. 7/10  │               │
│          │  │ P3 INFRA    7/10 │ P3 INFRA    5/10  │               │
│          │  │ P4 DURABLE  8/10 │ P4 DURABLE  8/10  │               │
│          │  ├──────────────────┼───────────────────┤               │
│          │  │ TOTAL      32/40 │ TOTAL      26/40  │               │
│          │  │ FIT          72% │ FIT          45%  │               │
│          │  │  [★ Pick This]   │  [Pick This]      │               │
│          │  └──────────────────┴───────────────────┘               │
│          │                                                          │
│          │  [← Back]                    [→ Build with Winner]      │
```

---

## 8. BUILD — Vibe Coding (The Core Experience)

User picks winner. Split pane appears. Preview WebView connects to BoxLite port-forwarded :3000.

```
┌──────┬─────────────────────────────────┬────────────────────────────┐
│      │ BUILD · SEA Atlas          [◧◨] │ PREVIEW     [↗] [📱] [🖥] │
│  S   │ ✓─────✓─────✓─────●─────○───── │ ┌──────────────────────┐  │
│  I   │                                  │ │                      │  │
│  D   │ ┌─ 🤖 BuildAgent ────────────┐ │ │    SEA Atlas          │  │
│  E   │ │ Building from startupsg/    │ │ │                      │  │
│  B   │ │ incorp. Plan:              │ │ │    Incorporate your   │  │
│  A   │ │                              │ │ │    company in        │  │
│  R   │ │ 1. Clone & install         │ │ │    Southeast Asia     │  │
│      │ │ 2. Rename to "SEA Atlas"   │ │ │                      │  │
│      │ │ 3. Add VN, TH, ID         │ │ │    🇸🇬  🇻🇳  🇹🇭  🇮🇩     │  │
│      │ │ 4. Restyle landing page    │ │ │                      │  │
│      │ │                              │ │ │    [Get Started →]   │  │
│      │ │ Starting now...              │ │ │                      │  │
│      │ └──────────────────────────────┘ │ └──────────────────────┘  │
│      │                                  │                            │
│      │ ┌─ ACTIVITY ─────────────────┐  │  🔄 Hot reload: 0.3s ago  │
│      │ │ ✓ Scaffold      12s        │  │                            │
│      │ │ ● Customize     working... │  │  ← user can click, fill   │
│      │ │ ○ Harden                    │  │    forms, test the app    │
│      │ │ ○ Test                      │  │    while agent builds     │
│      │ └────────────────────────────┘  │                            │
│      │                                  │                            │
│      │ ┌──────────────────────┬──────┐ │                            │
│      │ │ Make the hero darker │ Send │ │                            │
│      │ └──────────────────────┴──────┘ │                            │
├──────┴──────────────────────────────────┴────────────────────────────┤
│ ● BuildAgent │ claude-sonnet │ Tokens: 24K │ Files: 8 changed       │
└─────────────────────────────────────────────────────────────────────┘
```

User talks to agent, agent adjusts live. User tests in preview. Loop continues until user is happy.

### Build Checkpoint

```
│      │ ┌─ ✅ QUALITY REPORT ─────────┐ │ ┌──────────────────────┐  │
│      │ │  1. ✓ Responsive  3/3 pass  │ │ │                      │  │
│      │ │  2. ✓ 60fps       Score: 94 │ │ │  (triple viewport    │  │
│      │ │  3. ✓ Accessible  0 issues  │ │ │   all passing)       │  │
│      │ │  4. ✓ Fast        LCP: 1.8s │ │ │                      │  │
│      │ │  ...                         │ │ │  📱✓  📱↔✓  🖥✓     │  │
│      │ │  OVERALL: 13/13 ████████████│ │ │                      │  │
│      │ │                              │ │ └──────────────────────┘  │
│      │ │ [Keep Building] [→ Ship It] │ │                            │
│      │ └──────────────────────────────┘ │                            │
```

---

## 9. SHIP — Deploy + Legal + Payments

Three lanes. Each optional and skippable.

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  SHIP                                      Step 5 of 6   │
│          │  ✓───────✓───────✓───────✓───────●───────○               │
│          │                                                          │
│          │  ┌─ 🚀 DEPLOY ─────────┬─ 📜 LEGAL ──────┬─ 💳 PAY ──┐ │
│          │  │                     │                  │           │ │
│          │  │ ○ Vercel            │ ○ Stripe Atlas   │ ○ Stripe  │ │
│          │  │ ○ Fly.io            │ ○ Manual setup    │ ○ Lemon   │ │
│          │  │ ○ Railway           │ ○ Skip           │ ○ Skip    │ │
│          │  │                     │                  │           │ │
│          │  │ [Start →]           │ [Start →]        │ [Start →] │ │
│          │  └─────────────────────┴──────────────────┴───────────┘ │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  ● ShipAgent    LLM: claude-sonnet    Tokens: 28K                  │
└─────────────────────────────────────────────────────────────────────┘
```

After all lanes complete:

```
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │                                                  │   │
│          │  │  🎉 Your startup is live!                        │   │
│          │  │                                                  │   │
│          │  │  🚀 https://sea-atlas.vercel.app      ● Live     │   │
│          │  │  📦 github.com/0xtrou/sea-atlas                  │   │
│          │  │  💳 Stripe connected — 3 tiers                   │   │
│          │  │  📜 Legal: checklist in progress (2/5)           │   │
│          │  │                                                  │   │
│          │  │  Quality: 13/13 ████████████████                 │   │
│          │  │                                                  │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  [🏠 Back to Workspace]         [⚡ Launch Another]      │
```

---

## 10. BACK TO WORKSPACE — Project Added

User returns to workspace. New project appears in sidebar and project list with live status.

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │                                                          │
│ SIDEBAR  │  YOUR PROJECTS                                           │
│          │                                                          │
│ ┌──────┐ │  ┌──────────────────────────────────────────────────┐   │
│ │ ⚡   │ │  │ SEA Atlas                       NEW   ● Live    │   │
│ │ New  │ │  │ Company incorporation for SEA founders            │   │
│ └──────┘ │  │ Shipped just now │ sea-atlas.vercel.app           │   │
│          │  │ Quality: 13/13 │ Revenue: $0 (just launched)     │   │
│ ● SEA   ◀│  │                                                    │   │
│   Atlas  │  │ [Open] [View Live ↗]                              │   │
│ ● Code   │  └──────────────────────────────────────────────────┘   │
│   Review │                                                          │
│ ○ API    │  ┌──────────────────────────────────────────────────┐   │
│   Gateway│  │ AI Code Review                          ● Live    │   │
│          │  │ ...                                                │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  ● Ready    LLM: claude-sonnet    Tokens: 0    Projects: 4         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. RESUME — Re-enter Any Stage

User clicks "Open" on any project → sees its current state. Can re-enter any completed stage to modify.

```
│          │  SEA ATLAS                                    ● Live     │
│          │  ✓───────✓───────✓───────✓───────✓                     │
│          │  Clarify  Discover  Rate   Build   Ship                 │
│          │                                                          │
│          │  Click any stage to revisit:                             │
│          │                                                          │
│          │  [✓ Clarify]  — edit requirements                       │
│          │  [✓ Discover] — search for new alternatives             │
│          │  [✓ Rate]     — re-score with updated requirements      │
│          │  [✓ Build]    — re-enter vibe coding, add features      │
│          │  [✓ Ship]     — redeploy, update payments               │
│          │                                                          │
│          │  Re-entering Build will open the live preview split pane.│
│          │  Your BoxLite VM state is preserved — pick up where     │
│          │  you left off.                                           │
```

---

## 12. ONGOING — Health Monitoring

From workspace, user can see live status of all shipped projects. Memory page shows cross-project analytics.

```
│          │  🧠 MEMORY                                               │
│          │                                                          │
│          │  Projects: 4 │ Decisions: 127 │ Preferred: Next.js      │
│          │                                                          │
│          │  ┌─ HEALTH ─────────────────────────────────────────┐   │
│          │  │ SEA Atlas       ● 200 OK   147ms   SSL ✓         │   │
│          │  │ Code Review     ● 200 OK   203ms   SSL ✓         │   │
│          │  │ Landing Builder ⚠ 503       —      SSL expired   │   │
│          │  │ API Gateway     — Not deployed                    │   │
│          │  │                                                    │   │
│          │  │ [💬 Ask Agent to Fix Landing Builder]              │   │
│          │  └──────────────────────────────────────────────────┘   │
```

---

## Complete Flow Diagram

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Launch  │────▶│  Splash  │────▶│ First Run│ (one-time only)
│  App     │     │  < 100ms │     │  Setup   │
└──────────┘     └──────────┘     └────┬─────┘
                       │               │
                       ▼               ▼
                 ┌──────────┐
                 │Workspace │◀──────────────────────────────┐
                 │  < 200ms │                               │
                 └────┬─────┘                               │
                      │                                     │
              ┌───────┴────────┐                            │
              ▼                ▼                            │
        ┌──────────┐    ┌──────────┐                       │
        │ Open     │    │ New      │                       │
        │ Project  │    │ Project  │                       │
        └────┬─────┘    └────┬─────┘                       │
             │               ▼                             │
             │         ┌──────────┐                        │
             │         │  Idea    │                        │
             │         │  Input   │                        │
             │         └────┬─────┘                        │
             │               ▼                             │
             │         ┌──────────┐                        │
             │         │ Clarify  │ ◀── edit requirements  │
             │         │ (chat)   │                        │
             │         └────┬─────┘                        │
             │               ▼                             │
             │         ┌──────────┐                        │
             │         │ Discover │ ◀── search again       │
             │         │ (cards)  │                        │
             │         └────┬─────┘                        │
             │               ▼                             │
             │         ┌──────────┐                        │
             │         │  Rate    │ ◀── re-score           │
             │         │ (compare)│                        │
             │         └────┬─────┘                        │
             │               ▼                             │
             ├────────▶┌──────────┐                        │
             │         │  Build   │ ◀── add features       │
             │         │ (vibe    │                        │
             │         │  coding) │ ◀── re-enter anytime   │
             │         └────┬─────┘                        │
             │               ▼                             │
             │         ┌──────────┐                        │
             │         │  Ship    │ ◀── redeploy           │
             │         │ (3 lanes)│                        │
             │         └────┬─────┘                        │
             │               │                             │
             │               ▼                             │
             │         ┌──────────┐                        │
             │         │  🎉 Live │                        │
             │         └────┬─────┘                        │
             │               │                             │
             └───────────────┴─────────────────────────────┘
                              back to workspace
```

---

## State Preservation Rules

| When user... | State saved to... | Can resume? |
|---|---|---|
| Closes app mid-Clarify | Rust L3 session + BoxLite persistent VM | ✓ Exact conversation restored |
| Closes app mid-Build | Rust L3 session + BoxLite VM + file system | ✓ Code, preview, all changes preserved |
| Closes app mid-Ship | Rust L3 session | ✓ Deploy/legal/pay progress preserved |
| Revisits shipped project | Disk (project history) + BoxLite snapshot | ✓ Re-enter any stage |
| Uninstalls and reinstalls | Local data lost (unless exported) | ✗ Start fresh (but Telos export recoverable) |

## Transition Animations

| Transition | Animation |
|---|---|
| Splash → Workspace | Fade out splash, fade in workspace (200ms) |
| Stage → Stage | Slide left (300ms, `ease-out`), progress bar fills |
| Workspace → Build | Expand from project card to split-pane (400ms) |
| Build → Ship | Slide left, preview shrinks to thumbnail |
| Ship → Workspace | Zoom out to workspace grid (300ms) |
| Any → Any | All CSS `transform` + `opacity` only (GPU composited) |
