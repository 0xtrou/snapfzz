# Responsive Design Spec

Fully responsive from day 1. P1 demands it — no "responsive later" rewrite.

Three breakpoints. Every screen adapts. Touch-friendly on tablet. Usable on phone.

## Breakpoints

```
MOBILE        TABLET         DESKTOP
≤ 640px       641–1024px     ≥ 1025px
─────────     ──────────     ──────────
Phone         iPad           Laptop+
Single col    Flexible       Full layout
Bottom nav    Side/bottom    Sidebar
Touch first   Touch + mouse  Mouse first
```

## P1 Rationale

Responsive isn't a feature — it's architecture. A P1 violation means "needs rewrite at scale." If the layout is desktop-only, every mobile user requires a rewrite. Responsive-first means the layout engine handles all viewports from the first commit.

**Tailwind CSS + Ant Design 5** both support responsive out of the box. No extra framework needed. Use Tailwind breakpoints (`sm:`, `md:`, `lg:`) and Ant's Grid system (`<Row>`, `<Col>`).

---

## App Shell: Three Layouts

### Desktop (≥ 1025px) — Full sidebar + content

```
┌──────────┬──────────────────────────────────────────┐
│          │                                          │
│ SIDEBAR  │              MAIN CONTENT                │
│ 240px    │                                          │
│ fixed    │                                          │
│          │                                          │
│          │                                          │
│          │                                          │
│          │                                          │
│          │                                          │
│          │                                          │
├──────────┴──────────────────────────────────────────┤
│ Status bar                                          │
└─────────────────────────────────────────────────────┘
```

### Tablet (641–1024px) — Collapsible sidebar + content

```
┌────┬────────────────────────────────────────────────┐
│    │                                                │
│ICON│               MAIN CONTENT                     │
│BAR │                                                │
│56px│                                                │
│    │                                                │
│    │                                                │
│    │                                                │
│    │                                                │
│    │                                                │
├────┴────────────────────────────────────────────────┤
│ Status bar (compact)                                │
└─────────────────────────────────────────────────────┘

Tap hamburger → sidebar slides over as overlay:

┌──────────┬──────────────────────────────────────────┐
│          │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ SIDEBAR  │░░░░░░░░░░ (dimmed content) ░░░░░░░░░░░░│
│ overlay  │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ 280px    │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│          │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└──────────┴──────────────────────────────────────────┘
```

### Mobile (≤ 640px) — No sidebar, bottom nav

```
┌─────────────────────────────────────┐
│                                     │
│           MAIN CONTENT              │
│           (full width)              │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ [⚡] [📁] [⚙] [📊] [🧠]           │
│  New  Proj  Set  Eval Mem           │
└─────────────────────────────────────┘
```

---

## Build Screen: Responsive Split Pane

The most complex screen. Three layouts:

### Desktop: Side-by-side split

```
┌──────┬─────────────────────┬─────────────────────────┐
│      │     LEFT PANE       │      RIGHT PANE          │
│  S   │  Chat + Code + Tabs │    Live Preview          │
│  I   │                     │    (interactive iframe)  │
│  D   │  50% width          │    50% width             │
│  E   │  (drag to resize)   │    (drag to resize)      │
│  B   │                     │                          │
│  A   │                     │                          │
│  R   │                     │                          │
│      │  ┌────────┬──────┐  │                          │
│      │  │ Type.. │ Send │  │                          │
│      │  └────────┴──────┘  │                          │
├──────┴─────────────────────┴──────────────────────────┤
│ Status bar                                            │
└───────────────────────────────────────────────────────┘
```

### Tablet: Stacked with toggle

