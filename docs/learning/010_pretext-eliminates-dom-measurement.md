---
title: "Pretext Eliminates DOM Measurement for Chat Layout"
type: learning
date: 2026-04-05
tags: [pretext, performance, layout, chat, virtualization, A001]
---

# Pretext Eliminates DOM Measurement for Chat Layout

## Context

Chat UIs with variable-height messages (markdown, code blocks, images) need to know each message's height for virtualization. The standard approaches all compromise 60fps:

1. DOM measurement (getBoundingClientRect) — forces synchronous layout reflow
2. Estimated heights (react-virtuoso) — wrong estimates → scroll jumps
3. Render-then-measure — double render cost

## What Pretext Does

Pretext (38.8K stars, MIT, by Cheng Lou) is a pure JS text measurement and layout engine. Two-phase model:

```typescript
// ONE-TIME: prepare text measurement (expensive, but only once per message)
const prepared = prepare(messageText, '16px Inter');

// CHEAP: get height at any width (pure arithmetic, no DOM, no canvas)
const { height, lineCount } = layout(prepared, containerWidth, 22);
```

`prepare()` is width-independent — do it once when a message arrives or tokens finish streaming. `layout()` is arithmetic-only — runs in microseconds. No DOM reads, no reflow, no canvas calls in the hot path.

## Why This Matters for A001 (60fps)

- Virtualization without DOM measuring loops — exact height known before rendering
- Resize is free — re-run `layout()` with new width, pure math
- Scroll anchoring during streaming — height prediction is instant
- Shrinkwrap chat bubbles — exact bubble width without rendering
- 60fps guaranteed — `layout()` never triggers reflow

## The markdown-chat Demo

Pretext ships with a `markdown-chat` demo that handles:
- 10,000 virtualized messages
- Full markdown (headings, lists, code blocks, blockquotes, inline formatting)
- Shrinkwrap chat bubbles with exact widths
- Custom virtualizer using `findVisibleRange()` with exact heights
- All layout computed without DOM measurement

## React Integration Pattern

```typescript
function ChatMessage({ text, containerWidth }) {
  // prepare() once when text changes
  const prepared = useMemo(() => prepare(text, '16px Inter'), [text]);

  // layout() on resize via useLayoutEffect — pure arithmetic
  useLayoutEffect(() => {
    const { height } = layout(prepared, containerWidth, 22);
    setHeight(height);
  }, [prepared, containerWidth]);
}
```

## What Changes

- Replace react-virtuoso with custom virtualizer using Pretext heights
- `prepare()` in useMemo when message content changes
- `layout()` in useLayoutEffect on container resize
- Exact heights for all messages — no estimation, no DOM measurement
- Shrinkwrap bubbles with `measureNaturalWidth()`
- Code blocks with `prepareWithSegments()` for line-level layout

## Rule

If your layout depends on text measurement in the hot path, you've already lost 60fps. Move measurement to prepare-time, keep layout arithmetic-only. Pretext is the missing piece between "I have text" and "I know its height" without touching the DOM.
