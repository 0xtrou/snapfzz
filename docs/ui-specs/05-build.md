# Screen: Build (Lovable-Style Vibe Coding)

Split-pane collaborative builder. Left: chat + code + agent activity. Right: live preview that updates in real-time as code changes. Human stays in the loop — talk to the agent, see it build, steer it with natural language.

This is the core product experience. The Lovable/Bolt UX people love, but smarter — agents find the OSS first, then customize it live in front of you.

## Layout: The Split

```
┌──────────┬──────────────────────────────┬───────────────────────────┐
│          │          LEFT PANE           │        RIGHT PANE         │
│ SIDEBAR  │     Chat + Code + Agents    │       Live Preview        │
│          │                              │                           │
│          │  The conversation.           │  The result.              │
│          │  You talk, agents work,      │  Real-time. Every save    │
│          │  code appears.               │  refreshes. You see it    │
│          │                              │  happen.                  │
│          │                              │                           │
├──────────┴──────────────────────────────┴───────────────────────────┤
│  Status bar                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Default: Agent Starts Building

```
┌──────┬─────────────────────────────────┬────────────────────────────┐
│      │ BUILD · SEA Atlas          [◧◨] │ PREVIEW          [↗ Open] │
│ ▸ SEA│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │                            │
│  Atlas│ ✓─────✓─────✓─────●─────○───── │  ┌────────────────────┐   │
│      │ Clarify Disc  Rate  Build Ship  │  │                    │   │
│      │                                  │  │                    │   │
│      │ ┌─ 🤖 BuildAgent ────────────┐ │  │    Loading...       │   │
│      │ │                              │ │  │                    │   │
│      │ │ I'll build SEA Atlas from    │ │  │    ◌ ◌ ◌           │   │
│      │ │ startupsg/incorp. Here's my  │ │  │                    │   │
│      │ │ plan:                        │ │  │                    │   │
│      │ │                              │ │  │                    │   │
│      │ │ 1. Clone & install deps      │ │  │                    │   │
│      │ │ 2. Rename to "SEA Atlas"     │ │  │                    │   │
│      │ │ 3. Add VN, TH, ID juris.    │ │  │                    │   │
│      │ │ 4. Restyle landing page      │ │  │                    │   │
│      │ │ 5. Add multi-language        │ │  │                    │   │
│      │ │ 6. Harden + test             │ │  │                    │   │
│      │ │                              │ │  │                    │   │
│      │ │ Starting now...              │ │  │                    │   │
│      │ └──────────────────────────────┘ │  │                    │   │
│      │                                  │  └────────────────────┘   │
│      │ ┌─ ACTIVITY ─────────────────┐  │                            │
│      │ │ ● Cloning repo...          │  │  localhost:3000            │
│      │ │   npm install (47 deps)    │  │  Waiting for dev server   │
│      │ └────────────────────────────┘  │                            │
│      │                                  │                            │
│      │ ┌──────────────────────┬──────┐ │                            │
│      │ │ Tell the agent...    │ Send │ │                            │
│      │ └──────────────────────┴──────┘ │                            │
├──────┴──────────────────────────────────┴────────────────────────────┤
│ AgentScope ● │ claude-sonnet │ Tokens: 12K │ Files: 0 changed       │
└─────────────────────────────────────────────────────────────────────┘
```

## Active Building: Preview Live

```
┌──────┬─────────────────────────────────┬────────────────────────────┐
│      │ BUILD · SEA Atlas          [◧◨] │ PREVIEW     [↗] [📱] [🖥] │
│ ▸ SEA│                                  │ ┌──────────────────────┐  │
│  Atlas│ ┌─ 🤖 BuildAgent ────────────┐ │ │  ┌────────────────┐  │  │
│      │ │ Renamed app to "SEA Atlas", │ │ │  │                │  │  │
│      │ │ restructured nav, added     │ │ │  │   SEA Atlas     │  │  │
│      │ │ jurisdiction picker.        │ │ │  │                │  │  │
│      │ │                              │ │ │  │  Incorporate   │  │  │
│      │ │ Working on the landing page  │ │ │  │  your company  │  │  │
│      │ │ hero section now...          │ │ │  │  in Southeast  │  │  │
│      │ └──────────────────────────────┘ │ │  │  Asia          │  │  │
│      │                                  │ │  │                │  │  │
│      │ ┌─ 📝 CODE ─────────[tabs]───┐ │ │  │ [🇸🇬] [🇻🇳] [🇹🇭] │  │  │
│      │ │ app/page.tsx │ layout.tsx │..│ │ │  │                │  │  │
│      │ │                              │ │ │  │ [Get Started→] │  │  │
│      │ │  export default function() { │ │ │  │                │  │  │
│      │ │    return (                  │ │ │  └────────────────┘  │  │
│      │ │      <main>                  │ │ │                      │  │
│      │ │        <Hero                 │ │ │  ── Features ──      │  │
│      │ │●         title="SEA Atlas"   │ │ │                      │  │
│      │ │          countries={[        │ │ │  ┌────┐ ┌────┐      │  │
│      │ │            'SG','VN','TH'    │ │ │  │ 🏢 │ │ 🏦 │      │  │
│      │ │          ]}                  │ │ │  │Reg │ │Bank│      │  │
│      │ │        />                    │ │ │  └────┘ └────┘      │  │
│      │ │      </main>                 │ │ │  ┌────┐ ┌────┐      │  │
│      │ │    )                         │ │ │  │ 📋 │ │ 💰 │      │  │
│      │ │  }                           │ │ │  │Tax │ │Pay │      │  │
│      │ │                              │ │ │  └────┘ └────┘      │  │
│      │ └──────────────────────────────┘ │ │                      │  │
│      │                                  │ └──────────────────────┘  │
│      │ ┌─ ACTIVITY ─────────────────┐  │                            │
│      │ │ ✓ Scaffold      12s        │  │  🔄 Hot reload: 0.3s ago  │
│      │ │ ✓ Rename        8s         │  │                            │
│      │ │ ● Landing page  working... │  │                            │
│      │ │ ○ Jurisdictions             │  │                            │
│      │ │ ○ Harden                    │  │                            │
│      │ └────────────────────────────┘  │                            │
│      │                                  │                            │
│      │ ┌──────────────────────┬──────┐ │                            │
│      │ │ Make the hero darker │ Send │ │                            │
│      │ └──────────────────────┴──────┘ │                            │
├──────┴──────────────────────────────────┴────────────────────────────┤
│ AgentScope ● │ claude-sonnet │ Tokens: 24K │ Files: 8 changed       │
└─────────────────────────────────────────────────────────────────────┘
```

## Human Steers: Chat to Adjust

```
│      │                                  │                            │
│      │ ┌─ 👤 You ────────────────────┐ │                            │
│      │ │ Make the hero section darker │ │                            │
│      │ │ with a gradient background.  │ │                            │
│      │ │ And make the country flags   │ │                            │
│      │ │ bigger — they're too small.  │ │                            │
│      │ └──────────────────────────────┘ │                            │
│      │                                  │                            │
│      │ ┌─ 🤖 BuildAgent ────────────┐ │  Preview updating...       │
│      │ │ On it. Changing:            │ │  ◌ ◌ ◌                     │
│      │ │                              │ │                            │
│      │ │ • Hero bg → dark gradient   │ │                            │
│      │ │   (slate-900 → slate-800)   │ │                            │
│      │ │ • Flag icons → 48px (was 24)│ │                            │
│      │ │                              │ │                            │
│      │ │ ```diff                      │ │                            │
│      │ │ - className="bg-white"       │ │                            │
│      │ │ + className="bg-gradient-    │ │                            │
│      │ │ +   to-b from-slate-900      │ │                            │
│      │ │ +   to-slate-800 text-white" │ │                            │
│      │ │ ```                          │ │                            │
│      │ │                              │ │                            │
│      │ │ Applied. Check the preview → │ │                            │
│      │ └──────────────────────────────┘ │                            │
│      │                                  │                            │
```

## After Human Steers: Preview Updates

```
│      │                                  │ PREVIEW     [↗] [📱] [🖥] │
│      │                                  │ ┌──────────────────────┐  │
│      │  (chat history scrolled up)      │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │
│      │                                  │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │
│      │ ┌─ 🤖 BuildAgent ────────────┐ │ │ ▓▓                ▓▓ │  │
│      │ │ Done. Dark gradient + large │ │ │ ▓▓  SEA Atlas     ▓▓ │  │
│      │ │ flags applied.              │ │ │ ▓▓                ▓▓ │  │
│      │ │                              │ │ │ ▓▓  Incorporate  ▓▓ │  │
│      │ │ What else would you like to │ │ │ ▓▓  your company  ▓▓ │  │
│      │ │ change?                      │ │ │ ▓▓                ▓▓ │  │
│      │ └──────────────────────────────┘ │ │ ▓▓ 🇸🇬  🇻🇳  🇹🇭  🇮🇩 ▓▓ │  │
│      │                                  │ │ ▓▓ (large flags)  ▓▓ │  │
│      │                                  │ │ ▓▓                ▓▓ │  │
│      │                                  │ │ ▓▓ [Get Started→] ▓▓ │  │
│      │                                  │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  │
│      │                                  │ │                      │  │
│      │                                  │ │  ── Features ──      │  │
│      │                                  │ └──────────────────────┘  │
│      │                                  │                            │
│      │                                  │  🔄 Updated 2s ago        │
```

## Tab Bar: Switch Between Chat, Code, Files, Diff

```
│      │ ┌─────────────────────────────┐ │                            │
│      │ │ [💬 Chat] [📝 Code] [📁 Files] [±Diff] │                  │
│      │ └─────────────────────────────┘ │                            │
```

### Chat Tab (default) — shown above

### Code Tab — Monaco-style editor

```
│      │ [💬 Chat] [📝 Code] [📁 Files] [±Diff]  │                   │
│      │                                  │                            │
│      │ ┌─ app/page.tsx ────────────── ┐ │                            │
│      │ │  1  import { Hero } from     │ │                            │
│      │ │  2    '../components/Hero'    │ │                            │
│      │ │  3                            │ │                            │
│      │ │  4  export default function   │ │                            │
│      │ │  5    Home() {                │ │                            │
│      │ │  6    return (                │ │                            │
│      │ │  7      <main className=      │ │                            │
│      │ │  8        "bg-gradient-to-b   │ │                            │
│      │ │  9         from-slate-900     │ │                            │
│      │ │ 10         to-slate-800">     │ │                            │
│      │ │ 11        <Hero              │ │                            │
│      │ │ 12          title="SEA Atlas" │ │                            │
│      │ │ 13          countries={[      │ │                            │
│      │ │ 14            'SG','VN','TH', │ │                            │
│      │ │ 15            'ID'            │ │                            │
│      │ │ 16          ]}               │ │                            │
│      │ │ 17        />                 │ │                            │
│      │ │ 18      </main>              │ │                            │
│      │ │ 19    )                       │ │                            │
│      │ │ 20  }                         │ │                            │
│      │ └──────────────────────────────┘ │                            │
│      │  ↑ Editable. Changes trigger    │                            │
│      │    hot-reload in preview →       │                            │
```

### Files Tab — project tree

```
│      │ [💬 Chat] [📝 Code] [📁 Files] [±Diff]  │                   │
│      │                                  │                            │
│      │ ┌─ PROJECT FILES ──────────────┐ │                            │
│      │ │ sea-atlas/                    │ │                            │
│      │ │ ├── app/                      │ │                            │
│      │ │ │   ├── page.tsx         (M)  │ │                            │
│      │ │ │   ├── layout.tsx       (M)  │ │                            │
│      │ │ │   └── globals.css      (M)  │ │                            │
│      │ │ ├── components/               │ │                            │
│      │ │ │   ├── Hero.tsx         (M)  │ │                            │
│      │ │ │   ├── CountryPicker.tsx (A) │ │                            │
│      │ │ │   └── FeatureGrid.tsx  (A)  │ │                            │
│      │ │ ├── config/                   │ │                            │
│      │ │ │   └── jurisdictions/        │ │                            │
│      │ │ │       ├── sg.ts             │ │                            │
│      │ │ │       ├── vn.ts        (A)  │ │                            │
│      │ │ │       ├── th.ts        (A)  │ │                            │
│      │ │ │       └── id.ts        (A)  │ │                            │
│      │ │ ├── package.json         (M)  │ │                            │
│      │ │ └── tailwind.config.ts   (M)  │ │                            │
│      │ │                               │ │                            │
│      │ │ (M) = modified  (A) = added   │ │                            │
│      │ └──────────────────────────────┘ │                            │
│      │  ↑ Click any file → opens in    │                            │
│      │    Code tab                      │                            │
```

### Diff Tab — all changes since last checkpoint

```
│      │ [💬 Chat] [📝 Code] [📁 Files] [±Diff]  │                   │
│      │                                  │                            │
│      │ ┌─ CHANGES SINCE CHECKPOINT ───┐ │                            │
│      │ │                               │ │                            │
│      │ │ 8 files changed (+312 -47)    │ │                            │
│      │ │                               │ │                            │
│      │ │ ▸ app/page.tsx         +12 -3 │ │                            │
│      │ │ ▸ components/Hero.tsx  +45 -12│ │                            │
│      │ │ ▸ config/juris/vn.ts   +89   │ │                            │
│      │ │ ▸ config/juris/th.ts   +72   │ │                            │
│      │ │ ▸ config/juris/id.ts   +68   │ │                            │
│      │ │ ▸ package.json         +2  -1 │ │                            │
│      │ │ ▸ tailwind.config.ts   +8  -4 │ │                            │
│      │ │ ▸ globals.css          +16 -27│ │                            │
│      │ │                               │ │                            │
│      │ │ [✓ Approve All] [✗ Revert All]│ │                            │
│      │ └──────────────────────────────┘ │                            │
```

## Responsive Preview Controls

```
                              PREVIEW     [↗] [📱] [🖥] [▣]
                              ─────────────────────────────
                              ↗  = open in real browser
                              📱 = mobile viewport (375px)
                              🖥  = desktop viewport (1280px)
                              ▣  = responsive (drag to resize)
