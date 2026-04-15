# A013 — LLM Providers (LiteLLM Gateway)

LLM provider management backed by LiteLLM proxy. Snapfzz manages LiteLLM as a child process — all provider config, virtual keys, budgets, routing, and spend tracking delegated to LiteLLM's MIT-licensed core.

## Decision

**Use LiteLLM proxy as the unified LLM gateway.** Don't rebuild what exists.

LiteLLM provides: 100+ providers, virtual keys with budgets, model routing/combos, spend tracking, Prometheus metrics, OpenAI + Anthropic API compatibility — all MIT licensed.

Snapfzz builds: config generator, process lifecycle (via snapfzz-kernel), settings UI plugin, audit log / analytics UI that reads LiteLLM's spend API.

---

## Architecture Overview

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

```
Snapfzz App
├── snapfzz-kernel (A016)
│   ├── LiteLLM Gateway  (dynamic port via find_available_port())
│   │   ├── /v1/chat/completions  (OpenAI compat)
│   │   ├── /v1/messages          (Anthropic compat)
│   │   ├── /v1/models            (model discovery)
│   │   ├── /key/*                (virtual key mgmt)
│   │   ├── /spend/*              (spend tracking)
│   │   └── /health               (health check)
│   ├── AgentScope Runtime (port 8090)
│   │   └── uses gateway at localhost:{dynamic_port}
│   └── CEF Runtime (on demand)
│
│ External tools also use localhost:{dynamic_port}:
│   Cursor, Claude Code, Aider, any OpenAI-compat client
```

### Crate: snapfzz-llm

Thin orchestration layer — NOT a reimplementation.

```
src-tauri/crates/snapfzz-llm/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── config.rs       (generate LiteLLM config.yaml from settings)
│   ├── keys.rs         (proxy calls to LiteLLM /key/* API)
│   ├── spend.rs        (proxy calls to LiteLLM /spend/* API)
│   └── types.rs        (shared types)
```

Dependencies: `reqwest`, `serde`, `serde_yaml`, `serde_json`, `uuid`

---

## 1. Config Generation ✅

Snapfzz generates `~/.snapfzz/data/litellm/config.yaml` from user settings, then LiteLLM reads it.

### Config Structure

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
    pub model: String,               // "openai/gpt-4o"
    pub api_key: String,             // "os.environ/OPENAI_KEY_1"
    pub api_base: Option<String>,    // for custom endpoints
    pub rpm: Option<u32>,
    pub tpm: Option<u32>,
}

pub struct RouterSettings {
    pub routing_strategy: String,
    pub model_group_alias: HashMap<String, String>,
    pub fallbacks: Vec<FallbackRule>,
}

pub struct GeneralSettings {
    pub master_key: String,
    pub database_url: Option<String>,
}
```

### Generated YAML Example

```yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_KEY_1
      rpm: 100
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_KEY_2
      rpm: 100
  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_KEY_1
  - model_name: local-llama
    litellm_params:
      model: ollama/llama3.2
      api_base: http://127.0.0.1:11434

router_settings:
  routing_strategy: simple-shuffle
  model_group_alias:
    "fast": "gpt-4o"
    "smart": "claude-sonnet"

litellm_settings:
  json_logs: true
  turn_off_message_logging: false
  default_key_generate_params:
    max_budget: 0
    budget_duration: "30d"

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

### Config Flow

```
User saves provider settings in UI
  -> llm_save_config Tauri command
  -> Rust generates GatewayConfig struct
  -> Serialize to YAML
  -> Write atomically to ~/.snapfzz/data/litellm/config.yaml
  -> snapfzz-kernel restarts LiteLLM process
  -> LiteLLM picks up new config
```

---

## 2. Virtual Key Management ✅

