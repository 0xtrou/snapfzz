import { createTauriBridge } from '@snapfzz/shared';
// Per A013/LLMProviders: model-info types promoted to @snapfzz/shared — import for local use
// and re-export so consumers of settings-llm keep working without import changes.
import type {
  ModelInfo,
  ModelInfoDetails,
  ModelInfoEntry,
  ModelInfoResponse,
  ModelListResponse,
} from '@snapfzz/shared';
export type {
  ModelInfo,
  ModelInfoDetails,
  ModelInfoEntry,
  ModelInfoResponse,
  ModelListResponse,
};

const bridge = createTauriBridge();

// A013/Types: Shared types for LLM operations (settings-specific types below)

export interface ModelDeployment {
  model_name: string;
  litellm_params: {
    model: string;
    api_key: string;
    api_base?: string;
    rpm?: number;
    tpm?: number;
  };
}

export interface RouterSettings {
  routing_strategy: string;
  model_group_alias: Record<string, string>;
  fallbacks: Array<{ model: string; fallbacks: string[] }>;
}

export interface LiteLLMSettings {
  json_logs: boolean;
  turn_off_message_logging: boolean;
  default_key_generate_params: {
    max_budget: number;
    budget_duration: string;
  };
}

export interface GeneralSettings {
  master_key: string;
  database_url?: string;
}

export interface GatewayConfig {
  model_list: ModelDeployment[];
  router_settings: RouterSettings;
  litellm_settings: LiteLLMSettings;
  general_settings: GeneralSettings;
}

export interface KeyGenerateParams {
  models: string[];
  max_budget: number | null;
  budget_duration: string;
  metadata: Record<string, string>;
  key_alias?: string;
  rpm_limit?: number;
  tpm_limit?: number;
}

export interface KeyUpdateParams {
  models?: string[];
  max_budget?: number;
  budget_duration?: string;
  metadata?: Record<string, string>;
  rpm_limit?: number;
  tpm_limit?: number;
}

export interface GeneratedKey {
  key: string;
  key_alias?: string;
}

// A013/Keys: LiteLLM returns varying field names across versions.
// `token` is the key hash, `key` may or may not exist separately.
export interface KeyInfo {
  key?: string;
  token?: string;
  key_name?: string;
  key_alias?: string | null;
  models?: string[];
  spend?: number;
  max_budget?: number;
  budget_duration?: string;
  budget_reset_at?: string | null;
  expires?: string | null;
  user_id?: string;
  team_id?: string;
  metadata?: Record<string, string>;
  created_at?: string;
}

export interface KeyListResponse {
  keys: KeyInfo[];
  total_count?: number;
}

export interface SpendFilters {
  start_date?: string;
  end_date?: string;
  key?: string;
  model?: string;
  user?: string;
  page?: number;
  size?: number;
}

// A013/AuditLog: Matches LiteLLM_SpendLogs PostgreSQL schema exactly.
// Primary timestamp field is startTime (camelCase), not "timestamp".
export interface SpendLog {
  request_id: string;
  call_type?: string;
  api_key: string;
  model: string;
  spend: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  startTime?: string;
  endTime?: string;
  request_duration_ms?: number;
  model_id?: string;
  model_group?: string;
  custom_llm_provider?: string;
  api_base?: string;
  user?: string;
  metadata?: Record<string, unknown>;
  cache_hit?: string;
  cache_key?: string;
  request_tags?: unknown[];
  team_id?: string;
  end_user?: string;
  messages?: unknown;
  response?: unknown;
  proxy_server_request?: unknown;
  status?: string;
  // Some LiteLLM versions return "timestamp" instead of "startTime"
  timestamp?: string;
}

export interface KeySpend {
  key: string;
  spend: number;
}

export interface GlobalSpend {
  total_spend: number;
  by_provider: Record<string, number>;
}

// ModelInfo, ModelInfoDetails, ModelInfoEntry, ModelInfoResponse, ModelListResponse
// are now in @snapfzz/shared/llm — re-exported at the top of this file.

// Custom provider metadata stored in vault as JSON blob
export type CustomProviderVariant = 'openai' | 'anthropic' | 'cohere' | 'mistral' | string;

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  variant: CustomProviderVariant;
  // API key stored in provider config so user does not re-enter each session.
  // LiteLLM encrypts the key in its DB once models are imported.
  apiKey?: string;
}

// A013/Fetch: Helper to call LiteLLM APIs directly via fetch