```

## Live Interactive Preview

The preview pane is a **real, fully interactive iframe** pointing at the running dev server (`localhost:3000`). It is NOT a screenshot, NOT a render, NOT a static mockup. The user interacts with the actual app in real-time while the agent writes code simultaneously.

### How it works

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Agent writes file → dev server hot-reloads → iframe updates │
│                                                              │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │ AgentScope   │    │ Dev Server   │    │ Preview Pane   │  │
│  │ writes code  │──→ │ detects save │──→ │ <iframe> auto- │  │
│  │ to disk      │    │ HMR fires   │    │ refreshes via  │  │
│  │              │    │ ~200ms      │    │ HMR websocket  │  │
│  └─────────────┘    └──────────────┘    └────────────────┘  │
│                                                              │
│  User clicks in iframe → real navigation, real state,       │
│  real forms. Everything works.                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### User Tries the App While Agent Builds

```
┌──────┬─────────────────────────────────┬────────────────────────────┐
│      │                                  │ PREVIEW     [↗] [📱] [🖥] │
│      │ ┌─ 🤖 BuildAgent ────────────┐ │ ┌──────────────────────┐  │
│      │ │ Adding the registration     │ │ │                      │  │
│      │ │ form for Singapore...       │ │ │  ┌────────────────┐  │  │
│      │ │                              │ │ │  │ Register Your  │  │  │
│      │ │ Working on:                  │ │ │  │ Company in 🇸🇬  │  │  │
│      │ │ • Form validation           │ │ │  │                │  │  │
│      │ │ • ACRA field requirements   │ │ │  │ Company Name   │  │  │
│      │ │ • Director info section     │ │ │  │ [SEA Ventures█]│  │  │
│      │ └──────────────────────────────┘ │ │  │                │  │  │
│      │                                  │ │  │ Director Name  │  │  │
│      │  ↑ Agent is writing code         │ │  │ [Khang Tran  ] │  │  │
│      │                                  │ │  │                │  │  │
│      │                                  │ │  │ ID Type ▾      │  │  │
│      │                                  │ │  │ [Passport    ] │  │  │
│      │                                  │ │  │                │  │  │
│      │                                  │ │  │ ID Number      │  │  │
│      │                                  │ │  │ [P12345678   ] │  │  │
│      │                                  │ │  │                │  │  │
│      │                                  │ │  │ [Next Step →]  │  │  │
│      │                                  │ │  │                │  │  │
│      │                                  │ │  └────────────────┘  │  │
│      │  ↓ User is USING the app         │ │                      │  │
│      │    in the preview right now,      │ │  ← user is filling  │  │
│      │    filling out the form,          │ │    this form while   │  │
│      │    testing it live                │ │    agent codes more  │  │
│      │                                  │ └──────────────────────┘  │
│      │                                  │                            │
│      │                                  │  ● Live │ HMR connected   │
├──────┴──────────────────────────────────┴────────────────────────────┤
│ AgentScope ● │ claude-sonnet │ Tokens: 31K │ Files: 14 changed      │
└─────────────────────────────────────────────────────────────────────┘
```

### User Finds a Bug in Preview → Tells Agent

```
│      │                                  │                            │
│      │ ┌─ 👤 You ────────────────────┐ │  ┌──────────────────────┐ │
│      │ │ I just tried filling out the│ │  │                      │ │
│      │ │ form — when I click "Next   │ │  │  ┌────────────────┐  │ │
│      │ │ Step" with empty fields, it │ │  │  │  ⚠ Error       │  │ │
│      │ │ crashes. No validation.     │ │  │  │                │  │ │
│      │ │ Also the passport field     │ │  │  │  Unhandled     │  │ │
│      │ │ accepts letters, it should  │ │  │  │  TypeError:    │  │ │
│      │ │ be numbers only.            │ │  │  │  Cannot read   │  │ │
│      │ └──────────────────────────────┘ │  │  │  property...   │  │ │
│      │                                  │  │  │                │  │ │
│      │ ┌─ 🤖 BuildAgent ────────────┐ │  │  └────────────────┘  │ │
│      │ │ Good catch. Fixing both:    │ │  │                      │ │
│      │ │                              │ │  └──────────────────────┘ │
│      │ │ 1. Adding form validation   │ │                            │
│      │ │    with error messages for  │ │                            │
│      │ │    all required fields      │ │  ← user triggered this    │
│      │ │ 2. Passport field: regex    │ │    error by clicking in   │
│      │ │    [A-Z][0-9]{7,8}          │ │    the live preview       │
│      │ │                              │ │                            │
│      │ │ Applying fix now...          │ │                            │
│      │ └──────────────────────────────┘ │                            │
```

### After Fix — User Retries in Preview

```
│      │                                  │                            │
│      │ ┌─ 🤖 BuildAgent ────────────┐ │  ┌──────────────────────┐ │
│      │ │ Fixed. Try submitting with  │ │  │                      │ │
│      │ │ empty fields again — you    │ │  │  ┌────────────────┐  │ │
│      │ │ should see inline errors.   │ │  │  │ Register Your  │  │ │
│      │ │                              │ │  │  │ Company in 🇸🇬  │  │ │
│      │ │ And try a bad passport      │ │  │  │                │  │ │
│      │ │ number — it should reject.  │ │  │  │ Company Name   │  │ │
│      │ └──────────────────────────────┘ │  │  │ [            ] │  │ │
│      │                                  │  │  │ ⚠ Required     │  │ │
│      │                                  │  │  │                │  │ │
│      │                                  │  │  │ Director Name  │  │ │
│      │                                  │  │  │ [            ] │  │ │
│      │                                  │  │  │ ⚠ Required     │  │ │
│      │                                  │  │  │                │  │ │
│      │                                  │  │  │ Passport       │  │ │
│      │                                  │  │  │ [abc          ]│  │ │
│      │                                  │  │  │ ⚠ Format:      │  │ │
│      │                                  │  │  │   A1234567     │  │ │
│      │                                  │  │  │                │  │ │
│      │  ↓ User tried again, validation  │  │  │ [Next Step →]  │  │ │
│      │    works. Human tested, human    │  │  │ (disabled)     │  │ │
│      │    confirmed.                    │  │  └────────────────┘  │ │
│      │                                  │  │                      │ │
│      │ ┌──────────────────────┬──────┐ │  └──────────────────────┘ │
│      │ │ Looks good! Now add  │ Send │ │                            │
│      │ │ the payment step...  │      │ │  ● Live │ HMR connected   │
│      │ └──────────────────────┴──────┘ │                            │
```

### Multi-Page Navigation in Preview

```
│      │                                  │ PREVIEW     [↗] [📱] [🖥] │
│      │                                  │ ┌──────────────────────┐  │
│      │  (agent built 3 pages)           │ │  ← ● → 🔒 localhost: │  │
│      │                                  │ │  /register/step-2     │  │
│      │                                  │ ├──────────────────────┤  │
│      │                                  │ │                      │  │
│      │  User is navigating through      │ │  Step 2 of 4         │  │
│      │  the app freely:                 │ │  ━━━━━━━━●━━━━━━━━━  │  │
│      │                                  │ │                      │  │
│      │  • Clicked "Get Started"         │ │  Business Details    │  │
│      │  • Filled Step 1                 │ │                      │  │
│      │  • Clicked "Next"                │ │  Business Type ▾     │  │
│      │  • Now on Step 2                 │ │  [Pte. Ltd.        ] │  │
│      │                                  │ │                      │  │
│      │  The agent can see the user      │ │  Industry ▾          │  │
│      │  is on Step 2 and continues      │ │  [Technology       ] │  │
│      │  building Step 3 and 4           │ │                      │  │
│      │  in the background.              │ │  Annual Revenue ▾    │  │
│      │                                  │ │  [< S$1M           ] │  │
│      │                                  │ │                      │  │
│      │                                  │ │  [← Back] [Next →]   │  │
│      │                                  │ │                      │  │
│      │                                  │ └──────────────────────┘  │
│      │                                  │                            │
│      │                                  │  ● Live │ Page 2/4        │
```

### Console & Network Panel (Toggle)

```
│      │                                  │ PREVIEW     [↗] [📱] [🖥] │
│      │                                  │ ┌──────────────────────┐  │
│      │                                  │ │  (app running)       │  │
│      │                                  │ │                      │  │
│      │                                  │ │                      │  │
│      │                                  │ │                      │  │
│      │                                  │ ├──────────────────────┤  │
│      │                                  │ │ [Console] [Network]  │  │
│      │                                  │ │                      │  │
│      │                                  │ │ ⚠ Warning: missing   │  │
│      │                                  │ │   key prop on list   │  │
│      │                                  │ │   (line 42)          │  │
│      │                                  │ │ ✕ Error: 404         │  │
│      │                                  │ │   /api/jurisdictions │  │
│      │                                  │ │   /id — not found    │  │
│      │                                  │ │                      │  │
│      │                                  │ └──────────────────────┘  │
│      │                                  │                            │
│      │  Agent auto-detects console      │  2 issues detected        │
│      │  errors and offers to fix:       │  [🤖 Auto-fix]            │
│      │                                  │                            │
│      │ ┌─ 🤖 BuildAgent ────────────┐ │                            │
│      │ │ I see 2 issues in your      │ │                            │
│      │ │ console:                    │ │                            │
│      │ │                              │ │                            │
│      │ │ 1. Missing key prop — easy  │ │                            │
│      │ │ 2. /api/jurisdictions/id    │ │                            │
│      │ │    returns 404 — I haven't  │ │                            │
│      │ │    wired up the ID          │ │                            │
│      │ │    jurisdiction endpoint    │ │                            │
│      │ │    yet. Fixing now...       │ │                            │
│      │ └──────────────────────────────┘ │                            │
```

## Preview Technical Implementation

```
┌──────────────────────────────────────────────────────────────────┐
│ HOW THE LIVE PREVIEW WORKS                                       │
│                                                                  │
│ 1. LAUNCH                                                        │
│    AgentScope's ScaffoldWorker runs `npm run dev` (or equiv)     │
│    via execute_shell_command. Dev server starts on :3000.        │
│    Tauri embeds an <iframe src="http://localhost:3000">.          │
│                                                                  │
│ 2. HOT RELOAD                                                    │
│    Agent writes files via write_text_file MCP tool.             │
│    Next.js/Vite HMR detects changes via filesystem watcher.     │
│    HMR pushes update via WebSocket to the iframe.               │
│    Preview updates in ~200ms. No full page reload.              │
│                                                                  │
│ 3. USER INTERACTION                                              │
│    iframe is fully interactive — real DOM, real JS, real state.  │
│    User can: click, type, navigate, submit forms, scroll.       │
│    State persists across HMR updates (React Fast Refresh).      │
│                                                                  │
│ 4. ERROR CAPTURE                                                 │
│    Tauri injects a small script into the iframe that captures    │
│    console.error and console.warn via postMessage.              │
│    Errors are forwarded to the agent automatically.             │
│    Agent can self-heal: detect error → fix code → HMR fires.   │
│                                                                  │
│ 5. CONCURRENT WORK                                               │
│    Agent writes code AND user uses the app simultaneously.      │
│    No lock. No "please wait." Agent avoids editing files the    │
│    user is currently viewing (detected via iframe URL path).    │
│                                                                  │
│ 6. RESPONSIVE TESTING                                            │
│    Viewport buttons resize the iframe container CSS:            │
│    📱 = width: 375px   🖥 = width: 1280px   ▣ = user drags     │
│    The app inside responds via its own media queries.           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Checkpoint: Before Moving to Next Phase

