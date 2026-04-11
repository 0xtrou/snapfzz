// A013/Catalog: Model catalog derived from bundled LiteLLM model data.
// Source of truth for provider lists, model metadata, pricing, and capabilities.

import catalogData from '../../../src-tauri/model-catalog.json';

export interface CatalogModelEntry {
  litellm_provider: string;
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  mode?: string;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_reasoning?: boolean;
}

const catalog: Record<string, CatalogModelEntry> = catalogData as Record<string, CatalogModelEntry>;

// The sample_spec entry is documentation, not a real model.
const MODEL_ENTRIES = Object.entries(catalog).filter(([key]) => key !== 'sample_spec');

/** All unique provider IDs present in the catalog, sorted alphabetically. */
export function getProviderIds(): string[] {
  const ids = new Set<string>();
  for (const [, v] of MODEL_ENTRIES) {
    if (v.litellm_provider) {
      ids.add(v.litellm_provider);
    }
  }
  return [...ids].sort();
}

/** All models belonging to a given provider. */
export function getModelsForProvider(
  providerId: string,
): { id: string; info: CatalogModelEntry }[] {
  return MODEL_ENTRIES
    .filter(([, v]) => v.litellm_provider === providerId)
    .map(([id, info]) => ({ id, info }));
}

/** Look up a single model by its full catalog key (e.g. "openai/gpt-4o"). */
export function getCatalogModelInfo(modelId: string): CatalogModelEntry | undefined {
  if (modelId === 'sample_spec') return undefined;
  return catalog[modelId];
}

/** Aggregate provider metadata derived from the catalog. */
export function getProviderInfo(providerId: string): {
  modelCount: number;
  modes: string[];
} {
  const models = getModelsForProvider(providerId);
  const modes = [...new Set(models.map((m) => m.info.mode).filter(Boolean))] as string[];
  return { modelCount: models.length, modes };
}
