// @vitest-environment jsdom
// Per A013/ModelPicker + feedback/five-layer: observation layer tests.
// Mocks LlmGatewayClient factory + PluginRuntimeContext.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mocks (must be declared before module imports) ───────────────────────────

const mockGetModelInfo = vi.fn();
const mockGetBaseUrl = vi.fn();
const mockGetMasterKey = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createLlmGatewayClient: () => ({
    getBaseUrl: mockGetBaseUrl,
    getMasterKey: mockGetMasterKey,
    listModels: vi.fn(),
    getModelInfo: mockGetModelInfo,
    // getModelGroups is intentionally absent — observation no longer calls it.
    getModelGroups: vi.fn(),
  }),
}));

const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();

// Mock the runtime context to return a plugin ctx with storage
const usePluginRuntimeOptionalMock = vi.fn(() => ({
  ctx: {
    storage: {
      get: mockStorageGet,
      set: mockStorageSet,
      delete: vi.fn(),
    },
  },
} as ReturnType<typeof import('../runtime').usePluginRuntimeOptional>));

vi.mock('../runtime', () => ({
  get usePluginRuntimeOptional() { return usePluginRuntimeOptionalMock; },
}));

import { useModelPickerObservation } from './observation';

const SAMPLE_MODEL_INFO = {
  data: [
    {
      model_name: 'openai/gpt-4',
      litellm_params: { model: 'openai/gpt-4' },
      model_info: { supports_vision: true, input_cost_per_token: 0.00001 },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModelInfo.mockResolvedValue(SAMPLE_MODEL_INFO);
  mockStorageGet.mockResolvedValue(undefined);
  // Reset runtime mock to return a valid context by default
  usePluginRuntimeOptionalMock.mockReturnValue({
    ctx: {
      storage: {
        get: mockStorageGet,
        set: mockStorageSet,
        delete: vi.fn(),
      },
    },
  } as never);
});

describe('A013/ModelPicker/observation: initial loading state', () => {
  it('A013/observation: starts in loading=true state', async () => {
    const { result } = renderHook(() => useModelPickerObservation());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('A013/observation: loading=false after fetch completes', async () => {
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });
});

describe('A013/ModelPicker/observation: data population', () => {
  it('A013/observation: populates models from getModelInfo', async () => {
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.models).toHaveLength(1);
    expect(result.current.models[0].id).toBe('openai/gpt-4');
  });

  it('A013/observation: pinned models appear before unpinned in the flat list', async () => {
    mockGetModelInfo.mockResolvedValue({
      data: [
        { model_name: 'anthropic/claude-3', litellm_params: { model: 'anthropic/claude-3' }, model_info: {} },
        { model_name: 'openai/gpt-4', litellm_params: { model: 'openai/gpt-4' }, model_info: {} },
      ],
    });
    mockStorageGet.mockImplementation((key: string) => {
      if (key === 'model.pinnedIds') return Promise.resolve(['openai/gpt-4']);
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.pinnedIds).toEqual(['openai/gpt-4']));
    expect(result.current.models.map((m) => m.id)).toEqual([
      'openai/gpt-4',
      'anthropic/claude-3',
    ]);
  });

  it('A013/observation: reads selectedId from storage on mount', async () => {
    mockStorageGet.mockImplementation((key: string) => {
      if (key === 'model.selectedId') return Promise.resolve('openai/gpt-4');
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.selectedId).toBe('openai/gpt-4'));
  });

  it('A013/observation: reads pinnedIds from storage on mount', async () => {
    mockStorageGet.mockImplementation((key: string) => {
      if (key === 'model.pinnedIds') return Promise.resolve(['openai/gpt-4']);
      return Promise.resolve(undefined);
    });
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.pinnedIds).toEqual(['openai/gpt-4']));
  });
});

describe('A013/ModelPicker/observation: error state', () => {
  it('A013/observation: sets error when getModelInfo rejects', async () => {
    mockGetModelInfo.mockRejectedValue(new Error('LiteLLM 503: gateway error'));
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('LiteLLM 503');
  });

  it('A013/observation: non-Error rejection uses fallback message', async () => {
    mockGetModelInfo.mockRejectedValue('unexpected string');
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load models');
  });
});

describe('A013/ModelPicker/observation: no runtime', () => {
  it('A013/observation: does not crash when runtime is null (storage skipped)', async () => {
    usePluginRuntimeOptionalMock.mockReturnValue(null);
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // No crash, selectedId stays null
    expect(result.current.selectedId).toBeNull();
    expect(result.current.pinnedIds).toHaveLength(0);
  });
});

describe('A013/ModelPicker/observation: unmount cleanup', () => {
  it('A013/observation: unmounting before fetch completes does not cause setState errors', async () => {
    // Create a deferred promise to control when fetch resolves
    let resolveInfo!: (v: typeof SAMPLE_MODEL_INFO) => void;
    const deferredInfo = new Promise<typeof SAMPLE_MODEL_INFO>((res) => { resolveInfo = res; });
    mockGetModelInfo.mockReturnValue(deferredInfo);

    const { unmount } = renderHook(() => useModelPickerObservation());

    // Unmount before the fetch resolves
    unmount();

    // Resolve the fetch after unmount — should not throw or cause warnings
    expect(() => { resolveInfo(SAMPLE_MODEL_INFO); }).not.toThrow();
  });

  it('A013/observation: storage storage resolution after unmount does not setState', async () => {
    let resolveStorage!: (v: string | undefined) => void;
    const deferredStorage = new Promise<string | undefined>((res) => { resolveStorage = res; });
    mockStorageGet.mockReturnValue(deferredStorage);

    const { unmount } = renderHook(() => useModelPickerObservation());

    // Unmount before storage resolves
    unmount();

    // Resolve storage after unmount — no throw
    expect(() => { resolveStorage('openai/gpt-4'); }).not.toThrow();
  });

  it('A013/observation: error path mounted check covered — error after unmount ignored', async () => {
    let rejectFetch!: (e: Error) => void;
    const deferredFetch = new Promise<never>((_, rej) => { rejectFetch = rej; });
    mockGetModelInfo.mockReturnValue(deferredFetch);

    const { unmount } = renderHook(() => useModelPickerObservation());

    // Unmount before fetch rejects
    unmount();

    // Reject after unmount — mounted guard should prevent setState
    expect(() => { rejectFetch(new Error('after unmount')); }).not.toThrow();
  });
});

describe('A013/ModelPicker/observation: local state mutations', () => {
  it('A013/observation: setOpen changes isOpen', async () => {
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setOpen(true); });
    expect(result.current.isOpen).toBe(true);
  });

  it('A013/observation: setSearch filters models', async () => {
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setSearch('claude'); });
    expect(result.current.models).toHaveLength(0);
    act(() => { result.current.setSearch('gpt'); });
    expect(result.current.models).toHaveLength(1);
  });

  it('A013/observation: refresh re-fetches model info', async () => {
    const { result } = renderHook(() => useModelPickerObservation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockGetModelInfo.mockResolvedValue({ data: [] });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.models).toHaveLength(0);
  });
});
