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

export interface KeyInfo {
  key: string;
  models: string[];
  spend?: number;
  max_budget?: number;
  budget_duration?: string;
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

// A013/Vault: Provider key management hooks

export async function storeProviderKey(
  providerId: string,
  keyName: string,
  keyValue: string,
): Promise<void> {
  await bridge.invoke<void>('llm_store_provider_key', {
    provider_id: providerId,
    key_name: keyName,
    key_value: keyValue,
  });
}

export async function deleteProviderKey(
  providerId: string,
  keyName: string,
): Promise<void> {
  await bridge.invoke<void>('llm_delete_provider_key', {
    provider_id: providerId,
    key_name: keyName,
  });
}

export async function listProviderKeys(providerId: string): Promise<string[]> {
  return bridge.invoke<string[]>('llm_list_provider_keys', {
    provider_id: providerId,
  });
}

// A013/Config: Config management hooks

export async function saveConfig(
  config: GatewayConfig,
  dataDir: string,
): Promise<void> {
  await bridge.invoke<void>('llm_save_config', {
    config,
    data_dir: dataDir,
  });
}

export async function getConfigPath(dataDir: string): Promise<string> {
  return bridge.invoke<string>('llm_get_config_path', {
    data_dir: dataDir,
  });
}

// A013/Keys: Virtual key management hooks

export async function generateKey(
  baseUrl: string,
  params: KeyGenerateParams,
): Promise<GeneratedKey> {
  return bridge.invoke<GeneratedKey>('llm_generate_key', {
    base_url: baseUrl,
    params,
  });
}

export async function listKeys(
  baseUrl: string,
  page?: number,
  size?: number,
): Promise<KeyListResponse> {
  return bridge.invoke<KeyListResponse>('llm_list_keys', {
    base_url: baseUrl,
    page,
    size,
  });
}

export async function deleteKey(baseUrl: string, key: string): Promise<boolean> {
  return bridge.invoke<boolean>('llm_delete_key', {
    base_url: baseUrl,
    key,
  });
}

export async function getKeyInfo(baseUrl: string, key: string): Promise<KeyInfo> {
  return bridge.invoke<KeyInfo>('llm_get_key_info', {
    base_url: baseUrl,
    key,
  });
}

export async function updateKey(
  baseUrl: string,
  key: string,
  params: KeyUpdateParams,
): Promise<KeyInfo> {
  return bridge.invoke<KeyInfo>('llm_update_key', {
    base_url: baseUrl,
    key,
    params,
  });
}

// A013/Spend: Spend tracking hooks

export async function getSpendLogs(
  baseUrl: string,
  filters: SpendFilters,
): Promise<SpendLog[]> {
  return bridge.invoke<SpendLog[]>('llm_get_spend_logs', {
    base_url: baseUrl,
    filters,
  });
}

export async function getKeySpend(
  baseUrl: string,
  key: string,
): Promise<KeySpend> {
  return bridge.invoke<KeySpend>('llm_get_key_spend', {
    base_url: baseUrl,
    key,
  });
}

export async function getGlobalSpend(baseUrl: string): Promise<GlobalSpend> {
  return bridge.invoke<GlobalSpend>('llm_get_global_spend', {
    base_url: baseUrl,
  });
}

export async function getModels(baseUrl: string): Promise<ModelListResponse> {
  return bridge.invoke<ModelListResponse>('llm_get_models', {
    base_url: baseUrl,
  });
}