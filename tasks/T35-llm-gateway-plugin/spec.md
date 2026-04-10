# T35: LLM Gateway Plugin

## Goal

Implement LLM Gateway plugin per A013 spec, enabling full LiteLLM integration.

## Components

### 1. snapfzz-llm Crate

Create `src-tauri/crates/snapfzz-llm/`:

```
src/
├── lib.rs          // Exports
├── config.rs       // Generate ~/.snapfzz/gateway/config.yaml from settings
├── keys.rs         // HTTP client to LiteLLM /key/* API
├── spend.rs        // HTTP client to LiteLLM /spend/* API
├── vault.rs        // Provider key storage via snapfzz-vault
└── types.rs        // GatewayConfig, ModelDeployment, LiteLLMParams, etc.
```

**Dependencies**: `reqwest`, `serde`, `serde_yaml`, `serde_json`, `uuid`, `tokio`, `snapfzz-vault`

### 1.1 Vault Integration (A011)

**Provider API Keys Flow:**
1. User adds provider in UI → enters API key
2. Key stored in vault via `snapfzz-vault` with key format: `provider:{provider_id}:{key_name}`
3. Config generation fetches key names from vault
4. Config.yaml uses env var reference: `os.environ/PROVIDER_{ID}_{KEY_NAME}`

**LiteLLM Master Key Flow:**
1. On first LiteLLM start, generate UUID master key
2. Store in vault: `litellm:master_key`
3. Config.yaml references: `os.environ/LITELLM_MASTER_KEY`
4. Injected to LiteLLM process at spawn time

**Vault Key Format:**
```
provider:openai:key_1    → OPENAI_KEY_1 env var
provider:anthropic:key_1 → ANTHROPIC_KEY_1 env var
litellm:master_key       → LITELLM_MASTER_KEY env var
```

### 2. Tauri Commands

Create `src-tauri/src/commands/llm.rs`:

**LiteLLM Key Management (virtual keys with budgets):**
- `llm_generate_key(params)` → POST /key/generate
- `llm_list_keys(page, size)` → GET /key/list
- `llm_delete_key(key)` → POST /key/delete
- `llm_get_key_info(key)` → GET /key/info
- `llm_update_key(key, params)` → POST /key/update

**Spend Tracking:**
- `llm_get_spend_logs(filters)` → GET /spend/logs
- `llm_get_key_spend(key)` → GET /spend/keys
- `llm_get_global_spend()` → GET /spend/global
- `llm_get_models()` → GET /v1/models

**Config Management:**
- `llm_save_config(config)` → regenerate config.yaml, restart LiteLLM
- `llm_get_config()` → read current config from settings

**Provider Key Management (vault-backed):**
- `llm_store_provider_key(provider_id, key_name, key_value)` → store in vault
- `llm_list_provider_keys(provider_id)` → list keys for provider
- `llm_delete_provider_key(provider_id, key_name)` → delete from vault

### 3. Settings UI Plugin

Create `plugins/settings-llm/`:

**Tabs**:
- [Providers] — model deployments (writes config.yaml)
- [API Keys] — virtual keys with budgets (/key/* API)
- [Routing] — model groups, aliases, strategies
- [Audit Log] — request log from /spend/logs

## Key Types (from A013)

```rust
pub struct GatewayConfig {
    pub model_list: Vec<ModelDeployment>,
    pub router_settings: RouterSettings,
    pub litellm_settings: LiteLLMSettings,
    pub general_settings: GeneralSettings,
}

pub struct ModelDeployment {
    pub model_name: String,
    pub litellm_params: LiteLLMParams,
}

pub struct LiteLLMParams {
    pub model: String,
    pub api_key: String,
    pub api_base: Option<String>,
    pub rpm: Option<u32>,
    pub tpm: Option<u32>,
}

pub struct KeyGenerateParams {
    pub models: Vec<String>,
    pub max_budget: f64,
    pub budget_duration: String,
    pub metadata: HashMap<String, String>,
    pub rpm_limit: Option<u32>,
    pub tpm_limit: Option<u32>,
}
```

## Tests (from A013)

```rust
// A013/Config: generate_config produces valid YAML
// A013/Config: model_list includes all enabled providers
// A013/Config: router_settings includes strategy and aliases
// A013/Config: master_key uses env var reference
// A013/Config: config written atomically

// A013/Keys: generate_key calls POST /key/generate
// A013/Keys: list_keys calls GET /key/list with pagination
// A013/Keys: delete_key calls POST /key/delete
// A013/Keys: get_key_info calls GET /key/info

// A013/Spend: get_spend_logs calls /spend/logs with date filters
// A013/Spend: get_key_spend returns per-key spend
// A013/Spend: get_global_spend returns total spend

// A013/Vault: provider keys stored with provider:{id}:{name} format
// A013/Vault: config generation fetches key names from vault
// A013/Vault: master_key generated on first boot if missing
// A013/Vault: config.yaml uses os.environ/ references
```

## Spec Reference

Full spec: `docs/plans/A013-llm-providers.md`

## Constraints

- Never modify `@snapfzz/plugin-sdk`
- Never `// TODO` / `// FIXME` / `// HACK`
- Add inline spec references: `// A013/section: description`
- Keep 90% code coverage threshold
- Follow TDD: write tests first