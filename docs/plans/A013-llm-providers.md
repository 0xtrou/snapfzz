# A013 — LLM Providers

Settings plugin that manages AI provider configuration, model discovery, usage metering, and spend enforcement. Every LLM call in Snapfzz flows through this layer.

## Decision

LLM provider configuration, API key storage, model discovery, usage tracking, and budget enforcement are a single cohesive concern — not four separate systems. A unified `snapfzz-llm` crate in Zone 1 owns all compute. A single settings plugin in Zone 3 owns all UI. Zone 2 routes contribution registrations.

## Why This Shape

Spreading LLM concerns across multiple crates creates invisible coupling: the stream pipeline needs to know about token costs, the budget registry needs to know about provider schemas, settings plugins need to know about metering format. Centralizing in `snapfzz-llm` makes the boundaries explicit and testable.

API keys must never touch `settings.json` or any project folder (A004: API keys in global config only, never in projects). The A011 Secret Vault is the only permitted key store. This spec treats A011 as a hard dependency — `snapfzz-llm` holds references (key IDs) and asks the vault for decrypted values at call time. Keys are never held in memory longer than a single HTTP request.

Usage is an append-only log (A004: append-only logs). Aggregations are computed on-demand. Nothing is stored pre-aggregated — that would make the log a database, which it isn't.

Budget enforcement integrates with A008 by registering a new resource class (`LlmSpend`) rather than repurposing existing classes. Monetary spend is a supervised resource: the registry can't prevent an HTTP request from completing mid-flight, but it can block the next one. The response handler always records the actual cost after the call returns.

---

## Architecture Overview

```
Zone 1 (Rust) — snapfzz-llm crate
┌──────────────────────────────────────────────────────────────────┐
│  ProviderRegistry   ModelCache    UsageLog     SpendEnforcer     │
│  (config + vault    (LiteLLM DB  (JSONL        (budget gates     │
│   key refs)          + live APIs) append-only)  per provider)    │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ Tauri commands
Zone 3 (Main thread) — plugins/settings-llm-providers
┌──────────────────────────────────────────────────────────────────┐
│  ProviderList  ProviderDetail  ModelTable  UsageDashboard        │
│  (toggle/test) (key + URL)     (pricing)   (charts + limits)    │
└──────────────────────────────────────────────────────────────────┘
```

The plugin contributes one `settingsSections` entry to the preferences window. Nothing lands in the project window or launcher.

---

## 1. Provider Configuration

### Provider Schema

Each provider is identified by a stable string ID. Built-in providers ship with `builtin: true` and cannot be deleted, only disabled.

```rust
// snapfzz-llm/src/provider.rs
// Per A013/Providers: full provider descriptor stored in ~/.snapfzz/llm-providers.json

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,                   // "openai", "anthropic", "custom-1"
    pub name: String,                 // display name
    pub kind: ProviderKind,           // wire protocol
    pub base_url: String,             // canonical base URL
    pub api_key_ref: Option<String>,  // A011 secret vault key ID — never the raw key
    pub enabled: bool,
    pub builtin: bool,                // system providers can't be deleted
    pub models: Vec<CachedModel>,     // populated by model discovery
    pub pinned_models: Vec<String>,   // model IDs user starred
    pub budget: ProviderBudget,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    OpenaiCompat,    // Bearer token, /v1/models, OpenAI usage schema
    AnthropicCompat, // x-api-key, /v1/models, Anthropic usage schema
}
```

### Built-In Providers

Registered at first boot by `ProviderRegistry::seed()`. User can disable but not delete.

| ID | Name | Kind | Base URL |
|---|---|---|---|
| `openai` | OpenAI | `openai-compat` | `https://api.openai.com/v1` |
| `anthropic` | Anthropic | `anthropic-compat` | `https://api.anthropic.com/v1` |
| `xai` | xAI (Grok) | `openai-compat` | `https://api.x.ai/v1` |
| `minimax` | MiniMax | `openai-compat` | `https://api.minimaxi.com/v1` |
| `alibaba` | Alibaba Cloud | `openai-compat` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |

