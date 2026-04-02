# Design System — Theme, Typography, Colors

Ant Design 5 base with shadcn aesthetic. Inter font family. No custom colors — pure dark/light defaults. Snapfzz brand reserved for logo only.

---

## Principles

1. **No custom color palette.** Use Ant Design 5 defaults (neutral grays) with shadcn-inspired styling (low contrast, subtle borders, clean surfaces).
2. **Two themes only.** Dark and Light. Respect system preference. Manual toggle available.
3. **Inter everywhere.** One font family. No font mixing.
4. **Logo is the only brand element.** The bolt + network graph SVG. Used in splash, launcher title bar, and about page. Not on every screen.
5. **shadcn aesthetic on Ant Design bones.** Ant Design handles components and accessibility. We override visual style to match shadcn: less saturated, more subtle, fewer hard borders.

---

## Typography

**Font family:** Inter (Google Fonts, MIT license)

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
```

**Scale:**

| Token | Size | Weight | Use |
|---|---|---|---|
| `--text-xs` | 12px | 400 | Captions, badges, timestamps |
| `--text-sm` | 13px | 400 | Secondary text, helper text |
| `--text-base` | 14px | 400 | Body text, chat messages, form labels |
| `--text-lg` | 16px | 500 | Section headers, tab labels |
| `--text-xl` | 18px | 600 | Page titles, card titles |
| `--text-2xl` | 24px | 700 | Window titles, hero text |
| `--text-mono` | 13px | 400 | Code, terminal, file paths |

**Line height:** 1.5 for body, 1.3 for headings, 1.6 for code.

**Letter spacing:** -0.01em for headings, 0 for body, 0.02em for code.

---

## Color Tokens — No Custom Colors

Use Ant Design 5's built-in semantic tokens. No hex values in component code.

### Dark Theme (Default)

```css
:root[data-theme="dark"] {
  /* Backgrounds */
  --bg-primary: #09090b;           /* App background */
  --bg-secondary: #18181b;         /* Cards, panels */
  --bg-tertiary: #27272a;          /* Elevated surfaces, hover */
  --bg-input: #18181b;             /* Input fields */
  
  /* Borders */
  --border-default: #27272a;       /* Subtle borders */
  --border-strong: #3f3f46;        /* Emphasized borders */
  
  /* Text */
  --text-primary: #fafafa;         /* Primary text */
  --text-secondary: #a1a1aa;       /* Secondary text */
  --text-muted: #71717a;           /* Muted text, placeholders */
  
  /* Semantic (from Ant Design 5) */
  --color-success: #22c55e;        /* Green — passing, live, healthy */
  --color-warning: #eab308;        /* Yellow — in progress, attention */
  --color-error: #ef4444;          /* Red — failed, down, critical */
  --color-info: #3b82f6;           /* Blue — info, links */
  
  /* Interactive */
  --color-accent: #fafafa;         /* Primary buttons, active states */
  --color-accent-hover: #e4e4e7;   /* Hover state */
}
```

### Light Theme

```css
:root[data-theme="light"] {
  /* Backgrounds */
  --bg-primary: #ffffff;
  --bg-secondary: #fafafa;
  --bg-tertiary: #f4f4f5;
  --bg-input: #ffffff;
  
  /* Borders */
  --border-default: #e4e4e7;
  --border-strong: #d4d4d8;
  
  /* Text */
  --text-primary: #09090b;
  --text-secondary: #71717a;
  --text-muted: #a1a1aa;
  
  /* Semantic (same across themes) */
  --color-success: #22c55e;
  --color-warning: #eab308;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  
  /* Interactive */
  --color-accent: #18181b;
  --color-accent-hover: #27272a;
}
```

### Why These Values

These are **zinc** from Tailwind CSS / shadcn. Not custom. The most widely used neutral palette in modern web apps. Ant Design's default grays are slightly blue-tinted — we override to pure zinc for the shadcn look.

---

## Component Overrides — shadcn on Ant Design

Ant Design 5 provides the components (Button, Input, Select, Modal, Table, etc.). We override the visual style to match shadcn:

### Button

```css
/* Ant Design default: saturated blue, rounded */
/* shadcn style: monochrome, subtle radius */

.ant-btn-primary {
  background: var(--color-accent);
  color: var(--bg-primary);
  border: none;
  border-radius: 6px;
  font-weight: 500;
  font-size: 13px;
  height: 36px;
  padding: 0 16px;
}

.ant-btn-primary:hover {
  background: var(--color-accent-hover);
}

.ant-btn-default {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 6px;
}
```

### Input

```css
.ant-input {
  background: var(--bg-input);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  height: 36px;
  padding: 0 12px;
}

.ant-input:focus {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.05);
}

.ant-input::placeholder {
  color: var(--text-muted);
}
```

### Card

```css
.ant-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: none;
}

.ant-card:hover {
  border-color: var(--border-strong);
}
```

### Tabs

```css
.ant-tabs-tab {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 12px;
}

.ant-tabs-tab-active {
  color: var(--text-primary);
}

