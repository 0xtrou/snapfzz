# Perfectly From Day 1 — The Manifesto

Every app shipped through Snapfzz Startup Launcher meets these standards before it leaves the Build phase. Not after launch. Not in v2. Not "good enough for now." Perfect from day 1.

This is P1 applied to the user's product: if it needs fixing later, it failed.

---

## The 12 Standards

### 1. Responsive — Every Viewport

```
ENFORCED:
✓ Mobile (375px)  — no overflow, no truncation, touch targets ≥ 44px
✓ Tablet (768px)  — layouts adapt, grids reflow, navigation adjusts
✓ Desktop (1280px) — full-width layouts, hover states, keyboard shortcuts
✓ Ultra-wide (1920px+) — content max-width capped, no stretching

HOW:
Agent uses Tailwind mobile-first breakpoints on every component.
Triple viewport preview catches issues during build, not after ship.
Checkpoint gated: all 3 viewports must pass before Ship.

EVAL:
- No horizontal scrollbar at any viewport
- No element exceeding container bounds
- Touch targets ≥ 44px at ≤ 640px
- Text ≥ 13px at all viewports
```

### 2. 60fps — Butter Smooth

```
ENFORCED:
✓ Scroll — no jank, no layout shift during scroll
✓ Animation — CSS transitions and transforms only (GPU-composited)
✓ Interaction — tap/click response < 100ms, visual feedback < 50ms
✓ Navigation — page transitions < 300ms perceived, skeleton-first
✓ Typing — input response lag < 16ms (1 frame)

HOW:
Agent follows performance-first patterns:
- CSS transform/opacity for animations (not top/left/width/height)
- will-change on animated elements (sparingly)
- No layout thrashing (batch DOM reads before writes)
- Virtualized lists for > 50 items (react-window or equivalent)
- Image lazy loading with aspect-ratio placeholders (no CLS)
- Font display: swap (no invisible text)
- No synchronous JavaScript in the critical render path

EVAL:
- Lighthouse Performance ≥ 90
- CLS (Cumulative Layout Shift) < 0.1
- FID (First Input Delay) < 100ms
- LCP (Largest Contentful Paint) < 2.5s
- No frame drops during scroll (measured via PerformanceObserver)

AGENT RULES:
- NEVER use setInterval for animation — requestAnimationFrame only
- NEVER animate layout properties (width, height, top, left, margin)
- NEVER block the main thread > 50ms (Long Task API monitoring)
- ALWAYS use CSS containment on complex components
- ALWAYS debounce scroll/resize handlers (≤ 16ms or RAF)
- ALWAYS use IntersectionObserver for lazy loading, not scroll events
```

### 3. Accessible — WCAG AA Minimum

```
ENFORCED:
✓ Color contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text
✓ All interactive elements keyboard-navigable (Tab/Enter/Space/Escape)
✓ Focus indicators visible on every focusable element
✓ Screen reader labels on all images, icons, and controls
✓ Semantic HTML: headings hierarchy, landmarks, lists
✓ Form fields have associated labels (not just placeholder)
✓ Error messages linked to fields via aria-describedby
✓ No information conveyed by color alone

HOW:
Agent uses semantic HTML first, ARIA only when HTML isn't enough.
Ant Design 5 components ship with built-in a11y — agent doesn't override.
Color palette validated against WCAG AA on every theme change.

EVAL:
- axe-core audit: 0 critical, 0 serious violations
- Tab through entire page: all interactive elements reachable
- Screen reader pass: all content announced correctly
```

### 4. Fast — Speed Is a Feature

```
ENFORCED:
✓ First paint < 1s on 4G connection
✓ Interactive < 3s on 4G connection
✓ Bundle size: JS < 200KB gzipped (initial load)
✓ No render-blocking resources in <head>
✓ Images: WebP/AVIF with fallback, lazy-loaded, sized
✓ Fonts: preloaded, swap display, subset to used characters

HOW:
Agent configures build tools correctly from scaffold:
- Next.js: automatic code splitting, dynamic imports for heavy components
- Vite: tree shaking, chunk splitting by route
- Images: next/image or vite-imagetools for automatic optimization
- Fonts: @font-face with font-display: swap, preload critical fonts

EVAL:
- Lighthouse Performance ≥ 90
- Total blocking time < 200ms
- Bundle analyzer: no duplicated dependencies
- Network waterfall: no sequential chains > 3 requests
```

### 5. Secure — Not an Afterthought

```
ENFORCED:
✓ HTTPS everywhere (enforced at deploy)
✓ Content Security Policy headers
✓ No inline scripts (CSP-compatible)
✓ Input sanitization on all user inputs (XSS prevention)
✓ CSRF protection on all state-changing endpoints
✓ API keys never exposed in client-side code
✓ Dependency audit: no known critical vulnerabilities
✓ Rate limiting on auth endpoints

HOW:
HardenWorker (build phase) applies all security headers and validations.
Agent runs `npm audit` and fixes critical/high before Ship.
Environment variables for secrets — never hardcoded.

EVAL:
- Mozilla Observatory score ≥ B+
- No secrets in client bundle (grep for sk_, key_, password, token)
- npm audit: 0 critical, 0 high vulnerabilities
- CSP header present and functional
```