### Custom Providers

Users can add custom providers by choosing a kind and supplying a name and base URL. The `id` is auto-generated as a UUID with a `custom-` prefix. Custom providers default to `builtin: false`.

```rust
// Supported custom templates shown in the UI "Add Provider" dialog
pub enum CustomTemplate {
    GenericOpenai,   // user provides name + base URL
    GenericAnthropic,
}
```

### Persistence

`~/.snapfzz/llm-providers.json` — human-readable JSON array of `Provider` objects. Written atomically (write temp file, rename). Never stored inside a project folder.

```typescript
// TypeScript mirror — plugins/settings-llm-providers/src/types.ts
// Per A013/Providers: matches Rust Provider struct exactly

export interface Provider {
  id: string;
  name: string;
  kind: 'openai-compat' | 'anthropic-compat';
  baseUrl: string;
  apiKeyRef: string | null;   // vault key ID, not the key itself
  enabled: boolean;
  builtin: boolean;
  models: CachedModel[];
  pinnedModels: string[];
  budget: ProviderBudget;
}
```

---

## 2. Model Auto-Discovery

### Discovery Flow

```
User enables provider OR clicks "Refresh Models"
  → Tauri command: discover_models(provider_id)
      → Rust: read provider config from ProviderRegistry
      → Rust: ask A011 vault for decrypted API key (key_id → raw_key)
      → Rust: GET {base_url}/v1/models with auth headers
      → Rust: normalize raw model list to Vec<DiscoveredModel>
      → Rust: merge with LiteLLM pricing DB (context window + costs)
      → Rust: write merged Vec<CachedModel> to provider.models
      → Rust: persist llm-providers.json
      → Rust: emit "llm:models-updated" event with provider_id
  → Frontend: useProviderModels() hook receives event, re-renders table
```

### Auth Headers Per Kind

```rust
// snapfzz-llm/src/discovery.rs
// Per A013/Discovery: auth headers differ by provider kind

fn build_auth_headers(kind: &ProviderKind, raw_key: &str) -> HeaderMap {
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

### Anthropic Model Metadata

Anthropic's `/v1/models` response includes context metadata directly. When `kind == AnthropicCompat`, the crate extracts `max_input_tokens`, `max_tokens`, and `capabilities` from the response body and uses them instead of the LiteLLM fallback for those fields.

### LiteLLM Pricing Database

```
Source:  https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
Bundle:  src-tauri/assets/litellm-prices.json  (snapshot at build time)
Refresh: daily, at first model discovery after 24h since last fetch
Storage: ~/.snapfzz/litellm-prices-cache.json  (with timestamp)
```

Merge strategy: LiteLLM data fills pricing + context window fields. Live API data fills model IDs and availability. If a model ID exists in the live list but not LiteLLM, the pricing fields are `null` (displayed as "—" in the UI). If a model ID exists in LiteLLM but not the live list, it is excluded from the display.

### Cached Model Schema

```rust
// snapfzz-llm/src/model.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedModel {
    pub id: String,                           // "gpt-4o", "claude-3-5-sonnet-20241022"
    pub display_name: Option<String>,         // from LiteLLM or provider metadata
    pub max_input_tokens: Option<u64>,
    pub max_output_tokens: Option<u64>,
    pub input_cost_per_token: Option<f64>,    // USD
    pub output_cost_per_token: Option<f64>,
    pub cache_read_cost_per_token: Option<f64>,
    pub cache_creation_cost_per_token: Option<f64>,
    pub reasoning_cost_per_token: Option<f64>,
    pub supports_vision: bool,
    pub supports_function_calling: bool,
    pub supports_audio: bool,
    pub pinned: bool,
    pub discovered_at: u64,                   // Unix timestamp
}
```

---

## 3. Usage Metering (Zone 1)

### Log Format

All LLM API responses funnel through `snapfzz-llm`'s response handler before returning to the caller. The handler extracts token counts, computes cost, and appends one record to the monthly JSONL file.

```
~/.snapfzz/usage/YYYY-MM.jsonl
```

One JSON object per line. The file is never rewritten — only appended. New file created each month.

```rust
// snapfzz-llm/src/usage.rs
// Per A013/UsageMetering: append-only, one record per API call

