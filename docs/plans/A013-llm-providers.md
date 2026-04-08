# A013 — LLM Providers (LiteLLM Gateway)

LLM provider management backed by LiteLLM proxy. Snapfzz manages LiteLLM as a child process — all provider config, virtual keys, budgets, routing, and spend tracking delegated to LiteLLM's MIT-licensed core.

## Decision

**Use LiteLLM proxy as the unified LLM gateway.** Don't rebuild what exists.

LiteLLM provides: 100+ providers, virtual keys with budgets, model routing/combos, spend tracking, Prometheus metrics, OpenAI + Anthropic API compatibility — all MIT licensed.

Snapfzz builds: config generator, process lifecycle (via snapfzz-runtime), settings UI plugin, audit log UI that reads LiteLLM's spend API.

---

## Architecture Overview

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

```
Snapfzz App
├── snapfzz-runtime (A016)
│   ├── LiteLLM Gateway  (port 4000)
│   │   ├── /v1/chat/completions  (OpenAI compat)
│   │   ├── /v1/messages          (Anthropic compat)
│   │   ├── /v1/models            (model discovery)
│   │   ├── /key/*                (virtual key mgmt)
│   │   ├── /spend/*              (spend tracking)
│   │   └── /health               (health check)
│   ├── AgentScope Runtime (port 8090)
│   │   └── uses gateway at localhost:4000
│   └── CEF Runtime (on demand)
│
│ External tools also use localhost:4000:
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

## 1. Config Generation

Snapfzz generates `~/.snapfzz/gateway/config.yaml` from user settings, then LiteLLM reads it.

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
  -> Rust generates GatewayConfig struct
  -> Serialize to YAML
  -> Write atomically to ~/.snapfzz/gateway/config.yaml
  -> snapfzz-runtime restarts LiteLLM process
  -> LiteLLM picks up new config
```

---

## 2. Virtual Key Management

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

## 3. Spend Tracking & Audit Log

Read-only proxy to LiteLLM spend API. No custom storage.

### Tauri Commands

```rust
#[tauri::command] async fn llm_get_spend_logs(filters: SpendFilters) -> Result<Vec<SpendLog>, String>
#[tauri::command] async fn llm_get_key_spend(key: String) -> Result<KeySpend, String>
#[tauri::command] async fn llm_get_global_spend() -> Result<GlobalSpend, String>
#[tauri::command] async fn llm_get_models() -> Result<Vec<Model>, String>
```

---

## 4. Settings Plugin UI

### UI Tabs

```
LLM Providers
├── [Providers]  — model deployments (writes config.yaml)
├── [API Keys]   — virtual keys with budgets (/key/* API)
├── [Routing]    — model groups, aliases, strategies
└── [Audit Log]  — request log from /spend/logs
```

---

## 5. What LiteLLM Handles (NOT our code)

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

---

## 6. Zone Boundaries

| Concern | Zone | Why |
|---|---|---|
| Config YAML generation | Zone 1 | File I/O |
| HTTP calls to LiteLLM API | Zone 1 | Network I/O |
| Process lifecycle | Zone 1 (snapfzz-runtime) | Process management |
| Plugin manifest | Zone 2 | Worker lifecycle |
| React components | Zone 3 | Render only |

---

## 7. Dependencies

- `litellm[proxy]` Python package (MIT) — installed via snapfzz-packs
- `reqwest` — HTTP client for LiteLLM API calls
- `serde_yaml` — config.yaml generation
- snapfzz-runtime (A016) — process lifecycle
- snapfzz-packs — LiteLLM installation
- snapfzz-vault (A011) — provider API keys in vault, injected as env vars

---

## 8. Security

- Provider API keys in vault (A011), injected as env vars to LiteLLM process
- LiteLLM master key generated on first boot, stored in vault
- Virtual keys created via master key — never exposed to frontend
- LiteLLM binds to 127.0.0.1 only (not exposed to network)
- Config.yaml contains env var references, not raw keys

---

## 9. Tests

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
```

---

## 10. Performance

| Operation | Owner | Target |
|---|---|---|
| Chat completion proxy | LiteLLM | < 50ms overhead |
| Budget check | LiteLLM | Built-in per-key |
| Config generation | snapfzz-llm | < 10ms |
| Key management API | snapfzz-llm -> LiteLLM | < 100ms |
| Spend query | snapfzz-llm -> LiteLLM | < 500ms |