Proxy calls to LiteLLM /key/* endpoints. Each key = one API account with its own budget.

### Key Operations

```rust
pub struct LiteLLMKeyClient {
    base_url: String,
    master_key: String,
}

impl LiteLLMKeyClient {
    pub async fn generate_key(&self, params: KeyGenerateParams) -> Result<GeneratedKey, LlmError>;
    pub async fn list_keys(&self, page: u32, size: u32) -> Result<KeyListResponse, LlmError>;
    pub async fn delete_key(&self, key: &str) -> Result<(), LlmError>;
    pub async fn get_key_info(&self, key: &str) -> Result<KeyInfo, LlmError>;
    pub async fn update_key(&self, key: &str, params: KeyUpdateParams) -> Result<(), LlmError>;
}

pub struct KeyGenerateParams {
    pub models: Vec<String>,
    pub max_budget: f64,              // 0 = no budget (default)
    pub budget_duration: String,      // "30d", "7d", "1h"
    pub metadata: HashMap<String, String>,
    pub rpm_limit: Option<u32>,
    pub tpm_limit: Option<u32>,
}
```

### Tauri Commands

```rust
#[tauri::command] async fn llm_generate_key(params: KeyGenerateParams) -> Result<GeneratedKey, String>
#[tauri::command] async fn llm_list_keys(page: u32, size: u32) -> Result<KeyListResponse, String>
#[tauri::command] async fn llm_delete_key(key: String) -> Result<(), String>
#[tauri::command] async fn llm_get_key_info(key: String) -> Result<KeyInfo, String>
#[tauri::command] async fn llm_update_key(key: String, params: KeyUpdateParams) -> Result<(), String>
```

---

## 3. Spend Tracking & Audit Log ✅

Read-only proxy to LiteLLM spend API. No custom storage.

### Tauri Commands

```rust
#[tauri::command] async fn llm_get_spend_logs(filters: SpendFilters) -> Result<Vec<SpendLog>, String>
#[tauri::command] async fn llm_get_key_spend(key: String) -> Result<KeySpend, String>
#[tauri::command] async fn llm_get_global_spend() -> Result<GlobalSpend, String>
#[tauri::command] async fn llm_cleanup_spend_logs() -> Result<(), String>
```

---

## 4. Settings Plugin UI ✅

### UI Tabs

```
LLM Providers
├── [Providers]  — model deployments (writes config.yaml)
├── [API Keys]   — virtual keys with budgets (/key/* API)
├── [Combos]     — strategy composer, combo routing wizard
├── [Audit Log]  — request log from /spend/logs
├── [Analytics]  — client-side aggregated spend charts
└── [Cache]      — SQLite diskcache config, provider cache settings
```

---

## 5. Model Management (Frontend) ✅

Model import and discovery are pure frontend operations — no Tauri commands involved.

```typescript
// plugins/llm-providers/src/hooks/useLlmCommands.ts
//
// llm_import_model(model)   — calls LiteLLM /model/new directly via fetch()
// llm_discover_models()     — calls provider APIs (OpenAI /models, Anthropic, etc.) via fetch()
//
// Uses fetchWithToast() for unified error/toast handling
```

Frontend calls LiteLLM and provider APIs directly. Tauri is only involved for config I/O and secrets.

---

## 6. Strategy Composer / Combo System ✅

Combos are named routing strategies that group models under a single virtual model name.

### Architecture

```
ComboBuilder (wizard)
  -> user picks name + strategy + models
  -> writes to combo list in config
  -> llm_save_config persists to config.yaml

ComboList
  -> displays saved combos
  -> inline enable/disable/delete

routing/composer.ts
  -> builds LiteLLM router_settings from combo definitions
  -> supports 7 strategies:
       simple-shuffle         (default, random)
       least-busy             (lowest active requests)
       latency-based-routing  (fastest p50)
       cost-based-routing     (cheapest per token)
       usage-based-routing    (load balanced by usage)
       weighted               (explicit weight per model)
       priority               (ordered fallback list)
```

Combos are stored in config.yaml under `router_settings.model_group_alias` + strategy annotations. The combo name becomes a virtual model name accessible to any OpenAI-compat client.

---

## 7. Disk Caching ✅

### Architecture

```
CacheTab (UI)
  -> toggle response cache on/off
  -> configure TTL and cache size limits
  -> view cache hit/miss stats

SQLite diskcache
  -> LiteLLM disk_cache backend
  -> stores serialized responses keyed by (model, messages hash)
  -> file: ~/.snapfzz/data/litellm/cache.db

Two cache layers:
  provider prompt cache   — prefix caching at provider level (Anthropic, OpenAI)
                            enabled via litellm_settings.cache_prompt_injections
  response cache          — full response deduplication by Snapfzz diskcache
                            enabled via litellm_settings.cache = true
```

Config is written by `llm_save_config`. No separate Tauri commands for cache operations.

---

## 8. Analytics ✅

### Architecture

```
AnalyticsTab (UI)
  -> reads spend logs via llm_get_spend_logs
  -> aggregates client-side (no backend computation):
       cost by provider
       cost by model
       cost by key
       requests per day (bar chart)
       token usage over time
  -> time range filter: 7d / 30d / 90d / all
```

All aggregation is pure TypeScript on spend log data already fetched for the Audit Log. No additional API calls.

---

## 9. Shared Frontend Utilities ✅

```typescript
// modelNames.ts
buildProviderLookup(models)    // index LiteLLM model list by provider
resolveProviderName(model)     // "openai/gpt-4o" -> "OpenAI"
resolveModelName(model)        // "openai/gpt-4o" -> "GPT-4o"

// fetchWithToast.ts
fetchWithToast(url, opts)      // fetch() wrapper that shows toast on error/success
                               // used by all direct LiteLLM API calls from frontend
```

---

## 10. What LiteLLM Handles (NOT our code)

| Feature | LiteLLM Component |
|---|---|
| Provider auth (Bearer / x-api-key) | Core proxy |
| Request routing to backends | Router |
| OpenAI <-> Anthropic translation | Adapter layer |
| SSE streaming | Proxy streaming |
| Virtual key auth + budget enforcement | Key management |
| Spend tracking + cost calculation | Built-in pricing JSON |
| Prometheus metrics (/metrics) | Metrics middleware |
| Model discovery (/v1/models) | Proxy server |
| Rate limiting (RPM/TPM per key) | Key enforcement |
| 100+ provider support | Provider adapters |
| Provider API key storage + encryption | LiteLLM encrypted DB |

---

## 11. Zone Boundaries

| Concern | Zone | Why |
|---|---|---|
| Config YAML generation | Zone 1 | File I/O |
| HTTP calls to LiteLLM API | Zone 1 | Network I/O |
| Process lifecycle | Zone 1 (snapfzz-kernel) | Process management |
| Plugin manifest | Zone 2 | Worker lifecycle |
| React components | Zone 3 | Render only |
| Model import / discovery | Zone 3 (frontend fetch) | Direct provider API calls |

---

## 12. Dependencies

- `litellm[proxy]` Python package (MIT) — installed via snapfzz-packs
- `reqwest` — HTTP client for LiteLLM API calls
- `serde_yaml` — config.yaml generation
- snapfzz-kernel (A016) — process lifecycle
- snapfzz-packs — LiteLLM installation
- snapfzz-vault (A011) — master key + custom_providers config blob only

---

## 13. Security

- Provider API keys stored and encrypted in LiteLLM's own DB (not Snapfzz vault)
- Snapfzz vault holds only: LiteLLM master key + custom_providers config blob
- LiteLLM master key generated on first boot, stored in vault, referenced as `os.environ/LITELLM_MASTER_KEY`
- Virtual keys created via master key — never exposed to frontend
- LiteLLM binds to 127.0.0.1 only (not exposed to network)
- Config.yaml contains env var references, not raw keys

### Tauri Commands (Secrets / Config I/O only)

```rust
#[tauri::command] async fn llm_get_master_key() -> Result<String, String>
#[tauri::command] async fn llm_get_base_url() -> Result<String, String>
#[tauri::command] async fn llm_save_config(config: GatewayConfig) -> Result<(), String>
#[tauri::command] async fn llm_get_config_path() -> Result<String, String>
```

All other LiteLLM interactions (model import, discovery, spend logs, keys) go through direct HTTP from frontend or Rust HTTP client in snapfzz-llm.

---

## 14. Tests

```rust
// A013/Config: generate_config produces valid YAML
// A013/Config: model_list includes all enabled providers
// A013/Config: router_settings includes strategy and aliases
// A013/Config: master_key uses env var reference
// A013/Config: config written atomically to ~/.snapfzz/data/litellm/config.yaml

// A013/Keys: generate_key calls POST /key/generate
// A013/Keys: list_keys calls GET /key/list with pagination
// A013/Keys: delete_key calls POST /key/delete
// A013/Keys: get_key_info calls GET /key/info

// A013/Spend: get_spend_logs calls /spend/logs with date filters
// A013/Spend: get_key_spend returns per-key spend
// A013/Spend: get_global_spend returns total spend
// A013/Spend: cleanup_spend_logs prunes old records

// A013/Combos: composer builds valid router_settings for all 7 strategies
// A013/Combos: weighted strategy normalizes weights to 1.0
```

---

## 15. Performance

| Operation | Owner | Target |
|---|---|---|
| Chat completion proxy | LiteLLM | < 50ms overhead |
| Budget check | LiteLLM | Built-in per-key |
| Config generation | snapfzz-llm | < 10ms |
| Key management API | snapfzz-llm -> LiteLLM | < 100ms |
| Spend query | snapfzz-llm -> LiteLLM | < 500ms |
| Cache hit (diskcache) | LiteLLM diskcache | < 5ms |
| Analytics aggregation | Frontend (client-side) | < 50ms for 30d window |