```
┌──────┬─────────────────────────────────┬────────────────────────────┐
│      │                                  │ PREVIEW                    │
│      │ ┌─ ✅ CHECKPOINT ─────────────┐ │ ┌──────────────────────┐  │
│      │ │                              │ │ │                      │  │
│      │ │  Build phase complete.       │ │ │  (current state of   │  │
│      │ │                              │ │ │   the app — fully    │  │
│      │ │  Summary:                    │ │ │   rendered, live)    │  │
│      │ │  ✓ Scaffolded from incorp   │ │ │                      │  │
│      │ │  ✓ 3 jurisdictions added    │ │ │                      │  │
│      │ │  ✓ Landing page redesigned  │ │ │                      │  │
│      │ │  ✓ Dark theme applied       │ │ │                      │  │
│      │ │  ✓ 14 tests passing         │ │ │                      │  │
│      │ │  ✓ No lint errors           │ │ │                      │  │
│      │ │                              │ │ │                      │  │
│      │ │  22 files │ +486 -73 lines  │ │ │                      │  │
│      │ │                              │ │ │                      │  │
│      │ │  What's next:                │ │ │                      │  │
│      │ │  → Ship (deploy + legal +   │ │ │                      │  │
│      │ │    payments)                 │ │ │                      │  │
│      │ │                              │ │ │                      │  │
│      │ │ [Keep Building]              │ │ │                      │  │
│      │ │ [→ Ship It]                  │ │ │                      │  │
│      │ │                              │ │ └──────────────────────┘  │
│      │ └──────────────────────────────┘ │                            │
│      │                                  │  ● localhost:3000 running  │
├──────┴──────────────────────────────────┴────────────────────────────┤
│ AgentScope ● │ claude-sonnet │ Tokens: 38K │ Files: 22 changed      │
└─────────────────────────────────────────────────────────────────────┘
```

## "Keep Building" — Infinite Loop

The user can stay in Build forever. "Keep Building" returns to the chat view. The agent asks "What else?" and the user can keep iterating:

```
│      │ ┌─ 🤖 BuildAgent ────────────┐ │                            │
│      │ │ What would you like to      │ │                            │
│      │ │ change or add?              │ │                            │
│      │ └──────────────────────────────┘ │                            │
│      │                                  │                            │
│      │ ┌──────────────────────┬──────┐ │                            │
│      │ │ Add a pricing page   │ Send │ │                            │
│      │ │ with 3 tiers...      │      │ │                            │
│      │ └──────────────────────┴──────┘ │                            │
```

This loop continues until the user clicks "Ship It" or closes the project.

## Key UX Principles

1. **Preview is always visible** — right pane never disappears during build
2. **Hot reload** — every file save triggers instant preview refresh
3. **Chat is the steering wheel** — natural language to direct the agent
4. **Code is inspectable** — Code tab lets you see/edit what the agent wrote
5. **Diff is the safety net** — see exactly what changed, approve or revert
6. **Infinite iteration** — no forced exit from build mode
7. **Checkpoints are optional** — agents propose them, user decides when to move on
8. **Responsive preview** — test mobile/desktop instantly
