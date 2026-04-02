# Project Window — Agent-First IDE

The workspace is infrastructure. Agents decide how to use it. The orchestrator is your co-creator — PM, engineer, designer, legal advisor, whatever you need. The IDE adapts to agents, not the other way around.

---

## The Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ SEA Atlas                                                        [⚙] [✕]│
├──────────────────────────────────┬───────────────────────────────────────┤
│ LEFT PANEL (communication)       │ RIGHT PANEL (workspace)               │
│                                  │                                       │
│ ┌────────┬──────────┐           │ ┌────┬──────┬──────┬──────┬────┬────┐│
│ │💬 Chat │👥 Team   │           │ │📚KB│📁Code│👁Prev│🚀Dep │🔑ID│☑Com││
│ └────────┴──────────┘           │ └────┴──────┴──────┴──────┴────┴────┘│
│                                  │                                       │
│ (active left tab)          ◄──►  │ (active right tab)                    │
│                            drag  │                                       │
│                                  │                                       │
│ ┌────────────────────┬────────┐ │                                       │
│ │ Type...            │  Send  │ │                                       │
│ └────────────────────┴────────┘ │                                       │
├──────────────────────────────────┴───────────────────────────────────────┤
│ ▲ AGENT NETWORK                                              [▲▼ resize]│
├──────────────────────────────────────────────────────────────────────────┤
│ Status Bar                                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Design Principle: Agent-First

The product is NOT an IDE with AI features bolted on. It IS an agent system with IDE infrastructure underneath.

```
TRADITIONAL:    Human uses IDE → sometimes asks AI for help
AGENT-FIRST:    Orchestrator agent runs the project → uses IDE features as tools
                Human steers, approves, and collaborates via chat
```

The orchestrator can:
- Create and organize Knowledge Base documents
- Open and edit files in the Code tab
- Watch the Preview and detect errors
- Configure deployments
- Set up identities and integrations
- Manage compliance checklists
- Do all of this proactively, not just when asked

The human can do all of the same things manually. Agent-first means the agent is the default actor, not the human.

---

## LEFT PANEL — Communication

Two tabs. Chat (orchestrator) and Team (all agents).

### 💬 Chat — The Orchestrator

Your co-creator. One agent that IS the project. Not a helper — a partner.

```
│ ┌────────┬──────────┐           │
│ │💬 Chat◀│👥 Team   │           │
│ └────────┴──────────┘           │
│                                  │
│ ┌─ 🎯 Orchestrator ──────────┐ │
│ │ I'm your co-creator for     │ │
│ │ this project. I can:        │ │
│ │                              │ │
│ │ • Interview you about the   │ │
│ │   idea and write specs      │ │
│ │ • Research existing tools   │ │
│ │ • Design and build the app  │ │
│ │ • Deploy, set up payments   │ │
│ │ • Handle legal, compliance  │ │
│ │ • Anything you need.        │ │
│ │                              │ │
│ │ What are we building?       │ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌─ 👤 You ────────────────────┐ │
│ │ A Stripe Atlas alternative  │ │
│ │ for Southeast Asian founders│ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌─ 🎯 Orchestrator ──────────┐ │
│ │ Great. Let me interview you │ │
│ │ to understand the scope.    │ │
│ │                              │ │
│ │ I've assigned ClarifyAgent  │ │
│ │ to help. Meanwhile I'm      │ │
│ │ setting up the Knowledge    │ │
│ │ Base with a Business Spec   │ │
│ │ template. Check the KB tab →│ │
│ │                              │ │
│ │ First question: Who is your │ │
│ │ primary user?               │ │
│ └─────────────────────────────┘ │
│                                  │
│ ┌────────────────────┬────────┐ │
│ │ Type...            │  Send  │ │
│ └────────────────────┴────────┘ │
```

The orchestrator:
- **PM role**: Interviews, writes specs, manages scope
- **Engineer role**: Writes code, runs tests, fixes bugs
- **Designer role**: Designs UI, checks responsive, enforces quality
- **Ops role**: Deploys, monitors, configures infra
- **Legal role**: Sets up entity, compliance checklists
- **Onboarding role**: Guides new users through first project
- **Everything role**: Whatever the project needs right now

### 👥 Team — Agent Dashboard + Direct Chat

