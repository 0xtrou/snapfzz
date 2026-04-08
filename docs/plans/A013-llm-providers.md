# A013 — LLM Providers

Settings plugin that manages AI provider configuration, model discovery, usage metering, and budget enforcement.

## Decision

Provider configuration with multi-account support and SQLite-backed usage metering. Each provider (OpenAI, Anthropic, etc.) can have **multiple API accounts** — each account is one API key with its own name, budget, and usage tracking.

API keys stored in A011 Secret Vault (key IDs only, never raw keys in DB). Usage stored in SQLite with pre-optimized indexes for 20k+ requests/day. Budget enforcement blocks calls per-account when limits exceeded.

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
    enabled     INTEGER NOT NULL DEFAULT 1,
    builtin     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,   -- Unix ms
    updated_at  INTEGER NOT NULL    -- Unix ms
);

-- Each provider can have multiple API accounts (keys)
CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,           -- UUIDv4
    provider_id     TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,              -- "Personal", "Work", "Team Budget"
    api_key_ref     TEXT NOT NULL,              -- A011 vault key ID, never raw key
    is_default      INTEGER NOT NULL DEFAULT 0, -- one default per provider
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
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
    account_id            TEXT NOT NULL,     -- which API key was used
    model                 TEXT NOT NULL,
    session_id            TEXT,
    combo_id              TEXT,              -- NULL if direct call, combo ID if routed
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

-- Budgets are per-account, not per-provider
CREATE TABLE IF NOT EXISTS budgets (
    account_id          TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    daily_limit_usd     REAL,           -- NULL = no limit
    monthly_limit_usd   REAL,           -- NULL = no limit
    warn_at_percent     TEXT NOT NULL DEFAULT '[80,90]',  -- JSON array
    block_when_exceeded INTEGER NOT NULL DEFAULT 1
);
```

### Indexes — Pre-Optimized for 20k req/day

```sql
-- Budget check: SUM cost for today/month per account (called before EVERY API call)
-- At 20k req/day = ~600k rows/month. This index makes budget check O(log n).
CREATE INDEX IF NOT EXISTS idx_usage_budget_check
    ON usage(account_id, timestamp)
    WHERE status = 'success';

