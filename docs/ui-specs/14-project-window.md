# Project Window — Tabs as Agents

Each tab is an agent. Each agent has its own conversation with you. Agents talk to each other in the bottom panel. You watch, you intervene, you're always in control.

---

## The Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ SEA Atlas                                                    [⚙] [✕]│
│ ┌──────────┬────────┬──────────┬────────┬─────────┬────────┬───────┐│
│ │💬 Clarify│📑 Specs│🔍 Discover│⚖ Rate │🔨 Build │🚀 Ship │  +   ││
│ └──────────┴────────┴──────────┴────────┴─────────┴────────┴───────┘│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                     ACTIVE TAB CONTENT                               │
│                     (agent conversation + workspace)                 │
│                                                                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ ▲ AGENT NETWORK                                         [▲▼ resize] │
│                                                                      │
│  Agent-to-agent communication log                                    │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ Status Bar                                                           │
└──────────────────────────────────────────────────────────────────────┘
```

## Core Concept: Tab = Agent = Conversation

| Tab | Agent | What This Agent Does | Its Conversation |
|---|---|---|---|
| **💬 Clarify** | ClarifyAgent | Interviews you, produces requirements | You ↔ ClarifyAgent |
| **📑 Specs** | SpecsAgent | Manages versioned contracts, validates consistency | You ↔ SpecsAgent |
| **🔍 Discover** | DiscoverAgent | Searches GitHub, evaluates OSS candidates | You ↔ DiscoverAgent |
| **⚖ Rate** | RateAgent | Scores candidates against P1-P4 | You ↔ RateAgent |
| **🔨 Build** | BuildAgent | Writes code, manages workers, live preview | You ↔ BuildAgent |
| **🚀 Ship** | ShipAgent | Deploys, legal, payments | You ↔ ShipAgent |

Each tab maintains its own:
- Chat history (separate conversation thread)
- Agent context (what this agent knows)
- Workspace view (specific to this agent's domain)
- BoxLite VM (isolated process)

But all agents share:
- `.snapfzz/specs/` (the contracts — source of truth)
- Project files (the actual code)
- Agent Network messages (visible in bottom panel)

---

## Each Tab: Chat + Workspace Split

Every tab (not just Build) has a chat with its agent PLUS a workspace area specific to that agent's domain.

### Clarify Tab

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────┬────────┬──────────┬────────┬─────────┬────────┬───────┐│
│ │💬Clarify◀│📑 Specs│🔍 Discover│⚖ Rate │🔨 Build │🚀 Ship │  +   ││
│ └──────────┴────────┴──────────┴────────┴─────────┴────────┴───────┘│
├───────────────────────────────────┬──────────────────────────────────┤
│ CHAT with ClarifyAgent            │ WORKSPACE: Requirements Preview │
│                                   │                                  │
│ ┌─ 🤖 ClarifyAgent ───────────┐ │ ┌─ 📋 Requirements (live) ────┐ │
│ │ Who is the primary user?     │ │ │                              │ │
│ │ a) First-time founders       │ │ │ ## Problem                   │ │
│ │ b) Existing businesses       │ │ │ SEA founders need to         │ │
│ │ c) Freelancers               │ │ │ incorporate in SG...         │ │
│ └──────────────────────────────┘ │ │                              │ │
│                                   │ │ ## Target Users              │ │
│ ┌─ 👤 You ────────────────────┐ │ │ (fills in as you answer)     │ │
│ │ First-time founders in VN/TH│ │ │                              │ │
│ └──────────────────────────────┘ │ │ ## Core Features             │ │
│                                   │ │ (builds up during convo)     │ │
│ ┌─ 🤖 ClarifyAgent ───────────┐ │ │                              │ │
│ │ What's the differentiator    │ │ │                              │ │
│ │ vs Stripe Atlas?             │ │ └──────────────────────────────┘ │
│ └──────────────────────────────┘ │                                  │
│                                   │ Requirements doc builds in      │
│ ┌────────────────────┬──────┐    │ real-time as you chat.          │
│ │ Type answer...     │ Send │    │                                  │
│ └────────────────────┴──────┘    │ [✏ Edit] [→ Send to SpecsAgent] │
├───────────────────────────────────┴──────────────────────────────────┤
│ ▲ AGENT NETWORK                                                      │
│ 10:30 ClarifyAgent → SpecsAgent: "Requirements v1 ready for review" │
│ 10:30 SpecsAgent: "Received. Creating Business Spec v1 draft."      │
├──────────────────────────────────────────────────────────────────────┤
│ ● ClarifyAgent │ claude-haiku │ Tokens: 2.1K                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Specs Tab

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────┬────────┬──────────┬────────┬─────────┬────────┬───────┐│
│ │💬 Clarify│📑Specs◀│🔍 Discover│⚖ Rate │🔨 Build │🚀 Ship │  +   ││
│ │          │  ⚠ 1   │          │        │         │        │       ││
│ └──────────┴────────┴──────────┴────────┴─────────┴────────┴───────┘│
├───────────────────────────────────┬──────────────────────────────────┤
│ CHAT with SpecsAgent              │ WORKSPACE: Spec Documents        │
│                                   │                                  │
│ ┌─ 🤖 SpecsAgent ─────────────┐ │ ┌─ CONTRACTS ─────────────────┐ │
│ │ BuildAgent proposed changes  │ │ │                              │ │
│ │ to the Data Model spec.      │ │ │ 📄 Business Spec  v3 ✓     │ │
│ │                               │ │ │ 🎨 UI Spec        v2 ✓     │ │
│ │ They want to add a TaxFiling │ │ │ 🔌 API Spec       v1 ✓     │ │
│ │ entity with these fields:    │ │ │ 🗃 Data Model     v2 ⚠ draft│ │
│ │ - filing_type (GST/CIT)     │ │ │ 🚀 Deploy Spec    v1 ✓     │ │
│ │ - period, amount, status     │ │ │                              │ │
│ │                               │ │ │ [+ New Spec]               │ │
│ │ This is consistent with      │ │ └──────────────────────────────┘ │
│ │ Business Spec v3 which lists │ │                                  │
│ │ "Tax compliance dashboard"   │ │ ┌─ DATA MODEL v2 → v3 DIFF ──┐ │
│ │ as a core feature.           │ │ │                              │ │
│ │                               │ │ │ + entity TaxFiling {        │ │
│ │ Recommend: Approve.          │ │ │ +   filing_type: enum       │ │
│ └──────────────────────────────┘ │ │ +   period: daterange       │ │
│                                   │ │ +   amount: decimal         │ │
│ ┌─ 👤 You ────────────────────┐ │ │ +   status: enum            │ │
│ │ Approve. But add a           │ │ │ + }                         │ │
│ │ "submitted_at" timestamp.    │ │ │                              │ │
│ └──────────────────────────────┘ │ │ [✓ Approve] [✗ Reject]     │ │
│                                   │ └──────────────────────────────┘ │
│ ┌────────────────────┬──────┐    │                                  │
│ │ Type...            │ Send │    │                                  │
│ └────────────────────┴──────┘    │                                  │
├───────────────────────────────────┴──────────────────────────────────┤
│ ▲ AGENT NETWORK                                                      │
│ 10:45 BuildAgent → SpecsAgent: "Proposing Data Model v3: add TaxFiling entity" │
│ 10:45 SpecsAgent → User: "Review needed. Cross-checked against Business Spec." │
│ 10:46 User → SpecsAgent: "Approved with modification: add submitted_at"│
│ 10:46 SpecsAgent → BuildAgent: "Data Model v3 approved. Note: add submitted_at field." │
├──────────────────────────────────────────────────────────────────────┤
│ ● SpecsAgent │ claude-sonnet │ Tokens: 3.4K │ 5 specs │ 1 pending  │
└──────────────────────────────────────────────────────────────────────┘
```