```
│ ┌────────┬──────────┐           │
│ │💬 Chat │👥 Team◀  │           │
│ └────────┴──────────┘           │
│                                  │
│ AGENT TEAM                       │
│                                  │
│ ┌─────────────────────────────┐ │
│ │ 💬 ClarifyAgent    ● active │ │
│ │ "Interviewing about target  │ │
│ │  users..."                  │ │
│ │ 3 questions asked           │ │
│ │                     [→ Chat]│ │
│ ├─────────────────────────────┤ │
│ │ 📑 SpecsAgent      ● working│ │
│ │ "Creating Business Spec v1" │ │
│ │                     [→ Chat]│ │
│ ├─────────────────────────────┤ │
│ │ 🔍 DiscoverAgent   ◌ queued │ │
│ │ Waiting for requirements    │ │
│ │                     [→ Chat]│ │
│ ├─────────────────────────────┤ │
│ │ ⚖ RateAgent        ○ idle   │ │
│ │                     [→ Chat]│ │
│ ├─────────────────────────────┤ │
│ │ 🔨 BuildAgent      ○ idle   │ │
│ │                     [→ Chat]│ │
│ ├─────────────────────────────┤ │
│ │ 🚀 ShipAgent       ○ idle   │ │
│ │                     [→ Chat]│ │
│ └─────────────────────────────┘ │
│                                  │
│ [+ Add Custom Agent]             │
```

Click [→ Chat] drills into that agent's 1:1 conversation. [← Team] returns to list.

---

## RIGHT PANEL — Workspace Tabs

Six tabs. Two are hardcoded infrastructure (Code, Preview). Four are generic containers that agents organize.

### The Tabs

| Tab | Type | What It Is |
|---|---|---|
| **📚 Knowledge Base** | Generic | Notion-like document view. Agents create and organize any docs — business specs, UI specs, API specs, requirements, research notes, meeting notes, anything. Versioned. |
| **📁 Code** | Infrastructure | Full file explorer + Monaco editor. The code. |
| **👁 Preview** | Infrastructure | Live dev server from BoxLite :3000. Interactive. |
| **🚀 Deployments** | Generic | Manage deployments. Agents organize — Vercel, Fly.io, Railway configs, deploy history, rollbacks, health checks, domains. |
| **🔑 Identities** | Generic | Connect to third parties. Agents organize — Stripe, GitHub, hosting providers, DNS, API keys, OAuth apps. Any external identity/integration. |
| **☑ Compliance** | Generic | Legal, tax, regulatory checklists. Agents organize — entity registration, privacy policy, ToS, tax filings, certifications, audits. |

### What "Generic" Means

Generic tabs are **empty structures** that agents fill. The tab provides the UI primitives (documents, lists, forms, checklists). The agent decides what goes inside.

```
INFRASTRUCTURE TABS:          GENERIC TABS:
Code  → always shows files    Knowledge Base → agents create docs
Preview → always shows app    Deployments → agents add providers
                              Identities → agents add integrations
                              Compliance → agents add checklists

The generic tabs are like empty Notion databases.
Agents are the ones who create pages and fill them in.
Human can also create/edit anything manually.
```

### Mini Apps — Agent-Built Visualizations

Every generic tab can serve **custom mini apps**. Think Telegram mini apps but for your project workspace. An agent writes static HTML/JS/CSS, and it renders inline as an interactive widget.

```
┌──────────────────────────────────────────┐
│ WHAT THE AGENT WRITES:                   │
│                                          │
│ <div id="revenue-chart">                 │
│   <canvas id="chart"></canvas>           │
│   <script>                               │
│     fetch('/api/stripe/revenue')          │
│       .then(r => r.json())               │
│       .then(data => renderChart(data))   │
│   </script>                              │
│ </div>                                   │
│                                          │
│ WHAT THE USER SEES:                      │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ Revenue Dashboard        [↗] [✏] [×]│ │
│ │                                      │ │
│ │  $329/mo ▲ 12%                       │ │
│ │                                      │ │
│ │  $400│         ╭──────               │ │
│ │      │     ╭───╯                     │ │
│ │  $200│ ╭───╯                         │ │
│ │      │─╯                             │ │
│ │  $0  └─────────────────              │ │
│ │      Jan  Feb  Mar  Apr              │ │
│ │                                      │ │
│ │  SEA Atlas: $240  Code Review: $89   │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

**How it works:**

```
1. Agent writes HTML/JS/CSS as a file in .snapfzz/miniapps/<name>/
2. The generic tab renders it in a sandboxed iframe (same as Preview but local)
3. The mini app can query project data via a local API:
   - GET /api/project/specs     → read KB documents
   - GET /api/project/files     → read file tree
   - GET /api/project/deploys   → read deploy status
   - GET /api/project/identities → read connected services
   - GET /api/project/compliance → read checklist status
