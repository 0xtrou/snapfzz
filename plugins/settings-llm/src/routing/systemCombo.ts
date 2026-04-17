// Per A013/Orchestrator: some combos are system-level — created + mutated by the
// orchestrator plugin (e.g. the `orchestrator` combo whose underlying model is swapped
// by the ModelPicker). These combos must be VISIBLE in the routing list so users can
// see what's configured, but NOT editable or deletable from the UI.
//
// Any new system-level combo id must be added here (single source of truth).

export const SYSTEM_COMBO_NAMES: ReadonlySet<string> = new Set([
  'orchestrator',
]);

/** True when the combo name is reserved for system use. */
export function isSystemCombo(name: string): boolean {
  return SYSTEM_COMBO_NAMES.has(name);
}

/** Human-readable label shown next to system combos in the UI. */
export const SYSTEM_COMBO_LABEL = 'System';

/** Tooltip shown on disabled system-combo actions. */
export const SYSTEM_COMBO_TOOLTIP =
  'This combo is managed by the orchestrator plugin. Its underlying model is changed via the chat model picker.';