async function litellmFetch(
  url: string,
  masterKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${masterKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res;
}

// A013/Config: Get LiteLLM base URL from backend settings

export async function getBaseUrl(): Promise<string> {
  return bridge.invoke<string>('llm_get_base_url', {});
}

// A013/Config: Get LiteLLM master key from vault

export async function getMasterKey(): Promise<string> {
  return bridge.invoke<string>('llm_get_master_key', {});
}

// A013/Config: Config management hooks

export async function saveConfig(
  config: GatewayConfig,
  dataDir: string,
): Promise<void> {
  await bridge.invoke<void>('llm_save_config', {
    config,
    dataDir,
  });
}

export async function getConfigPath(dataDir: string): Promise<string> {
  return bridge.invoke<string>('llm_get_config_path', {
    dataDir,
  });
}

// A013/Keys: Virtual key management via direct LiteLLM fetch

export async function generateKey(
  baseUrl: string,
  masterKey: string,
  params: KeyGenerateParams,
): Promise<GeneratedKey> {
  const res = await litellmFetch(`${baseUrl}/key/generate`, masterKey, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function listKeys(
  baseUrl: string,
  masterKey: string,
  page?: number,
  size?: number,
): Promise<KeyListResponse> {
  const query = new URLSearchParams();
  if (page != null) query.set('page', String(page));
  if (size != null) query.set('size', String(size));
  const qs = query.toString();
  const url = `${baseUrl}/key/list${qs ? `?${qs}` : ''}`;
  const res = await litellmFetch(url, masterKey);
  const data = await res.json();
  // A013/Keys: LiteLLM returns either {keys: [...]} or a flat array — handle both
  if (Array.isArray(data)) {
    return { keys: data, total_count: data.length };
  }
  return { keys: data.keys ?? [], total_count: data.total_count };
}

// A013/Keys: /key/list returns minimal data (no alias, models, budget_duration).
// Fetch /key/info per key in parallel to get the full picture.
export async function listKeysWithInfo(
  baseUrl: string,
  masterKey: string,
): Promise<KeyListResponse> {
  // /key/list returns a flat array of token hash strings (not objects).
  // Fetch /key/info per token in parallel to get the full key data.
  const res = await litellmFetch(`${baseUrl}/key/list`, masterKey);
  const data = await res.json();
  const rawList: unknown[] = Array.isArray(data) ? data : (data.keys ?? []);

  // Extract tokens — may be plain strings or objects with a token field
  const tokens: string[] = rawList.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      return (obj.token ?? obj.key ?? obj.key_hash ?? '') as string;
    }
    return '';
  }).filter(Boolean);

  if (tokens.length === 0) return { keys: [], total_count: 0 };

  const infoResults = await Promise.allSettled(
    tokens.map((token) => getKeyInfo(baseUrl, masterKey, token)),
  );

  const keys: KeyInfo[] = infoResults.map((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      const raw = result.value as Record<string, unknown>;
      // /key/info may wrap in { key: "...", info: {...} } or return flat
      const keyData = (raw.info && typeof raw.info === 'object' ? raw.info : raw) as KeyInfo;
      return { ...keyData, token: tokens[i] };
    }
    return { token: tokens[i] } as KeyInfo;
  });

  return { keys, total_count: keys.length };
}

export async function deleteKey(
  baseUrl: string,
  masterKey: string,
  key: string,
): Promise<boolean> {
  const res = await litellmFetch(`${baseUrl}/key/delete`, masterKey, {
    method: 'POST',
    body: JSON.stringify({ keys: [key] }),
  });
  const data = await res.json();
  return !!data;
}

export async function getKeyInfo(
  baseUrl: string,
  masterKey: string,
  key: string,
): Promise<KeyInfo> {
  const res = await litellmFetch(`${baseUrl}/key/info?key=${encodeURIComponent(key)}`, masterKey);
  return res.json();
}

export async function updateKey(
  baseUrl: string,
  masterKey: string,
  key: string,
  params: KeyUpdateParams,
): Promise<KeyInfo> {
  const res = await litellmFetch(`${baseUrl}/key/update`, masterKey, {
    method: 'POST',
    body: JSON.stringify({ key, ...params }),
  });
  return res.json();
}

// A013/Spend: Spend tracking via direct LiteLLM fetch

