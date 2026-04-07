# A013 — LLM Providers

Settings plugin that manages AI provider configuration, model discovery, usage metering, and budget enforcement.

## Decision

Simple provider configuration with budget enforcement. User enters **Base URL** + **API Key**, we fetch **Model List** from `/v1/models`.

API keys stored in A011 Secret Vault (key IDs only, never raw keys in config). Usage is append-only log. Budget enforcement blocks calls when limits exceeded.

---

## Architecture Overview

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

This spec adds the provider-management domain on top of that architecture: Rust owns provider compute and the settings plugin owns the preferences UI.

The plugin contributes one `settingsSections` entry to the preferences window. Nothing lands in the project window or launcher.

---

## 1. Provider Configuration

### Provider Schema

```rust
// snapfzz-llm/src/provider.rs
// Stored in ~/.snapfzz/llm-providers.json

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,                   // "openai", "anthropic", "custom-uuid"
    pub name: String,                 // display name
    pub kind: ProviderKind,           // "openai-compat" | "anthropic-compat"
    pub base_url: String,             // e.g. "https://api.openai.com/v1"
    pub api_key_ref: Option<String>,  // A011 vault key ID
    pub enabled: bool,
    pub builtin: bool,                // built-in providers can't be deleted
    pub models: Vec<CachedModel>,     // from /v1/models discovery
    pub pinned_models: Vec<String>,   // user-starred models
    pub budget: ProviderBudget,       // daily/monthly limits
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    OpenaiCompat,    // Bearer token, /v1/models
    AnthropicCompat, // x-api-key, /v1/models
}
```

### Built-In Providers

| ID | Name | Kind | Base URL |
|---|---|---|---|
| `openai` | OpenAI | `openai-compat` | `https://api.openai.com/v1` |
| `anthropic` | Anthropic | `anthropic-compat` | `https://api.anthropic.com/v1` |

### Custom Providers

User adds by entering:
- **Name**: Display name
- **Kind**: OpenAI-compatible or Anthropic-compatible
- **Base URL**: e.g. `http://localhost:11434/v1` (Ollama), `https://api.openai.com/v1`
- **API Key**: Stored in vault

ID auto-generated as `custom-{uuid}`. User can delete custom providers.

### Persistence

`~/.snapfzz/llm-providers.json` — JSON array, written atomically. Never in project folders.

---

## 2. Model Discovery

### Discovery Flow

```
User enables provider OR clicks "Refresh"
  → GET {base_url}/v1/models with auth headers
  → Normalize to Vec<CachedModel>
  → Persist to provider.models
  → Emit "llm:models-updated" event
```

### Auth Headers

```rust
fn build_auth_headers(kind: &ProviderKind, api_key: &str) -> HeaderMap {
    match kind {
        ProviderKind::OpenaiCompat => {
            // Authorization: Bearer {key}
        }
        ProviderKind::AnthropicCompat => {
            // x-api-key: {key}
            // anthropic-version: 2023-06-01
        }
    }
}
```

### Cached Model Schema

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedModel {
    pub id: String,                    // "gpt-4o", "claude-3-5-sonnet"
    pub display_name: Option<String>,
    pub max_input_tokens: Option<u64>,
    pub max_output_tokens: Option<u64>,
    pub input_cost_per_token: Option<f64>,
    pub output_cost_per_token: Option<f64>,
    pub supports_vision: bool,
    pub supports_function_calling: bool,
    pub pinned: bool,
    pub discovered_at: u64,
}
```

---

## 3. Usage Metering

### Log Format

```
~/.snapfzz/usage/YYYY-MM.jsonl
```

Append-only, one record per API call.

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct UsageRecord {
    pub id: String,                      // UUIDv4
    pub timestamp: u64,                  // Unix ms
    pub provider: String,
    pub model: String,
    pub session_id: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub reasoning_tokens: u64,
    pub cost_usd: f64,
    pub latency_ms: u64,
    pub status: CallStatus,
    pub error_code: Option<String>,
}

pub enum CallStatus {
    Success, Error, BlockedByBudget
}
```

### Token Normalization

```rust
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub reasoning_tokens: u64,
}

impl TokenUsage {
    // OpenAI: usage.prompt_tokens, completion_tokens, etc.
    pub fn from_openai(raw: &Value) -> Self { ... }
    
    // Anthropic: usage.input_tokens, output_tokens, etc.
    pub fn from_anthropic(raw: &Value) -> Self { ... }
}
```

