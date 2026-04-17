// Per feedback/five-layer: events layer — outward emission. Domain-aware, view-agnostic.
// Receives runtime handles, wires to plugin storage + refresh. No external state reads.

import { useCallback } from 'react';
import { usePluginRuntimeOptional } from '../runtime';
import { SELECTED_MODEL_STORAGE_KEY, PINNED_MODELS_STORAGE_KEY } from './data';
import type { ModelPickerEventHandlers } from './contracts';

export interface ModelPickerEventDeps {
  readonly selectedId: string | null;
  readonly pinnedIds: readonly string[];
  readonly onRefresh: () => void;
  readonly onToggleOpenState: (next: boolean) => void;
  readonly onSearchState: (q: string) => void;
  readonly onSelectState: (id: string | null) => void;
  readonly onPinnedState: (ids: readonly string[]) => void;
}

export function useModelPickerEvents(deps: ModelPickerEventDeps): ModelPickerEventHandlers {
  const runtime = usePluginRuntimeOptional();
  const {
    pinnedIds,
    onRefresh,
    onToggleOpenState,
    onSearchState,
    onSelectState,
    onPinnedState,
  } = deps;

  const onSelect = useCallback(
    (id: string) => {
      onSelectState(id);
      onToggleOpenState(false);
      if (runtime) {
        void runtime.ctx.storage.set(SELECTED_MODEL_STORAGE_KEY, id);
        // Per A013/Orchestrator: Rust owns the LiteLLM master key and the `orchestrator`
        // combo mutation. The frontend passes the selected model_name; Rust resolves
        // litellm_params (api_base, api_key, real model) and applies the update.
        void runtime.ctx.rust.invoke('llm_update_orchestrator_combo', {
          modelTarget: id,
        });
      }
    },
    [onSelectState, onToggleOpenState, runtime],
  );

  const onPin = useCallback(
    (id: string) => {
      const next = pinnedIds.includes(id)
        ? pinnedIds.filter((p) => p !== id)
        : [...pinnedIds, id];
      onPinnedState(next);
      if (runtime) {
        void runtime.ctx.storage.set(PINNED_MODELS_STORAGE_KEY, next);
      }
    },
    [pinnedIds, onPinnedState, runtime],
  );

  const onToggleOpen = useCallback(
    (next: boolean) => {
      onToggleOpenState(next);
    },
    [onToggleOpenState],
  );

  const onSearch = useCallback(
    (query: string) => {
      onSearchState(query);
    },
    [onSearchState],
  );

  return { onSelect, onRefresh, onPin, onToggleOpen, onSearch };
}