```
┌────┬────────────────────────────────────────────┐
│    │  [💬 Chat] [👁 Preview]     ← toggle tabs  │
│ICON│                                             │
│BAR │  ┌──────────────────────────────────────┐  │
│    │  │                                      │  │
│    │  │    Shows EITHER chat OR preview       │  │
│    │  │    based on active tab.               │  │
│    │  │                                      │  │
│    │  │    When on Preview tab:              │  │
│    │  │    Full-width interactive iframe.     │  │
│    │  │                                      │  │
│    │  │    When on Chat tab:                 │  │
│    │  │    Full-width chat + code.           │  │
│    │  │                                      │  │
│    │  │    Floating preview thumbnail in     │  │
│    │  │    bottom-right (picture-in-picture) │  │
│    │  │    when on Chat tab.                 │  │
│    │  │                                      │  │
│    │  └──────────────────────────────────────┘  │
│    │                                             │
│    │  ┌──────────────────────────────┬────────┐ │
│    │  │ Type...                      │  Send  │ │
│    │  └──────────────────────────────┴────────┘ │
├────┴─────────────────────────────────────────────┤
│ Status (compact)                                  │
└───────────────────────────────────────────────────┘
```

### Mobile: Full-screen tabs + floating preview

```
┌─────────────────────────────────────┐
│ BUILD · SEA Atlas                   │
│ [💬 Chat] [📝 Code] [👁 Preview]   │
├─────────────────────────────────────┤
│                                     │
│  (active tab content, full width)   │
│                                     │
│  Chat tab:                          │
│  ┌─────────────────────────────┐   │
│  │ 🤖 Adding jurisdiction...   │   │
│  │                              │   │
│  │ Working on TH config now.    │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌───────────────────┐             │
│  │ Floating preview  │             │
│  │ thumbnail (PiP)   │  ← tap to  │
│  │ 120x80px          │    expand   │
│  └───────────────────┘             │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────┬──────┐ │
│ │ Make the hero darker... │ Send │ │
│ └─────────────────────────┴──────┘ │
├─────────────────────────────────────┤
│ [⚡] [📁] [⚙] [📊] [🧠]           │
└─────────────────────────────────────┘

Preview tab (tapped):
┌─────────────────────────────────────┐
│ BUILD · SEA Atlas                   │
│ [💬 Chat] [📝 Code] [👁 Preview]   │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │      Full-screen preview        │ │
│ │      (interactive iframe)       │ │
│ │                                 │ │
│ │  ┌─────────────────────────┐   │ │
│ │  │    SEA Atlas             │   │ │
│ │  │    Incorporate your      │   │ │
│ │  │    company in SE Asia    │   │ │
│ │  │                          │   │ │
│ │  │    🇸🇬  🇻🇳  🇹🇭  🇮🇩        │   │ │
│ │  │                          │   │ │
│ │  │    [Get Started →]       │   │ │
│ │  └─────────────────────────┘   │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│  ┌──────┐                           │
│  │ Chat │ ← floating mini-chat      │
│  │ 💬   │   bubble to send quick    │
│  └──────┘   instructions to agent   │
├─────────────────────────────────────┤
│ [⚡] [📁] [⚙] [📊] [🧠]           │
└─────────────────────────────────────┘
```

---

## All Screens: Per-Breakpoint Behavior

### 01 Idea Input

| Breakpoint | Layout |
|---|---|
| Desktop | Centered card, max-width 640px, templates in 3-col grid |
| Tablet | Centered card, max-width 560px, templates in 2-col grid |
| Mobile | Full-width card, edge-to-edge, templates in 1-col stack |

### 02 Clarify (Interview)

| Breakpoint | Layout |
|---|---|
| Desktop | Chat bubbles max-width 720px, centered |
| Tablet | Chat bubbles full-width with 24px padding |
| Mobile | Chat bubbles edge-to-edge, 12px padding, sender bar fixed to bottom |

### 03 Discover (OSS Search)

| Breakpoint | Layout |
|---|---|
| Desktop | Card grid: 2 columns, filters in toolbar |
| Tablet | Card grid: 2 columns, filters collapsible |
| Mobile | Card stack: 1 column, filters in bottom sheet |

### 04 Rate (Comparison)