#[derive(Debug, Serialize, Deserialize)]
pub struct UsageRecord {
    pub id: String,                      // UUIDv4
    pub timestamp: u64,                  // Unix ms
    pub provider: String,                // provider id
    pub model: String,                   // model id
    pub session_id: Option<String>,      // agent session if available
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub reasoning_tokens: u64,
    pub cost_usd: f64,                   // computed via cost formula
    pub latency_ms: u64,
    pub first_token_ms: Option<u64>,     // None for non-streaming
    pub status: CallStatus,
    pub error_code: Option<String>,
    pub tags: Vec<String>,               // e.g. ["agent:chat", "project:xyz"]
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallStatus {
    Success,
    Error,
    BlockedByBudget,
}
```

### Token Normalization

Different providers use different field names in their usage objects. The normalizer maps both schemas to a canonical `TokenUsage` struct before cost computation.

```rust
// Per A013/UsageMetering: normalize provider-specific usage schemas

pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub reasoning_tokens: u64,
}

impl TokenUsage {
    // OpenAI: usage.prompt_tokens, completion_tokens,
    //         prompt_tokens_details.cached_tokens, completion_tokens_details.reasoning_tokens
    pub fn from_openai(raw: &Value) -> Self { ... }

    // Anthropic: usage.input_tokens, output_tokens,
    //            cache_read_input_tokens, cache_creation_input_tokens
    // OpenAI-compat providers follow from_openai()
    pub fn from_anthropic(raw: &Value) -> Self { ... }
}
```

### Cost Formula

```rust
// Per A013/UsageMetering: cost formula applied to every response

pub fn compute_cost(usage: &TokenUsage, pricing: &ModelPricing) -> f64 {
    let billable_input = usage.input_tokens.saturating_sub(usage.cache_read_tokens);

    let input_cost          = billable_input as f64 * pricing.input_cost_per_token.unwrap_or(0.0);
    let cache_read_cost     = usage.cache_read_tokens as f64 * pricing.cache_read_cost_per_token.unwrap_or(0.0);
    let cache_creation_cost = usage.cache_creation_tokens as f64 * pricing.cache_creation_cost_per_token.unwrap_or(0.0);
    let visible_output      = usage.output_tokens.saturating_sub(usage.reasoning_tokens);
    let output_cost         = visible_output as f64 * pricing.output_cost_per_token.unwrap_or(0.0);
    let reasoning_cost      = usage.reasoning_tokens as f64
        * pricing.reasoning_cost_per_token
            .or(pricing.output_cost_per_token)
            .unwrap_or(0.0);

    input_cost + cache_read_cost + cache_creation_cost + output_cost + reasoning_cost
}
```

If pricing is unknown for a model (all cost fields are `None`), cost is recorded as `0.0` and a `"pricing-unknown"` tag is appended to the record.

### Tauri Commands for Usage Data

```rust
// snapfzz-llm/src/commands.rs

#[tauri::command]
async fn get_usage_summary(
    provider_id: Option<String>,  // None = all providers
    period: UsagePeriod,          // Daily, Monthly, Custom { start, end }
) -> Result<UsageSummary, String>

#[tauri::command]
async fn get_usage_detail(
    provider_id: Option<String>,
    period: UsagePeriod,
    page: u32,
    page_size: u32,
) -> Result<UsageDetailPage, String>

