// Shared utilities for resolving provider and model names from LiteLLM's internal naming.

import type { SpendLog, CustomProvider } from '../hooks/useLlmCommands';

/** Provider lookup maps built from custom providers and model info. */
export interface ProviderLookup {
  byModelId: Map<string, string>;  // model_info.id → provider name
  byApiBase: Map<string, string>;  // api_base URL → provider name
  /** provider name → normalized base URL set for stripping prefix from model_group */
  providerNames: Set<string>;
}

/** Build provider lookup from custom providers and model info entries. */
export function buildProviderLookup(
  providers: CustomProvider[],
  modelInfos: Array<{ model_name?: string; litellm_params?: { api_base?: string }; model_info?: Record<string, unknown> }>,
): ProviderLookup {
  // Provider ID → name from custom providers config
  const idToName = new Map<string, string>();
  const baseToName = new Map<string, string>();
  const providerNames = new Set<string>();

  for (const p of providers) {
    idToName.set(`custom-${p.id}`, p.name);
    providerNames.add(p.name);
    const base = p.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
    // Don't overwrite — first provider with this base wins
    if (!baseToName.has(base)) {
      baseToName.set(base, p.name);
      baseToName.set(base + '/', p.name);
      baseToName.set(base + '/v1', p.name);
      baseToName.set(base + '/v1/', p.name);
    }
  }

  // model_id → provider name from model_info.snapfzz_provider_id
  const byModelId = new Map<string, string>();
  for (const m of modelInfos) {
    const modelId = (m.model_info as Record<string, unknown> | undefined)?.id as string | undefined;
    const providerId = (m.model_info as Record<string, unknown> | undefined)?.snapfzz_provider_id as string | undefined;
    if (modelId && providerId && idToName.has(providerId)) {
      byModelId.set(modelId, idToName.get(providerId)!);
    } else if (modelId && m.litellm_params?.api_base) {
      // Fallback: resolve from api_base
      const base = m.litellm_params.api_base.replace(/\/+$/, '');
      if (baseToName.has(base)) byModelId.set(modelId, baseToName.get(base)!);
    }
  }

  return { byModelId, byApiBase: baseToName, providerNames };
}

/** Resolve the user-facing provider name for a spend log entry. */
export function resolveProviderName(log: SpendLog, lookup: ProviderLookup): string {
  // 1. Try model_id → provider name (most accurate, uses custom provider config)
  if (log.model_id && lookup.byModelId.has(log.model_id)) {
    return lookup.byModelId.get(log.model_id)!;
  }
  // 2. Try api_base → provider name from custom provider config
  if (log.api_base) {
    const base = log.api_base.replace(/\/+$/, '');
    if (lookup.byApiBase.has(base)) return lookup.byApiBase.get(base)!;
    if (lookup.byApiBase.has(log.api_base)) return lookup.byApiBase.get(log.api_base)!;
  }
  // 3. Extract from model_group first segment (e.g. "openai/gpt-4o" → "openai",
  //    "solo-engineer/bcp/glm-5" → "solo-engineer").
  //    Only use model_group (not model fallback) to avoid misidentifying the
  //    provider when model is e.g. "bcp/glm-5" with no real provider prefix.
  if (log.model_group && log.model_group.includes('/')) {
    return log.model_group.split('/')[0];
  }
  // 4. Fallback to hostname from api_base
  if (log.api_base) {
    try { return new URL(log.api_base).hostname.replace(/^(api|llm)\./, ''); } catch { /* */ }
  }
  return 'unknown';
}

/**
 * Extract display model name from model_group, stripping the provider prefix.
 *
 * LiteLLM model_group format: "<provider>/<model>" where model itself may contain
 * slashes (e.g. "solo-engineer/bcp/glm-5" → provider "solo-engineer", model "bcp/glm-5").
 *
 * Resolution order:
 * 1. If model_group matches a known provider name as its first segment, strip it.
 * 2. Otherwise fall back to stripping the first segment naively.
 * 3. If model_group has no slash, return it as-is.
 */
export function resolveModelName(log: SpendLog, lookup: ProviderLookup): string {
  const modelGroup = log.model_group || log.model || 'unknown';

  if (!modelGroup.includes('/')) return modelGroup;

  const slashIdx = modelGroup.indexOf('/');
  const firstSegment = modelGroup.slice(0, slashIdx);
  const rest = modelGroup.slice(slashIdx + 1);

  // If the first segment is a known provider name, strip it
  if (lookup.providerNames.has(firstSegment)) {
    return rest;
  }

  // Fallback: naive strip of first segment
  return rest;
}
