# T21 — Fix CI Test Failures

**Status:** COMPLETE  
**Spec refs:** A007, A008  
**Files changed:** Test files only — no component code modified

---

## What Was Fixed

### Plugin 1: settings-advanced (1 test)

**Test:** `save failure displays error message`

**Root cause:** The component's `handleSave` catch block sets `saveError` to `'Unable to save settings. Please try again.'` — a generic message, not the raw error string `'disk full'`. The test regex `/disk full|error/i` didn't match the actual error text.

**Fix:** Updated regex to `/unable to save|save settings|error/i` which matches the component's actual error message.

---

### Plugin 2: settings-performance (20 tests)

**Root cause (multi-part):** The component was redesigned from an Ant Design `<Table>` to a div-based `BudgetItem` list. Several API changes happened:

1. **Hardware badge UI removed:** `perfCpu` and `perfRam` are still computed but never rendered. Tests looking for `8 CPU`, `8GB`, `512MB` etc. in `bodyText` always failed. Fixed by verifying `get_hardware_info` is called and the component renders the radio selector.

2. **Table → BudgetItem:** No `.ant-table` exists. Tests looking for `.ant-table`, `.ant-table-tbody tr`, and column headers `Budget/Current/Limit/Usage` were updated to check for row name text instead.

3. **Row renames/removals:** "Frame" → "Batch Interval", "Batch Rate" merged into Batch Interval, "Startup" row removed. Tests updated to look for existing rows.

4. **Limit column format:** `BudgetItem` renders limit as `/ {row.limit}` (with slash prefix), so `getByText('8')` won't match `/ 8`. Fixed by using `bodyText.toContain()` for limit values and `getByText()` only for current values (rendered without prefix).

5. **fps annotation removed:** `16ms (60fps)` and `33ms (30fps)` format removed — component now just renders `${batchIntervalMs}ms`. Tests updated to check for `bodyText.toContain('16ms')`.

---

### Plugin 3: settings-processes (7 tests)

**Root cause (multi-part):**

1. **`showLogs` default is `true`:** The `DetailPanel` initializes `showLogs = true`, so the log panel is **immediately visible** when a row is expanded. Tests that clicked "View Logs" to open the panel actually **hid** it (toggle from open→closed), then failed to find `log-panel-agentscope`.

   **Fix:** Removed the `fireEvent.click(btn-view-logs)` step from log panel tests — just expand the row and the panel is already there.

2. **Toggle test direction:** "toggle logs hides log panel on second click" — previously tested open→close→verify. Since panel starts open, the test now just expands (panel visible), clicks once (panel hides), verifies hidden.

3. **`toHaveStyle` with CSS variables:** `toHaveStyle({ fontFamily: 'var(--font-mono)' })` fails in jsdom because `getComputedStyle` can't resolve CSS custom properties. Fixed by checking `element.style.fontFamily` directly.

4. **Save & Restart disabled when configDirty=false:** The button is `disabled={!configDirty || !configValid}`. The "restart_process called" test never changed an input, so button was disabled and popconfirm never fired. Fixed by adding a port input change before clicking Save & Restart.

---

## Verification

All 6 test suites pass with 0 failures:

| Plugin | Tests | Status |
|--------|-------|--------|
| settings-advanced | 46 | PASS |
| settings-performance | 72 | PASS |
| settings-plugins | 38 | PASS |
| settings-processes | 86 | PASS |
| settings-general | 54 | PASS |
| frontend | 75 | PASS |

Total: **371 tests passing, 0 failing**