4. Pure static HTML — no build step, no bundler, no deps
5. Agent can update the mini app anytime (write new HTML → iframe refreshes)
```

**Examples of agent-built mini apps:**

| Tab | Mini App | What Agent Writes |
|---|---|---|
| **Knowledge Base** | Architecture diagram | Mermaid.js rendering of system design |
| **Knowledge Base** | Competitor matrix | Interactive comparison table with sorting |
| **Deployments** | Traffic dashboard | Chart.js pulling from Plausible/Vercel analytics API |
| **Deployments** | Cost calculator | Shows monthly infra costs by provider |
| **Identities** | OAuth flow diagram | Visual representation of auth flow |
| **Identities** | API key dashboard | Status of all connected services, expiry dates |
| **Compliance** | Tax estimator | Calculator based on jurisdiction + revenue |
| **Compliance** | GDPR audit tool | Interactive checklist with evidence links |
| **Any tab** | Custom query view | Agent writes SQL/API query → renders results as table/chart |

**Security:** Mini apps run in a sandboxed iframe with `sandbox="allow-scripts"`. No access to parent DOM, cookies, or localStorage. Can only read project data via the local API (which respects permissions).

**The human can also create mini apps** — write HTML in the Code tab, point a widget at it. But the power move is telling the orchestrator "show me a revenue dashboard" and it builds one.

```
👤 You: "Show me a chart of our Stripe revenue by product"

🎯 Orchestrator: "Building a revenue dashboard. I'll put it in
   the Deployments tab as a mini app."
   
   → Agent writes .snapfzz/miniapps/revenue-chart/index.html
   → Deployments tab shows the interactive chart
   → Chart auto-refreshes every 5 minutes

👤 You: "Add a comparison with last month"

🎯 Orchestrator: "Updated the dashboard with month-over-month comparison."
   → Agent rewrites the HTML → iframe refreshes → new chart appears
```

### Mini App Storage

```
.snapfzz/miniapps/
├── revenue-chart/
│   └── index.html          # Self-contained HTML + inline JS/CSS
├── tax-calculator/
│   └── index.html
├── architecture-diagram/
│   └── index.html
└── competitor-matrix/
    └── index.html