| Breakpoint | Layout |
|---|---|
| Desktop | Side-by-side comparison table, both visible |
| Tablet | Side-by-side, horizontally scrollable if > 2 candidates |
| Mobile | Stacked cards, swipe between candidates, sticky total score |

### 05 Build (Vibe Coding)

| Breakpoint | Layout |
|---|---|
| Desktop | Split pane: left chat+code 50%, right preview 50%, draggable |
| Tablet | Tab toggle: Chat / Preview. PiP thumbnail of inactive pane |
| Mobile | Full-screen tabs: Chat / Code / Preview. Floating mini-chat on Preview |

### 06 Ship (Deploy/Legal/Pay)

| Breakpoint | Layout |
|---|---|
| Desktop | 3 horizontal lanes side by side |
| Tablet | 3 horizontal lanes, horizontally scrollable |
| Mobile | Vertical stack, one lane at a time, swipe or scroll |

### 07 Settings

| Breakpoint | Layout |
|---|---|
| Desktop | 2-column: nav left, settings right |
| Tablet | Single column, settings groups as accordions |
| Mobile | Single column, full-width inputs, large touch targets |

### 08 Eval Dashboard

| Breakpoint | Layout |
|---|---|
| Desktop | Score table + chart side by side |
| Tablet | Score table above, chart below |
| Mobile | Score cards (swipeable), chart in accordion |

### 09 Memory

| Breakpoint | Layout |
|---|---|
| Desktop | Profile + projects + decisions in 2-column layout |
| Tablet | Single column, sections stacked |
| Mobile | Single column, collapsible sections, large touch targets |

---

## Touch Targets

All interactive elements must be ≥ 44x44px on mobile (Apple HIG) and ≥ 48x48px on tablet (Material). Applies to:
- Buttons
- Navigation items
- Tab bars
- Card action buttons
- Input fields
- Checkboxes
- Dropdown triggers

## Typography Scale

```
Desktop:         Tablet:          Mobile:
H1: 32px         H1: 28px         H1: 24px
H2: 24px         H2: 22px         H2: 20px
H3: 18px         H3: 17px         H3: 16px
Body: 16px       Body: 16px       Body: 16px
Small: 14px      Small: 14px      Small: 13px
Code: 14px mono  Code: 14px mono  Code: 13px mono
```

## Safe Areas

Mobile must respect:
- iOS safe area insets (notch, home indicator)
- Android navigation bar
- Bottom nav must not overlap with system UI

```css
/* Applied globally */
padding-bottom: env(safe-area-inset-bottom);
padding-top: env(safe-area-inset-top);
```

## Implementation: Tailwind Breakpoints

```
sm:  ≥ 640px   (mobile → tablet transition)
md:  ≥ 768px   (tablet mid)
lg:  ≥ 1024px  (tablet → desktop transition)
xl:  ≥ 1280px  (wide desktop)
2xl: ≥ 1536px  (ultra-wide)
```

Every component uses mobile-first classes:
```html
<!-- Example: Build split pane -->
<div class="flex flex-col lg:flex-row">
  <div class="w-full lg:w-1/2">Chat + Code</div>
  <div class="w-full lg:w-1/2">Preview</div>
</div>
```

## Testing Matrix

Every PR must be tested at:

| Device | Viewport | Method |
|---|---|---|
| iPhone SE | 375x667 | Preview responsive toggle 📱 |
| iPhone 15 Pro Max | 430x932 | Preview responsive toggle 📱 |
| iPad | 768x1024 | Preview responsive toggle |
| iPad Pro | 1024x1366 | Preview responsive toggle |
| Laptop | 1280x800 | Default Tauri window |
| Desktop | 1920x1080 | Maximized Tauri window |
| Ultra-wide | 2560x1440 | Max content width capped at 1440px |

Eval benchmark ME includes responsive checks: every agent-built app is tested at 3 viewports (375, 768, 1280) and must render without horizontal overflow or overlapping elements.
