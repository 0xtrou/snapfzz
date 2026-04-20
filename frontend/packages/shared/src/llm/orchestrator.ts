// Per A013/Orchestrator: combo-related helpers shared between settings-llm and
// orchestrator. Both plugins need to agree on:
//   1. which `/v1/model/info` entries are routing combos (and therefore NOT
//      user-pickable models),
//   2. which real model entry the system `orchestrator` combo is currently
//      routing to (so the ModelPicker + RoutingTab can surface that selection).
//
// Keeping the definitions here avoids drift — a plugin-local copy rotting out
// of sync with the other side is how the `snapfzz_provider_id` / `os.environ/`
// mismatches crept in during earlier commits.

import type { ModelInfoEntry } from './contracts';

/** The stable combo name the orchestrator agent always asks for. */
export const ORCHESTRATOR_COMBO_NAME = 'orchestrator';

/**
 * True when an entry is a routing combo (system or user-created). Matches in
 * this order of precedence:
 *   - `model_name === ORCHESTRATOR_COMBO_NAME` (belt-and-braces — legacy
 *     combos may not carry the flag),
 *   - `model_info.snapfzz_system_combo === true`,
 *   - `model_info.snapfzz_combo === true`.
 */
export function isComboEntry(entry: ModelInfoEntry): boolean {
  if (entry.model_name === ORCHESTRATOR_COMBO_NAME) return true;
  const info = entry.model_info as Record<string, unknown>;
  return info.snapfzz_system_combo === true || info.snapfzz_combo === true;
}

/** Drop combos from the raw entry list — leaves only real, user-pickable models. */
export function filterOutCombos(
  entries: readonly ModelInfoEntry[],
): readonly ModelInfoEntry[] {
  return entries.filter((e) => !isComboEntry(e));
}

/**
 * Finds the user-facing model that the `orchestrator` combo currently routes to.
 * Matches on `litellm_params.model` + `api_base` — `api_key` is masked by
 * `/v1/model/info` so it can't participate, but those two are enough to
 * uniquely identify the target deployment in practice.
 *
 * Returns the matching real entry (so the caller can use its `model_name` as
 * the UI's "selected" id) or `null` when there's no combo / no match.
 */
export function findOrchestratorUnderlyingTarget(
  entries: readonly ModelInfoEntry[],
): ModelInfoEntry | null {
  const combo = entries.find((e) => e.model_name === ORCHESTRATOR_COMBO_NAME);
  if (!combo) return null;
  const comboModel = combo.litellm_params?.model;
  const comboBase = combo.litellm_params?.api_base;
  if (!comboModel) return null;
  return (
    entries.find(
      (e) =>
        !isComboEntry(e) &&
        e.litellm_params?.model === comboModel &&
        (e.litellm_params?.api_base ?? null) === (comboBase ?? null),
    ) ?? null
  );
}

/** Aggregated view the ModelPicker needs in one pass — avoids a second filter. */
export interface PickerModelListing {
  /** Real, user-pickable models (combos filtered out). */
  readonly models: readonly ModelInfoEntry[];
  /** The real entry the `orchestrator` combo currently routes to, or null. */
  readonly orchestratorTarget: ModelInfoEntry | null;
}

/** Transform a raw `/v1/model/info` response into the picker-ready shape. */
export function buildPickerListing(response: {
  data: ModelInfoEntry[];
}): PickerModelListing {
  return {
    models: filterOutCombos(response.data),
    orchestratorTarget: findOrchestratorUnderlyingTarget(response.data),
  };
}
