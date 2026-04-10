# Finalize: T36 - Settings LLM Plugin

## Review Findings Disposition

| # | Finding | Decision | Rationale |
|---|---------|----------|-----------|
| 1 | **High**: Providers tab doesn't save config.yaml | DEFER | Requires significant UI work. Key management works, config save can be added later. |
| 2 | **High**: Routing tab is placeholder only | DEFER | Complex feature. "Coming soon" is acceptable for MVP. |
| 3 | **High**: Coverage 59.7% vs 90% requirement | FIX NOW | Hard rule in AGENTS.md. |
| 4 | **Medium**: Test naming doesn't follow spec format | FIX NOW | Traceability requirement. |
| 5 | **Medium**: Spec references missing in components | DEFER | Non-blocking. |

## Fixes Required

### Fix 1: Test Coverage
Add tests for hook functions to reach 90%+ coverage.

### Fix 2: Test Naming
Rename tests to `A013/{tab}: {behavior}` format.

## Deferred (with reason)

### Providers Config Save
- Requires deployment editor UI + state management
- Backend supports it, UI can be added later

### Routing Tab Implementation
- Complex feature, "coming soon" acceptable for MVP