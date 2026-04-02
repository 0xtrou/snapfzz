# Screen: Build (Multi-Agent Construction)

Real-time view of the multi-agent build team working. Human-in-the-loop checkpoints between phases.

## Build In Progress

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  BUILD                                     Step 4 of 6   │
│ SIDEBAR  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│          │  ✓───────✓───────✓───────●───────○───────○               │
│          │  Clarify  Discover  Rate   Build   Ship                 │
│          │                                                          │
│          │  Building from: startupsg/incorp (Score: 32/40)          │
│          │                                                          │
│          │  ┌─ AGENT ACTIVITY ──────────────────────────────────┐  │
│          │  │                                                    │  │
│          │  │  ✓ ScaffoldWorker                        DONE     │  │
│          │  │    Cloned repo, installed 47 deps (12s)           │  │
│          │  │                                                    │  │
│          │  │  ● CustomizeWorker                     WORKING    │  │
│          │  │    ├ ✓ Renamed app to "SEA Atlas"                 │  │
│          │  │    ├ ✓ Added VN jurisdiction config                │  │
│          │  │    ├ ● Adding TH jurisdiction config...           │  │
│          │  │    └ ○ Adding ID jurisdiction config               │  │
│          │  │                                                    │  │
│          │  │  ○ HardenWorker                        WAITING    │  │
│          │  │  ○ TestWorker                           WAITING    │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  ┌─ FILE CHANGES (live) ─────────────────────────────┐  │
│          │  │                                                    │  │
│          │  │  M  src/config/jurisdictions.ts        +45  -2    │  │
│          │  │  A  src/config/jurisdictions/vn.ts     +89        │  │
│          │  │  A  src/config/jurisdictions/th.ts     +72  (new) │  │
│          │  │  M  src/components/RegistrationForm.tsx +12  -3   │  │
│          │  │  M  package.json                       +2   -1    │  │
│          │  │                                                    │  │
│          │  │  [View Diff ▾]                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
│          │                                                          │
│          │  [⏸ Pause]  [💬 Chat with Agent]  [✗ Reject & Redo]    │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 24.7K     │
└─────────────────────────────────────────────────────────────────────┘
```

## Checkpoint (Between Phases)

```
│          │  ┌─ CHECKPOINT ──────────────────────────────────────┐  │
│          │  │                                                    │  │
│          │  │  CustomizeWorker completed.                        │  │
│          │  │                                                    │  │
│          │  │  Summary:                                          │  │
│          │  │  • Added 3 new jurisdictions (VN, TH, ID)         │  │
│          │  │  • Modified registration form for multi-country   │  │
│          │  │  • Updated 8 files, added 4 new files             │  │
│          │  │  • No test failures introduced                    │  │
│          │  │                                                    │  │
│          │  │  Next: HardenWorker will add error boundaries,    │  │
│          │  │  input validation, security headers, and env      │  │
│          │  │  var handling.                                     │  │
│          │  │                                                    │  │
│          │  │  [View All Changes]                                │  │
│          │  │                                                    │  │
│          │  │  [✓ Approve & Continue]  [✏️ Edit First]  [✗ Redo] │  │
│          │  │                                                    │  │
│          │  └────────────────────────────────────────────────────┘  │
```

## Diff View (Expanded)

```
│          │  ┌─ DIFF: src/config/jurisdictions/vn.ts ────────────┐  │
│          │  │                                                    │  │
│          │  │  + export const vietnamJurisdiction = {            │  │
│          │  │  +   code: 'VN',                                  │  │
│          │  │  +   name: 'Vietnam',                             │  │
│          │  │  +   registrationAuthority: 'DPI',                │  │
│          │  │  +   requiredDocuments: [                          │  │
│          │  │  +     'business_registration_cert',              │  │
│          │  │  +     'tax_registration',                        │  │
│          │  │  +     'investment_certificate',                  │  │
│          │  │  +   ],                                           │  │
│          │  │  +   estimatedDays: 15,                           │  │
│          │  │  +   fees: {                                      │  │
│          │  │  +     registration: 200000, // VND               │  │
│          │  │  +     currency: 'VND',                           │  │
│          │  │  +   },                                           │  │
│          │  │  + };                                             │  │
│          │  │                                                    │  │
│          │  │  [← Prev File]  [Next File →]  [Approve File ✓]  │  │
│          │  └────────────────────────────────────────────────────┘  │
```

## Build Complete + Preview

```
│          │  BUILD COMPLETE                             Step 4 of 6  │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │ ✓ All 4 workers completed successfully           │   │
│          │  │                                                  │   │
│          │  │ ScaffoldWorker    ✓  Clone + deps      12s      │   │
│          │  │ CustomizeWorker   ✓  3 jurisdictions   2m 34s   │   │
│          │  │ HardenWorker      ✓  Security + env    1m 12s   │   │
│          │  │ TestWorker        ✓  14 tests passing  45s      │   │
│          │  │                                                  │   │
│          │  │ Total: 22 files changed, 14 tests, 0 errors     │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  ┌──────────────────────────────────────────────────┐   │
│          │  │ PREVIEW                                          │   │
│          │  │ ┌──────────────────────────────────────────────┐ │   │
│          │  │ │                                              │ │   │
│          │  │ │       🌐 http://localhost:3000                │ │   │
│          │  │ │                                              │ │   │
│          │  │ │    ┌─────────────────────────────┐          │ │   │
│          │  │ │    │    SEA Atlas                 │          │ │   │
│          │  │ │    │    Incorporate your company  │          │ │   │
│          │  │ │    │    [🇸🇬 SG] [🇻🇳 VN] [🇹🇭 TH]  │          │ │   │
│          │  │ │    │    [Get Started →]           │          │ │   │
│          │  │ │    └─────────────────────────────┘          │ │   │
│          │  │ │                                              │ │   │
│          │  │ └──────────────────────────────────────────────┘ │   │
│          │  │ [🔗 Open in Browser]                             │   │
│          │  └──────────────────────────────────────────────────┘   │
│          │                                                          │
│          │  [← Back to Rate]                    [→ Ship It]        │
│          │                                                          │
```
