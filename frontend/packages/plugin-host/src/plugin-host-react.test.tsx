// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { ContributionStore } from './contribution-store';
import { useContributionStore } from './use-contribution-store';
import { usePluginHost, PluginHostProvider } from './use-plugin-host';
import { PluginErrorBoundary } from './plugin-error-boundary';
import type { PluginHost } from './plugin-host';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('useContributionStore', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      writable: true,
      configurable: true,
    });
  });

  it('re-renders on store change', () => {
    const store = new ContributionStore();

    const { result } = renderHook(() => useContributionStore(() => store));

    expect(result.current.leftPanelTabs).toHaveLength(0);

    act(() => {
      store.registerLeftPanelTab({
        id: 'test.tab',
        label: 'Test Tab',
        icon: '🧪',
        component: async () => ({ default: () => null }),
      });
    });

    expect(result.current.leftPanelTabs).toHaveLength(1);
    expect(result.current.leftPanelTabs[0].id).toBe('test.tab');
  });

  it('returns snapshot from store', () => {
    const store = new ContributionStore();

    store.registerWorkspaceTab({
      id: 'workspace.tab',
      label: 'Workspace',
      icon: '📦',
      component: async () => ({ default: () => null }),
    });

    const { result } = renderHook(() => useContributionStore(() => store));

    expect(result.current.workspaceTabs).toHaveLength(1);
    expect(result.current.workspaceTabs[0].id).toBe('workspace.tab');
  });
});

describe('usePluginHost + PluginHostProvider', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      writable: true,
      configurable: true,
    });
  });

  it('provides PluginHost via context', () => {
    const mockHost = {
      register: vi.fn(),
      getPlugin: vi.fn(),
      getPlugins: vi.fn(),
      resolve: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
      activateAll: vi.fn(),
    } as unknown as PluginHost;

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(PluginHostProvider, { host: mockHost }, children);

    const { result } = renderHook(() => usePluginHost(), { wrapper });

    expect(result.current).toBe(mockHost);
  });

  it('throws when used outside provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => usePluginHost())).toThrow(/PluginHostProvider/i);
  });
});

describe('PluginErrorBoundary', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      writable: true,
      configurable: true,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('catches render error and shows fallback', () => {
    const ErrorComponent = () => {
      throw new Error('Plugin crashed');
    };

    const Fallback = ({ error }: { error: Error }) => createElement('div', null, `Error: ${error.message}`);

    const { container } = render(
      createElement(
        PluginErrorBoundary,
        { FallbackComponent: Fallback },
        createElement(ErrorComponent),
      ),
    );

    expect(container.textContent).toContain('Error: Plugin crashed');
  });

  it('renders children when no error', () => {
    const { container } = render(
      createElement(
        PluginErrorBoundary,
        {
          FallbackComponent: ({ error }: { error: Error }) => createElement('div', null, error.message),
        },
        createElement('div', null, 'OK'),
      ),
    );

    expect(container.textContent).toContain('OK');
  });
});
