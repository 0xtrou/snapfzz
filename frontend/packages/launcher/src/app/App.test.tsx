// @vitest-environment jsdom
// Spec: A003-instant-loading.md
// Section: LoadingSequence, SkeletonBehavior
// Verifies: launcher shell renders instantly via static skeleton, transitions to React shell
// Per A003/BootComplete: skeleton stays visible until boot-complete event is received.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import type { StatusItemContribution, ComponentContribution } from '@snapfzz/plugin-sdk';

const emptySnapshot = {
  leftPanelTabs: [] as unknown[],
  workspaceTabs: [] as unknown[],
  bottomPanels: [] as unknown[],
  statusItems: [] as unknown[],
  commands: [] as unknown[],
  shortcuts: [] as unknown[],
  settings: [] as unknown[],
  genericComponents: [] as unknown[],
};

let snapshot = { ...emptySnapshot };
let crashingPluginIds = new Set<string>();

const { useAppSettingsMock, consoleLogMock, PerformanceObserverMock, bridgeInvokeMock, bootCompleteHandlers, supervisorEventHandlers } = vi.hoisted(() => {
  class MockPerformanceObserver {
    private readonly callback: (list: { getEntries: () => Array<{ startTime?: number; duration?: number }> }) => void;

    constructor(callback: (list: { getEntries: () => Array<{ startTime?: number; duration?: number }> }) => void) {
      this.callback = callback;
    }

    observe(options: { type: string }) {
      if (options.type === 'largest-contentful-paint') {
        this.callback({ getEntries: () => [{ startTime: 12 }, { startTime: 42 }] });
      }
      if (options.type === 'longtask') {
        this.callback({ getEntries: () => [{ duration: 67, startTime: 9 }] });
      }
    }
  }

  const invokeMock = vi.fn().mockResolvedValue(undefined);
  // Per A003/BootComplete: capture boot-complete handlers so tests can fire them.
  const handlers: Array<() => void> = [];
  // Per A003/BootComplete: capture supervisor-event handlers so tests can fire them.
  const supervisorHandlers: Array<(event: { process: string; message: string }) => void> = [];

  return {
    useAppSettingsMock: vi.fn(),
    consoleLogMock: vi.fn(),
    PerformanceObserverMock: MockPerformanceObserver,
    bridgeInvokeMock: invokeMock,
    bootCompleteHandlers: handlers,
    supervisorEventHandlers: supervisorHandlers,
  };
});

vi.mock('@snapfzz/shared', () => ({
  useAppSettings: useAppSettingsMock,
  darkTheme: { algorithm: undefined, token: {} },
  lightTheme: { algorithm: undefined, token: {} },
  createTauriBridge: () => ({
    invoke: bridgeInvokeMock,
    // Per A003/BootComplete: listen returns a Promise so .then() works; captures boot-complete and supervisor-event handlers.
    listen: vi.fn().mockImplementation((event: string, handler: (payload?: unknown) => void) => {
      if (event === 'boot-complete') {
        bootCompleteHandlers.push(handler as () => void);
      }
      if (event === 'supervisor-event') {
        supervisorEventHandlers.push(handler as (event: { process: string; message: string }) => void);
      }
      return Promise.resolve(vi.fn());
    }),
    isAvailable: false,
  }),
}));

vi.mock('antd', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'config' }, children),
}));

const { PluginHostMock, reportCrashMock } = vi.hoisted(() => ({
  reportCrashMock: vi.fn(),
  PluginHostMock: vi.fn().mockImplementation(function () {
    return {
      activateByEvent: () => Promise.resolve(),
      reportCrash: () => reportCrashMock(),
    };
  }),
}));