.ant-tabs-ink-bar {
  background: var(--text-primary);
  height: 2px;
}
```

---

## Ant Design 5 Theme Config

```typescript
// antd-theme.ts
import { theme } from 'antd';

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontFamilyCode: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 14,
    
    // Zinc palette (shadcn)
    colorBgContainer: '#18181b',
    colorBgElevated: '#27272a',
    colorBgLayout: '#09090b',
    colorBorder: '#27272a',
    colorBorderSecondary: '#3f3f46',
    colorText: '#fafafa',
    colorTextSecondary: '#a1a1aa',
    colorTextTertiary: '#71717a',
    
    // Semantic
    colorSuccess: '#22c55e',
    colorWarning: '#eab308',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    colorPrimary: '#fafafa',
    
    // Radius (shadcn: slightly rounded, not pill)
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    
    // Sizing
    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 32,
  },
};

export const lightTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontFamilyCode: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 14,
    
    colorBgContainer: '#ffffff',
    colorBgElevated: '#fafafa',
    colorBgLayout: '#ffffff',
    colorBorder: '#e4e4e7',
    colorBorderSecondary: '#d4d4d8',
    colorText: '#09090b',
    colorTextSecondary: '#71717a',
    colorTextTertiary: '#a1a1aa',
    
    colorSuccess: '#22c55e',
    colorWarning: '#eab308',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    colorPrimary: '#18181b',
    
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    
    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 32,
  },
};
```

---

## Logo Usage

The Snapfzz logo (lightning bolt + network graph on dark rounded square) is stored at `assets/logo.svg`.

### Where It Appears

| Location | Size | Variant |
|---|---|---|
| Splash screen | 128px | Full logo, centered |
| Launcher title bar | 24px | Icon only (no text) |
| About page | 64px | Full logo + "Snapfzz Startup Launcher" text below |
| Tauri app icon | 512px | Full SVG as .icns/.ico |

### Where It Does NOT Appear

- Not in the project window title bar (project name only)
- Not watermarked on user's built apps
- Not in the status bar
- Not on every screen — minimal brand presence

### Favicon / App Icon Variants

```
assets/
├── logo.svg              # Full SVG (512x512)
├── logo-icon-only.svg    # Bolt only, no background (for small sizes)
├── icon.icns             # macOS app icon (generated from SVG)
├── icon.ico              # Windows app icon (generated from SVG)
└── icon.png              # 512x512 PNG (for Linux + web)
```

---

## Spacing

Tailwind default spacing scale. No custom values.

```
4px   → p-1, m-1, gap-1
8px   → p-2, m-2, gap-2
12px  → p-3, m-3, gap-3
16px  → p-4, m-4, gap-4
20px  → p-5, m-5, gap-5
24px  → p-6, m-6, gap-6
32px  → p-8, m-8, gap-8
```

---

## Shadows

Minimal. shadcn uses almost no shadows. Borders define hierarchy instead.

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);   /* Subtle lift */
--shadow-md: 0 2px 4px rgba(0, 0, 0, 0.1);     /* Dropdowns, popovers */
--shadow-none: none;                              /* Default for most elements */
```

---

## Theme Switching

```typescript
// Detect system preference
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

// Load from user preference (localStorage), fall back to system
const getTheme = (): 'dark' | 'light' => {
  const stored = localStorage.getItem('snapfzz-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return prefersDark.matches ? 'dark' : 'light';
};

// Apply before first paint (blocking script in <head>)
document.documentElement.setAttribute('data-theme', getTheme());
```

**No flash of wrong theme.** Theme is applied in a blocking `<script>` before React hydration.

---

## Monaco Editor Theme

Monaco uses its own theme system. Match the app theme:

```typescript
import * as monaco from 'monaco-editor';

// Dark theme matching our zinc palette
monaco.editor.defineTheme('snapfzz-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#18181b',
    'editor.foreground': '#fafafa',
    'editorLineNumber.foreground': '#71717a',
    'editorLineNumber.activeForeground': '#a1a1aa',
    'editor.selectionBackground': '#3f3f46',
    'editor.lineHighlightBackground': '#27272a',
    'editorWidget.background': '#27272a',
    'editorWidget.border': '#3f3f46',
  },
});

// Light theme
monaco.editor.defineTheme('snapfzz-light', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#09090b',
    'editorLineNumber.foreground': '#a1a1aa',
    'editorLineNumber.activeForeground': '#71717a',
    'editor.selectionBackground': '#e4e4e7',
    'editor.lineHighlightBackground': '#fafafa',
    'editorWidget.background': '#fafafa',
    'editorWidget.border': '#e4e4e7',
  },
});
```

---

## Key Design Decisions

1. **Ant Design 5 + shadcn aesthetic.** Ant gives us 50+ accessible components. shadcn gives us the modern, minimal look. Best of both.
2. **Zinc palette, not custom colors.** Industry standard neutral. No brand colors in the UI. Let the content speak.
3. **Inter only.** One sans-serif font. JetBrains Mono for code. No font mixing.
4. **Logo reserved.** Splash, launcher, about page, app icon. That's it. Not plastered everywhere.
5. **Dark default.** Most developers prefer dark. System preference respected. No flash.
6. **Borders over shadows.** shadcn philosophy. Clean, flat, minimal depth. Borders create hierarchy.
7. **No custom Tailwind colors.** Use the default palette. `zinc-900`, `zinc-800`, etc. No `snapfzz-orange` or custom brand tokens in component code.