-- Usage summary: aggregate cost by provider + date range (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_usage_summary
    ON usage(provider_id, timestamp, cost_usd);

-- Usage by account: per-account spend breakdown
CREATE INDEX IF NOT EXISTS idx_usage_by_account
    ON usage(account_id, timestamp, cost_usd);

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

-- Account lookup: fast account list per provider
CREATE INDEX IF NOT EXISTS idx_accounts_provider
    ON accounts(provider_id, is_default DESC, name);
```

### Query Patterns (Pre-Optimized)

```sql
-- Budget check: daily spend per account (called before every API call, must be < 1ms)
-- Uses idx_usage_budget_check covering index
SELECT COALESCE(SUM(cost_usd), 0.0) AS daily_spend
FROM usage
WHERE account_id = ?1
  AND timestamp >= ?2    -- start of today UTC
  AND status = 'success';

-- Budget check: monthly spend per account
SELECT COALESCE(SUM(cost_usd), 0.0) AS monthly_spend
FROM usage
WHERE account_id = ?1
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

-- Usage summary: per-account breakdown within a provider
SELECT u.account_id, a.name AS account_name,
       COUNT(*) AS request_count,
       SUM(u.cost_usd) AS total_cost,
       SUM(u.input_tokens + u.output_tokens) AS total_tokens
FROM usage u
JOIN accounts a ON a.id = u.account_id
WHERE u.provider_id = ?1
  AND u.timestamp BETWEEN ?2 AND ?3
GROUP BY u.account_id
ORDER BY total_cost DESC;

-- Usage detail: paginated list (scrollable table)
SELECT u.*, a.name AS account_name
FROM usage u
LEFT JOIN accounts a ON a.id = u.account_id
WHERE u.provider_id = COALESCE(?1, u.provider_id)
  AND u.timestamp BETWEEN ?2 AND ?3
ORDER BY u.timestamp DESC
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

-- Account spend trend: per-account daily spend
SELECT DATE(timestamp / 1000, 'unixepoch') AS day,
       account_id,
       SUM(cost_usd) AS daily_cost
FROM usage
WHERE account_id = ?1
  AND timestamp >= ?2
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
    pub enabled: bool,
    pub builtin: bool,
    pub created_at: u64,
    pub updated_at: u64,
    pub accounts: Vec<Account>,  // loaded via JOIN, not stored inline
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,              // UUIDv4
    pub provider_id: String,
    pub name: String,            // "Personal", "Work", "Team Budget"
    pub api_key_ref: String,     // A011 vault key ID
    pub is_default: bool,
    pub enabled: bool,
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
    ")?;
    Ok(())
}
```

Accounts are added by the user — no seed accounts. Built-in providers start with 0 accounts until user adds an API key.

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

## 4. Model Combos (Routing)

A combo groups multiple models (potentially across different providers/accounts) behind a single virtual endpoint. When the agent calls a combo, the router picks which real model to use based on the selected strategy.

### Combo Schema

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCombo {
    pub id: String,                  // UUIDv4
    pub name: String,               // "Fast Coding", "Budget Mix"
    pub strategy: RoutingStrategy,
    pub models: Vec<ComboModel>,
    pub enabled: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComboModel {
    pub provider_id: String,
    pub account_id: String,
    pub model_id: String,            // "gpt-4o", "claude-sonnet-4-20250514"
    pub weight: u32,                 // for Weighted strategy (0-100)
    pub priority: u32,               // for Priority/Fallback (lower = higher priority)
    pub max_daily_requests: Option<u64>,  // per-model cap within combo
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum RoutingStrategy {
    Priority,       // sequential fallback: try model 1, if fails try model 2, etc.
    Weighted,       // distribute by weight percentage (e.g. 70% gpt-4o, 30% claude)
    RoundRobin,     // rotate evenly across models
    Random,         // random selection
    LeastUsed,      // route to model with least requests today
    CostOptimized,  // pick cheapest model that fits the request
    Fallback,       // use primary until budget/rate exceeded, then fallback
}
```

### SQL Tables

```sql
CREATE TABLE IF NOT EXISTS combos (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    strategy    TEXT NOT NULL CHECK(strategy IN (
        'priority', 'weighted', 'round-robin', 'random',
        'least-used', 'cost-optimized', 'fallback'
    )),
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS combo_models (
    combo_id            TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
    provider_id         TEXT NOT NULL REFERENCES providers(id),
    account_id          TEXT NOT NULL REFERENCES accounts(id),
    model_id            TEXT NOT NULL,
    weight              INTEGER NOT NULL DEFAULT 0,
    priority            INTEGER NOT NULL DEFAULT 0,
    max_daily_requests  INTEGER,
    PRIMARY KEY (combo_id, provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_combo_models_combo
    ON combo_models(combo_id, priority, weight DESC);
```

### Routing Logic

```rust
pub fn route(conn: &Connection, combo: &ModelCombo) -> Result<ResolvedModel, LlmError> {
    let candidates: Vec<ComboModel> = combo.models.iter()
        .filter(|m| is_within_daily_cap(conn, m))
        .filter(|m| check_budget(conn, &m.account_id)?.is_allowed())
        .collect();

    if candidates.is_empty() {
        return Err(LlmError::AllModelsExhausted(combo.id.clone()));
    }

    match combo.strategy {
        RoutingStrategy::Priority => {
            // sorted by priority, return first available
            Ok(candidates.into_iter().min_by_key(|m| m.priority).unwrap().into())
        }
        RoutingStrategy::Weighted => {
            // weighted random selection
            let total: u32 = candidates.iter().map(|m| m.weight).sum();
            let roll = rand(0..total);
            // ... pick based on cumulative weights
        }
        RoutingStrategy::RoundRobin => {
            // track last-used index in memory, rotate
        }
        RoutingStrategy::Random => {
            // uniform random from candidates
        }
        RoutingStrategy::LeastUsed => {
            // query usage count today per model, pick lowest
        }
        RoutingStrategy::CostOptimized => {
            // sort by input_cost_per_token ASC, pick cheapest
        }
        RoutingStrategy::Fallback => {
            // use priority[0] until budget exceeded, then next
        }
    }
}
```

