// @vitest-environment jsdom
// Per A013/ModelPicker: tests for PluginRuntimeProvider and hooks.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useContext } from 'react';

// ─── Mock getPluginContext ─────────────────────────────────────────────────────

const mockGetPluginContext = vi.hoisted(() => vi.fn());
vi.mock('../hooks/use-chat', () => ({
  getPluginContext: mockGetPluginContext,
}));

import { PluginRuntimeProvider, usePluginRuntime, usePluginRuntimeOptional } from './runtime';

function makeCtx() {
  return {
    storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    bus: { emit: vi.fn(), on: vi.fn() },
    commands: { execute: vi.fn(), register: vi.fn() },
    settings: { get: vi.fn(), set: vi.fn(), onChange: vi.fn() },
    apis: { get: vi.fn(), provide: vi.fn() },
    rust: { invoke: vi.fn(), listen: vi.fn() },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registry: { registerTab: vi.fn(), registerBottomPanel: vi.fn(), registerStatusItem: vi.fn(), registerComponent: vi.fn() },
    surface: 'project' as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A013/ModelPicker/runtime: PluginRuntimeProvider', () => {
  it('A013/runtime: renders children when ctx is available', () => {
    mockGetPluginContext.mockReturnValue(makeCtx());
    render(
      <PluginRuntimeProvider>
        <div data-testid="child">hello</div>
      </PluginRuntimeProvider>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('A013/runtime: renders children when ctx is null (no ctx yet)', () => {
    mockGetPluginContext.mockReturnValue(null);
    render(
      <PluginRuntimeProvider>
        <div data-testid="child-null">hello</div>
      </PluginRuntimeProvider>,
    );
    expect(screen.getByTestId('child-null')).toBeTruthy();
  });
});

describe('A013/ModelPicker/runtime: usePluginRuntimeOptional', () => {
  it('A013/runtime: returns context value when ctx is available', () => {
    const ctx = makeCtx();
    mockGetPluginContext.mockReturnValue(ctx);

    let result: ReturnType<typeof usePluginRuntimeOptional> = null;
    function Consumer() {
      result = usePluginRuntimeOptional();
      return null;
    }
    render(<PluginRuntimeProvider><Consumer /></PluginRuntimeProvider>);
    expect(result).not.toBeNull();
    expect(result?.ctx).toBe(ctx);
  });

  it('A013/runtime: returns null when ctx is null', () => {
    mockGetPluginContext.mockReturnValue(null);

    let result: ReturnType<typeof usePluginRuntimeOptional> = undefined as never;
    function Consumer() {
      result = usePluginRuntimeOptional();
      return null;
    }
    render(<PluginRuntimeProvider><Consumer /></PluginRuntimeProvider>);
    expect(result).toBeNull();
  });
});

describe('A013/ModelPicker/runtime: usePluginRuntime', () => {
  it('A013/runtime: returns context when ctx is available', () => {
    const ctx = makeCtx();
    mockGetPluginContext.mockReturnValue(ctx);

    let result: ReturnType<typeof usePluginRuntime> | null = null;
    function Consumer() {
      result = usePluginRuntime();
      return null;
    }
    render(<PluginRuntimeProvider><Consumer /></PluginRuntimeProvider>);
    expect(result?.ctx).toBe(ctx);
  });

  it('A013/runtime: throws when ctx is unavailable', () => {
    mockGetPluginContext.mockReturnValue(null);

    function Consumer() {
      usePluginRuntime();
      return null;
    }

    // Suppress React error boundary output in test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<PluginRuntimeProvider><Consumer /></PluginRuntimeProvider>);
    }).toThrow('usePluginRuntime: PluginContext is not available');
    spy.mockRestore();
  });
});