export async function getSpendLogs(
  baseUrl: string,
  masterKey: string,
  filters: SpendFilters,
): Promise<SpendLog[]> {
  const query = new URLSearchParams();
  if (filters.start_date) query.set('start_date', filters.start_date);
  if (filters.end_date) query.set('end_date', filters.end_date);
  if (filters.key) query.set('key', filters.key);
  if (filters.model) query.set('model', filters.model);
  if (filters.user) query.set('user', filters.user);
  if (filters.page != null) query.set('page', String(filters.page));
  if (filters.size != null) query.set('size', String(filters.size));
  const qs = query.toString();
  const url = `${baseUrl}/spend/logs${qs ? `?${qs}` : ''}`;
  const res = await litellmFetch(url, masterKey);
  return res.json();
}

export async function getKeySpend(
  baseUrl: string,
  masterKey: string,
  key: string,
): Promise<KeySpend> {
  const res = await litellmFetch(
    `${baseUrl}/spend/key?key=${encodeURIComponent(key)}`,
    masterKey,
  );
  return res.json();
}

export async function getGlobalSpend(
  baseUrl: string,
  masterKey: string,
): Promise<GlobalSpend> {
  const res = await litellmFetch(`${baseUrl}/global/spend`, masterKey);
  return res.json();
}

// A013/Analytics: Server-side aggregated spend report — no client-side computation needed.
// GET /global/spend/report?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&group_by=team|customer
export interface SpendReportEntry {
  group_by?: string;
  spend: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  api_requests?: number;
  model?: string;
  provider?: string;
  // Nested model breakdown when group_by is used
  breakdown?: Record<string, {
    spend: number;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    api_requests: number;
  }>;
}

export async function getSpendReport(
  baseUrl: string,
  masterKey: string,
  startDate?: string,
  endDate?: string,
  groupBy?: string,
): Promise<SpendReportEntry[]> {
  const query = new URLSearchParams();
  if (startDate) query.set('start_date', startDate);
  if (endDate) query.set('end_date', endDate);
  if (groupBy) query.set('group_by', groupBy);
  const qs = query.toString();
  const res = await litellmFetch(`${baseUrl}/global/spend/report${qs ? `?${qs}` : ''}`, masterKey);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? data.report ?? [data]);
}

// A013/Analytics: GET /spend/logs?summarize=true returns aggregated summary
export interface SpendSummary {
  total_spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  api_requests: number;
  per_model?: Record<string, { spend: number; total_tokens: number; prompt_tokens: number; completion_tokens: number; api_requests: number }>;
  per_provider?: Record<string, { spend: number; total_tokens: number; api_requests: number }>;
  per_api_key?: Record<string, { spend: number; total_tokens: number; api_requests: number }>;
}

export async function getSpendSummary(
  baseUrl: string,
  masterKey: string,
  startDate?: string,
  endDate?: string,
): Promise<SpendSummary> {
  const query = new URLSearchParams();
  query.set('summarize', 'true');
  if (startDate) query.set('start_date', startDate);
  if (endDate) query.set('end_date', endDate);
  const url = `${baseUrl}/spend/logs?${query.toString()}`;
  const res = await litellmFetch(url, masterKey);
  return res.json();
}

// A013/Analytics: GET /user/daily/activity for time-series data
export interface DailyActivity {
  date: string;
  model?: string;
  provider?: string;
  api_key?: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  spend: number;
  api_requests: number;
}

export async function getDailyActivity(
  baseUrl: string,
  masterKey: string,
  startDate: string,
  endDate: string,
): Promise<DailyActivity[]> {
  const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
  const res = await litellmFetch(`${baseUrl}/user/daily/activity?${query.toString()}`, masterKey);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? data.daily_activity ?? []);
}

export async function getModels(
  baseUrl: string,
  masterKey: string,
): Promise<ModelListResponse> {
  const res = await litellmFetch(`${baseUrl}/v1/models`, masterKey);
  return res.json();
}

export async function getModelInfo(
  baseUrl: string,
  masterKey: string,
): Promise<ModelInfoResponse> {
  const res = await litellmFetch(`${baseUrl}/v1/model/info`, masterKey);
  return res.json();
}

// A013/Discovery: Discover models from a provider's native API.
// The frontend passes the API key directly — it is not read from the vault.

export interface DiscoveredModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export interface DiscoverModelsResponse {
  data: DiscoveredModel[];
}