```

Each mini app is a single `index.html` file. Self-contained. No build step. Agent writes it, iframe renders it. Delete the file, widget disappears. Simple.

---

### 📚 Knowledge Base — Notion-Like Document View

Agents create documents here. Any type. Organized in a tree/list. Versioned.

```
│ ┌────┬──────┬──────┬──────┬────┬────┐ │
│ │📚KB◀│📁Code│👁Prev│🚀Dep │🔑ID│☑Com│ │
│ └────┴──────┴──────┴──────┴────┴────┘ │
│                                        │
│ KNOWLEDGE BASE              [+ New Doc]│
│                                        │
│ 📂 Specs                               │
│ ├── 📄 Business Spec     v3 ✓ Approved │
│ ├── 📄 UI Spec           v2 ✓ Approved │
│ ├── 📄 API Spec          v1 ✓ Approved │
│ ├── 📄 Data Model        v2 ⚠ Draft    │
│ └── 📄 Deploy Spec       v1 ✓ Approved │
│                                        │
│ 📂 Research                             │
│ ├── 📄 Competitor Analysis              │
│ ├── 📄 Market Sizing Notes              │
│ └── 📄 OSS Evaluation (5 candidates)   │
│                                        │
│ 📂 Design                              │
│ ├── 📄 Wireframes                      │
│ ├── 📄 User Flows                      │
│ └── 📄 Component Inventory             │
│                                        │
│ 📂 Meeting Notes                        │
│ └── 📄 2026-04-02 Initial Brainstorm   │
│                                        │
```

Click any doc → opens in a rich markdown editor (Notion-like blocks):

```
│ [← KB] 📄 Business Spec        v3 │ ✓ │
│ ──────────────────────────────────────│
│                                        │
│ ## Problem                             │
│ SEA founders need to incorporate in    │
│ Singapore but existing tools only      │
│ support US entities.                   │
│                                        │
│ ## Target Users                        │
│ First-time founders in VN, TH, ID     │
│ incorporating in Singapore.            │
│                                        │
│ ## Core Features                       │
│ 1. SG company registration wizard     │
│ 2. Bank account setup (DBS, OCBC)     │
│ 3. Tax compliance dashboard           │
│ 4. Document management                │
│                                        │
│ ## Revenue Model                       │
│ | Tier | Price | Features |            │
│ |------|-------|----------|            │
│ | Starter | $299 | Reg only |          │
│ | Pro | $79/mo | Full service |        │
│ | Enterprise | $199/mo | Dedicated |   │
│                                        │
│ [✏ Edit] [History ▾] [Diff] [Export]  │
│                                        │
│ Version: v3 │ By: ClarifyAgent + You  │
│ Last edited: 2 hours ago               │
```

**Versioning**: Every save creates a new version. Agents propose changes as drafts. Human approves. Full diff between any two versions. Same system as before, but now inside a generic doc container.

**Agents can create any document type:**
- Business specs, UI specs, API specs (structured)
- Research notes (freeform)
- Meeting summaries (auto-generated from chat)
- Checklists, tables, diagrams
- Whatever the project needs

---

### 📁 Code — Full Monaco Editor

File explorer + Monaco. Full VS Code editing experience.

```
│ ┌────┬──────┬──────┬──────┬────┬────┐ │
│ │📚KB│📁Code◀│👁Prev│🚀Dep │🔑ID│☑Com│ │
│ └────┴──────┴──────┴──────┴────┴────┘ │
│                                        │
│ ┌─ FILES ───────┐ ┌─ EDITOR ────────┐ │
│ │ sea-atlas/    │ │ app/page.tsx    │ │
│ │ ├── app/      │ │                 │ │
│ │ │  ├ page.tsx◀│ │ 1  import {     │ │
│ │ │  ├ layout   │ │ 2    Hero       │ │
│ │ │  └ global   │ │ 3  } from '../  │ │
│ │ ├── components│ │ 4    components │ │
│ │ │  ├ Hero.tsx │ │ 5    /Hero'     │ │
│ │ │  ├ Country  │ │ 6               │ │
│ │ │  └ Feature  │ │ 7  export       │ │
│ │ ├── config/   │ │ 8  default      │ │
│ │ │  └ juris/   │ │ 9  function     │ │
│ │ │    ├ sg.ts  │ │ 10   Home() {   │ │
│ │ │    ├ vn.ts  │ │ 11   return (   │ │
│ │ │    └ th.ts  │ │ 12     <main>   │ │
│ │ ├── package   │ │ 13       <Hero  │ │
│ │ └── .snapfzz/ │ │ 14         ... │ │
│ └───────────────┘ │                 │ │
│                    │ Ln 10, Col 3   │ │
│ [± Diff] [📊 Qual] └─────────────────┘ │
│                                        │
│ 14 files │ 8 modified │ +312 -47      │
```

**Monaco features included:**
- Syntax highlighting (all major languages)
- IntelliSense / autocomplete
- Multi-cursor editing
- Find & replace (⌘F / ⌘H)
- Go to definition, peek, references
- Minimap
- Bracket matching
- Git diff decorations (gutter marks for changes)
- Integrated terminal (future)

**Agent interaction with Code tab:**
- BuildAgent writes files → they appear in file tree immediately
- Agent can highlight specific lines in chat ("See line 42 in page.tsx")
- User edits code manually → agent sees changes in its next turn
- [± Diff] shows all changes since last checkpoint
- [📊 Quality] runs the 13-standard quality check

---

### 👁 Preview — Live Dev Server

The running app from BoxLite :3000. Fully interactive.

```
│ ┌────┬──────┬──────┬──────┬────┬────┐ │
│ │📚KB│📁Code│👁Prev◀│🚀Dep │🔑ID│☑Com│ │
│ └────┴──────┴──────┴──────┴────┴────┘ │
│                                        │
│ [↗ Open] [📱 375] [📱↔ 768] [🖥 1280] │
│ [▣▣▣ Triple]                           │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │                                    │ │
│ │        SEA Atlas                   │ │
│ │                                    │ │
│ │        Incorporate your company    │ │
│ │        in Southeast Asia           │ │
│ │                                    │ │
│ │        [🇸🇬] [🇻🇳] [🇹🇭] [🇮🇩]         │ │
│ │                                    │ │
│ │        [Get Started →]             │ │
│ │                                    │ │
│ └────────────────────────────────────┘ │
│                                        │
│ ┌─ Console ──────────────────────────┐│
│ │ ⚠ Warning: missing key prop (L42) ││
│ │ ✕ Error: 404 /api/jurisdictions/id ││
│ └────────────────────────────────────┘│
│                                        │
│ ● Live │ HMR │ localhost:3000         │
│ Interactive: click, type, navigate    │
```

Triple viewport, responsive testing, console capture, error auto-detection — all per existing specs in `05-build.md`.

---

### 🚀 Deployments — Agent-Organized

Empty by default. ShipAgent creates and manages entries.

```
│ ┌────┬──────┬──────┬──────┬────┬────┐ │
│ │📚KB│📁Code│👁Prev│🚀Dep◀│🔑ID│☑Com│ │
│ └────┴──────┴──────┴──────┴────┴────┘ │
│                                        │
│ DEPLOYMENTS                [+ Add New] │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ 🟢 Production                      │ │
│ │ Vercel │ sea-atlas.vercel.app      │ │
│ │ Branch: main │ Auto-deploy: ON     │ │
│ │ Last deploy: 2h ago │ ● Healthy    │ │
│ │ Response: 147ms │ SSL: ✓ Valid     │ │
│ │                                    │ │
│ │ [Redeploy] [Logs] [Settings] [···]│ │
│ └────────────────────────────────────┘ │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ 🟡 Staging                         │ │
│ │ Vercel │ sea-atlas-staging.vercel  │ │
│ │ Branch: develop │ Auto-deploy: ON  │ │
│ │ Last deploy: 30m ago │ ● Healthy   │ │
│ │                                    │ │
│ │ [Redeploy] [Logs] [Promote → Prod]│ │
│ └────────────────────────────────────┘ │
│                                        │
│ DEPLOY HISTORY                         │
│ ├── Apr 2, 12:00 — v1.2.0 → Prod ✓  │
│ ├── Apr 2, 11:30 — v1.2.0 → Staging ✓│
│ ├── Apr 2, 10:00 — v1.1.0 → Prod ✓  │
│ └── Apr 1, 15:00 — v1.0.0 → Prod ✓  │
│                                        │
│ [Rollback to previous]                 │
```

**Agent-organized means:** ShipAgent creates "Production" and "Staging" entries during deploy. Adds health checks, configures auto-deploy. Human can add/edit manually too. The structure isn't hardcoded — agent decides based on the project.

---

### 🔑 Identities — Agent-Organized

Third-party connections. Generic — agents decide what goes here.

```
│ ┌────┬──────┬──────┬──────┬────┬────┐ │
│ │📚KB│📁Code│👁Prev│🚀Dep │🔑ID◀│☑Com│ │
│ └────┴──────┴──────┴──────┴────┴────┘ │
│                                        │
│ IDENTITIES               [+ Connect]  │
│                                        │
│ 📂 Hosting                             │
│ ┌────────────────────────────────────┐ │
│ │ Vercel               ● Connected   │ │
│ │ Team: snapfzz │ 3 projects        │ │
│ │ [Manage] [Disconnect]              │ │
│ └────────────────────────────────────┘ │
│                                        │
│ 📂 Payments                            │
│ ┌────────────────────────────────────┐ │
│ │ Stripe               ● Connected   │ │
│ │ Account: acct_1NqX │ Mode: Live   │ │
│ │ Products: 3 │ Revenue: $240/mo    │ │
│ │ [Dashboard ↗] [Manage]            │ │
│ └────────────────────────────────────┘ │
│                                        │
│ 📂 Source Control                      │
│ ┌────────────────────────────────────┐ │
│ │ GitHub               ● Connected   │ │
│ │ Repo: 0xtrou/sea-atlas           │ │
│ │ [View Repo ↗] [Manage]           │ │
│ └────────────────────────────────────┘ │
│                                        │
│ 📂 DNS                                 │
│ ┌────────────────────────────────────┐ │
│ │ Cloudflare           ○ Not set up  │ │
│ │ [Connect]                          │ │
│ └────────────────────────────────────┘ │
│                                        │
│ 📂 Analytics                           │
│ ┌────────────────────────────────────┐ │
│ │ Plausible            ● Connected   │ │
│ │ Site: sea-atlas.com               │ │
│ │ [Dashboard ↗] [Manage]           │ │
│ └────────────────────────────────────┘ │
```

**Agent-organized means:** When ShipAgent deploys to Vercel, it creates the Vercel identity here. When it adds Stripe, it creates the Stripe identity. When user says "add analytics", agent adds Plausible. The categories (Hosting, Payments, Source Control, DNS, Analytics) are created by agents based on what's connected — not hardcoded.

---

### ☑ Compliance — Agent-Organized

Legal, tax, regulatory. Checklists that agents create and maintain.

```
│ ┌────┬──────┬──────┬──────┬────┬────┐ │
│ │📚KB│📁Code│👁Prev│🚀Dep │🔑ID│☑Com◀│ │
│ └────┴──────┴──────┴──────┴────┴────┘ │
│                                        │
│ COMPLIANCE              [+ Add Area]   │
│                                        │
│ 📂 Corporate Entity                    │
│ ┌────────────────────────────────────┐ │
│ │ Singapore Pte. Ltd.    ✓ Registered│ │
│ │                                    │ │
│ │ - [✓] Register company with ACRA  │ │
│ │ - [✓] Appoint local director      │ │
│ │ - [ ] Open corporate bank account │ │
│ │       → DBS application pending   │ │
│ │ - [ ] Register for GST            │ │
│ │       → Required when rev > S$1M  │ │
│ │ - [✓] Corporate secretary         │ │
│ │                                    │ │
│ │ 3/5 complete                       │ │
│ └────────────────────────────────────┘ │
│                                        │
│ 📂 Privacy & Data                      │
│ ┌────────────────────────────────────┐ │
│ │ PDPA (SG) + GDPR (if EU users)   │ │
│ │                                    │ │
│ │ - [✓] Privacy Policy generated    │ │
│ │ - [✓] Terms of Service generated  │ │
│ │ - [✓] Cookie consent implemented  │ │
│ │ - [ ] PDPA data protection officer│ │
│ │ - [ ] GDPR data export endpoint   │ │
│ │                                    │ │
│ │ 3/5 complete                       │ │
│ └────────────────────────────────────┘ │
│                                        │
│ 📂 Tax                                 │
│ ┌────────────────────────────────────┐ │
│ │ Singapore Tax Obligations          │ │
│ │                                    │ │
│ │ - [ ] Corporate Income Tax (CIT)  │ │
│ │       → 17% on chargeable income  │ │
│ │ - [ ] GST registration            │ │
│ │ - [ ] Withholding tax setup       │ │
│ │                                    │ │
│ │ 0/3 complete                       │ │
│ └────────────────────────────────────┘ │
│                                        │
│ Overall: 6/13 items complete           │
```

**Agent-organized means:** When user says "set up the legal entity in Singapore", the orchestrator creates the Corporate Entity checklist via ShipAgent. When user says "we'll have EU users too", agent adds GDPR items to Privacy & Data. The compliance structure grows with the project.

---

## BOTTOM PANEL — Agent Network

Unchanged from previous spec. Live MsgHub log. Human can inspect and intervene with `@agent` messages.

```
├──────────────────────────────────────────────────────────────────────────┤
│ ▲ AGENT NETWORK                     [Filter: All▾] [Clear] [▲▼ resize] │
│                                                                          │
│ 10:30 💬 ClarifyAgent → 📑 SpecsAgent: "Requirements v1 ready."        │
│ 10:31 📑 SpecsAgent: "Created Business Spec in Knowledge Base."          │
│ 10:32 🔍 DiscoverAgent: "Searching GitHub..."                            │
│ 10:35 🔍 DiscoverAgent → ⚖ RateAgent: "5 candidates ready."            │
│ 10:42 🔨 BuildAgent → 📑 SpecsAgent: "Need Data Model change."         │
│ 10:46 📑 SpecsAgent → 👤 User: "Review needed in KB → Data Model."     │
│                                                                          │
│ ┌───────────────────────────────────────────────────────┬──────┐        │
│ │ @build also add a due_date field                      │ Send │        │
│ └───────────────────────────────────────────────────────┴──────┘        │
├──────────────────────────────────────────────────────────────────────────┤
```

---

## Tab Empty States

Every generic tab starts empty with a helpful prompt:

### Knowledge Base (empty)

```
│              📚 Knowledge Base is empty.             │
│                                                      │
│              The orchestrator will create docs        │
│              as the project evolves — specs,          │
│              research, designs, notes.                │
│                                                      │
│              Or create one yourself:                  │
│              [+ New Document]                         │
```

### Deployments (empty)

```
│              🚀 No deployments yet.                  │
│                                                      │
│              Tell the orchestrator "deploy this"      │
│              or set up manually:                      │
│              [+ Add Deployment]                       │
```

### Identities (empty)

```
│              🔑 No connections yet.                  │
│                                                      │
│              Agents will connect services as          │
│              needed — or connect one yourself:        │
│              [+ Connect Service]                      │
```

### Compliance (empty)

```
│              ☑ No compliance items yet.              │
│                                                      │
│              When you're ready to ship, the           │
│              orchestrator will set up legal,          │
│              privacy, and tax requirements.           │
│                                                      │
│              Or start manually:                       │
│              [+ Add Compliance Area]                  │
```

---

## Responsive

### Desktop (≥ 1025px)

Full layout as shown above. Both panels visible. Network panel at bottom.

### Tablet (641–1024px)

```
┌──────────────────────────────────────────────┐
│ SEA Atlas                             [⚙] [✕]│
├──────────────────────────────────────────────┤
│ [💬 Left] [📋 Right]  ← toggle panels       │
│                                              │
│ (one panel at a time, full width)            │
│ PiP thumbnail of other panel in corner       │
├──────────────────────────────────────────────┤
│ ▲ NETWORK (1 line)                           │
├──────────────────────────────────────────────┤
│ Status                                       │
└──────────────────────────────────────────────┘
```

### Mobile (≤ 640px)

```
┌─────────────────────────────────────┐
│ SEA Atlas                    [⚙] [✕]│
├─────────────────────────────────────┤
│ [💬 Chat] [👥 Team] [📋 Workspace] │
│                                     │
│ (one at a time, full screen)        │
├─────────────────────────────────────┤
│ ▲ NET (tap = sheet)                 │
├─────────────────────────────────────┤
│ Status                              │
└─────────────────────────────────────┘
```

---

## Keyboard Shortcuts

```
LEFT PANEL:
⌘ + Shift + C    → Chat tab
⌘ + Shift + T    → Team tab
⌘ + Enter        → Send message

RIGHT PANEL:
⌘ + 1            → Knowledge Base
⌘ + 2            → Code
⌘ + 3            → Preview
⌘ + 4            → Deployments
⌘ + 5            → Identities
⌘ + 6            → Compliance

CODE TAB:
⌘ + P            → Quick open file (Monaco)
⌘ + Shift + F    → Search across files
⌘ + G            → Go to line
⌘ + D            → Multi-cursor select

LAYOUT:
⌘ + \            → Toggle Agent Network panel
⌘ + B            → Cycle panel balance (50/50, 30/70, 70/30)
⌘ + J            → Expand/collapse Network panel
⌘ + W            → Close project window
```

---

## Key Design Decisions

1. **Agent-first, not IDE-first.** The orchestrator uses the workspace as tools. The human steers and approves.
2. **Left = communication, Right = data.** Talk on the left, see results on the right. Always.
3. **Orchestrator is everything.** PM, engineer, designer, ops, legal — one agent that delegates to a team.
4. **Generic tabs for agent-organized content.** KB, Deployments, Identities, Compliance are empty canvases. Agents decide the structure.
5. **Infrastructure tabs are hardcoded.** Code (Monaco) and Preview (BoxLite) are always there — every project needs files and a running app.
6. **Monaco, not CodeMirror.** This is a code editor. Full VS Code experience. 5MB justified.
7. **Knowledge Base replaces the old Specs/Requirements/Discovery/Rate tabs.** All documents live in KB. Agents create the right docs for each project type.
8. **Compliance is generic.** Not just legal. Tax, privacy, regulatory, certifications — agents create what the jurisdiction requires.
9. **Identities are generic.** Not just Stripe. Any third-party connection the project needs.
10. **Everything is resizable.** Left/right divider, network panel, file explorer width — all draggable.
