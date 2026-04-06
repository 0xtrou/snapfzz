# Build: T8a — Preferences Shell Package

## 5 Questions
1. Which spec? → A007 (multi-layout), A008 (budget), A001 (frame), U009 (design)
2. Which zone? → Zone 3 (render only)
3. Core or plugin? → Core infrastructure (shell package)
4. Existing pattern? → Copied project shell structure exactly
5. Test name? → A007/{section}: {behavior}

## What Was Built

### New package: frontend/packages/preferences/
- package.json (@snapfzz/preferences)
- tsconfig.json, vite.config.ts (port 5175)
- index.html (skeleton with theme no-flash)
- tailwind.config.js, postcss.config.js
- src/globals.css, src/main.tsx
- src/app/App.tsx (sidebar + content layout, reads settingsSections)
- src/app/App.test.tsx (empty state test)

### Modified: plugin-host/src/contribution-store.ts
- Added settingsSections array, registerSettingsSection(), getSettingsSections()
- Included in snapshot (frozen)

### Modified: plugin-host/src/plugin-host.ts
- registerManifestContributions handles c.settingsSections

### 5 new tests in contribution-store.test.ts
- A007/store-settingsSections: register, dispose, dedup, snapshot frozen, subscriber

## Verification
- 54 plugin-host tests passing
- cargo check clean
- pnpm install clean
