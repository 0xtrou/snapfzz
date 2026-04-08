# A013 — LLM Providers

Settings plugin that manages AI provider configuration, model discovery, usage metering, and budget enforcement.

## Decision

Provider configuration with SQLite-backed usage metering and budget enforcement. User enters **Base URL** + **API Key**, we fetch **Model List** from `/v1/models`.

API keys stored in A011 Secret Vault (key IDs only, never raw keys in config). Usage stored in SQLite with pre-optimized indexes for 20k+ requests/day. Budget enforcement blocks calls when limits exceeded.

---

## Architecture Overview

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

New crate: `snapfzz-llm` — owns all LLM provider logic. Depends on `snapfzz-vault` for key retrieval. The settings plugin contributes one `settingsSections` entry to the preferences window.

### Crate Structure

```
src-tauri/crates/snapfzz-llm/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── db.rs           (SQLite connection, migrations, WAL setup)
│   ├── provider.rs     (Provider CRUD, seed, persistence)
│   ├── discovery.rs    (model discovery, auth headers, normalization)
│   ├── usage.rs        (UsageRecord insert, queries, aggregation)
│   ├── budget.rs       (ProviderBudget, check, daily/monthly reset)
│   └── types.rs        (shared types, enums)
```

---

## 1. Storage: SQLite

### Database File

`~/.snapfzz/llm.db` — single file, WAL mode, never in project folders.

### Connection Setup

```rust
pub fn open_db(data_dir: &Path) -> Result<Connection, LlmError> {
    let db_path = data_dir.join("llm.db");
    let conn = Connection::open(&db_path)?;
    conn.execute_batch("
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -8000;     -- 8MB cache
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
    ")?;
    run_migrations(&conn)?;
    Ok(conn)
}
```

### Schema

```sql
CREATE TABLE IF NOT EXISTS providers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK(kind IN ('openai-compat', 'anthropic-compat')),
    base_url    TEXT NOT NULL,
    api_key_ref TEXT,               -- A011 vault key ID, never raw key
    enabled     INTEGER NOT NULL DEFAULT 1,
    builtin     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,   -- Unix ms
    updated_at  INTEGER NOT NULL    -- Unix ms
);

CREATE TABLE IF NOT EXISTS models (
    id                      TEXT NOT NULL,
    provider_id             TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    display_name            TEXT,
    max_input_tokens        INTEGER,
    max_output_tokens       INTEGER,
    input_cost_per_token    REAL,
    output_cost_per_token   REAL,
    supports_vision         INTEGER NOT NULL DEFAULT 0,
    supports_function_calling INTEGER NOT NULL DEFAULT 0,
    pinned                  INTEGER NOT NULL DEFAULT 0,
    discovered_at           INTEGER NOT NULL, -- Unix ms
    PRIMARY KEY (provider_id, id)
);

CREATE TABLE IF NOT EXISTS usage (
    id                    TEXT PRIMARY KEY,  -- UUIDv7 (time-sortable)
    timestamp             INTEGER NOT NULL,  -- Unix ms
    provider_id           TEXT NOT NULL,
    model                 TEXT NOT NULL,
    session_id            TEXT,
    input_tokens          INTEGER NOT NULL DEFAULT 0,
    output_tokens         INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens      INTEGER NOT NULL DEFAULT 0,
    cost_usd              REAL NOT NULL DEFAULT 0.0,
    latency_ms            INTEGER NOT NULL DEFAULT 0,
    status                TEXT NOT NULL CHECK(status IN ('success', 'error', 'blocked')),
    error_code            TEXT
);

CREATE TABLE IF NOT EXISTS budgets (
    provider_id         TEXT PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
    daily_limit_usd     REAL,           -- NULL = no limit
    monthly_limit_usd   REAL,           -- NULL = no limit
    warn_at_percent     TEXT NOT NULL DEFAULT '[80,90]',  -- JSON array
    block_when_exceeded INTEGER NOT NULL DEFAULT 1
);
```

### Indexes — Pre-Optimized for 20k req/day

```sql
-- Budget check: SUM cost for today/month per provider (called before EVERY API call)
-- At 20k req/day = ~600k rows/month. This index makes budget check O(log n).
CREATE INDEX IF NOT EXISTS idx_usage_budget_check
    ON usage(provider_id, timestamp)
    WHERE status = 'success';

-- Usage summary: aggregate cost by provider + date range (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_usage_summary
    ON usage(provider_id, timestamp, cost_usd);

-- Usage by model: breakdown per model (analytics)
CREATE INDEX IF NOT EXISTS idx_usage_by_model
    ON usage(provider_id, model, timestamp);

-- Usage by session: trace costs per chat session
CREATE INDEX IF NOT EXISTS idx_usage_by_session
    ON usage(session_id, timestamp)
    WHERE session_id IS NOT NULL;

-- Model lookup: fast model list per provider
CREATE INDEX IF NOT EXISTS idx_models_provider
    ON models(provider_id, pinned DESC, id);
```