// Aggregation is computed on-demand from the JSONL log — never pre-stored
pub struct UsageSummary {
    pub total_cost_usd: f64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub call_count: u64,
    pub by_provider: Vec<ProviderSummary>,
    pub by_model: Vec<ModelSummary>,
}

pub struct UsageDetailPage {
    pub records: Vec<UsageRecord>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
}
```

---

## 4. Budget Enforcement (Zone 1)

### New Resource Class

A013 adds `LlmSpend` as a new supervised resource class in A008's `Resource` enum. Monetary spend is cross-process in the sense that it accumulates across many short-lived HTTP calls, making semaphore-style control inappropriate. The pattern is observe-then-gate: record each spend, check the running total before the next call.

```rust
// Per A013/Budget: extends A008 Resource enum (additive, with approval)
// Registered in snapfzz-kernel/budget

pub enum Resource {
    CpuPermit(usize),
    Memory(u64),
    NetworkOp,
    Strike,
    DiskBytes(u64),
    LlmSpend { provider_id: String, amount_usd: f64 }, // A013 addition
}
```

### Provider Budget Schema

Each provider carries its own budget envelope. Both daily and monthly limits are optional — if `None`, that period has no cap.

```rust
// snapfzz-llm/src/budget.rs
// Per A013/Budget: per-provider spend limits with threshold events

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBudget {
    pub daily_limit_usd: Option<f64>,
    pub monthly_limit_usd: Option<f64>,
    pub warn_at_percent: Vec<u8>,   // e.g. [80, 90] — emit warning events at these thresholds
    pub block_when_exceeded: bool,  // if false: warn-only mode (allow spend beyond limit)
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
Before each LLM API call:
  SpendEnforcer::check(provider_id) → SpendCheckResult

  SpendCheckResult::Allow               → proceed with call
  SpendCheckResult::Warn { percent }    → proceed, emit "llm:budget-warning" event
  SpendCheckResult::Block               → return Err, record CallStatus::BlockedByBudget

After each LLM API call returns:
  SpendEnforcer::record(provider_id, cost_usd)
  → UsageLog::append(record)
  → update running daily + monthly totals in memory
  → check if a new threshold was just crossed → emit warning event if so
```

Period boundaries reset at midnight UTC (daily) and the first of the month UTC (monthly). Running totals are recomputed by summing the JSONL log for the current period — no separate counter to go stale.

### Budget Events (to frontend)

```rust
// Emitted via Tauri's app_handle.emit() — received by any open window

#[derive(Serialize)]
struct LlmBudgetWarning {
    provider_id: String,
    period: String,          // "daily" | "monthly"
    percent_used: f64,
    spent_usd: f64,
    limit_usd: f64,
}
// event name: "llm:budget-warning"

#[derive(Serialize)]
struct LlmBudgetExceeded {
    provider_id: String,
    period: String,
    spent_usd: f64,
    limit_usd: f64,
}
// event name: "llm:budget-exceeded"
```

---

## 5. Settings Plugin UI (Zone 3)

### Manifest

```typescript
// plugins/settings-llm-providers/src/index.ts
// Per A007/Preferences: contributes one settingsSections entry

definePlugin({
  id: 'snapfzz.settings.llm-providers',
  name: 'LLM Providers',
  version: '1.0.0',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],
  contributes: {
    settingsSections: [{
      id: 'llm-providers',
      label: 'LLM Providers',
      icon: 'ApiOutlined',
      order: 25,               // between Runtime (20) and Performance (30)
      component: () => import('./LlmProvidersSection'),
    }],
  },
  budget: {
    maxMemoryMb: 32,
    maxConcurrentInvokes: 4,
  },
});
```

### Section Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ LLM Providers                                    [Add Provider]  │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ ◉ OpenAI                    ● Connected     [Test] [↺]    │   │
│ │ ○ Anthropic                 ○ No API key    [Test] [↺]    │   │
│ │ ○ xAI                       ○ Disabled      [Test] [↺]    │   │
│ │ ○ MiniMax                   ○ Disabled      [Test] [↺]    │   │
│ │ ○ Alibaba Cloud             ○ Disabled      [Test] [↺]    │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ▼ OpenAI                                                         │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ API Key    [●●●●●●●●●●●●  sk-proj-…Kx9]   [Change]        │   │
│ │ Base URL   https://api.openai.com/v1       (read-only)     │   │
│ │                                                            │   │
│ │ Models (47)                    [★ Pinned first]  [Refresh] │   │
│ │ ┌──────────────────┬──────────┬──────────┬────────────┐   │   │
│ │ │ Model            │ Context  │ Input    │ Output     │   │   │
│ │ ├──────────────────┼──────────┼──────────┼────────────┤   │   │
│ │ │ ★ gpt-4o         │ 128K     │ $2.50/M  │ $10.00/M   │   │   │
│ │ │   gpt-4o-mini    │ 128K     │ $0.15/M  │ $0.60/M    │   │   │
│ │ │   o3             │ 200K     │ $10.00/M │ $40.00/M   │   │   │
│ │ └──────────────────┴──────────┴──────────┴────────────┘   │   │
│ │                                                            │   │
│ │ Spend Limits                                               │   │
│ │ Daily    [ $——  ] USD/day    Monthly  [ $——  ] USD/month   │   │
│ │ Warn at  [80]% [90]%        Block when exceeded  [✓]      │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ─────────────────────────────────────────────────────────────── │
│                                                                  │
│ Usage This Month                              [View Full Report] │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ [Bar chart: spend per provider, last 30 days]              │   │
│ │                                                            │   │
│ │ OpenAI      $4.32   Anthropic   $1.07   xAI   $0.00       │   │
│ └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Component Tree

```
plugins/settings-llm-providers/src/
  LlmProvidersSection.tsx      ← section root, loaded lazily
  ProviderList.tsx             ← scrollable list of provider rows
  ProviderRow.tsx              ← name + status badge + test button
  ProviderDetail.tsx           ← expanded: key, URL, model table, budget
  ApiKeyField.tsx              ← masked input; save calls vault command
  ModelTable.tsx               ← Ant Design Table, virtual scroll
  ModelRow.tsx                 ← one model: name, context, pricing cells
  UsageDashboard.tsx           ← spend chart + per-provider summary
  BudgetConfig.tsx             ← daily/monthly inputs + warn thresholds
  AddProviderModal.tsx         ← kind selector, name, base URL
  hooks/
    use-providers.ts           ← invoke('get_providers'), event listener
    use-provider-models.ts     ← invoke('get_provider_models'), "llm:models-updated"
    use-usage-summary.ts       ← invoke('get_usage_summary')
    use-budget-events.ts       ← listen("llm:budget-warning"), listen("llm:budget-exceeded")
