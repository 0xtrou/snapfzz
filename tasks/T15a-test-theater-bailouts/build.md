# Build: T15a — Remove Test Theater Bailouts

## Priority: P0

## Problem
3 instances of `expect(true).toBe(true)` bailouts in settings plugin tests. These tests **cannot fail** — if the DOM doesn't match expectations (button not found, save never called), the test passes silently. This creates invisible blind spots where real regressions ship green.

## Locations
1. `plugins/settings-runtime/src/__tests__/RuntimeSettings.test.tsx` ~L216 — `.catch(() => { expect(true).toBe(true); })` on save_settings
2. `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx` ~L245 — `if (resetBtn) { ... } else { expect(true).toBe(true); }` on reset confirm
3. `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx` ~L532 — same bailout pattern

## 5 Questions
1. Which spec? → REVIEW_GUIDE.md: "Tests with no assertions are NOT valid"
2. Which zone? → Zone 3 (React test files)
3. Core or plugin? → Plugin (settings-runtime, settings-advanced)
4. Existing pattern? → Other settings plugins (general, performance, plugins) do NOT have bailouts — follow their pattern
5. Test name? → Keep existing test names, fix assertion logic

## What Must Be Done
- Replace every `expect(true).toBe(true)` with a real assertion
- For `.catch()` bailouts: assert that the mock WAS called, or assert the error state renders
- For `if (btn) { ... } else { expect(true)... }` bailouts: use `screen.getByRole()` (throws if missing) instead of `queryByRole()` + conditional. If the button MUST exist, assert it exists.
- Run `npx vitest run --filter settings-runtime` and `npx vitest run --filter settings-advanced` — all tests must still pass
- Grep for `expect(true)` across all test files to confirm zero remaining instances

## Effort: Quick (<1h)
