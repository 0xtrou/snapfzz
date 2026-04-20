// Per A013/LLMProviders: shared gateway client — both settings-llm and orchestrator import
// this factory so LiteLLM base-url + master-key lookups are centralised and cached.
// Per feedback/contract-driven: implementation wires to LlmGatewayClient contract, not siblings.

import { createTauriBridge } from '../lib/tauri-bridge';
import type {
  LlmGatewayClient,
  ModelGroup,
  ModelInfoResponse,
  ModelListResponse,
} from './contracts';

// Per A013/Fetch: minimal fetch wrapper — sets Bearer auth and throws on non-2xx.
// Kept internal; callers use the client interface.
async function litellmFetch(
  url: string,
  masterKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${masterKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LiteLLM ${res.status}: ${body}`);
  }
  return res;
}

/**
 * Factory that returns a cached {@link LlmGatewayClient}.
 *
 * The base URL and master key are fetched from Rust once and reused — repeated
 * calls to listModels / getModelInfo do NOT re-invoke the Tauri bridge.
 *
 * Per A013/LLMProviders: infrastructure layer — no feature logic here.
 */
export function createLlmGatewayClient(): LlmGatewayClient {
  const bridge = createTauriBridge();

  // Lazy cached promises — resolved on first demand, reused thereafter.
  let _baseUrlPromise: Promise<string> | null = null;
  let _masterKeyPromise: Promise<string> | null = null;

  function getBaseUrl(): Promise<string> {
    if (!_baseUrlPromise) {
      _baseUrlPromise = bridge.invoke<string>('llm_get_base_url', {});
    }
    return _baseUrlPromise;
  }

  function getMasterKey(): Promise<string> {
    if (!_masterKeyPromise) {
      _masterKeyPromise = bridge.invoke<string>('llm_get_master_key', {});
    }
    return _masterKeyPromise;
  }

  async function listModels(): Promise<ModelListResponse> {
    const [baseUrl, masterKey] = await Promise.all([getBaseUrl(), getMasterKey()]);
    const res = await litellmFetch(`${baseUrl}/v1/models`, masterKey);
    return res.json() as Promise<ModelListResponse>;
  }

  async function getModelInfo(): Promise<ModelInfoResponse> {
    const [baseUrl, masterKey] = await Promise.all([getBaseUrl(), getMasterKey()]);
    const res = await litellmFetch(`${baseUrl}/v1/model/info`, masterKey);
    return res.json() as Promise<ModelInfoResponse>;
  }

  async function getModelGroups(): Promise<ModelGroup[]> {
    const [baseUrl, masterKey] = await Promise.all([getBaseUrl(), getMasterKey()]);
    const res = await litellmFetch(`${baseUrl}/model_group/info`, masterKey);
    const data = (await res.json()) as Record<string, unknown> | unknown[];
    const items: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)['data'])
        ? ((data as Record<string, unknown>)['data'] as unknown[])
        : [];
    return items
      .map((g) => {
        if (g && typeof g === 'object') {
          const obj = g as Record<string, unknown>;
          const name = (obj['model_group'] ?? obj['name']) as string | undefined;
          return name ? { name } : null;
        }
        return typeof g === 'string' && g ? { name: g } : null;
      })
      .filter((v): v is ModelGroup => v !== null);
  }

  return { getBaseUrl, getMasterKey, listModels, getModelInfo, getModelGroups };
}
