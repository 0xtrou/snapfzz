// Per feedback/five-layer: observation layer — reads external state, produces read-only view.
// No writes, no side effects.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createLlmGatewayClient } from '@snapfzz/shared';
import { usePluginRuntimeOptional } from '../runtime';
import { sortForDisplay, toDescriptor, filterBySearch } from './data';
import { SELECTED_MODEL_STORAGE_KEY, PINNED_MODELS_STORAGE_KEY } from './data';
import type { ModelDescriptor, ModelPickerObservation } from './contracts';

// Per A013/ModelPicker: client is created once per component mount via useMemo — not
// recreated on every render. Fetch happens once on mount and on explicit refresh.

export function useModelPickerObservation(): ModelPickerObservation & {
  readonly refresh: () => void;
  readonly setOpen: (next: boolean) => void;
  readonly setSearch: (q: string) => void;
  readonly setSelected: (id: string | null) => void;
  readonly setPinned: (ids: readonly string[]) => void;
} {
  const runtime = usePluginRuntimeOptional();
  const client = useMemo(() => createLlmGatewayClient(), []);

  const [allModels, setAllModels] = useState<readonly ModelDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [pinnedIds, setPinnedIdsState] = useState<readonly string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Track whether mounted to avoid setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Per A013/ModelPicker: load persisted selection + pins from plugin storage on mount.
  useEffect(() => {
    if (!runtime) return;
    void (async () => {
      const [storedId, storedPins] = await Promise.all([
        runtime.ctx.storage.get<string>(SELECTED_MODEL_STORAGE_KEY),
        runtime.ctx.storage.get<string[]>(PINNED_MODELS_STORAGE_KEY),
      ]);
      if (!mountedRef.current) return;
      if (storedId) setSelectedIdState(storedId);
      if (storedPins) setPinnedIdsState(storedPins);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const infoRes = await client.getModelInfo();
      if (!mountedRef.current) return;
      const descriptors = infoRes.data.map(toDescriptor);
      setAllModels(descriptors);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client]);

  // Fetch once on mount.
  useEffect(() => {
    void fetchModels();
  // fetchModels is stable (useMemo client), only run once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter by search, then order (pinned first, rest alphabetical).
  const displayModels = useMemo<readonly ModelDescriptor[]>(
    () => sortForDisplay(filterBySearch(allModels, searchQuery), pinnedIds),
    [allModels, searchQuery, pinnedIds],
  );

  return {
    models: displayModels,
    loading,
    error,
    selectedId,
    isOpen,
    searchQuery,
    pinnedIds,
    refresh: fetchModels,
    setOpen: setIsOpen,
    setSearch: setSearchQuery,
    setSelected: setSelectedIdState,
    setPinned: setPinnedIdsState,
  };
}