### 6. SEO-Ready — Discoverable from Launch

```
ENFORCED:
✓ Server-side rendering or static generation for public pages
✓ <title>, <meta description>, og:image on every page
✓ Semantic HTML: h1-h6 hierarchy, main, nav, article, section
✓ Structured data (JSON-LD) for business/product pages
✓ sitemap.xml generated
✓ robots.txt configured
✓ Canonical URLs set
✓ 404 page returns proper status code

HOW:
Agent scaffolds with SSR framework (Next.js, Nuxt, etc).
Metadata template applied to every page during customize phase.
Sitemap plugin installed at scaffold time.

EVAL:
- Lighthouse SEO ≥ 90
- Google Search Console: no errors (manual check post-deploy)
- Open Graph: preview renders correctly on Twitter/LinkedIn/Slack
```

### 7. Error Handling — Graceful, Not Crashing

```
ENFORCED:
✓ Global error boundary catches all uncaught React errors
✓ API errors show user-friendly messages, not stack traces
✓ Loading states for every async operation (skeleton, spinner)
✓ Empty states for every list/table/feed (not blank screen)
✓ Offline state detection and message
✓ 404/500 pages are designed, not browser defaults
✓ Form validation: inline errors, not alert() or console.log

HOW:
HardenWorker adds error boundaries, loading states, empty states.
Agent checks every fetch/API call has .catch() or try/catch.
Custom 404/500 pages created during scaffold.

EVAL:
- Kill API server → app shows offline message, not white screen
- Submit invalid form → inline errors, no crash
- Navigate to /nonexistent → custom 404 page
- Throw error in component → error boundary catches, app doesn't die
```

### 8. Dark Mode — From Day 1

```
ENFORCED:
✓ Respects system preference (prefers-color-scheme)
✓ Manual toggle available (persisted in localStorage)
✓ All components render correctly in both modes
✓ No "flash of wrong theme" on page load
✓ Images/illustrations adapt (dark bg variants or opacity treatment)

HOW:
Tailwind dark: class strategy (class-based, not media-based).
Agent applies dark: variants alongside every color utility.
Theme preference read from localStorage before first paint (blocking script).

EVAL:
- Toggle dark mode: every page renders without color issues
- No white flashes on navigation
- Contrast ratios maintained in both modes (WCAG AA)
```

### 9. Internationalization-Ready — Even If Shipping English

```
ENFORCED:
✓ All user-facing strings extracted to translation files
✓ No hardcoded strings in JSX/TSX
✓ Date, number, currency formatting uses Intl API
✓ RTL-ready layout (logical properties: margin-inline, padding-block)
✓ Language switcher component exists (even if only English initially)

HOW:
Agent uses next-intl, react-i18next, or equivalent from scaffold.
All strings wrapped in t() function during customize phase.
Logical CSS properties used instead of physical (start/end not left/right).

EVAL:
- grep for hardcoded strings in JSX — 0 matches
- Swap locale to ar/he → layout doesn't break (RTL)
- Date displays respect locale format
```

### 10. Analytics-Ready — Measure from Launch

```
ENFORCED:
✓ Privacy-respecting analytics installed (Plausible, Umami, or PostHog)
✓ Core events tracked: page view, signup, purchase, error
✓ No PII in analytics events
✓ Cookie consent banner if required by jurisdiction
✓ Analytics can be self-hosted (no vendor lock-in)

HOW:
Agent installs lightweight analytics during Ship phase.
Event tracking added to key user actions during customize phase.
Cookie consent component from Spark Design library if available.

EVAL:
- Analytics dashboard shows page views after deploy
- No PII in event payloads (manual audit)
```

### 11. Legal-Ready — Compliance from Day 1

```
ENFORCED:
✓ Privacy policy page (generated from template, jurisdiction-aware)
✓ Terms of service page (generated from template)
✓ Cookie consent (if applicable)
✓ GDPR data export endpoint (if EU users expected)
✓ Copyright footer with current year

HOW:
LegalAgent generates privacy policy and ToS from templates during Ship phase.
Agent asks for jurisdiction during Clarify to determine requirements.
Footer template includes dynamic year.

EVAL:
- /privacy and /terms pages exist and load
- Cookie banner appears if EU jurisdiction
- Footer shows current year
```

### 12. Deployment-Ready — Ship Without Manual Steps

```
ENFORCED:
✓ Environment variables documented in .env.example
✓ Dockerfile or platform config (vercel.json, fly.toml) present
✓ Build command works: npm run build exits 0
✓ Start command works: npm start exits 0
✓ Health check endpoint: GET /api/health returns 200
✓ CI config present (.github/workflows/deploy.yml)
✓ README with setup instructions

HOW:
ScaffoldWorker creates .env.example, Dockerfile, CI config from templates.
TestWorker verifies build + start commands pass.
Agent adds /api/health route during scaffold.

EVAL:
- npm run build → exit 0
- npm start → exit 0, GET /api/health → 200
- Docker build + run → same
- CI workflow runs green
```