```

### Key UX Rules

- API key field always shows a masked preview (last 4 chars visible). Clicking "Change" opens an input that clears after saving. The raw key is never held in component state after submission.
- "Test" button calls `test_provider_connection` and shows a success badge or error inline. Never a modal.
- Model table uses Ant Design's virtual scroll for providers with 100+ models. No pagination.
- Pricing is displayed as USD per million tokens (human-readable), computed from per-token floats in the backend.
- Pinned models always sort to the top of the table. The star icon is a toggle — clicking it calls `toggle_model_pin`.
- Spend limits: empty inputs mean no limit. Inputs accept decimal USD values.
- Budget warning notifications arrive via `useBudgetEvents()` hook and are shown as Ant Design notification toasts, not modals. They don't interrupt the user's current work.

### Loading States

Per ENGINEERING_GUIDE.md Plugin Loading UX:

- Provider list: shows skeleton rows while `get_providers` loads (three gray bars matching row height)
- Model table: shows a 5-row skeleton on first load or refresh
- Usage chart: shows a skeleton chart area (matching chart height) while `get_usage_summary` loads

---

## 6. Tauri Commands

All commands live in `snapfzz-llm/src/commands.rs` and are registered in `src-tauri/src/main.rs`.

```rust
// Provider management
#[tauri::command]
async fn get_providers() -> Result<Vec<Provider>, String>