### ResolvedModel

The output of routing — tells the caller exactly which provider/account/model to use:

```rust
pub struct ResolvedModel {
    pub provider_id: String,
    pub account_id: String,
    pub model_id: String,
    pub base_url: String,       // from provider
    pub api_key_ref: String,    // from account, for vault lookup
    pub kind: ProviderKind,     // for auth header construction
    pub combo_id: Option<String>, // if routed through a combo
}
```

### Tauri Commands (Combos)

```rust
#[tauri::command] async fn get_combos() -> Result<Vec<ModelCombo>, String>
#[tauri::command] async fn save_combo(combo: ModelCombo) -> Result<(), String>
#[tauri::command] async fn delete_combo(combo_id: String) -> Result<(), String>
#[tauri::command] async fn test_combo(combo_id: String) -> Result<ResolvedModel, String>
```

### UI Layout (Combo Section)

```
┌──────────────────────────────────────────────────────────┐
│ Model Combos                               [Add Combo]   │
├──────────────────────────────────────────────────────────┤
│ ▼ Fast Coding                              Priority      │
│   1. gpt-4o (OpenAI/Personal)                            │
│   2. claude-sonnet-4-20250514 (Anthropic/Work)                  │
│   3. gpt-4o-mini (OpenAI/Personal)          [fallback]   │
├──────────────────────────────────────────────────────────┤
│ ▶ Budget Mix                               Weighted      │
│   gpt-4o-mini 70% / claude-haiku 30%                     │
├──────────────────────────────────────────────────────────┤
│ ▶ Round Robin Pool                         Round Robin   │
│   3 models across 2 providers                            │
└──────────────────────────────────────────────────────────┘
```

### Tests (Combos)

```rust
// A013/Combo: save_combo persists with strategy
// A013/Combo: delete_combo cascades to combo_models
// A013/Combo: route Priority returns first available model
// A013/Combo: route Priority skips budget-exceeded models
// A013/Combo: route Weighted distributes within 5% of target weights
// A013/Combo: route RoundRobin cycles through models evenly
// A013/Combo: route CostOptimized picks cheapest available
// A013/Combo: route Fallback switches on budget exhaustion
// A013/Combo: route returns error when all models exhausted
// A013/Combo: route respects max_daily_requests per model
```

---

## 5. Audit Log Dashboard

A real-time request log — every LLM API call recorded and browsable. Inspired by LiteLLM's audit log UI, adapted to Snapfzz's Ant Design system.

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ LLM Providers › Request Logs                              [Export CSV]  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ [● Recording]  [Search model, provider, account, combo...]              │
│                                                                          │
│ [All Accounts ▾]  [All Providers ▾]  [All Models ▾]  [Newest ▾]         │
│                                                                          │
│  300 total   285 OK   12 combo   3 errors   300 shown       [↻]        │
│                                                                          │
│ [All] [Errors] [Success] [Combo]    [CLAUDE] [OPENAI] [OLLAMA]          │
│                                                                          │
│ COLUMNS: Status Model Requested Provider Account API Key Combo          │
│          Tokens Duration Time                                            │
├──────────────────────────────────────────────────────────────────────────┤
│ STATUS  MODEL         REQUESTED          PROVIDER  ACCOUNT  API KEY     │
│         COMBO         TOKENS             DURATION  TIME                  │
├──────────────────────────────────────────────────────────────────────────┤
│ [200]   gpt-4o        codex/gpt-4o       OPENAI    Personal  ●●●sk-12  │
│         —             I: 1,204  O: 342   2.1s      14:23:05            │
├─────────────────────────────────────────────────────────────────────────┤
│ [200]   claude-sonnet claude/claude-son.  CLAUDE    Work      ●●●sk-ab  │
│         fast-coding   I: 52,891 O: 1,204 8.3s      14:22:58            │
├─────────────────────────────────────────────────────────────────────────┤
│ [429]   gpt-4o-mini   codex/gpt-4o-mini  OPENAI    Personal  ●●●sk-12  │
│         budget-mix    I: 0      O: 0     0.1s      14:22:51            │
├─────────────────────────────────────────────────────────────────────────┤
│ [500]   claude-haiku  claude/claude-hai.  CLAUDE    Work      ●●●sk-ab  │
│         —             I: 892    O: 0     12.4s     14:22:44            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Features