### Discovery Tab

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────┬────────┬──────────┬────────┬─────────┬────────┬───────┐│
│ │💬 Clarify│📑 Specs│🔍Disco◀  │⚖ Rate │🔨 Build │🚀 Ship │  +   ││
│ │          │        │  5       │        │         │        │       ││
│ └──────────┴────────┴──────────┴────────┴─────────┴────────┴───────┘│
├───────────────────────────────────┬──────────────────────────────────┤
│ CHAT with DiscoverAgent           │ WORKSPACE: OSS Candidates        │
│                                   │                                  │
│ ┌─ 🤖 DiscoverAgent ──────────┐ │ ┌─ CANDIDATES ────────────────┐ │
│ │ Found 5 matches based on     │ │ │                              │ │
│ │ your Business Spec.          │ │ │ ⭐ 890  startupsg/incorp     │ │
│ │                               │ │ │ Match: 94%  Apache 2.0     │ │
│ │ Best match: startupsg/incorp │ │ │ SG registration + ACRA      │ │
│ │ at 94% — it already has      │ │ │ [→ Send to RateAgent]      │ │
│ │ ACRA integration.            │ │ │                              │ │
│ │                               │ │ │ ⭐ 2.3K opencorporates/reg  │ │
│ │ Want me to deep-dive into    │ │ │ Match: 78%  MIT             │ │
│ │ any of these?                │ │ │ Multi-jurisdiction, Ruby    │ │
│ └──────────────────────────────┘ │ │ [→ Send to RateAgent]      │ │
│                                   │ │                              │ │
│ ┌─ 👤 You ────────────────────┐ │ │ ⭐ 450  asean-tools/bizsetup │ │
│ │ Deep-dive startupsg/incorp.  │ │ │ Match: 68%  MIT             │ │
│ │ What's the test coverage     │ │ │ ASEAN business setup        │ │
│ │ like? Any active maintainers?│ │ │ [→ Send to RateAgent]      │ │
│ └──────────────────────────────┘ │ │                              │ │
│                                   │ │ Filter: [License▾] [Stars▾]│ │
│ ┌────────────────────┬──────┐    │ │ [🔄 Search Again]           │ │
│ │ Type...            │ Send │    │ └──────────────────────────────┘ │
│ └────────────────────┴──────┘    │                                  │
├───────────────────────────────────┴──────────────────────────────────┤
│ ▲ AGENT NETWORK                                                      │
│ 10:32 ClarifyAgent → DiscoverAgent: "Requirements v1 ready. Key: SG incorp, ACRA, multi-country." │
│ 10:33 DiscoverAgent: "Searching GitHub with 3 keyword strategies..." │
│ 10:35 DiscoverAgent → RateAgent: "5 candidates ready for scoring."  │
├──────────────────────────────────────────────────────────────────────┤
│ ● DiscoverAgent │ claude-haiku │ Tokens: 5.8K │ 5 candidates        │
└──────────────────────────────────────────────────────────────────────┘
```

### Rate Tab

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────┬────────┬──────────┬────────┬─────────┬────────┬───────┐│
│ │💬 Clarify│📑 Specs│🔍 Discover│⚖Rate◀ │🔨 Build │🚀 Ship │  +   ││
│ │          │        │  5       │ 32/40  │         │        │       ││
│ └──────────┴────────┴──────────┴────────┴─────────┴────────┴───────┘│
├───────────────────────────────────┬──────────────────────────────────┤
│ CHAT with RateAgent               │ WORKSPACE: Comparison            │
│                                   │                                  │
│ ┌─ 🤖 RateAgent ──────────────┐ │ ┌─ COMPARISON ────────────────┐ │
│ │ I've scored 2 candidates     │ │ │                              │ │
│ │ against your P1-P4 framework.│ │ │ startupsg    │ opencorps     │ │
│ │                               │ │ │ ─────────── │ ──────────── │ │
│ │ startupsg/incorp wins at     │ │ │ P1: 8/10    │ P1: 6/10     │ │
│ │ 32/40. Main weakness: P3     │ │ │ P2: 9/10    │ P2: 7/10     │ │
│ │ (no recurring infra layer).  │ │ │ P3: 7/10    │ P3: 5/10     │ │
│ │                               │ │ │ P4: 8/10    │ P4: 8/10     │ │
│ │ But you could add infra via  │ │ │ ─────────── │ ──────────── │ │
│ │ subscription pricing for tax │ │ │ Total: 32   │ Total: 26    │ │
│ │ compliance — that's P3.      │ │ │ Fit: 72%    │ Fit: 45%     │ │
│ └──────────────────────────────┘ │ │                              │ │
│                                   │ │ [★ Build]   │ [Build]      │ │
│ ┌─ 👤 You ────────────────────┐ │ │                              │ │
│ │ Good analysis. Can you       │ │ │ ── or ──                    │ │
│ │ score the P3 assuming we     │ │ │ 🏗️ Build from scratch       │ │
│ │ add tax subscription?        │ │ │ [Build]                     │ │
│ └──────────────────────────────┘ │ └──────────────────────────────┘ │
│                                   │                                  │
│ ┌────────────────────┬──────┐    │                                  │
│ │ Type...            │ Send │    │                                  │
│ └────────────────────┴──────┘    │                                  │
├───────────────────────────────────┴──────────────────────────────────┤
│ ▲ AGENT NETWORK                                                      │
│ 10:36 DiscoverAgent → RateAgent: "Score these 2: startupsg/incorp, opencorporates/register" │
│ 10:37 RateAgent: "Scoring against P1-P4 + Business Spec requirements..." │
│ 10:39 RateAgent → SpecsAgent: "Rating complete. Proposing UI Spec draft based on winner." │
├──────────────────────────────────────────────────────────────────────┤
│ ● RateAgent │ claude-sonnet │ Tokens: 9.4K │ 2 scored              │
└──────────────────────────────────────────────────────────────────────┘
```