#[tauri::command]
async fn save_provider(provider: Provider) -> Result<(), String>
// Persists to llm-providers.json. API key field is ignored — keys go through set_provider_api_key.

#[tauri::command]
async fn delete_provider(provider_id: String) -> Result<(), String>
// Returns Err if provider.builtin == true

#[tauri::command]
async fn set_provider_api_key(provider_id: String, key_id: String) -> Result<(), String>
// Stores key_id (A011 vault reference) on the provider. Never the raw key.

#[tauri::command]
async fn test_provider_connection(provider_id: String) -> Result<ConnectionTestResult, String>
// Makes a minimal authenticated request (GET /v1/models, expect 200).

// Model discovery
#[tauri::command]
async fn discover_models(provider_id: String) -> Result<Vec<CachedModel>, String>
// Fetches live model list, merges with LiteLLM, persists, emits "llm:models-updated"

#[tauri::command]
async fn get_provider_models(provider_id: String) -> Result<Vec<CachedModel>, String>
// Returns cached models from provider config — no network call

#[tauri::command]
async fn toggle_model_pin(provider_id: String, model_id: String, pinned: bool) -> Result<(), String>

// Usage metering
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

// Budget config
#[tauri::command]
async fn save_provider_budget(
    provider_id: String,
    budget: ProviderBudget,
) -> Result<(), String>

// Internal — called by snapfzz-llm before/after each API call
// Not exposed to plugins; called by the LLM client directly
pub async fn check_spend_budget(provider_id: &str) -> SpendCheckResult
pub async fn record_llm_call(record: UsageRecord) -> Result<(), LlmError>
```

```rust
// Return types

pub struct ConnectionTestResult {
    pub success: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,  // user-safe message, no internal paths
}

pub enum UsagePeriod {
    Daily,
    Monthly,
    Custom { start_ms: u64, end_ms: u64 },
}
```

---

## 7. Crate Structure

```
src-tauri/crates/
  snapfzz-llm/
    src/
      lib.rs          # Public API: LlmClient, ProviderRegistry, UsageLog, SpendEnforcer
      provider.rs     # Provider, ProviderKind, ProviderBudget structs
      model.rs        # CachedModel, ModelPricing, LiteLlmDb
      discovery.rs    # HTTP model discovery, LiteLLM merge logic
      usage.rs        # UsageRecord, TokenUsage, compute_cost(), append_record()
      budget.rs       # SpendEnforcer, check(), record(), period_reset()
      commands.rs     # All #[tauri::command] handlers
      normalizer.rs   # from_openai(), from_anthropic() token usage normalizers
    tests/
      provider_test.rs
      discovery_test.rs
      usage_test.rs
      budget_test.rs
      normalizer_test.rs

src-tauri/assets/
  litellm-prices.json   # bundled snapshot (updated at build time via build.rs)

plugins/
  settings-llm-providers/
    src/
      index.ts
      LlmProvidersSection.tsx
      ProviderList.tsx
      ProviderRow.tsx
      ProviderDetail.tsx
      ApiKeyField.tsx
      ModelTable.tsx
      ModelRow.tsx
      UsageDashboard.tsx
      BudgetConfig.tsx
      AddProviderModal.tsx
      hooks/
        use-providers.ts
        use-provider-models.ts
        use-usage-summary.ts
        use-budget-events.ts
      __tests__/
        LlmProvidersSection.test.tsx
        ProviderDetail.test.tsx
        ModelTable.test.tsx
        UsageDashboard.test.tsx
        BudgetConfig.test.tsx
        use-providers.test.ts
        use-usage-summary.test.ts
        use-budget-events.test.ts
    package.json
    tsconfig.json