### Query Patterns (Pre-Optimized)

```sql
-- Budget check: daily spend (called before every API call, must be < 1ms)
-- Uses idx_usage_budget_check covering index
SELECT COALESCE(SUM(cost_usd), 0.0) AS daily_spend
FROM usage
WHERE provider_id = ?1
  AND timestamp >= ?2    -- start of today UTC
  AND status = 'success';

-- Budget check: monthly spend
SELECT COALESCE(SUM(cost_usd), 0.0) AS monthly_spend
FROM usage
WHERE provider_id = ?1
  AND timestamp >= ?2    -- start of month UTC
  AND status = 'success';

-- Usage summary: per-provider totals for date range (dashboard)
SELECT provider_id,
       COUNT(*) AS request_count,
       SUM(input_tokens) AS total_input,
       SUM(output_tokens) AS total_output,
       SUM(cost_usd) AS total_cost,
       AVG(latency_ms) AS avg_latency
FROM usage
WHERE timestamp BETWEEN ?1 AND ?2
GROUP BY provider_id;

-- Usage detail: paginated list (scrollable table)
SELECT * FROM usage
WHERE provider_id = COALESCE(?1, provider_id)
  AND timestamp BETWEEN ?2 AND ?3
ORDER BY timestamp DESC
LIMIT ?4 OFFSET ?5;

-- Usage by model: model breakdown for a provider (pie chart data)
SELECT model,
       COUNT(*) AS request_count,
       SUM(cost_usd) AS total_cost,
       SUM(input_tokens + output_tokens) AS total_tokens
FROM usage
WHERE provider_id = ?1
  AND timestamp BETWEEN ?2 AND ?3
GROUP BY model
ORDER BY total_cost DESC;

-- Daily spend trend: last 30 days (sparkline chart)
SELECT DATE(timestamp / 1000, 'unixepoch') AS day,
       SUM(cost_usd) AS daily_cost,
       COUNT(*) AS request_count
FROM usage
WHERE provider_id = ?1
  AND timestamp >= ?2   -- 30 days ago
  AND status = 'success'
GROUP BY day
ORDER BY day;
```

### Write Performance

At 20k writes/day (~14/min), SQLite WAL mode handles this easily. Key optimizations:

- **Batch inserts**: wrap multiple usage records in a transaction (reduces fsync)
- **UUIDv7 primary keys**: time-sortable, no index fragmentation
- **WAL mode**: concurrent reads don't block writes
- **NORMAL synchronous**: trade durability for speed (acceptable — usage logs are not financial records)

### Retention

```sql
-- Auto-cleanup: delete usage older than 90 days (configurable)
DELETE FROM usage WHERE timestamp < ?1;

-- VACUUM after cleanup to reclaim space
-- Run monthly via scheduled task, not on every cleanup
```

---

## 2. Provider Configuration

### Provider Struct (Rust)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    pub base_url: String,
    pub api_key_ref: Option<String>,  // A011 vault key ID
    pub enabled: bool,
    pub builtin: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
    OpenaiCompat,
    AnthropicCompat,
}
```

### Built-In Providers

| ID | Name | Kind | Base URL |
|---|---|---|---|
| `openai` | OpenAI | `openai-compat` | `https://api.openai.com/v1` |
| `anthropic` | Anthropic | `anthropic-compat` | `https://api.anthropic.com/v1` |

### Custom Providers

User adds: Name + Kind + Base URL + API Key. ID auto-generated as `custom-{uuid}`.

### Seed

```rust
pub fn seed(conn: &Connection) -> Result<(), LlmError> {
    conn.execute_batch("
        INSERT OR IGNORE INTO providers (id, name, kind, base_url, enabled, builtin, created_at, updated_at)
        VALUES ('openai', 'OpenAI', 'openai-compat', 'https://api.openai.com/v1', 1, 1, 0, 0);

        INSERT OR IGNORE INTO providers (id, name, kind, base_url, enabled, builtin, created_at, updated_at)
        VALUES ('anthropic', 'Anthropic', 'anthropic-compat', 'https://api.anthropic.com/v1', 1, 1, 0, 0);

        INSERT OR IGNORE INTO budgets (provider_id) VALUES ('openai');
        INSERT OR IGNORE INTO budgets (provider_id) VALUES ('anthropic');
    ")?;
    Ok(())
}
```