**Filters (top bar):**
- Full-text search across model, provider, account, combo, error code
- Dropdown filters: Account, Provider, Model (multi-select)
- Sort: Newest, Oldest, Slowest, Most Tokens, Highest Cost
- Status filter tabs: All / Errors / Success / Combo-routed

**Provider badges:** Colored tags per provider (CLAUDE = purple, OPENAI = green, OLLAMA = gray). Colors from provider config.

**Stats bar:** Live counters — total requests, OK count, combo-routed count, error count, shown count. Updates as filters change.

**Column toggles:** User can show/hide columns. Persisted in settings.

**Row detail:** Click a row to expand inline detail view:
```
┌─────────────────────────────────────────────────────────┐
│ Request Detail                                           │
│                                                          │
│ ID:          01926f3a-7b2c-7def-8123-456789abcdef        │
│ Session:     chat-session-abc123                          │
│ Timestamp:   2026-04-08 14:23:05.123 UTC                 │
│                                                          │
│ Tokens:                                                  │
│   Input: 1,204   Output: 342   Cache Read: 800           │
│   Cache Create: 0   Reasoning: 0                         │
│                                                          │
│ Cost:        $0.0043                                     │
│ Latency:     2,134ms                                     │
│ Status:      200                                         │
│ Error:       —                                           │
│                                                          │
│ Combo:       fast-coding (Priority strategy)              │
│ Resolved:    gpt-4o via OpenAI/Personal                   │
└─────────────────────────────────────────────────────────┘
```

**Export:** CSV download of filtered results (all columns).

**Recording indicator:** Green dot = actively recording new requests. Can be paused.

### SQL Support

The audit log reads from the `usage` table with JOINs:

```sql
-- Audit log: filtered, paginated, with provider/account names
SELECT
    u.id,
    u.timestamp,
    u.status,
    u.model,
    u.provider_id,
    p.name AS provider_name,
    p.kind AS provider_kind,
    u.account_id,
    a.name AS account_name,
    SUBSTR(a.api_key_ref, -4) AS api_key_hint,
    u.input_tokens,
    u.output_tokens,
    u.cache_read_tokens,
    u.reasoning_tokens,
    u.cost_usd,
    u.latency_ms,
    u.error_code,
    u.session_id,
    u.combo_id
FROM usage u
LEFT JOIN providers p ON p.id = u.provider_id
LEFT JOIN accounts a ON a.id = u.account_id
WHERE (?1 IS NULL OR u.provider_id = ?1)
  AND (?2 IS NULL OR u.account_id = ?2)
  AND (?3 IS NULL OR u.model = ?3)
  AND (?4 IS NULL OR u.status = ?4)
  AND u.timestamp BETWEEN ?5 AND ?6
ORDER BY u.timestamp DESC
LIMIT ?7 OFFSET ?8;

-- Stats counters for current filter
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS ok_count,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count,
    SUM(CASE WHEN combo_id IS NOT NULL THEN 1 ELSE 0 END) AS combo_count
FROM usage
WHERE (?1 IS NULL OR provider_id = ?1)
  AND (?2 IS NULL OR account_id = ?2)
  AND timestamp BETWEEN ?3 AND ?4;

-- Full-text search (requires idx_usage_search)
SELECT u.* FROM usage u
WHERE u.model LIKE '%' || ?1 || '%'
   OR u.provider_id LIKE '%' || ?1 || '%'
   OR u.error_code LIKE '%' || ?1 || '%'
ORDER BY u.timestamp DESC
LIMIT 100;
```

