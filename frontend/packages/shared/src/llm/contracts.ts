// Per A013/LLMProviders: public contract for the shared LiteLLM gateway client.
// Both settings-llm and orchestrator consume these types — defined once here to avoid drift.

/** Flat model id entry from GET /v1/models */
export interface ModelInfo {
  id: string;
}

/** Rich capability + cost metadata nested inside ModelInfoEntry.
 * Also satisfies Record<string, unknown> via index signature so call sites in settings-llm
 * that access ad-hoc fields (snapfzz_provider_id, id, etc.) continue to type-check.
 */
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
  // Per A013/LLMProviders: LiteLLM model_info is an open map — allow additional fields.
  [key: string]: unknown;
}

/** Single model entry from GET /v1/model/info */
export interface ModelInfoEntry {
  model_name: string;
  litellm_params?: {
    api_base?: string;
    model?: string;
    api_key?: string;
  };
  model_info: ModelInfoDetails;
}

/** Response shape of GET /v1/model/info */
export interface ModelInfoResponse {
  data: ModelInfoEntry[];
}

/** Response shape of GET /v1/models */
export interface ModelListResponse {
  data: ModelInfo[];
}

/** One model group alias returned by GET /model_group/info */
export interface ModelGroup {
  name: string;
}

/** Interface for the shared LiteLLM gateway client */
export interface LlmGatewayClient {
  /** Resolves the LiteLLM base URL (cached after first call) */
  getBaseUrl(): Promise<string>;
  /** Resolves the LiteLLM master key (cached after first call) */
  getMasterKey(): Promise<string>;
  /** GET /v1/models — flat model id list */
  listModels(): Promise<ModelListResponse>;
  /** GET /v1/model/info — rich model metadata */
  getModelInfo(): Promise<ModelInfoResponse>;
  /** GET /model_group/info — model group aliases */
  getModelGroups(): Promise<ModelGroup[]>;
}