```

---

## 8. Zone Boundaries

| Concern | Zone | Why |
|---|---|---|
| API key encryption/decryption | Zone 1 (A011 vault) | Keys never cross into JS |
| HTTP requests to provider APIs | Zone 1 | Network I/O is computation |
| Token counting + cost math | Zone 1 | Pure computation |
| JSONL append | Zone 1 | File I/O is computation |
| Budget gate check | Zone 1 | Decision is computation, not rendering |
| LiteLLM DB fetch (daily refresh) | Zone 1 | Network I/O |
| Aggregation computation | Zone 1 | On-demand from JSONL, not cached |
| Plugin manifest + contribution | Zone 2 | Lifecycle managed in Worker |
| React components | Zone 3 | Render only |
| Chart rendering | Zone 3 | `react-chartjs-2` or Ant Design Charts, GPU composited |

The frontend never knows a raw API key. It receives only `apiKeyRef` (a string ID) and a boolean `hasKey` derived by the backend. `ApiKeyField.tsx` accepts a new raw key from the user and immediately passes it to the A011 vault command — it clears the input and never stores it in component state.

---

## 9. Dependencies

| Dependency | Why |
|---|---|
| A011 (Secret Vault) | API key encryption. `api_key_ref` on every provider is a vault key ID. |
| A012 (Preflight Service) | Vault must be initialized before any provider config loads. `snapfzz-llm` initializes only after A012 signals vault-ready. |
| A008 (Budget Registry) | `LlmSpend` registered as a supervised resource class. |
| A007 (Preferences Layout) | Plugin contributes to `preferences` surface via `settingsSections`. |
| A005 (Plugin Architecture) | Registered as a system plugin via `registerAsSystem()`. Cannot be uninstalled. |
| A004 (Workspace) | `llm-providers.json` and `usage/YYYY-MM.jsonl` live in `~/.snapfzz/`, never in project folders. |

---

## 10. Tests

All test names follow `{spec}/{section}: {behavior}` from ENGINEERING_GUIDE.md. A013 is the spec number.

### Rust (snapfzz-llm)

```rust
// A013/Provider: seed() registers all 5 built-in providers
// A013/Provider: save_provider() persists to llm-providers.json atomically
// A013/Provider: delete_provider() returns error for builtin providers
// A013/Provider: api_key_ref is stored, raw key is never persisted

// A013/Discovery: GET /v1/models uses Bearer token for openai-compat
// A013/Discovery: GET /v1/models uses x-api-key for anthropic-compat
// A013/Discovery: anthropic response fields populate max_input_tokens directly
// A013/Discovery: merge uses LiteLLM for pricing when provider gives none
// A013/Discovery: model in live list but not LiteLLM has null cost fields
// A013/Discovery: model in LiteLLM but not live list is excluded
// A013/Discovery: stale LiteLLM cache triggers re-fetch after 24h

// A013/UsageMetering: from_openai() normalizes prompt_tokens_details.cached_tokens
// A013/UsageMetering: from_openai() normalizes completion_tokens_details.reasoning_tokens
// A013/UsageMetering: from_anthropic() normalizes cache_read_input_tokens
// A013/UsageMetering: compute_cost() uses output_cost_per_token for reasoning if no reasoning_cost_per_token
// A013/UsageMetering: compute_cost() subtracts cache_read_tokens from billable_input
// A013/UsageMetering: unknown pricing records cost as 0.0 with "pricing-unknown" tag
// A013/UsageMetering: append_record() creates new file on month boundary
// A013/UsageMetering: get_usage_summary() aggregates from JSONL, not a cache