### Additional Index for Audit Log

```sql
-- Full-text search support
CREATE INDEX IF NOT EXISTS idx_usage_search
    ON usage(model, provider_id, status);

-- Combo filter
CREATE INDEX IF NOT EXISTS idx_usage_combo
    ON usage(combo_id, timestamp)
    WHERE combo_id IS NOT NULL;
```

### Tauri Commands (Audit Log)

```rust
#[tauri::command] async fn get_audit_log(
    provider_id: Option<String>,
    account_id: Option<String>,
    model: Option<String>,
    status: Option<String>,
    search: Option<String>,
    sort: AuditSort,
    period: UsagePeriod,
    page: u32,
    page_size: u32,
) -> Result<AuditLogPage, String>

#[tauri::command] async fn get_audit_stats(
    provider_id: Option<String>,
    account_id: Option<String>,
    period: UsagePeriod,
) -> Result<AuditStats, String>

#[tauri::command] async fn get_audit_detail(id: String) -> Result<AuditDetail, String>

#[tauri::command] async fn export_audit_csv(
    provider_id: Option<String>,
    account_id: Option<String>,
    period: UsagePeriod,
) -> Result<String, String>  // returns file path
```

### Response Types

```rust
#[derive(Serialize)]
pub struct AuditLogPage {
    pub rows: Vec<AuditRow>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Serialize)]
pub struct AuditRow {
    pub id: String,
    pub timestamp: u64,
    pub status: String,
    pub model: String,
    pub requested: String,           // "provider/model" display format
    pub provider_name: String,
    pub provider_kind: String,
    pub account_name: String,
    pub api_key_hint: String,        // last 4 chars only
    pub combo_name: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
    pub latency_ms: u64,
    pub error_code: Option<String>,
}

#[derive(Serialize)]
pub struct AuditStats {
    pub total: u64,
    pub ok_count: u64,
    pub error_count: u64,
    pub combo_count: u64,
}

pub enum AuditSort {
    Newest, Oldest, Slowest, MostTokens, HighestCost,
}
```

### Tests (Audit Log)

```rust
// A013/AuditLog: get_audit_log returns paginated rows with JOINed names
// A013/AuditLog: get_audit_log filters by provider_id
// A013/AuditLog: get_audit_log filters by account_id
// A013/AuditLog: get_audit_log filters by status
// A013/AuditLog: get_audit_log search matches model name
// A013/AuditLog: get_audit_log sort Slowest orders by latency DESC
// A013/AuditLog: get_audit_stats returns correct counters
// A013/AuditLog: get_audit_detail returns full record with token breakdown
// A013/AuditLog: export_audit_csv writes valid CSV file
// A013/AuditLog: api_key_hint shows only last 4 chars
```

### Frontend Component

```
plugins/settings-llm-providers/src/
├── AuditLogTab.tsx          (main audit log view)
├── AuditFilters.tsx         (filter bar + search + dropdowns)
├── AuditTable.tsx           (virtualized table rows)
├── AuditDetailDrawer.tsx    (expandable row detail)
└── AuditStatsBar.tsx        (live counter badges)
```

Uses Ant Design `Table` with virtual scroll for large datasets, `Tag` for provider badges, `Input.Search` for full-text search, `Select` for filter dropdowns, `Segmented` for status tabs.

---

## 6. Usage Metering

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

## 7. Budget Enforcement

### Budget Check (called before every API call)

Budgets are per-account, not per-provider. Each API key has its own spend limits.

