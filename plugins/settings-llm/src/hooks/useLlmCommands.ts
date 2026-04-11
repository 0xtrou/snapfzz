import { createTauriBridge } from '@snapfzz/shared';

const bridge = createTauriBridge();

// A013/Types: Shared types for LLM operations

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
  max_budget: number;
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
  key_alias?: string;
  models?: string[];
  spend?: number;
  max_budget?: number;
  budget_duration?: string;
  expires?: string;
  user_id?: string;
  team_id?: string;
  metadata?: Record<string, string>;
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

export interface SpendLog {
  request_id: string;
  api_key: string;
  model: string;
  spend: number;
  timestamp: string;
  // A013/Analytics: Token breakdown fields returned by LiteLLM spend/logs
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  startTime?: string;
}

export interface KeySpend {
  key: string;
  spend: number;
}

export interface GlobalSpend {
  total_spend: number;
  by_provider: Record<string, number>;
}

export interface ModelInfo {
  id: string;
}

export interface ModelListResponse {
  data: ModelInfo[];
}

// Rich model metadata returned by /v1/model/info
export interface ModelInfoDetails {
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  mode?: string;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_reasoning?: boolean;
  litellm_provider?: string;
}

export interface ModelInfoEntry {
  model_name: string;
  litellm_params?: {
    api_base?: string;
    model?: string;
    api_key?: string;
  };
  model_info: ModelInfoDetails;
}

export interface ModelInfoResponse {
  data: ModelInfoEntry[];
}

// Custom provider metadata stored in vault as JSON blob
export type CustomProviderVariant = 'openai' | 'anthropic';

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  variant: CustomProviderVariant;
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

// A013/ModelCatalog: Full model catalog bundled in the backend (2656 models, 108 providers).
// Returned as a Record<modelId, ModelInfoDetails>. Frontend caches in memory after first call.
let catalogCache: Record<string, ModelInfoDetails> | null = null;

export async function getModelCatalog(): Promise<Record<string, ModelInfoDetails>> {
  if (catalogCache) return catalogCache;
  const data = await bridge.invoke<Record<string, ModelInfoDetails>>('llm_get_model_catalog', {});
  catalogCache = data;
  return data;
}

// Derived helpers from catalog
export function catalogModelsForProvider(catalog: Record<string, ModelInfoDetails>, providerId: string): { id: string; info: ModelInfoDetails }[] {
  return Object.entries(catalog)
    .filter(([, v]) => v.litellm_provider === providerId)
    .map(([id, info]) => ({ id, info }));
}

export function catalogProviderIds(catalog: Record<string, ModelInfoDetails>): string[] {
  const ids = new Set<string>();
  for (const v of Object.values(catalog)) {
    if (v.litellm_provider) ids.add(v.litellm_provider);
  }
  return [...ids].sort();
}

// A013/Vault: Provider key management hooks

export async function storeProviderKey(
  providerId: string,
  keyName: string,
  keyValue: string,
): Promise<void> {
  await bridge.invoke<void>('llm_store_provider_key', {
    providerId,
    keyName,
    keyValue,
  });
}

export async function deleteProviderKey(
  providerId: string,
  keyName: string,
): Promise<void> {
  await bridge.invoke<void>('llm_delete_provider_key', {
    providerId,
    keyName,
  });
}

export async function listProviderKeys(providerId: string): Promise<string[]> {
  return bridge.invoke<string[]>('llm_list_provider_keys', {
    providerId,
  });
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
// API keys are read from the vault on the backend — the frontend never sees them.

export interface DiscoveredModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export interface DiscoverModelsResponse {
  data: DiscoveredModel[];
}

export async function discoverModels(
  providerId: string,
  baseUrl?: string,
): Promise<DiscoverModelsResponse> {
  return bridge.invoke<DiscoverModelsResponse>('llm_discover_models', {
    providerId,
    baseUrl: baseUrl ?? null,
  });
}

export async function importModel(
  providerId: string,
  modelId: string,
  modelName?: string,
  baseUrl?: string,
): Promise<Record<string, unknown>> {
  return bridge.invoke<Record<string, unknown>>('llm_import_model', {
    providerId,
    modelId,
    modelName: modelName ?? null,
    baseUrl: baseUrl ?? null,
  });
}

// Custom provider config persistence via vault

export async function loadCustomProviders(): Promise<CustomProvider[]> {
  try {
    const raw = await bridge.invoke<string>('vault_read', {
      key: 'litellm:custom_providers',
    });
    if (!raw) return [];
    return JSON.parse(raw) as CustomProvider[];
  } catch {
    return [];
  }
}

export async function saveCustomProviders(
  providers: CustomProvider[],
): Promise<void> {
  await bridge.invoke<void>('vault_store', {
    key: 'litellm:custom_providers',
    value: JSON.stringify(providers),
  });
}