### Build Tab (Split Pane — Preview WebView Added)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────┬────────┬──────────┬────────┬─────────┬────────┬───────┐│
│ │💬 Clarify│📑 Specs│🔍 Discover│⚖ Rate │🔨Build◀ │🚀 Ship │  +   ││
│ │          │        │  5       │ 32/40  │ ● live  │        │       ││
│ └──────────┴────────┴──────────┴────────┴─────────┴────────┴───────┘│
├──────────────────────────────────┬───────────────────────────────────┤
│ CHAT with BuildAgent             │ PREVIEW (BoxLite :3000)           │
│                                  │                                   │
│ [💬 Chat] [📝 Code] [📁 Files]  │ [↗] [📱] [📱↔] [🖥] [▣▣▣]       │
│                                  │                                   │
│ ┌─ 🤖 BuildAgent ────────────┐ │ ┌───────────────────────────┐    │
│ │ Adding VN jurisdiction.     │ │ │                           │    │
│ │ The SpecsAgent approved     │ │ │    SEA Atlas              │    │
│ │ Data Model v3 with the      │ │ │                           │    │
│ │ TaxFiling entity you        │ │ │    [🇸🇬] [🇻🇳] [🇹🇭]         │    │
│ │ requested. Implementing     │ │ │                           │    │
│ │ now.                        │ │ │    [Get Started →]        │    │
│ └─────────────────────────────┘ │ │                           │    │
│                                  │ └───────────────────────────┘    │
│ ┌─ ACTIVITY ──────────────┐    │                                   │
│ │ ✓ Scaffold    12s       │    │ 🔄 Hot reload │ ● Live            │
│ │ ● Customize   working..│    │                                   │
│ │ ○ Harden                │    │                                   │
│ │ ○ Test                  │    │                                   │
│ └──────────────────────────┘    │                                   │
│                                  │                                   │
│ ┌──────────────────┬──────┐    │                                   │
│ │ Make hero darker │ Send │    │                                   │
│ └──────────────────┴──────┘    │                                   │
├──────────────────────────────────┴───────────────────────────────────┤
│ ▲ AGENT NETWORK                                                      │
│ 10:42 BuildAgent → SpecsAgent: "Need Data Model change: add TaxFiling entity" │
│ 10:45 SpecsAgent → User: "Review needed." │ 10:46 User: "Approved + submitted_at" │
│ 10:46 SpecsAgent → BuildAgent: "Data Model v3 approved. Add submitted_at field." │
│ 10:47 BuildAgent: "Implementing TaxFiling with submitted_at. ETA: 30s."│
├──────────────────────────────────────────────────────────────────────┤
│ ● BuildAgent │ claude-sonnet │ Tokens: 24K │ Files: 8 │ Quality: —  │
└──────────────────────────────────────────────────────────────────────┘
```

### Ship Tab

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────┬────────┬──────────┬────────┬─────────┬────────┬───────┐│
│ │💬 Clarify│📑 Specs│🔍 Discover│⚖ Rate │🔨 Build │🚀Ship◀ │  +   ││
│ │          │        │  5       │ 32/40  │  ✓      │        │       ││
│ └──────────┴────────┴──────────┴────────┴─────────┴────────┴───────┘│
├───────────────────────────────────┬──────────────────────────────────┤
│ CHAT with ShipAgent               │ WORKSPACE: Deploy Dashboard      │
│                                   │                                  │
│ ┌─ 🤖 ShipAgent ──────────────┐ │ ┌─ 🚀 DEPLOY ───────────────┐  │
│ │ Ready to ship. I've read the│ │ │ ○ Vercel  ○ Fly.io         │  │
│ │ Deploy Spec and your build  │ │ │ [Start Deploy →]           │  │
│ │ passes 13/13 quality checks.│ │ ├────────────────────────────┤  │
│ │                               │ │ │ 📜 LEGAL                  │  │
│ │ Where would you like to     │ │ │ ○ Stripe Atlas ○ Manual    │  │
│ │ deploy?                     │ │ │ [Start →]                  │  │
│ └──────────────────────────────┘ │ ├────────────────────────────┤  │
│                                   │ │ 💳 PAYMENTS                │  │
│ ┌─ 👤 You ────────────────────┐ │ │ ○ Stripe  ○ LemonSqueezy  │  │
│ │ Vercel. Use the pricing from│ │ │ [Start →]                  │  │
│ │ the Business Spec.          │ │ └────────────────────────────┘  │
│ └──────────────────────────────┘ │                                  │
│                                   │                                  │
│ ┌────────────────────┬──────┐    │                                  │
│ │ Type...            │ Send │    │                                  │
│ └────────────────────┴──────┘    │                                  │
├───────────────────────────────────┴──────────────────────────────────┤
│ ▲ AGENT NETWORK                                                      │
│ 10:50 BuildAgent → ShipAgent: "Build complete. 13/13 quality. Ready to ship." │
│ 10:50 ShipAgent: "Reading Deploy Spec v1 and Business Spec v3 for pricing..." │
│ 10:51 ShipAgent → SpecsAgent: "Proposing Deploy Spec v2: add Vercel config." │
├──────────────────────────────────────────────────────────────────────┤
│ ● ShipAgent │ claude-sonnet │ Tokens: 28K                           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## The Agent Network Panel (Bottom)

The heartbeat of the system. Shows how agents collaborate in real-time.

### Default (Collapsed — 2 lines visible)

```
├──────────────────────────────────────────────────────────────────────┤
│ ▲ AGENT NETWORK                                         [▲▼ resize] │
│ 10:46 SpecsAgent → BuildAgent: "Data Model v3 approved."            │
│ 10:47 BuildAgent: "Implementing TaxFiling. ETA: 30s."               │
├──────────────────────────────────────────────────────────────────────┤
```

### Expanded (Drag handle up, or click ▲)

```
├──────────────────────────────────────────────────────────────────────┤
│ ▲ AGENT NETWORK                   [Filter: All▾] [Clear] [▲▼ resize]│
│                                                                      │
│  10:30 💬 ClarifyAgent → 📑 SpecsAgent                              │
│        "Requirements v1 ready for review."                           │
│        attachments: [requirements.md]                                │
│                                                                      │
│  10:30 📑 SpecsAgent                                                 │
│        "Received. Creating Business Spec v1 draft."                  │
│                                                                      │
│  10:31 📑 SpecsAgent → 👤 User                                      │
│        "Business Spec v1 ready for approval."                        │
│        ✓ Approved by user at 10:31                                   │
│                                                                      │
│  10:32 💬 ClarifyAgent → 🔍 DiscoverAgent                           │
│        "Requirements finalized. Key terms: SG incorp, ACRA,         │
│         multi-country, tax compliance."                              │
│                                                                      │
│  10:33 🔍 DiscoverAgent                                              │
│        "Searching GitHub with 3 keyword strategies..."               │
│                                                                      │
│  10:35 🔍 DiscoverAgent → ⚖ RateAgent                               │
│        "5 candidates ready for scoring."                             │
│        attachments: [discovery.json]                                 │
│                                                                      │
│  10:36 ⚖ RateAgent                                                   │
│        "Scoring 2 selected candidates against P1-P4..."             │
│                                                                      │
│  10:39 ⚖ RateAgent → 📑 SpecsAgent                                  │
│        "Rating complete. Winner: startupsg/incorp (32/40).           │
│         Proposing UI Spec based on winner's architecture."           │
│                                                                      │
│  10:42 🔨 BuildAgent → 📑 SpecsAgent                                │
│        "Need Data Model change: add TaxFiling entity."              │
│        attachments: [data-model-v3-draft.md]                        │
│                                                                      │
│  10:45 📑 SpecsAgent → 👤 User                                      │
│        "BuildAgent proposed Data Model changes.                      │
│         Cross-checked against Business Spec v3: consistent.          │
│         Recommend: approve."                                         │
│                                                                      │
│  10:46 👤 User → 📑 SpecsAgent                                      │
│        "Approved. Add submitted_at timestamp."                       │
│                                                                      │
│  10:46 📑 SpecsAgent → 🔨 BuildAgent                                │
│        "Data Model v3 approved. Note: add submitted_at field."      │
│                                                                      │
│  10:47 🔨 BuildAgent                                                 │
│        "Implementing TaxFiling with submitted_at. ETA: 30s."        │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
```

### Filter Options

```
Filter: [All ▾]
  ├── All messages
  ├── 💬 ClarifyAgent only
  ├── 📑 SpecsAgent only
  ├── 🔍 DiscoverAgent only
  ├── ⚖ RateAgent only
  ├── 🔨 BuildAgent only
  ├── 🚀 ShipAgent only
  ├── 👤 User interventions only
  └── ⚠ Approvals needed