```rust
pub enum BudgetDecision {
    Allow,
    Warn { period: String, percent_used: f64, spent: f64, limit: f64 },
    Block { period: String, spent: f64, limit: f64 },
}

pub fn check_budget(conn: &Connection, account_id: &str) -> Result<BudgetDecision, LlmError> {
    let budget = get_budget(conn, account_id)?;

    if let Some(daily_limit) = budget.daily_limit_usd {
        let daily_spend = daily_spend(conn, account_id)?;
        if daily_spend >= daily_limit && budget.block_when_exceeded {
            return Ok(BudgetDecision::Block { ... });
        }
        // check warn thresholds
    }

    if let Some(monthly_limit) = budget.monthly_limit_usd {
        let monthly_spend = monthly_spend(conn, account_id)?;
        if monthly_spend >= monthly_limit && budget.block_when_exceeded {
            return Ok(BudgetDecision::Block { ... });
        }
        // check warn thresholds
    }

    Ok(BudgetDecision::Allow)
}
```

### Performance Target

`check_budget()` must complete in **< 1ms** at 600k rows/month. The `idx_usage_budget_check` covering index on `(account_id, timestamp)` ensures this — SQLite reads only the index, never touches the table.

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

## 8. Tauri Commands

```rust
// Provider management
#[tauri::command] async fn get_providers() -> Result<Vec<Provider>, String>
#[tauri::command] async fn save_provider(provider: Provider) -> Result<(), String>
#[tauri::command] async fn delete_provider(provider_id: String) -> Result<(), String>
#[tauri::command] async fn test_provider_connection(provider_id: String, account_id: String) -> Result<ConnectionTestResult, String>

// Account management (multi-key per provider)
#[tauri::command] async fn add_account(provider_id: String, name: String, api_key: String) -> Result<Account, String>
#[tauri::command] async fn update_account(account_id: String, name: String) -> Result<(), String>
#[tauri::command] async fn delete_account(account_id: String) -> Result<(), String>
#[tauri::command] async fn set_default_account(provider_id: String, account_id: String) -> Result<(), String>
#[tauri::command] async fn rotate_account_key(account_id: String, new_api_key: String) -> Result<(), String>

// Model discovery (uses default account's key)
#[tauri::command] async fn discover_models(provider_id: String) -> Result<Vec<CachedModel>, String>
#[tauri::command] async fn get_provider_models(provider_id: String) -> Result<Vec<CachedModel>, String>
#[tauri::command] async fn toggle_model_pin(provider_id: String, model_id: String, pinned: bool) -> Result<(), String>

// Usage (filterable by provider or account)
#[tauri::command] async fn get_usage_summary(provider_id: Option<String>, account_id: Option<String>, period: UsagePeriod) -> Result<UsageSummary, String>
#[tauri::command] async fn get_usage_detail(provider_id: Option<String>, account_id: Option<String>, period: UsagePeriod, page: u32, page_size: u32) -> Result<UsageDetailPage, String>
#[tauri::command] async fn get_usage_by_model(provider_id: String, period: UsagePeriod) -> Result<Vec<ModelUsage>, String>
#[tauri::command] async fn get_daily_trend(provider_id: String, days: u32) -> Result<Vec<DailyTrend>, String>
#[tauri::command] async fn get_account_usage(account_id: String, period: UsagePeriod) -> Result<AccountUsage, String>

// Budget (per-account)
#[tauri::command] async fn save_account_budget(account_id: String, budget: ProviderBudget) -> Result<(), String>
```

---