---

## 3. Model Discovery

### Discovery Flow

```
User enables provider OR clicks "Refresh"
  → Resolve API key from vault (A011)
  → GET {base_url}/v1/models with auth headers
  → Normalize to models table rows
  → DELETE old models for provider, INSERT new
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

### Model Normalization

OpenAI `/v1/models` returns `{ data: [{ id, ... }] }`. Anthropic returns `{ data: [{ id, display_name, ... }] }`. Normalize both into the `models` table schema. Unknown fields default to NULL.

---

## 4. Usage Metering

### Insert (hot path — called on every API response)

```rust
pub fn record_usage(conn: &Connection, record: &UsageRecord) -> Result<(), LlmError> {
    conn.execute(
        "INSERT INTO usage (id, timestamp, provider_id, model, session_id,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
         reasoning_tokens, cost_usd, latency_ms, status, error_code)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![...],
    )?;
    Ok(())
}
```

### Token Normalization

```rust
impl TokenUsage {
    pub fn from_openai(raw: &Value) -> Self { ... }
    pub fn from_anthropic(raw: &Value) -> Self { ... }
}
```

### Cost Formula

```rust
pub fn compute_cost(usage: &TokenUsage, pricing: &ModelPricing) -> f64 {
    let billable_input = usage.input_tokens.saturating_sub(usage.cache_read_tokens);
    billable_input as f64 * pricing.input_cost_per_token.unwrap_or(0.0)
        + usage.cache_read_tokens as f64 * pricing.cache_read_cost_per_token.unwrap_or(0.0)
        + usage.cache_creation_tokens as f64 * pricing.cache_creation_cost_per_token.unwrap_or(0.0)
        + usage.output_tokens as f64 * pricing.output_cost_per_token.unwrap_or(0.0)
        + usage.reasoning_tokens as f64 * pricing.reasoning_cost_per_token
            .or(pricing.output_cost_per_token).unwrap_or(0.0)
}
```

---

## 5. Budget Enforcement

### Budget Check (called before every API call)

```rust
pub enum BudgetDecision {
    Allow,
    Warn { period: String, percent_used: f64, spent: f64, limit: f64 },
    Block { period: String, spent: f64, limit: f64 },
}