```

### Human Intervention From Network Panel

The user can type directly into the Agent Network panel to intervene:

```
│  10:46 📑 SpecsAgent → 🔨 BuildAgent                                │
│        "Data Model v3 approved."                                     │
│                                                                      │
│  10:47 🔨 BuildAgent                                                 │
│        "Implementing TaxFiling. ETA: 30s."                           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┬──────┐    │
│  │ @build wait — also add a due_date field to TaxFiling │ Send │    │
│  └──────────────────────────────────────────────────────┴──────┘    │
```

`@agent` prefix sends to a specific agent. No prefix broadcasts to all.

---

## Agent-to-Agent Communication: How It Works

### AgentScope MsgHub

Under the hood, all agents are in a shared `MsgHub`. When ClarifyAgent produces requirements, it posts a `Msg` to the hub. DiscoverAgent subscribes to requirement messages. The Network Panel is a live view of the MsgHub.

```python
# AgentScope MsgHub — all agents are participants
async with MsgHub(
    participants=[clarify, specs, discover, rate, build, ship],
    announcement=project_context
):
    # Each agent's messages are visible to all other agents
    # The Network Panel renders the MsgHub log
    # Human can inject messages via the panel input
```

### Message Types

| Type | Example | Visible In |
|---|---|---|
| **Agent → Agent** | ClarifyAgent → DiscoverAgent: "Requirements ready" | Network Panel |
| **Agent → User** | SpecsAgent → User: "Review needed" | Network Panel + Tab badge ⚠ |
| **User → Agent** | User → BuildAgent: "Add due_date field" | Network Panel + agent's Chat |
| **Agent status** | BuildAgent: "Implementing..." | Network Panel |
| **Approval** | User approved Data Model v3 | Network Panel (✓ badge) |

### Agents Read Specs Automatically

Every agent can read `.snapfzz/specs/` at any time. When a spec is approved, the relevant agents are notified:

```
SpecsAgent approves Data Model v3
    → BuildAgent: "Data Model updated. Read new schema before coding."
    → ShipAgent: "Data Model changed. Migration may be needed."