## 9. Settings Plugin UI

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
│ ◉ OpenAI       2 accounts     [↻]                        │
│ ○ Anthropic    0 accounts     [↻]                        │
│ ○ Ollama       1 account      [↻]                        │
├──────────────────────────────────────────────────────────┤
│ ▼ OpenAI                                                 │
│ Base URL   https://api.openai.com/v1                     │
│                                                          │
│ API Accounts                              [Add Account]  │
│ ┌────────────────────────────────────────────────────┐   │
│ │ ★ Personal     ●●●●sk-1234   ● Connected  [Test]  │   │
│ │   Daily: $5/$10   Monthly: $42/$100                │   │
│ │                              [Rotate Key] [Delete] │   │
│ ├────────────────────────────────────────────────────┤   │
│ │   Work          ●●●●sk-5678   ● Connected  [Test]  │   │
│ │   Daily: $12/$50  Monthly: $89/$500                │   │
│ │                   [Set Default] [Rotate Key] [Delete]│   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ Models (47)                            [★ Pinned] [↻]   │
│ ┌────────────┬─────────┬──────────┬──────────┐          │
│ │ Model      │ Context │ Input    │ Output   │          │
│ ├────────────┼─────────┼──────────┼──────────┤          │
│ │ ★ gpt-4o   │ 128K    │ $2.50/M  │ $10.00/M │          │
│ │   gpt-4o-mini│128K  │ $0.15/M  │ $0.60/M  │          │
│ └────────────┴─────────┴──────────┴──────────┘          │
├──────────────────────────────────────────────────────────┤
│ Usage This Month                       [View Report]     │
│ Personal: $4.32   Work: $12.07                           │
└──────────────────────────────────────────────────────────┘
```

---

## 10. Zone Boundaries

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

## 11. Dependencies

- `rusqlite` with `bundled` feature (ships SQLite with binary)
- `uuid` with `v7` feature (time-sortable IDs)
- `reqwest` (model discovery HTTP)
- `serde` + `serde_json` (serialization)
- A011 (Secret Vault) — API key storage
- A008 (Budget Registry) — LlmSpend resource class
- A007 (Preferences) — settingsSections contribution

---

## 12. Tests

### Rust (snapfzz-llm)

```rust
// A013/Db: open_db creates tables and indexes
// A013/Db: seed() inserts built-in providers idempotently
// A013/Db: WAL mode active after open

// A013/Provider: save_provider() inserts new row
// A013/Provider: save_provider() updates existing row
// A013/Provider: delete_provider() errors for builtin
// A013/Provider: delete_provider() cascades to accounts, models, and budgets

// A013/Account: add_account creates account with vault key ref
// A013/Account: add_account first account becomes default
// A013/Account: set_default_account clears previous default
// A013/Account: delete_account cascades to usage and budgets
// A013/Account: delete_account errors for last remaining account
// A013/Account: rotate_account_key updates vault ref atomically
// A013/Account: api_key_ref stored, raw key never in db

// A013/Discovery: Bearer token for openai-compat
// A013/Discovery: x-api-key header for anthropic-compat
// A013/Discovery: discover_models replaces old models for provider
// A013/Discovery: uses default account's key for discovery

// A013/Usage: record_usage inserts with UUIDv7 and account_id
// A013/Usage: daily_spend aggregates per-account, not per-provider
// A013/Usage: monthly_spend aggregates per-account
// A013/Usage: get_usage_summary groups by provider
// A013/Usage: get_account_usage returns per-account breakdown
// A013/Usage: get_usage_detail paginates correctly
// A013/Usage: get_usage_by_model groups and sorts by cost
// A013/Usage: get_daily_trend returns 30 days
// A013/Usage: 10k inserts complete in < 2s (batch performance)

// A013/Budget: check_budget per-account returns Allow when no limit
// A013/Budget: check_budget per-account returns Warn at threshold
// A013/Budget: check_budget per-account returns Block when exceeded
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

## 13. Performance Targets

| Operation | Target | How |
|---|---|---|
| `check_budget()` | < 1ms | Covering index on (provider_id, timestamp) |
| `record_usage()` | < 0.5ms | Single INSERT, WAL mode |
| `get_usage_summary()` | < 10ms | Index scan + GROUP BY |
| `get_daily_trend(30)` | < 5ms | Index scan + DATE grouping |
| 10k batch inserts | < 2s | Transaction wrapping |
| DB size at 600k rows/mo | ~50MB | Compact schema, no BLOBs |

---

## 14. Security

- Raw API keys never in SQLite — only vault key IDs
- SQLite file permissions: 0o600 (owner read/write only)
- Usage records contain no secrets
- Budget blocking happens before network call
- Error messages are generic (no internal paths)
- `PRAGMA secure_delete = ON` for key ref cleanup

---

## 15. Retention & Maintenance

- Default retention: 90 days
- Cleanup runs on app boot (delete + VACUUM if > 30 days since last vacuum)
- User can configure retention in settings
- Export: `get_usage_detail` with full date range → CSV/JSON from frontend
