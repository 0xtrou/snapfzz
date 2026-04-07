# U011 — Vault Settings Plugin

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Settings section for managing the Secret Vault (A011). Shows stored secrets, master key status, and allows manual secret management. Never displays raw secret values.

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│ Secret Vault                                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Master Key                                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ● Healthy — stored in system keychain             │  │
│  │   Last verified: 2 minutes ago                    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Stored Secrets (3)                                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Name                          │ Value     │       │  │
│  │ provider:openai:apiKey        │ ••••sk-4f │  🗑   │  │
│  │ provider:anthropic:apiKey     │ ••••an-9x │  🗑   │  │
│  │ custom:webhook-secret         │ ••••wh-2k │  🗑   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Add Secret                                             │
│  ┌─────────────────┐ ┌───────────────────────┐          │
│  │ Secret name     │ │ Secret value          │ [Add]    │
│  └─────────────────┘ └───────────────────────┘          │
│  Name format: provider:{id}:apiKey or custom:{name}     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Sections

### Master Key Status

Shows health of the vault master key:

| Status | Icon | Text |
|---|---|---|
| Healthy (keychain) | ● green | Healthy — stored in system keychain |
| Healthy (keyfile) | ● yellow | Healthy — stored in local keyfile (keychain unavailable) |
| Missing | ● red | Missing — secrets are unencrypted. Restart to regenerate. |

Implementation: call `vault_list` on mount. If it succeeds, key is healthy. The source (keychain vs keyfile) can be added as a future Tauri command `vault_key_source`.

### Stored Secrets Table

Lists all secret entry names from `vault_list`. For each entry:

- **Name**: full entry key (e.g., `provider:openai:apiKey`)
- **Value**: masked — last 4 chars visible, rest as `•` dots. Read via `vault_read`, mask in frontend: `'•'.repeat(raw.length - 4) + raw.slice(-4)`
- **Delete button**: `ConfirmAction` with danger, calls `vault_delete`

The table refreshes after add/delete operations.

**Important**: the raw value is read from vault only for masking display. It is NOT stored in React state — read, mask, display, discard. Per A011: "Frontend receives decrypted values only via vault_read — never caches them in React state beyond the current render."

### Add Secret Form

Two inputs + Add button:

- **Name input**: validated against entry naming convention regex `^(provider|custom|webhook):[a-z0-9-]+:[a-zA-Z0-9-]+$`
- **Value input**: `type="password"` — never visible in plaintext
- **Add button**: calls `vault_store`, clears inputs, refreshes table
- **Error display**: inline error text below inputs for validation failures

---

## Plugin Registration

```typescript
// plugins/settings-vault/src/index.ts
export default definePlugin({
  id: 'snapfzz.settings.vault',
  name: 'Secret Vault Settings',
  version: '1.0.0',
  description: 'Manage encrypted secrets',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],
  contributes: {
    settingsSections: [{
      id: 'vault',
      label: 'Secret Vault',
      icon: 'LockOutlined',
      component: () => import('./VaultSettings'),
      order: 55,  // after Processes (50), before Advanced (60)
    }],
  },
});
```

---

## Component Structure

```
plugins/settings-vault/
├── package.json
├── vitest.config.ts
├── tsconfig.json
├── src/
│   ├── index.ts              # definePlugin
│   ├── VaultSettings.tsx     # Main settings component
│   └── __tests__/
│       ├── setup.ts
│       └── VaultSettings.test.tsx
```

### VaultSettings.tsx

```typescript
export default function VaultSettings() {
  // State
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load secrets on mount
  useEffect(() => {
    loadSecrets();
  }, []);

  async function loadSecrets() {
    const names = await bridge.invoke<string[]>('vault_list');
    const entries = await Promise.all(
      names.map(async (name) => {
        const raw = await bridge.invoke<string>('vault_read', { key: name });
        const masked = raw.length > 4
          ? '•'.repeat(raw.length - 4) + raw.slice(-4)
          : '•'.repeat(raw.length);
        return { name, masked };
      })
    );
    setSecrets(entries);
    setLoading(false);
  }

  async function handleAdd() { ... }
  async function handleDelete(name: string) { ... }
}
```

---

## Tauri Commands Used

| Command | Args | Returns | Notes |
|---|---|---|---|
| `vault_list` | none | `string[]` | Entry names only |
| `vault_read` | `{ key }` | `string` | Raw value — mask immediately, don't cache |
| `vault_store` | `{ key, value }` | `()` | Encrypt + persist |
| `vault_delete` | `{ key }` | `()` | Remove + rewrite file |
| `vault_has` | `{ key }` | `boolean` | Check existence |

All commands have `plugin_id` guard — reject if called from a plugin context.

---

## Test Specifications

```
U011/vault-settings: renders master key status section
U011/vault-settings: shows healthy status when vault_list succeeds
U011/vault-settings: shows secret entries table with masked values
U011/vault-settings: masks secrets showing only last 4 chars
U011/vault-settings: masks short secrets (≤4 chars) fully
U011/vault-settings: add secret validates name format
U011/vault-settings: add secret rejects empty name
U011/vault-settings: add secret rejects empty value
U011/vault-settings: add secret calls vault_store and refreshes table
U011/vault-settings: delete secret shows confirmation dialog
U011/vault-settings: delete secret calls vault_delete and refreshes table
U011/vault-settings: loading state shows skeleton
U011/vault-settings: empty vault shows empty state message
U011/vault-settings: vault_list failure shows error state
```

---

## Design Tokens

Uses existing Ant Design theme tokens from U009:
- Table: `Table` component with dark mode overrides
- Inputs: standard `Input` + `Input.Password`
- Buttons: `Button` + `ConfirmAction` for delete
- Status: `Tag` component with color variants (green/yellow/red)
- Layout: `SettingsHeader` + `Space` vertical layout

---

## Dependencies

| Spec | What |
|---|---|
| A011 | Vault backend — all 5 Tauri commands |
| A007 | Settings plugin registration via settingsSections |
| U009 | Design system — Ant Design tokens |

---

## Hard Rules

- Raw secret values NEVER cached in React state — read, mask, render, discard
- Value input always `type="password"` — never plaintext visible
- Delete requires confirmation via `ConfirmAction`
- Name validation enforced before vault_store call
- ≥90% test coverage (lines + branches + functions)
- Uses `createTauriBridge()` from `@snapfzz/shared` — no raw `__TAURI_INTERNALS__`
