// Per A013/ModelPicker + feedback/five-layer: pure TS data layer.
// No React, no DOM, no effects. All functions are independently unit-testable.

import type { ModelInfoDetails, ModelInfoEntry } from '@snapfzz/shared';
import type { ModelCapabilities, ModelDescriptor } from './contracts';

// NOTE: The combo-resolution helpers (isComboEntry, filterOutCombos,
// findOrchestratorUnderlyingTarget, buildPickerListing) and the
// ORCHESTRATOR_COMBO_NAME constant live in `@snapfzz/shared/llm/orchestrator`
// and are consumed directly from `@snapfzz/shared` by `observation.ts`. We
// intentionally do NOT re-export them here — importing runtime values from
// shared would pull the full `@snapfzz/shared` barrel (including UI
// components that depend on icon mocks) into every module that only needed
// `SELECTED_MODEL_STORAGE_KEY` (ConnectionStatus, tests, etc).

/** Plugin-storage key for the selected model id. */
export const SELECTED_MODEL_STORAGE_KEY = 'model.selectedId';

/** Plugin-storage key for the pinned model ids array. */
export const PINNED_MODELS_STORAGE_KEY = 'model.pinnedIds';

// ─── Capability derivation ────────────────────────────────────────────────────

/** Derives boolean capability flags from raw LiteLLM model_info. */
export function deriveCapabilities(info: ModelInfoDetails): ModelCapabilities {
  return {
    vision: info.supports_vision === true,
    tools: info.supports_function_calling === true,
    reasoning: info.supports_reasoning === true,
  };
}

// ─── Cost formatting ─────────────────────────────────────────────────────────

/**
 * Converts a per-token cost value to cost per 1M tokens.
 * Returns null when the value is undefined, null, or not a finite number.
 */
export function toCostPer1M(perToken: number | undefined | null): number | null {
  if (perToken == null || !Number.isFinite(perToken)) return null;
  return Math.round(perToken * 1e6 * 100) / 100; // 2 decimal places
}

/** Formats cost pair as "$X/$Y" per 1M tokens. Returns null when both are unknown. */
export function formatCost(
  inputPer1M: number | null,
  outputPer1M: number | null,
): string | null {
  if (inputPer1M === null && outputPer1M === null) return null;
  const inStr = inputPer1M !== null ? `$${inputPer1M}` : '?';
  const outStr = outputPer1M !== null ? `$${outputPer1M}` : '?';
  return `${inStr}/${outStr}`;
}

// ─── Context window ──────────────────────────────────────────────────────────

/** Pulls the context window from model_info, preferring max_input_tokens over max_tokens. */
export function toContextWindow(details: ModelInfoDetails): number | null {
  const candidate =
    typeof details.max_input_tokens === 'number' && Number.isFinite(details.max_input_tokens)
      ? details.max_input_tokens
      : typeof details.max_tokens === 'number' && Number.isFinite(details.max_tokens)
        ? details.max_tokens
        : null;
  return candidate !== null && candidate > 0 ? candidate : null;
}

/**
 * Human-readable token-count badge: "128k", "1M", "4k". Returns null when input is null.
 * Uses short SI-ish suffixes — picker badges are space-constrained.
 */
export function formatTokenCount(tokens: number | null): string | null {
  if (tokens === null) return null;
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    const rounded = Math.round(millions * 10) / 10;
    return `${rounded}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return `${tokens}`;
}

// ─── ModelDescriptor derivation ───────────────────────────────────────────────

/** Extracts provider slug from a model_name like "openai/gpt-4" or litellm_provider field. */
export function extractProvider(entry: ModelInfoEntry): string {
  const fromParams = entry.litellm_params?.model;
  if (fromParams) {
    const slash = fromParams.indexOf('/');
    if (slash > 0) return fromParams.slice(0, slash);
  }
  if (entry.model_info.litellm_provider) return entry.model_info.litellm_provider;
  const slash = entry.model_name.indexOf('/');
  if (slash > 0) return entry.model_name.slice(0, slash);
  return 'unknown';
}

/** Converts a raw ModelInfoEntry into a display-ready ModelDescriptor. */
export function toDescriptor(entry: ModelInfoEntry): ModelDescriptor {
  const capabilities = deriveCapabilities(entry.model_info);
  return {
    id: entry.model_name,
    displayName: entry.model_name,
    provider: extractProvider(entry),
    capabilities,
    inputCostPer1M: toCostPer1M(entry.model_info.input_cost_per_token),
    outputCostPer1M: toCostPer1M(entry.model_info.output_cost_per_token),
    contextWindow: toContextWindow(entry.model_info),
  };
}

// ─── Search filter ────────────────────────────────────────────────────────────

/** Case-insensitive filter by name or provider. Returns all when query is empty. */
export function filterBySearch(
  models: readonly ModelDescriptor[],
  query: string,
): readonly ModelDescriptor[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter(
    (m) =>
      m.displayName.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
  );
}

// ─── Ordering ────────────────────────────────────────────────────────────────

/**
 * Flat ordering for the picker: pinned models first (preserving their alphabetical order),
 * then every other model alphabetically by provider+displayName.
 *
 * Per A013/ModelPicker: the picker is a single list — no provider buckets, no model-group
 * aliases. Model groups (fast/smart aliases) are a routing concern handled elsewhere and are
 * not models the user can pick here, so we intentionally exclude them.
 */
export function sortForDisplay(
  models: readonly ModelDescriptor[],
  pinnedIds: readonly string[],
): readonly ModelDescriptor[] {
  const pinnedSet = new Set(pinnedIds);
  const alphaSort = (a: ModelDescriptor, b: ModelDescriptor): number => {
    const p = a.provider.localeCompare(b.provider);
    if (p !== 0) return p;
    return a.displayName.localeCompare(b.displayName);
  };

  const pinned = models.filter((m) => pinnedSet.has(m.id)).slice().sort(alphaSort);
  const rest = models.filter((m) => !pinnedSet.has(m.id)).slice().sort(alphaSort);
  return [...pinned, ...rest];
}