```

---

## The [+] Tab — Add Custom Agents

Users can add custom agent tabs:

```
[+] → ┌────────────────────────────┐
      │ Add Agent Tab               │
      │                             │
      │ ○ 📊 Analytics Agent        │
      │   Monitor traffic & revenue │
      │                             │
      │ ○ 🧪 Test Agent             │
      │   Write & run tests         │
      │                             │
      │ ○ 📝 Content Agent          │
      │   Write copy & content      │
      │                             │
      │ ○ 🔒 Security Agent         │
      │   Audit & harden            │
      │                             │
      │ ○ Custom...                 │
      │   Define your own agent     │
      └────────────────────────────┘
```

Each custom agent gets its own BoxLite VM, its own conversation, and participates in the MsgHub.

---

## Responsive: Project Window

### Desktop (≥1025px)

As shown above — chat + workspace split (50/50 or adjustable).

### Tablet (641-1024px)

```
┌───────────────────────────────────────────────┐
│ SEA Atlas                              [⚙] [✕]│
│ ┌──────┬──────┬──────┬──────┬──────┬────┬───┐│
│ │💬    │📑    │🔍    │⚖    │🔨    │🚀  │ + ││
│ └──────┴──────┴──────┴──────┴──────┴────┴───┘│
├───────────────────────────────────────────────┤
│                                               │
│  [💬 Chat] [📋 Workspace]  ← toggle          │
│                                               │
│  (one at a time, full width)                  │
│  PiP thumbnail of inactive pane              │
│                                               │
├───────────────────────────────────────────────┤
│ ▲ NETWORK (collapsed, 1 line)                 │
├───────────────────────────────────────────────┤
│ Status                                        │
└───────────────────────────────────────────────┘
```

### Mobile (≤640px)

```
┌─────────────────────────────────────┐
│ SEA Atlas                    [⚙] [✕]│
│ ┌────┬────┬────┬────┬────┬───┬───┐ │
│ │ 💬 │ 📑 │ 🔍 │ ⚖ │ 🔨 │🚀│ + │ │
│ └────┴────┴────┴────┴────┴───┴───┘ │
├─────────────────────────────────────┤
│                                     │
│ (full screen, single view)          │
│                                     │
│ Chat is default.                    │
│ Workspace slides in as sheet.       │
│                                     │
├─────────────────────────────────────┤
│ ▲ NET (tap to expand as sheet)      │
├─────────────────────────────────────┤
│ ● BuildAgent │ 24K tokens           │
└─────────────────────────────────────┘
```

---

## Keyboard Shortcuts

```
⌘ + 1-7        → Switch tabs (Clarify, Specs, Discover, Rate, Build, Ship, +)
⌘ + [  / ]     → Previous / next tab
⌘ + \          → Toggle Agent Network panel
⌘ + Shift + N  → Focus Network panel input
⌘ + J          → Toggle Network panel expand/collapse
⌘ + B          → Toggle chat/workspace split (in any tab)
⌘ + W          → Close project window
```

---

## Key Design Decisions

1. **Each tab = each agent = each conversation.** Not views. Dedicated workspaces with specialized agents.
2. **Agent Network panel shows agent-to-agent coordination.** The human sees everything agents say to each other.
3. **Human can intervene from anywhere.** Type in any tab's chat or the Network panel. `@agent` for targeting.
4. **Agents read shared specs.** `.snapfzz/specs/` is the shared contract. SpecsAgent manages it. All agents reference it.
5. **Spec changes require human approval.** Agent proposes → SpecsAgent validates → human approves → only then does the agent implement.
6. **Build tab is the only split-pane.** All other tabs use chat + workspace split at full width.
7. **[+] adds custom agents.** The system is extensible from day 1.
8. **AgentScope MsgHub is the backbone.** All agent coordination runs through MsgHub. The Network Panel is a live view of it.
9. **Each agent has its own BoxLite VM.** Crash isolation. Independent memory. Independent model assignment.
