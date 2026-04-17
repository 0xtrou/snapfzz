// @vitest-environment jsdom
// Per A013/ModelPicker + feedback/five-layer: events layer tests.
// Mocks plugin storage; asserts that onSelect/onPin write through storage.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockRustInvoke = vi.fn();

const mockCtx = {
  ctx: {
    storage: {
      get: mockStorageGet,
      set: mockStorageSet,
      delete: vi.fn(),
    },
    rust: {
      invoke: mockRustInvoke,
      listen: vi.fn(),
    },
  },
};

const usePluginRuntimeOptionalMock = vi.fn(() => mockCtx as typeof mockCtx | null);

vi.mock('../runtime', () => ({
  get usePluginRuntimeOptional() { return usePluginRuntimeOptionalMock; },
}));

import { useModelPickerEvents } from './events';
import type { ModelPickerEventDeps } from './events';

function buildDeps(overrides: Partial<ModelPickerEventDeps> = {}): ModelPickerEventDeps {
  return {
    selectedId: null,
    pinnedIds: [],
    onRefresh: vi.fn(),
    onToggleOpenState: vi.fn(),
    onSearchState: vi.fn(),
    onSelectState: vi.fn(),
    onPinnedState: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStorageSet.mockResolvedValue(undefined);
  mockRustInvoke.mockResolvedValue(undefined);
});

describe('A013/ModelPicker/events: onSelect', () => {
  it('A013/events: onSelect calls onSelectState with id', () => {
    const onSelectState = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ onSelectState })));
    act(() => { result.current.onSelect('openai/gpt-4'); });
    expect(onSelectState).toHaveBeenCalledWith('openai/gpt-4');
  });

  it('A013/events: onSelect closes the popover', () => {
    const onToggleOpenState = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ onToggleOpenState })));
    act(() => { result.current.onSelect('openai/gpt-4'); });
    expect(onToggleOpenState).toHaveBeenCalledWith(false);
  });

  it('A013/events: onSelect writes to plugin storage', () => {
    const { result } = renderHook(() => useModelPickerEvents(buildDeps()));
    act(() => { result.current.onSelect('anthropic/claude-3'); });
    expect(mockStorageSet).toHaveBeenCalledWith('model.selectedId', 'anthropic/claude-3');
  });

  it('A013/events: onSelect mutates the orchestrator combo via Rust', () => {
    const { result } = renderHook(() => useModelPickerEvents(buildDeps()));
    act(() => { result.current.onSelect('anthropic/claude-3'); });
    expect(mockRustInvoke).toHaveBeenCalledWith('llm_update_orchestrator_combo', {
      modelTarget: 'anthropic/claude-3',
    });
  });
});

describe('A013/ModelPicker/events: onPin', () => {
  it('A013/events: onPin adds id to pinnedIds when not pinned', () => {
    const onPinnedState = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ pinnedIds: [], onPinnedState })));
    act(() => { result.current.onPin('openai/gpt-4'); });
    expect(onPinnedState).toHaveBeenCalledWith(['openai/gpt-4']);
  });

  it('A013/events: onPin removes id from pinnedIds when already pinned', () => {
    const onPinnedState = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ pinnedIds: ['openai/gpt-4'], onPinnedState })));
    act(() => { result.current.onPin('openai/gpt-4'); });
    expect(onPinnedState).toHaveBeenCalledWith([]);
  });

  it('A013/events: onPin writes updated pins to plugin storage', () => {
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ pinnedIds: [] })));
    act(() => { result.current.onPin('openai/gpt-4'); });
    expect(mockStorageSet).toHaveBeenCalledWith('model.pinnedIds', ['openai/gpt-4']);
  });
});

describe('A013/ModelPicker/events: onToggleOpen', () => {
  it('A013/events: onToggleOpen delegates to onToggleOpenState', () => {
    const onToggleOpenState = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ onToggleOpenState })));
    act(() => { result.current.onToggleOpen(true); });
    expect(onToggleOpenState).toHaveBeenCalledWith(true);
  });
});

describe('A013/ModelPicker/events: onRefresh', () => {
  it('A013/events: onRefresh delegates to onRefresh dep', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ onRefresh })));
    act(() => { result.current.onRefresh(); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('A013/ModelPicker/events: onSearch', () => {
  it('A013/events: onSearch delegates to onSearchState', () => {
    const onSearchState = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ onSearchState })));
    act(() => { result.current.onSearch('gpt'); });
    expect(onSearchState).toHaveBeenCalledWith('gpt');
  });
});

describe('A013/ModelPicker/events: no runtime (null context)', () => {
  it('A013/events: onSelect does not throw and does not call storage when runtime is null', () => {
    usePluginRuntimeOptionalMock.mockReturnValueOnce(null);

    const onSelectState = vi.fn();
    const onToggleOpenState = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ onSelectState, onToggleOpenState })));
    act(() => { result.current.onSelect('x'); });

    expect(onSelectState).toHaveBeenCalledWith('x');
    expect(onToggleOpenState).toHaveBeenCalledWith(false);
    // No storage call because runtime is null
    expect(mockStorageSet).not.toHaveBeenCalled();
    // No Rust combo mutation either
    expect(mockRustInvoke).not.toHaveBeenCalled();
  });

  it('A013/events: onPin does not throw and does not call storage when runtime is null', () => {
    usePluginRuntimeOptionalMock.mockReturnValueOnce(null);

    const onPinnedState = vi.fn();
    const { result } = renderHook(() => useModelPickerEvents(buildDeps({ onPinnedState })));
    act(() => { result.current.onPin('y'); });

    expect(onPinnedState).toHaveBeenCalled();
    expect(mockStorageSet).not.toHaveBeenCalled();
  });
});
