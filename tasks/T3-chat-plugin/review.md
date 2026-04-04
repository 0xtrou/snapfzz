# Review: T3 — Chat Plugin UI

## Verdict: FAIL

## Checklist

| # | Check | Status | Evidence (file:line) | Spec |
|---|-------|--------|---------------------|------|
| 1 | Manifest matches chat/SPEC.md | FAIL | Eager imports instead of lazy `() => import(...)` (index.ts:3-5,14-24) | chat/SPEC:111-125 |
| 2 | All 7 ContentBlock renderers | PASS | MessageBubble dispatches all 7 types (MessageBubble.tsx:69-93) | chat/SPEC:34-55 |
| 3 | MessageBubble dispatches by block.type | PASS | Switch on type in render (MessageBubble.tsx:69-93) | chat/SPEC |
| 4 | types.ts mirrors AgentScope exactly | FAIL | Extra fields (status, alt) + render-only types mixed in (types.ts:19,33,63-143) | chat/SPEC:37-53 |
| 5 | react-virtuoso followOutput="smooth" | FAIL | Conditional false instead of spec-required "smooth" (ChatPanel.tsx:72) | A001, chat/SPEC:212 |
| 6 | Composer behavior correct | PARTIAL | Missing explicit Shift+Enter handling (Composer.tsx:45-56) | chat/SPEC:228-230 |
| 7 | contain: content on panel | PASS | Present (ChatPanel.tsx:16) | A001 |
| 8 | content-visibility: auto | PARTIAL | On bubbles but not panel-level (ChatPanel.tsx:9-26) | A001:228 |
| 9 | GPU-only animations | PASS | Spinner + dots use opacity/transform (ToolUseCard:25-27, ThinkingIndicator:27) | A001 |
| 10 | No Zone 3 computation | FAIL | Markdown parsing in use-chat hook on main thread (use-chat.ts:89-129) | A002:270-283 |
| 11 | CSS variables only | PARTIAL | Hardcoded rgba overlay in ImageContent (ImageContent.tsx:36) | U009 |
| 12 | No cross-plugin imports | PASS | Only @snapfzz/plugin-sdk | A005 |
| 13 | activate() returns PluginHandle | PASS | With deactivate (index.ts:66-93) | A005 |
| 14 | No TODO/FIXME/HACK | PASS | Clean | AGENTS.md |
| 15 | Inline spec comments | PARTIAL | Many decisions uncited | ENGINEERING_GUIDE |

## What's Good

- All 7 ContentBlock renderers exist and dispatch correctly
- CSS containment present, GPU-only animations
- No cross-plugin imports, no TODOs
- 20 files created covering full spec file structure
- activate() returns proper PluginHandle

## What Needs Fixing

| # | Severity | Finding | Fix Instructions |
|---|----------|---------|-----------------|
| 1 | High | Manifest uses eager imports | Replace with lazy `() => import('./contributions/ChatPanel')` pattern |
| 2 | High | Markdown parsing on main thread (Zone 3 violation) | Move to mock for ugly phase, real worker for production |
| 3 | High | followOutput not "smooth" | Use `followOutput="smooth"` per spec |
| 4 | Medium | types.ts has extra fields not in AgentScope | Split: exact mirror types + separate UI augmentation types |
| 5 | Medium | Hardcoded color in ImageContent overlay | Use CSS variable or add token |
| 6 | Medium | Composer Shift+Enter not explicit | Add explicit key handling branch |
| 7 | Medium | Clear-conversation flow incomplete | Wire create_session → load_session → reset UI |
| 8 | Medium | Missing inline spec comments | Add // Per A00X/... on architectural decisions |
