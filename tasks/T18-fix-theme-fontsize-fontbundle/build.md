# Build Report — T18 Fix Theme/FontSize/Font Bundle

## Scope
Implemented the requested A007 + U009 fixes across shared hooks, settings-general plugin, and launcher integration:

1. Theme sync between settings.json and runtime theme hook
2. Font-size visual application via inherited CSS override
3. Cross-platform font preset cleanup
4. Launcher window appearance settings application

## Files Changed

### 1) `frontend/packages/shared/src/hooks/use-app-settings.ts`
- Added runtime/settings theme types (`RuntimeTheme`, `SettingsTheme`)
- Added theme resolution logic for persisted `system` values:
  - `resolveTheme(theme)` resolves to `'dark' | 'light'` using `matchMedia`
- Added consolidated DOM apply path:
  - `applyDomSettings(settings)` now applies:
    - `data-theme` attribute
    - `localStorage['snapfzz-theme']`
    - storage notification dispatch for in-window theme listeners
    - font family + font size CSS vars/body styles
    - global override style with both:
      - `font-family: ... !important`
      - `font-size: inherit !important`
      - `html { font-size: ... !important }`
- Updated hook flow to call `applyDomSettings(settings)` on boot + `settings-changed`

### 2) `frontend/packages/shared/src/hooks/use-theme.ts`
- Added shared `THEME_STORAGE_KEY`
- Added `storage` event listener to re-read persisted theme and re-render on cross-context updates
- Added `prefers-color-scheme` listener to refresh when system theme changes and no stored override exists

### 3) `plugins/settings-general/src/GeneralSettings.tsx`
- Updated font presets to cross-platform-safe defaults only:
  - kept: `Inter`, `System Default`, `JetBrains Mono`
  - removed: `SF Pro`, `Helvetica Neue`
- Added runtime theme resolver for form value `'system'`
- Added immediate theme apply on save:
  - resolves `system` to runtime light/dark
  - sets `data-theme`
  - writes resolved runtime theme to localStorage
  - dispatches storage event for local hook sync
- Updated font apply override to include inherited font-size strategy:
  - `*, *::before, *::after { font-family: ... !important; font-size: inherit !important; }`
  - `html { font-size: ... !important; }`
- Kept custom fonts install UI + tags + custom size input intact

### 4) `frontend/packages/launcher/src/app/App.tsx`
- Imported `useAppSettings` from `@snapfzz/shared`
- Mounted `useAppSettings()` in launcher `App` component so launcher follows settings.json on boot and settings-changed

### 5) Tests Updated

#### `plugins/settings-general/src/__tests__/GeneralSettings.test.tsx`
- Added cleanup hardening:
  - `vi.restoreAllMocks()`
  - `localStorage.clear()`
- Added tests for requested behavior:
  - `A007/settings-general: theme change applies immediately with resolved runtime theme`
  - `A007/settings-general: font size applies through html root inheritance override`

#### `frontend/packages/launcher/src/app/App.test.tsx`
- Mocked `useAppSettings` from shared package
- Added assertion test:
  - `A007/settings-general: launcher mounts shared app settings hook`

## Spec Traceability
- A007 (Multi-Layout): shared settings propagation across preferences/project/launcher windows
- U009 (Design System): theme runtime resolution and typography/font-size inheritance behavior
- Inline spec comments were preserved/added where architectural decisions are non-obvious.

## Verification
- `plugins/settings-general`: `npx vitest run` ✅ (54/54 tests passing)
- `frontend/packages/shared`: `npx tsc --noEmit` ✅
- LSP diagnostics on all changed TS/TSX files: clean ✅

## Behavior Outcome
After these changes:
1. Saving theme in Settings resolves `system` to runtime light/dark and applies immediately
2. Theme sync now reaches all windows via `settings-changed` + storage synchronization
3. Saving font size applies visually via root html size + inherited descendants override
4. Font dropdown contains only cross-platform bundled defaults + installed custom fonts
5. Launcher now applies app settings on boot/events like other windows
