# Build: T6 — Pretext Integration

## 5 Questions
1. Which spec? → A001/Performance (60fps, no DOM measurement in hot path)
2. Which zone? → Zone 3 — rendering only, Pretext layout is arithmetic
3. Core or plugin? → Core shared components (used by any plugin, any surface)
4. Existing pattern? → Replaces react-virtuoso estimation with Pretext exact heights
5. Test name? → A001/pretext: {behavior}

## What Was Built

### @snapfzz/shared — Pretext library + components

**lib/pretext.ts** — React hooks wrapping @chenglou/pretext:
- usePreparedText(text, font) → PreparedText (useMemo)
- usePretextLayout(prepared, width, lineHeight) → { height, lineCount } (useLayoutEffect)
- usePreparedSegments, useSegmentLayout, useNaturalWidth
- Re-exports raw prepare/layout for non-React usage

**components/pretext/** — General-purpose Pretext-powered components:
- PretextText — single measured text block
- PretextMarkdown — markdown with code blocks, headings, lists, blockquotes, inline formatting
- PretextInput — auto-resizing textarea using Pretext height calculation
- PretextList — virtualized list with exact Pretext-measured item heights
- PretextBubble — shrinkwrap container for chat bubbles, tooltips, popovers
- useContainerWidth — ResizeObserver hook for container width tracking

### plugins/chat/ — Refactored to use Pretext components

ChatPanel.tsx rewritten:
- PretextList replaces react-virtuoso
- PretextBubble replaces custom bubble article
- PretextMarkdown replaces TextContent for text blocks
- PretextInput replaces Composer for message input
- estimateMessageHeight uses prepare()/layout() for exact heights
- react-virtuoso removed from dependencies

## Verification
- 49 plugin-host tests: passing
- pnpm install: clean
- No react-virtuoso dependency remaining
