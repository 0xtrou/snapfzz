# Preview & Build Engine — Deep Dive

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Technical spec for the Preview tab, HMR pipeline, triple viewport, responsive enforcement, and quality gate. This is the engine underneath the 👁 Preview tab and the 🔨 BuildAgent workflow.

All previews run inside BoxLite micro-VMs. Port-forwarded to host. Fully interactive.

---

## HMR Pipeline

```
BuildAgent writes file (inside BoxLite Code VM)
    ↓
File appears on shared volume (host filesystem)
    ↓
Vite/Next.js dev server (inside BoxLite Preview VM) detects change
    ↓
HMR module graph updated
    ↓
WebSocket pushes delta to Tauri child WebView
    ↓
Preview updates (~200ms total)
    ↓
React Fast Refresh preserves component state
```

## Preview Controls

```
[↗ Open] [📱 375] [📱↔ 768] [🖥 1280] [▣▣▣ Triple]

↗    = open in real browser
📱   = mobile viewport (375px)
📱↔  = tablet viewport (768px)
🖥   = desktop viewport (1280px)
▣▣▣  = triple viewport (all 3 simultaneously)
```

## Triple Viewport Mode

Three Tauri child WebViews, each pointing at the same BoxLite :3000, each at a different CSS container width. All interactive independently. All receive HMR simultaneously.

```
┌─────────────┬─────────────────┬────────────────────┐
│ 📱 375px     │ 📱↔ 768px        │ 🖥 1280px            │
│              │                 │                    │
│ ┌─────────┐ │ ┌─────────────┐ │ ┌────────────────┐ │
│ │  SEA    │ │ │   SEA Atlas  │ │ │  SEA Atlas     │ │
│ │  Atlas  │ │ │              │ │ │                │ │
│ │         │ │ │  [🇸🇬] [🇻🇳]   │ │ │  🇸🇬  🇻🇳  🇹🇭  🇮🇩 │ │
│ │  🇸🇬     │ │ │  [🇹🇭]        │ │ │                │ │
│ │  🇻🇳     │ │ │              │ │ │  [Start →]     │ │
│ │  🇹🇭     │ │ │  [Start →]   │ │ │                │ │
│ │         │ │ │              │ │ │  Features      │ │
│ │  [Go]   │ │ │  Features    │ │ │  3-col grid    │ │
│ │         │ │ │  2-col grid  │ │ │                │ │
│ │  1-col  │ │ │              │ │ │                │ │
│ └─────────┘ │ └─────────────┘ │ └────────────────┘ │
│              │                 │                    │
│ Interactive  │ Interactive     │ Interactive        │
└─────────────┴─────────────────┴────────────────────┘

All 3 receive HMR updates simultaneously.
User can click/type in any viewport independently.
```

## Console & Error Capture

Preview tab includes a collapsible console panel at the bottom:

```
┌───────────────────────────────────────────┐
│ (live app preview)                         │
│                                           │
├───────────────────────────────────────────┤
│ [Console] [Network]                       │
│                                           │
│ ⚠ Warning: missing key prop (L42)        │
│ ✕ Error: 404 /api/jurisdictions/id        │
│                                           │
│ 2 issues │ [🤖 Auto-fix]                  │
└───────────────────────────────────────────┘
```

Agent auto-detects errors via injected capture script and offers to fix in the Chat panel.

## Responsive-First Build Enforcement

BuildAgent enforces responsive code from the first component:

```
RULES:
1. Every component uses Tailwind responsive: grid-cols-1 md:grid-cols-3
2. After every file write, agent checks all 3 viewports:
   - No horizontal overflow at 375px
   - No text truncation/overlap
   - Touch targets ≥ 44px on mobile
   - If any fail → auto-fix before continuing
3. Quality checkpoint includes responsive report:
   ✓ 📱 375px   ✓ 📱↔ 768px   ✓ 🖥 1280px
4. Checkpoint blocked until all 3 pass
```

## Quality Gate (Before Ship)

```
┌──────────────────────────────────────────┐
│ ✅ QUALITY REPORT                        │
│                                          │
│  1. ✓ Responsive     3/3 viewports pass │
│  2. ✓ 60fps          Score: 94          │
│  3. ✓ Accessible     0 violations       │
│  4. ✓ Fast           LCP: 1.8s         │
│  5. ✓ Secure         0 vulns           │
│  6. ✓ SEO            Score: 92          │
│  7. ✓ Error Handling  All caught        │
│  8. ✓ Dark Mode      Both pass         │
│  9. ✓ i18n Ready     0 hardcoded       │
│ 10. ✓ Analytics      Installed          │
│ 11. ✓ Legal          Pages exist        │
│ 12. ✓ Deploy Ready   Build OK          │
│ 13. ✓ Instant Load   < 500ms           │
│                                          │
│ OVERALL: 13/13 ████████████████████████ │
│                                          │
│ [Keep Building]  [→ Ship It ✓]          │
└──────────────────────────────────────────┘
```

## Technical Implementation

```
1. LAUNCH: BuildAgent runs `npm run dev` inside BoxLite Preview VM
2. PORT FORWARD: BoxLite :3000 → host :3000
3. WEBVIEW: Tauri child WebView points at http://localhost:3000
4. HMR: Vite WebSocket through port-forward, auto-refreshes WebView
5. CONSOLE: Injected script captures console.error via postMessage
6. TRIPLE: 3 child WebViews, same :3000, different CSS container widths
7. RESPONSIVE CHECK: Agent programmatically validates overflow/touch/text at 3 widths
8. CONCURRENT: Agent writes code while user tests in preview simultaneously
```
