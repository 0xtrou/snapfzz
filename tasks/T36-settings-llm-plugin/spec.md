# T36: Settings LLM Plugin

## Goal

Create the UI plugin for LLM Gateway management per A013 spec. Users can manage providers, virtual keys, routing, and view audit logs through a settings panel.

## Components

### 1. Plugin Package

Create `plugins/settings-llm/`:

```
plugins/settings-llm/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                    # Plugin manifest
    ├── LlmSettings.tsx             # Main tab container
    ├── tabs/
    │   ├── ProvidersTab.tsx        # Model deployments
    │   ├── ApiKeysTab.tsx          # Virtual keys with budgets
    │   ├── RoutingTab.tsx          # Model groups, aliases
    │   └── AuditLogTab.tsx         # Request logs
    ├── hooks/
    │   └── useLlmCommands.ts       # Tauri command wrappers
    └── __tests__/
        ├── LlmSettings.test.tsx
        └── tabs/
            ├── ProvidersTab.test.tsx
            ├── ApiKeysTab.test.tsx
            ├── RoutingTab.test.tsx
            └── AuditLogTab.test.tsx
```

### 2. Plugin Manifest

```typescript
// src/index.ts
import { definePlugin } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.settings.llm',
  name: 'LLM Providers Settings',
  version: '1.0.0',
  description: 'Manage LLM providers, virtual keys, routing, and audit logs',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],
  contributes: {
    settingsSections: [
      {
        id: 'llm',
        label: 'LLM Providers',
        icon: 'ApiOutlined',
        component: () => import('./LlmSettings'),
        order: 6,
      },
    ],
  },
});
```

### 3. Tabs

#### [Providers] Tab
- List of model deployments (model_name, provider, api_base, rpm/tpm)
- Add/Edit/Delete provider deployments
- Form fields: model_name, litellm_params.model, api_base (optional), rpm, tpm
- "Add Provider Key" button opens modal to store API key in vault
- Save writes to config.yaml via `llm_save_config` command

#### [API Keys] Tab
- List of virtual keys with budgets
- Columns: key (masked), models, spend, max_budget, budget_duration, created
- Actions: Create, Delete
- Create form: models[], max_budget, budget_duration, metadata, rpm_limit, tpm_limit
- Uses commands: `llm_generate_key`, `llm_list_keys`, `llm_delete_key`, `llm_get_key_info`

#### [Routing] Tab
- Model group aliases (e.g., "fast" -> "gpt-4o")
- Routing strategy selector: simple-shuffle, latency-based-routing, least-busy-routing
- Fallback rules configuration
- Uses settings stored in GatewayConfig

#### [Audit Log] Tab
- Table of spend logs: request_id, api_key, model, spend, timestamp
- Date range filter
- Model filter
- Key filter
- Pagination
- Uses commands: `llm_get_spend_logs`, `llm_get_key_spend`, `llm_get_global_spend`

### 4. Hooks

```typescript
// src/hooks/useLlmCommands.ts

// Provider key management
export function useStoreProviderKey() { ... }
export function useListProviderKeys() { ... }
export function useDeleteProviderKey() { ... }

// Config management
export function useSaveConfig() { ... }
export function useGetConfigPath() { ... }

// Virtual key management
export function useGenerateKey() { ... }
export function useListKeys() { ... }
export function useDeleteKey() { ... }
export function useGetKeyInfo() { ... }
export function useUpdateKey() { ... }

// Spend tracking
export function useGetSpendLogs() { ... }
export function useGetKeySpend() { ... }
export function useGetGlobalSpend() { ... }
export function useGetModels() { ... }
```

### 5. Tauri Commands (Already Implemented)

From T35:
- `llm_store_provider_key` - Store provider API key in vault
- `llm_delete_provider_key` - Delete provider key from vault
- `llm_list_provider_keys` - List all keys for a provider
- `llm_save_config` - Write config.yaml atomically
- `llm_get_config_path` - Get config file path
- `llm_generate_key` - POST /key/generate
- `llm_list_keys` - GET /key/list
- `llm_delete_key` - POST /key/delete
- `llm_get_key_info` - GET /key/info
- `llm_update_key` - POST /key/update
- `llm_get_spend_logs` - GET /spend/logs
- `llm_get_key_spend` - GET /spend/keys
- `llm_get_global_spend` - GET /spend/global
- `llm_get_models` - GET /v1/models

## Zone Boundaries

| Concern | Zone | Why |
|---|---|---|
| React components | Zone 3 | Render only |
| Tauri command calls | Zone 3 → Zone 1 | IPC |
| Data transformation | Zone 3 | UI logic |
| State management | Zone 3 | React state |

## Dependencies

```json
{
  "dependencies": {
    "@snapfzz/plugin-sdk": "workspace:*",
    "@snapfzz/shared": "workspace:*",
    "antd": "^5.0.0",
    "react": "^19.0.0",
    "@tauri-apps/api": "^2.0.0"
  }
}
```

## Tests

```typescript
// A013/UI: ProvidersTab renders model deployments list
// A013/UI: ProvidersTab add deployment button opens form
// A013/UI: ApiKeysTab renders virtual keys with budgets
// A013/UI: ApiKeysTab create key button opens form
// A013/UI: RoutingTab renders model group aliases
// A013/UI: AuditLogTab renders spend logs with filters
// A013/UI: AuditLogTab date range filter works
```

## Spec Reference

Full spec: `docs/plans/A013-llm-providers.md`

## Constraints

- Never modify `@snapfzz/plugin-sdk`
- Never `// TODO` / `// FIXME` / `// HACK`
- Add inline spec references: `// A013/UI: description`
- Keep 90% code coverage threshold
- Follow existing settings plugin patterns (settings-vault, settings-general)
- Use Ant Design components
- Master key is NEVER exposed to frontend - all key/spend operations read from vault internally

## Existing Patterns to Follow

- `plugins/settings-vault/src/index.ts` - Plugin manifest pattern
- `plugins/settings-vault/src/VaultSettings.tsx` - Tab component pattern
- `plugins/settings-general/` - Form patterns
- `frontend/packages/plugin-sdk/` - Plugin SDK types