vi.mock('@snapfzz/plugin-host', () => ({
  ContributionStore: class ContributionStore {},
  PluginHost: PluginHostMock,
  PluginHostProvider: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'plugin-host-provider' }, children),
  PluginErrorBoundary: ({
    children,
    pluginId,
    onCrash,
  }: {
    children: React.ReactNode;
    pluginId?: string;
    onCrash?: (pluginId: string, error: Error) => void;
  }) => {
    if (pluginId && crashingPluginIds.has(pluginId)) {
      onCrash?.(pluginId, new Error('crash'));
      return createElement('div', null, `crashed:${pluginId}`);
    }
    return createElement('div', null, children);
  },
  registerDiscoveredPlugins: () => Promise.resolve(),
  useContributionStore: () => snapshot,
}));

import { App } from './App';

describe('A003/InstantLoading: Launcher shell boot', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-app-ready');
    const existing = document.getElementById('skeleton');
    if (existing) existing.remove();
    snapshot = { ...emptySnapshot };
    crashingPluginIds = new Set<string>();
    bootCompleteHandlers.length = 0;
    supervisorEventHandlers.length = 0;

    useAppSettingsMock.mockReset();
    useAppSettingsMock.mockReturnValue({ theme: 'dark', toggleTheme: vi.fn(), customFonts: [] });

    consoleLogMock.mockReset();
    bridgeInvokeMock.mockReset();
    bridgeInvokeMock.mockResolvedValue(undefined);
    vi.stubGlobal('PerformanceObserver', PerformanceObserverMock);
    vi.spyOn(console, 'log').mockImplementation(consoleLogMock);
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-app-ready');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('A003/BootComplete: sets data-app-ready only after boot-complete event + 3s splash delay', async () => {
    vi.useFakeTimers();
    render(createElement(App));
    // Before boot-complete fires, data-app-ready must not be set.
    expect(document.documentElement.getAttribute('data-app-ready')).toBeNull();

    // Simulate backend emitting boot-complete after all phases finish.
    await act(async () => {
      for (const handler of bootCompleteHandlers) handler();
    });

    // Still null — 3s splash delay hasn't elapsed.
    expect(document.documentElement.getAttribute('data-app-ready')).toBeNull();

    // Advance past the 3s splash delay.
    await act(async () => { vi.advanceTimersByTime(3000); });

    expect(document.documentElement.getAttribute('data-app-ready')).toBe('true');
    vi.useRealTimers();
  });

  it('A003/BootComplete: adds fade-out class to skeleton only after boot-complete + 3s splash', async () => {
    vi.useFakeTimers();
    const skeleton = document.createElement('div');
    skeleton.id = 'skeleton';
    document.body.appendChild(skeleton);

    render(createElement(App));
    // Skeleton must still be visible before boot-complete.
    expect(skeleton.classList.contains('fade-out')).toBe(false);

    // Simulate backend emitting boot-complete after all phases finish.
    await act(async () => {
      for (const handler of bootCompleteHandlers) handler();
    });

    // Still no fade-out — 3s splash delay hasn't elapsed.
    expect(skeleton.classList.contains('fade-out')).toBe(false);

    // Advance past the 3s splash delay.
    await act(async () => { vi.advanceTimersByTime(3000); });

    expect(skeleton.classList.contains('fade-out')).toBe(true);
    vi.useRealTimers();
  });

  it('A006/shell: renders plugin host provider wrapper', () => {
    render(createElement(App));
    expect(screen.getByTestId('plugin-host-provider')).toBeTruthy();
  });

  it('A006/shell: renders launcher generic components from contributions', async () => {
    snapshot.genericComponents = [
      { id: 'launcher:main:projects', name: 'Projects', component: async () => ({ default: () => createElement('div', null, 'projects-content') }) } as ComponentContribution,
      { id: 'launcher:header:meta', name: 'Meta', component: async () => ({ default: () => createElement('div', null, 'header-meta') }) } as ComponentContribution,
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('projects-content')).toBeTruthy();
      expect(screen.getByText('header-meta')).toBeTruthy();
    });
  });

  it('A007/shell: creates PluginHost with surface \'launcher\'', () => {
    PluginHostMock.mockClear();
    render(createElement(App));
    expect(PluginHostMock).toHaveBeenCalled();
    const [, surface] = PluginHostMock.mock.calls[0];
    expect(surface).toBe('launcher');
  });

  it('A007/settings-general: launcher mounts shared app settings hook', () => {
    render(createElement(App));
    expect(useAppSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('A007/settings-general: applies light theme path via app settings', () => {
    useAppSettingsMock.mockReturnValue({ theme: 'light', toggleTheme: vi.fn(), customFonts: [] });

    render(createElement(App));

    expect(screen.getByTestId('config')).toBeTruthy();
  });

  it('A006/shell: renders status items from contributions', async () => {
    snapshot.statusItems = [
      { id: 'ready-left', position: 'left', component: async () => ({ default: () => createElement('span', null, 'left-ready') }) } as StatusItemContribution,
      { id: 'ready-right', position: 'right', component: async () => ({ default: () => createElement('span', null, 'right-ready') }) } as StatusItemContribution,
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('left-ready')).toBeTruthy();
      expect(screen.getByText('right-ready')).toBeTruthy();
    });
  });

  it('A006/shell: shows fallback shell content when no main contributions exist', () => {
    render(createElement(App));

    expect(screen.getByText('Core shell ready. Plugins will load here.')).toBeTruthy();
    expect(screen.getByText('● Ready')).toBeTruthy();
  });

  it('A003/metrics: logs startup metrics through performance observers', () => {
    render(createElement(App));

    expect(consoleLogMock).toHaveBeenCalledWith('[A003/metrics] LCP: 42ms');
    expect(consoleLogMock).toHaveBeenCalledWith('[A003/metrics] Long task: 67ms at 9ms');
    expect(consoleLogMock).toHaveBeenCalledWith(expect.stringMatching(/\[A003\/metrics\] TTI \(hydration\): \d+ms/));
  });

  it('A002/ZoneViolation: reports LCP and long task violations to BudgetRegistry via bridge invoke', () => {
    render(createElement(App));

    expect(bridgeInvokeMock).toHaveBeenCalledWith('budget_report_violation', {
      class: 'startup',
      metric: 'lcp',
      actual_ms: 42,
    });
    expect(bridgeInvokeMock).toHaveBeenCalledWith('budget_report_violation', {
      class: 'cpu',
      metric: 'longtask',
      actual_ms: 67,
    });
  });

  it('A003/BootComplete: supervisor-event updates skeleton-status text when element exists', async () => {
    const statusEl = document.createElement('div');
    statusEl.id = 'skeleton-status';
    document.body.appendChild(statusEl);

    render(createElement(App));

    await act(async () => {
      for (const handler of supervisorEventHandlers) {
        handler({ process: 'litellm', message: 'Starting LiteLLM...' });
      }
    });

    expect(statusEl.textContent).toBe('Starting LiteLLM...');

    statusEl.remove();
  });

  it('A003/BootComplete: supervisor-event does not throw when skeleton-status element is absent', async () => {
    // Ensure no skeleton-status element is present.
    const existing = document.getElementById('skeleton-status');
    if (existing) existing.remove();

    render(createElement(App));

    await act(async () => {
      for (const handler of supervisorEventHandlers) {
        handler({ process: 'litellm', message: 'Starting LiteLLM...' });
      }
    });

    // No element to update — should complete without error.
    expect(document.getElementById('skeleton-status')).toBeNull();
  });

  it('A005/isolation: routes component crashes to plugin boundary fallback', async () => {
    crashingPluginIds = new Set(['launcher:main:broken']);
    snapshot.genericComponents = [
      {
        id: 'launcher:main:broken',
        name: 'Broken',
        component: async () => ({ default: () => createElement('div', null, 'should-not-render') }),
      } as ComponentContribution,
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('crashed:launcher:main:broken')).toBeTruthy();
    });
  });
});
