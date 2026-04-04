# Finalize: T3 — Chat Plugin UI

## Review Findings Disposition

| # | Finding | Decision | Rationale |
|---|---------|----------|-----------|
| 1 | Manifest eager imports | FIXED | Replaced with lazy `() => import(...)` pattern. |
| 2 | Markdown parsing on main thread | ACCEPT FOR UGLY | Parsing is lightweight for short messages. Worker migration in production (Zone 2). |
| 3 | followOutput not "smooth" | FIXED | Changed to `followOutput="smooth"`. |
| 4 | types.ts extra fields | ACCEPT FOR UGLY | Extra UI fields (status, alt) are useful for rendering. Will split mirror vs UI types in production. |
| 5 | Hardcoded overlay color | DEFER | Trivial — will add token when theme stabilizes. |
| 6 | Composer Shift+Enter | ACCEPT | Default browser behavior handles this correctly. Explicit branch is defensive but not blocking. |
| 7 | Clear-conversation flow | ACCEPT FOR UGLY | Reset local state is fine. Full session delegation in production. |
| 8 | Missing spec comments | DEFER | Will add during production migration. |

## Fixes Applied

- index.ts: lazy dynamic imports for all contributions
- index.ts: lazy import of use-chat in activate()
- ChatPanel.tsx: followOutput="smooth"

## Verification

- cargo check: PASS
- 61 frontend tests: PASS