---

## How Standards Are Enforced

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  1. AGENT SYSTEM PROMPT                                        │
│     BuildAgent, HardenWorker, TestWorker all have these        │
│     standards in their system prompts. They write code that    │
│     follows them by default.                                   │
│                                                                │
│  2. AUTO-VALIDATION                                            │
│     After each build phase, agent runs:                        │
│     - Lighthouse CI (performance, a11y, SEO, best practices)  │
│     - axe-core (accessibility)                                │
│     - Bundle analyzer (size)                                   │
│     - npm audit (security)                                     │
│     - Responsive check (3 viewports)                          │
│     - Error boundary test (kill API, navigate to 404)          │
│                                                                │
│  3. CHECKPOINT GATE                                            │
│     Checkpoint report includes all 12 standards with ✓/✗.     │
│     Build cannot proceed to Ship if any critical standard      │
│     fails. User can override with "Ship anyway" but the       │
│     report is shown.                                           │
│                                                                │
│  4. EVAL BENCHMARK                                             │
│     BuildBenchmark includes automated checks for all 12.       │
│     Score < 70% = agent regression = blocked.                  │
│                                                                │
│  5. USER SEES IT ALL                                           │
│     The checkpoint shows every standard. Nothing hidden.       │
│     User knows exactly what they're shipping.                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Checkpoint With Full Quality Report

```
┌──────┬─────────────────────────────────┬────────────────────────────┐
│      │                                  │ PREVIEW (triple viewport)  │
│  S   │ ┌─ ✅ QUALITY REPORT ─────────┐ │                            │
│  I   │ │                              │ │ ┌────┐ ┌──────┐ ┌──────┐ │
│  D   │ │  1. ✓ Responsive  3/3 pass  │ │ │ 📱✓│ │ 📱↔ ✓│ │ 🖥 ✓ │ │
│  E   │ │  2. ✓ 60fps       Score: 94 │ │ └────┘ └──────┘ └──────┘ │
│  B   │ │  3. ✓ Accessible  0 issues  │ │                            │
│  A   │ │  4. ✓ Fast        LCP: 1.8s │ │                            │
│  R   │ │  5. ✓ Secure      0 vulns   │ │                            │
│      │ │  6. ✓ SEO         Score: 92 │ │                            │
│      │ │  7. ✓ Errors      All caught│ │                            │
│      │ │  8. ✓ Dark mode   Both pass │ │                            │
│      │ │  9. ✓ i18n ready  0 hardcode│ │                            │
│      │ │ 10. ✓ Analytics   Installed │ │                            │
│      │ │ 11. ✓ Legal       Pages exist│ │                            │
│      │ │ 12. ✓ Deploy-ready  Build OK│ │                            │
│      │ │                              │ │                            │
│      │ │  OVERALL: 12/12 ████████████│ │                            │
│      │ │                              │ │                            │
│      │ │  This app is ready to ship. │ │                            │
│      │ │                              │ │                            │
│      │ │ [Keep Building]              │ │                            │
│      │ │ [→ Ship It ✓]               │ │                            │
│      │ │                              │ │                            │
│      │ └──────────────────────────────┘ │                            │
├──────┴──────────────────────────────────┴────────────────────────────┤
│ AgentScope ● │ claude-sonnet │ 12/12 quality │ Files: 22 changed    │
└─────────────────────────────────────────────────────────────────────┘
```

## When Standards Fail

```
│      │ ┌─ ⚠ QUALITY REPORT ──────────┐ │                            │
│      │ │                              │ │                            │
│      │ │  1. ✓ Responsive  3/3 pass  │ │                            │
│      │ │  2. ✗ 60fps       Score: 71 │ │                            │
│      │ │     → CLS 0.23 on mobile    │ │                            │
│      │ │     → Image without size     │ │                            │
│      │ │  3. ✓ Accessible  0 issues  │ │                            │
│      │ │  4. ✗ Fast        LCP: 4.1s │ │                            │
│      │ │     → Unoptimized hero image │ │                            │
│      │ │     → Render-blocking CSS    │ │                            │
│      │ │  5. ✓ Secure      0 vulns   │ │                            │
│      │ │  ...                         │ │                            │
│      │ │                              │ │                            │
│      │ │  OVERALL: 10/12 ████████░░  │ │                            │
│      │ │                              │ │                            │
│      │ │  2 issues must be fixed.     │ │                            │
│      │ │                              │ │                            │
│      │ │ [🤖 Auto-fix Issues]         │ │                            │
│      │ │ [Ship Anyway (not recommended)]│                            │
│      │ │                              │ │                            │
│      │ └──────────────────────────────┘ │                            │
```

Auto-fix: agent reads the failures, applies targeted fixes (optimize image, add sizes, defer CSS), re-runs checks. Loop until 12/12 or user overrides.

---

## The Promise

> Every app shipped through Snapfzz Startup Launcher is responsive, fast, accessible, secure, SEO-ready, error-handled, dark-mode capable, i18n-ready, analytics-tracked, legally compliant, and deployment-ready. Not because the user asked for each one. Because the system enforces all twelve. Perfectly from day 1.
