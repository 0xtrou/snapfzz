# Responsive Design Spec

Fully responsive from day 1. P1 demands it.

## Breakpoints

```
MOBILE        TABLET         DESKTOP
≤ 640px       641–1024px     ≥ 1025px
```

## Launcher Window

| Breakpoint | Layout |
|---|---|
| Desktop | Cards with full detail, max-width 720px |
| Tablet | Cards slightly compressed, max-width 600px |
| Mobile | Cards full-width, stacked, minimum 480px |

## Project Window

| Breakpoint | Layout |
|---|---|
| Desktop | Left panel (Chat/Team) + Right panel (workspace tabs) side by side, 50/50 resizable. Agent Network bottom panel. |
| Tablet | Toggle between Left and Right panel (one at a time, full width). PiP thumbnail of inactive panel. Network collapsed to 1 line. |
| Mobile | Three tabs: Chat, Team, Workspace. One at a time, full screen. Network as expandable sheet. |

### Desktop

```
┌──────────────────────────────────┬───────────────────────────────────────┐
│ LEFT (50%)                       │ RIGHT (50%)                            │
│ ┌────────┬──────────┐           │ ┌────┬──────┬──────┬──────┬────┬────┐│
│ │💬 Chat │👥 Team   │           │ │📚KB│📁Code│👁Prev│🚀Dep │🔑ID│☑Com││
│ └────────┴──────────┘           │ └────┴──────┴──────┴──────┴────┴────┘│
│ (active left tab)          ◄──► │ (active right tab)                    │
│                            drag │                                       │
│ ┌────────────────────┬────────┐│                                       │
│ │ Type...            │  Send  ││                                       │
│ └────────────────────┴────────┘│                                       │
├──────────────────────────────────┴───────────────────────────────────────┤
│ ▲ AGENT NETWORK                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ Status Bar                                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

### Tablet

```
┌───────────────────────────────────────────────┐
│ SEA Atlas                              [⚙] [✕]│
├───────────────────────────────────────────────┤
│ [💬 Left Panel] [📋 Right Panel]  ← toggle    │
│                                               │
│ (one panel at a time, full width)             │
│ PiP thumbnail of inactive panel               │
│                                               │
├───────────────────────────────────────────────┤
│ ▲ NETWORK (1 line)                            │
├───────────────────────────────────────────────┤
│ Status                                        │
└───────────────────────────────────────────────┘
```

### Mobile

```
┌─────────────────────────────────────┐
│ SEA Atlas                    [⚙] [✕]│
├─────────────────────────────────────┤
│ [💬 Chat] [👥 Team] [📋 Workspace] │
│                                     │
│ (one view at a time, full screen)   │
│                                     │
├─────────────────────────────────────┤
│ ▲ NET (tap = sheet)                 │
├─────────────────────────────────────┤
│ Status                              │
└─────────────────────────────────────┘
```

## Touch Targets

All interactive elements ≥ 44x44px on mobile, ≥ 48x48px on tablet.

## Typography Scale

```
Desktop:   H1: 32px  H2: 24px  H3: 18px  Body: 16px  Small: 14px  Code: 14px mono
Tablet:    H1: 28px  H2: 22px  H3: 17px  Body: 16px  Small: 14px  Code: 14px mono
Mobile:    H1: 24px  H2: 20px  H3: 16px  Body: 16px  Small: 13px  Code: 13px mono
```

## Safe Areas

```css
padding-bottom: env(safe-area-inset-bottom);
padding-top: env(safe-area-inset-top);
```

## Implementation

Tailwind mobile-first breakpoints: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`.

```html
<div class="flex flex-col lg:flex-row">
  <div class="w-full lg:w-1/2">Left Panel</div>
  <div class="w-full lg:w-1/2">Right Panel</div>
</div>
```

## Testing Matrix

Every PR tested at: iPhone SE (375), iPhone 15 Pro Max (430), iPad (768), iPad Pro (1024), Laptop (1280), Desktop (1920).