// A013/Budget: check() returns Allow when no limit set
// A013/Budget: check() returns Warn at 80% threshold
// A013/Budget: check() returns Warn at 90% threshold
// A013/Budget: check() returns Block when exceeded and block_when_exceeded=true
// A013/Budget: check() returns Warn (not Block) when block_when_exceeded=false
// A013/Budget: daily totals reset at midnight UTC
// A013/Budget: monthly totals reset on first of month UTC
// A013/Budget: record() emits "llm:budget-warning" event when threshold first crossed
// A013/Budget: record() emits "llm:budget-exceeded" event when limit first exceeded
// A013/Budget: check_spend_budget is called before each LLM API call
// A013/Budget: record_llm_call is called after each LLM API call completes (including errors)
```

### Frontend (plugins/settings-llm-providers)

```typescript
// A013/UI: definePlugin returns manifest with surface=['preferences']
// A013/UI: definePlugin contributes settingsSections with icon='ApiOutlined'
// A013/UI: activate returns PluginHandle with deactivate cleanup

// A013/ProviderList: renders skeleton while get_providers loads
// A013/ProviderList: shows Connected status when provider enabled and key set
// A013/ProviderList: shows No API key status when apiKeyRef is null
// A013/ProviderList: toggle calls save_provider with enabled toggled

// A013/ProviderDetail: ApiKeyField shows last-4-chars masked preview
// A013/ProviderDetail: ApiKeyField clears input after calling set_provider_api_key
// A013/ProviderDetail: ApiKeyField never stores raw key in React state after submission
// A013/ProviderDetail: refresh calls discover_models and shows loading state
// A013/ProviderDetail: builtin providers render base URL as read-only

// A013/ModelTable: pinned models sort to top
// A013/ModelTable: star toggle calls toggle_model_pin
// A013/ModelTable: null cost fields display as em dash
// A013/ModelTable: per-token costs displayed as per-million-token USD

// A013/BudgetConfig: empty input saved as null (no limit)
// A013/BudgetConfig: save calls save_provider_budget
// A013/BudgetConfig: warn_at_percent chips render for each threshold

// A013/UsageDashboard: renders skeleton chart while get_usage_summary loads
// A013/UsageDashboard: displays per-provider spend for current month

// A013/BudgetEvents: use-budget-events shows Ant notification toast on llm:budget-warning
// A013/BudgetEvents: use-budget-events shows Ant notification toast on llm:budget-exceeded
// A013/BudgetEvents: notifications do not open a modal or block the UI
```

---

## 11. Performance Constraints

Every A001/A002/A003 constraint applies to this plugin independently.

| Constraint | How It Applies |
|---|---|
| A001: 60fps | Model table uses virtual scroll. Chart uses GPU-composited canvas. No layout thrash on budget event. |
| A001: CSS containment | `contain: strict` on provider list and model table independently. |
| A002: Zone 3 render only | All computation (cost math, aggregation) in Zone 1. Hooks receive pre-computed values. |
| A002: No computation in render | Cost displayed as formatted string from Rust, not computed in JSX. |
| A003: < 100ms plugin activation | `onStartupFinished` activation; component loaded lazily on first navigation to section. |
| ENGINEERING_GUIDE: loading skeleton | ProviderList, ModelTable, and UsageDashboard each show shape-matched skeletons during load. |

---

## 12. Security Considerations

- **Raw API keys never cross the Rust/JS boundary.** The vault command accepts a key and returns a key ID. The key ID is what flows to the frontend and back.
- **Usage JSONL contains no keys** — only provider IDs, model IDs, token counts, and cost.
- **`llm-providers.json` contains no keys** — only `api_key_ref` (vault ID).
- **Test provider connection** uses the vault at call time. The raw key is not held in any struct after the HTTP request returns.
- **Budget blocking** happens before the network call. A blocked call never leaves the machine — no partial cost, no token exposure.
- **User-facing error messages** from `test_provider_connection` and discovery errors use generic language: "Could not connect to provider" rather than exposing HTTP error bodies or internal path names (ENGINEERING_GUIDE.md: User-Facing Copy).