### Cost Formula

```rust
pub fn compute_cost(usage: &TokenUsage, pricing: &ModelPricing) -> f64 {
    let billable_input = usage.input_tokens.saturating_sub(usage.cache_read_tokens);
    
    let input_cost = billable_input as f64 * pricing.input_cost_per_token.unwrap_or(0.0);
    let cache_read_cost = usage.cache_read_tokens as f64 * pricing.cache_read_cost_per_token.unwrap_or(0.0);
    let cache_creation_cost = usage.cache_creation_tokens as f64 * pricing.cache_creation_cost_per_token.unwrap_or(0.0);
    let output_cost = usage.output_tokens as f64 * pricing.output_cost_per_token.unwrap_or(0.0);
    let reasoning_cost = usage.reasoning_tokens as f64 * pricing.reasoning_cost_per_token.or(pricing.output_cost_per_token).unwrap_or(0.0);
    
    input_cost + cache_read_cost + cache_creation_cost + output_cost + reasoning_cost
}
```

---

## 4. Budget Enforcement

### Provider Budget Schema

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBudget {
    pub daily_limit_usd: Option<f64>,    // None = no limit
    pub monthly_limit_usd: Option<f64>,  // None = no limit
    pub warn_at_percent: Vec<u8>,        // e.g. [80, 90]
    pub block_when_exceeded: bool,       // true = block, false = warn-only
}

impl Default for ProviderBudget {
    fn default() -> Self {
        Self {
            daily_limit_usd: None,
            monthly_limit_usd: None,
            warn_at_percent: vec![80, 90],
            block_when_exceeded: true,
        }
    }
}
```

### Enforcement Flow

```
Before API call:
  check_budget(provider_id) → Allow | Warn | Block

After API call:
  record_usage(UsageRecord)
  → append to JSONL
  → check if threshold crossed → emit warning event
```

### Budget Events

```rust
// Emitted via Tauri event system
struct LlmBudgetWarning {
    provider_id: String,
    period: String,          // "daily" | "monthly"
    percent_used: f64,
    spent_usd: f64,
    limit_usd: f64,
}
// Event: "llm:budget-warning"

struct LlmBudgetExceeded {
    provider_id: String,
    period: String,
    spent_usd: f64,
    limit_usd: f64,
}
// Event: "llm:budget-exceeded"
```

---

## 5. Settings Plugin UI

### Manifest

```typescript
// plugins/settings-llm-providers/src/index.ts
definePlugin({
  id: 'snapfzz.settings.llm-providers',
  name: 'LLM Providers',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],
  contributes: {
    settingsSections: [{
      id: 'llm-providers',
      label: 'LLM Providers',
      icon: 'ApiOutlined',
      order: 25,
      component: () => import('./LlmProvidersSection'),
    }],
  },
});
```

### UI Layout

```
┌──────────────────────────────────────────────────────────┐
│ LLM Providers                              [Add Provider] │
├──────────────────────────────────────────────────────────┤
│ ◉ OpenAI       ● Connected    [Test] [↻]                │
│ ○ Anthropic    ○ No API key   [Test] [↻]                │
│ ○ Custom-1     ○ Disabled     [Test] [↻]                │
├──────────────────────────────────────────────────────────┤
│ ▼ OpenAI                                                 │
│ API Key    [●●●●●●●●]  [Change]                          │
│ Base URL   https://api.openai.com/v1                     │
│                                                          │
│ Models (47)                            [★ Pinned] [↻]   │
│ ┌────────────┬─────────┬──────────┬──────────┐          │
│ │ Model      │ Context │ Input    │ Output   │          │
│ ├────────────┼─────────┼──────────┼──────────┤          │
│ │ ★ gpt-4o   │ 128K    │ $2.50/M  │ $10.00/M │          │
│ │   gpt-4o-mini│128K  │ $0.15/M  │ $0.60/M  │          │
│ └────────────┴─────────┴──────────┴──────────┘          │
│                                                          │
│ Spend Limits                                             │
│ Daily: [$____]  Monthly: [$____]                        │
│ Warn at: [80]% [90]%   Block when exceeded: [✓]          │
├──────────────────────────────────────────────────────────┤
│ Usage This Month                       [View Report]     │
│ OpenAI: $4.32   Anthropic: $1.07                         │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Tauri Commands