export async function discoverModels(
  apiKey: string,
  baseUrl: string,
): Promise<DiscoverModelsResponse> {
  // Call the provider's /v1/models endpoint directly via fetch.
  const base = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  const res = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Provider returned ${res.status}: ${body}`);
  }
  return res.json();
}

export interface ImportModelOpts {
  weight?: number;
  rpm?: number;
  tpm?: number;
  order?: number;
  isCombo?: boolean;
}

/**
 * Import a model into LiteLLM via POST /model/new.
 * Pure frontend — calls LiteLLM directly using the master key.
 */
export async function importModel(
  litellmBaseUrl: string,
  masterKey: string,
  providerId: string,
  modelId: string,
  apiKey: string,
  modelName?: string,
  apiBase?: string,
  variant?: string,
  opts?: ImportModelOpts,
): Promise<Record<string, unknown>> {
  // Build model names:
  // model_name = <provider-slug>/<model-id> for unique routing
  // litellm_params.model = <sdk-prefix>/<model-id> for LiteLLM SDK routing
  const providerSlug = providerId.startsWith('custom-')
    ? providerId.slice('custom-'.length)
    : providerId;
  const sdkPrefix = variant ?? 'openai';
  const litellmModel = `${sdkPrefix}/${modelId}`;
  const displayName = modelName ?? `${providerSlug}/${modelId}`;

  const litellmParams: Record<string, unknown> = {
    model: litellmModel,
    api_key: apiKey,
    api_base: apiBase,
  };
  if (opts?.weight != null) litellmParams.weight = opts.weight;
  if (opts?.rpm != null) litellmParams.rpm = opts.rpm;
  if (opts?.tpm != null) litellmParams.tpm = opts.tpm;

  const modelInfo: Record<string, unknown> = {
    snapfzz_provider_id: providerId,
  };
  if (opts?.isCombo) modelInfo.snapfzz_combo = true;
  if (opts?.order != null) modelInfo.order = opts.order;

  const res = await litellmFetch(`${litellmBaseUrl}/model/new`, masterKey, {
    method: 'POST',
    body: JSON.stringify({
      model_name: displayName,
      litellm_params: litellmParams,
      model_info: modelInfo,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LiteLLM returned ${res.status}: ${body}`);
  }
  return res.json();
}

// A013/ModelDelete: Remove a model from LiteLLM via POST /model/delete
export async function deleteModel(baseUrl: string, masterKey: string, modelId: string): Promise<void> {
  const res = await litellmFetch(`${baseUrl}/model/delete`, masterKey, {
    method: 'POST',
    body: JSON.stringify({ id: modelId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to delete model: ${body}`);
  }
}

// Custom provider config persistence via localStorage

const CUSTOM_PROVIDERS_KEY = 'snapfzz:custom_providers';

export async function loadCustomProviders(): Promise<CustomProvider[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_PROVIDERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomProvider[];
  } catch {
    return [];
  }
}

export async function saveCustomProviders(
  providers: CustomProvider[],
): Promise<void> {
  localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(providers));
}

// A013/Routing: Config read/write for router_settings via API
// /router/settings returns { current_values: { routing_strategy, fallbacks, ... } }.
// We reshape it to { router_settings: current_values } to match what RoutingTab expects.

export async function getConfig(baseUrl: string, masterKey: string): Promise<Record<string, unknown>> {
  const res = await litellmFetch(`${baseUrl}/router/settings`, masterKey);
  const data = await res.json() as Record<string, unknown>;
  const current = (data['current_values'] ?? {}) as Record<string, unknown>;
  return { router_settings: current };
}

export async function updateConfig(baseUrl: string, masterKey: string, settings: Record<string, unknown>): Promise<unknown> {
  const res = await litellmFetch(`${baseUrl}/config/update`, masterKey, {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getModelGroups(baseUrl: string, masterKey: string): Promise<string[]> {
  const res = await litellmFetch(`${baseUrl}/model_group/info`, masterKey);
  const data = await res.json() as Record<string, unknown> | unknown[];
  // /model_group/info returns { data: [{ model_group: "..." }, ...] }
  const items: unknown[] = Array.isArray(data) ? data : (Array.isArray((data as Record<string, unknown>)['data']) ? (data as Record<string, unknown>)['data'] as unknown[] : []);
  return items
    .map((g) => {
      if (g && typeof g === 'object') {
        const obj = g as Record<string, unknown>;
        return (obj['model_group'] ?? obj['name']) as string | undefined;
      }
      return String(g);
    })
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}