pub fn check_budget(conn: &Connection, provider_id: &str) -> Result<BudgetDecision, LlmError> {
    let budget = get_budget(conn, provider_id)?;

    if let Some(daily_limit) = budget.daily_limit_usd {
        let daily_spend = daily_spend(conn, provider_id)?;
        if daily_spend >= daily_limit && budget.block_when_exceeded {
            return Ok(BudgetDecision::Block { ... });
        }
        // check warn thresholds
    }

    if let Some(monthly_limit) = budget.monthly_limit_usd {
        let monthly_spend = monthly_spend(conn, provider_id)?;
        if monthly_spend >= monthly_limit && budget.block_when_exceeded {
            return Ok(BudgetDecision::Block { ... });
        }
        // check warn thresholds
    }

    Ok(BudgetDecision::Allow)
}
```

### Performance Target

`check_budget()` must complete in **< 1ms** at 600k rows/month. The `idx_usage_budget_check` covering index ensures this — SQLite reads only the index, never touches the table.

### Budget Events

```rust
struct LlmBudgetWarning {
    provider_id: String,
    period: String,
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

## 6. Tauri Commands

```rust
// Provider management
#[tauri::command] async fn get_providers() -> Result<Vec<Provider>, String>
#[tauri::command] async fn save_provider(provider: Provider) -> Result<(), String>
#[tauri::command] async fn delete_provider(provider_id: String) -> Result<(), String>
#[tauri::command] async fn set_provider_api_key(provider_id: String, key_id: String) -> Result<(), String>
#[tauri::command] async fn test_provider_connection(provider_id: String) -> Result<ConnectionTestResult, String>

// Model discovery
#[tauri::command] async fn discover_models(provider_id: String) -> Result<Vec<CachedModel>, String>
#[tauri::command] async fn get_provider_models(provider_id: String) -> Result<Vec<CachedModel>, String>
#[tauri::command] async fn toggle_model_pin(provider_id: String, model_id: String, pinned: bool) -> Result<(), String>

// Usage
#[tauri::command] async fn get_usage_summary(provider_id: Option<String>, period: UsagePeriod) -> Result<UsageSummary, String>
#[tauri::command] async fn get_usage_detail(provider_id: Option<String>, period: UsagePeriod, page: u32, page_size: u32) -> Result<UsageDetailPage, String>
#[tauri::command] async fn get_usage_by_model(provider_id: String, period: UsagePeriod) -> Result<Vec<ModelUsage>, String>
#[tauri::command] async fn get_daily_trend(provider_id: String, days: u32) -> Result<Vec<DailyTrend>, String>

// Budget
#[tauri::command] async fn save_provider_budget(provider_id: String, budget: ProviderBudget) -> Result<(), String>
```

---

## 7. Settings Plugin UI

### Manifest

```typescript
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

## 8. Zone Boundaries

| Concern | Zone | Why |
|---|---|---|
| API key retrieval (vault) | Zone 1 (A011) | Keys never cross to JS |
| HTTP requests (discovery, test) | Zone 1 | Network I/O |
| SQLite reads/writes | Zone 1 | File I/O + computation |
| Token counting + cost math | Zone 1 | Computation |
| Budget gate check | Zone 1 | Decision logic |
| Plugin manifest | Zone 2 | Worker lifecycle |
| React components | Zone 3 | Render only |

---

## 9. Dependencies

- `rusqlite` with `bundled` feature (ships SQLite with binary)
- `uuid` with `v7` feature (time-sortable IDs)
- `reqwest` (model discovery HTTP)
- `serde` + `serde_json` (serialization)
- A011 (Secret Vault) — API key storage
- A008 (Budget Registry) — LlmSpend resource class
- A007 (Preferences) — settingsSections contribution

---

## 10. Tests

### Rust (snapfzz-llm)

```rust
// A013/Db: open_db creates tables and indexes
// A013/Db: seed() inserts built-in providers idempotently
// A013/Db: WAL mode active after open

// A013/Provider: save_provider() inserts new row
// A013/Provider: save_provider() updates existing row
// A013/Provider: delete_provider() errors for builtin
// A013/Provider: delete_provider() cascades to models and budgets
// A013/Provider: api_key_ref stored, raw key never in db

// A013/Discovery: Bearer token for openai-compat
// A013/Discovery: x-api-key header for anthropic-compat
// A013/Discovery: discover_models replaces old models for provider

// A013/Usage: record_usage inserts with UUIDv7
// A013/Usage: daily_spend aggregates only today's success records
// A013/Usage: monthly_spend aggregates current month
// A013/Usage: get_usage_summary groups by provider
// A013/Usage: get_usage_detail paginates correctly
// A013/Usage: get_usage_by_model groups and sorts by cost
// A013/Usage: get_daily_trend returns 30 days
// A013/Usage: 10k inserts complete in < 2s (batch performance)

// A013/Budget: check_budget returns Allow when no limit
// A013/Budget: check_budget returns Warn at threshold
// A013/Budget: check_budget returns Block when exceeded
// A013/Budget: check_budget < 1ms with 600k rows (index scan)

// A013/Cost: compute_cost applies formula correctly
// A013/Cost: from_openai normalizes all token fields
// A013/Cost: from_anthropic normalizes all token fields
// A013/Cost: unknown pricing = 0.0
```

### Frontend (plugins/settings-llm-providers)

```typescript
// A013/UI: manifest with surface=['preferences']
// A013/ProviderList: skeleton while loading
// A013/ProviderList: Connected/No key/Disabled status
// A013/ApiKeyField: masked preview (last 4 chars)
// A013/ApiKeyField: never stores raw key in state
// A013/ModelTable: pinned models sort first
// A013/ModelTable: null cost shows em dash
// A013/BudgetConfig: empty input = null (no limit)
// A013/BudgetEvents: notification toast on warning/exceeded
```

---

## 11. Performance Targets

| Operation | Target | How |
|---|---|---|
| `check_budget()` | < 1ms | Covering index on (provider_id, timestamp) |
| `record_usage()` | < 0.5ms | Single INSERT, WAL mode |
| `get_usage_summary()` | < 10ms | Index scan + GROUP BY |
| `get_daily_trend(30)` | < 5ms | Index scan + DATE grouping |
| 10k batch inserts | < 2s | Transaction wrapping |
| DB size at 600k rows/mo | ~50MB | Compact schema, no BLOBs |

---

## 12. Security

- Raw API keys never in SQLite — only vault key IDs
- SQLite file permissions: 0o600 (owner read/write only)
- Usage records contain no secrets
- Budget blocking happens before network call
- Error messages are generic (no internal paths)
- `PRAGMA secure_delete = ON` for key ref cleanup

---

## 13. Retention & Maintenance

- Default retention: 90 days
- Cleanup runs on app boot (delete + VACUUM if > 30 days since last vacuum)
- User can configure retention in settings
- Export: `get_usage_detail` with full date range → CSV/JSON from frontend
