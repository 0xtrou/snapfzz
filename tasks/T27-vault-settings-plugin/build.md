# T27 — Vault Settings Plugin Build Report

## 5 Questions
1. Which spec? → U011 (Vault Settings), A011 (Secret Vault), U009 (Design System)
2. Which zone? → Zone 3 (React rendering only)
3. Core or plugin? → Plugin (`settings-vault`)
4. Existing pattern? → Matched `settings-advanced` and `settings-processes`
5. Test name? → `U011/vault-settings: {behavior}`

## Files planned
- `plugins/settings-vault/package.json`
- `plugins/settings-vault/vitest.config.ts`
- `plugins/settings-vault/tsconfig.json`
- `plugins/settings-vault/src/index.ts`
- `plugins/settings-vault/src/VaultSettings.tsx`
- `plugins/settings-vault/src/__tests__/setup.ts`
- `plugins/settings-vault/src/__tests__/VaultSettings.test.tsx`
- `frontend/packages/plugin-host/src/plugin-discovery.ts`
- `frontend/packages/plugin-host/src/plugin-discovery.test.ts`
- `frontend/packages/plugin-host/package.json`
- `frontend/packages/preferences/vite.config.ts`
- `frontend/packages/project/vite.config.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/coverage-badges.yml`
- `README.md`

## Design alignment
- Reused `SettingsHeader` shell and the same `16px 32px` content padding pattern
- Kept settings sections in `Space direction="vertical" size={32}`
- Used Ant components only (`Tag`, `Table`, `Input.Password`, `Skeleton`, `Empty`, `Button`)
- All colors remain on CSS variables / Ant theme tokens

## Security handling
- `vault_read` values are transformed into masked strings immediately
- Component state stores `{ name, masked }` only
- Add form uses `Input.Password`; no plaintext echo state outside controlled input

## Verification plan
- Run plugin coverage for `settings-vault`
- Run plugin-host test suite because discovery list changed
- Run preferences tests because alias registration changed
- Run diagnostics on changed TS/TSX files