```rust
// Provider management
#[tauri::command]
async fn get_providers() -> Result<Vec<Provider>, String>

#[tauri::command]
async fn save_provider(provider: Provider) -> Result<(), String>
// api_key field ignored — use set_provider_api_key

#[tauri::command]
async fn delete_provider(provider_id: String) -> Result<(), String>
// Err if builtin == true

#[tauri::command]
async fn set_provider_api_key(provider_id: String, key_id: String) -> Result<(), String>

#[tauri::command]
async fn test_provider_connection(provider_id: String) -> Result<ConnectionTestResult, String>

// Model discovery
#[tauri::command]
async fn discover_models(provider_id: String) -> Result<Vec<CachedModel>, String>

#[tauri::command]
async fn get_provider_models(provider_id: String) -> Result<Vec<CachedModel>, String>

#[tauri::command]
async fn toggle_model_pin(provider_id: String, model_id: String, pinned: bool) -> Result<(), String>

// Usage
#[tauri::command]
async fn get_usage_summary(
    provider_id: Option<String>,
    period: UsagePeriod,
) -> Result<UsageSummary, String>

#[tauri::command]
async fn get_usage_detail(
    provider_id: Option<String>,
    period: UsagePeriod,
    page: u32,
    page_size: u32,
) -> Result<UsageDetailPage, String>

// Budget
#[tauri::command]
async fn save_provider_budget(provider_id: String, budget: ProviderBudget) -> Result<(), String>
```

---

## 7. Zone Boundaries

| Concern | Zone | Why |
|---|---|---|
| API key encryption/decryption | Zone 1 (A011) | Keys never cross to JS |
| HTTP requests | Zone 1 | Network I/O |
| Token counting + cost math | Zone 1 | Computation |
| JSONL append | Zone 1 | File I/O |
| Budget gate check | Zone 1 | Decision logic |
| Plugin manifest | Zone 2 | Worker lifecycle |
| React components | Zone 3 | Render only |

---

## 8. Dependencies

- A011 (Secret Vault) — API key storage
- A008 (Budget Registry) — LlmSpend resource class
- A007 (Preferences) — settingsSections contribution
- A005 (Plugin Architecture) — system plugin registration
- A004 (Workspace) — config in ~/.snapfzz/

---

## 9. Tests

### Rust (snapfzz-llm)

```rust
// A013/Provider: seed() registers built-in providers
// A013/Provider: save_provider() persists atomically
// A013/Provider: delete_provider() errors for builtin
// A013/Provider: api_key_ref stored, raw key never persisted

// A013/Discovery: Bearer token for openai-compat
// A013/Discovery: x-api-key for anthropic-compat
// A013/Discovery: null pricing for models not in LiteLLM

// A013/UsageMetering: from_openai() normalizes all token fields
// A013/UsageMetering: from_anthropic() normalizes all token fields
// A013/UsageMetering: compute_cost() applies formula correctly
// A013/UsageMetering: unknown pricing = 0.0 with "pricing-unknown" tag

// A013/Budget: check() returns Allow when no limit
// A013/Budget: check() returns Warn at threshold
// A013/Budget: check() returns Block when exceeded
// A013/Budget: daily totals reset at midnight UTC
// A013/Budget: monthly totals reset on 1st of month UTC
```

### Frontend (plugins/settings-llm-providers)

```typescript
// A013/UI: manifest with surface=['preferences']
// A013/UI: settingsSections with icon='ApiOutlined'

// A013/ProviderList: skeleton while loading
// A013/ProviderList: Connected/No key/Disabled status

// A013/ApiKeyField: masked preview (last 4 chars)
// A013/ApiKeyField: clears input after save
// A013/ApiKeyField: never stores raw key in state

// A013/ModelTable: pinned models sort first
// A013/ModelTable: null cost shows em dash

// A013/BudgetConfig: empty input = null (no limit)
// A013/BudgetEvents: notification toast on warning/exceeded
```

---

## 10. Performance Constraints

| Constraint | How |
|---|---|
| A001: 60fps | Virtual scroll for model table |
| A002: Zone 3 render only | Pre-computed costs from Rust |
| A003: < 100ms activation | Lazy load on navigation |
| Loading UX | Skeletons during load |

---

## 11. Security

- Raw API keys never cross Rust/JS boundary
- Usage JSONL contains no keys
- Test connection uses vault at call time
- Budget blocking happens before network call
- Error messages are generic (no internal paths)
