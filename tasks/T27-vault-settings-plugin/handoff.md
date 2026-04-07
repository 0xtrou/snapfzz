# Handoff: T27 Vault Settings Plugin

## What Changed

### New files
- `plugins/settings-vault/package.json` — plugin package config
- `plugins/settings-vault/vitest.config.ts` — test + coverage config (90% thresholds)
- `plugins/settings-vault/tsconfig.json` — TypeScript config
- `plugins/settings-vault/src/index.ts` — plugin definition (definePlugin, order 50)
- `plugins/settings-vault/src/VaultSettings.tsx` — main settings component
- `plugins/settings-vault/src/__tests__/setup.ts` — jsdom test setup
- `plugins/settings-vault/src/__tests__/VaultSettings.test.tsx` — 14 spec tests

### Modified files
- `frontend/packages/plugin-host/src/plugin-discovery.ts` — added vault to preferences surface
- `frontend/packages/plugin-host/src/plugin-discovery.test.ts` — updated expected plugin count
- `frontend/packages/plugin-host/package.json` — added vault devDependency
- `frontend/packages/preferences/vite.config.ts` — added @snapfzz/settings-vault alias
- `frontend/packages/project/vite.config.ts` — added @snapfzz/settings-vault alias
- `.github/workflows/ci.yml` — settings-vault in plugin matrix
- `.github/workflows/coverage-badges.yml` — settings-vault in badge loop
- `README.md` — @snapfzz/settings-vault in Core Plugins coverage table

## Key Decisions

- **Raw values never in state**: `vault_read` → mask → store `{ name, masked }` only. Raw value goes out of scope immediately.
- **Master key health**: heuristic — `vault_list` success = healthy, failure = missing. Source detection (keychain vs keyfile) deferred to future `vault_key_source` command.
- **Name validation**: regex `^(provider|custom|webhook):[a-z0-9-]+:[a-zA-Z0-9-]+$` enforced client-side before `vault_store` call.
- **Sidebar order 50**: between Plugins (40) and Advanced (99).

## Known Limitations

- Master key source (keychain vs keyfile) not yet distinguishable — shows generic "Healthy" status
- No migration UI — plaintext API key migration from settings.json to vault is a future preflight hook
- Vault settings visible to all windows but only useful in preferences window

## How to Verify

```bash
# Tests
cd plugins/settings-vault && npx vitest run --coverage --coverage.reporter=text

# Coverage thresholds
# lines ≥90%, branches ≥90%, functions ≥90%

# Plugin loads in settings sidebar
cargo tauri dev
# → Open Preferences → see "Secret Vault" between Plugins and Advanced

# Verify no raw Tauri access
grep -rn "__TAURI_INTERNALS__" plugins/settings-vault/src/ | grep -v test
# → 0 results
```

## Ready for Review: YES
