// @vitest-environment jsdom
// Spec: A003-instant-loading.md
// Section: LoadingSequence, SkeletonBehavior
// Verifies: launcher shell renders instantly via static skeleton, transitions to React shell
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

const { useAppSettingsMock } = vi.hoisted(() => ({
  useAppSettingsMock: vi.fn(),
}));

vi.mock('@snapfzz/shared', () => ({
  useTheme: () => ({ theme: 'dark' }),
  useAppSettings: useAppSettingsMock,
  darkTheme: { algorithm: undefined, token: {} },
  lightTheme: { algorithm: undefined, token: {} },
}));

vi.mock('antd', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'config' }, children),
}));

const { PluginHostMock } = vi.hoisted(() => ({
  PluginHostMock: vi.fn().mockImplementation(function () {
    return { activateByEvent: () => Promise.resolve() };
  }),
}));

vi.mock('@snapfzz/plugin-host', () => ({
  ContributionStore: class ContributionStore {},
  PluginHost: PluginHostMock,
  PluginHostProvider: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'plugin-host-provider' }, children),
  PluginErrorBoundary: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
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
    useAppSettingsMock.mockReset();
    useAppSettingsMock.mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-app-ready');
  });

  it('A003/InstantLoading: sets data-app-ready on hydration', async () => {
    render(createElement(App));
    expect(document.documentElement.getAttribute('data-app-ready')).toBe('true');
  });

  it('A003/InstantLoading: adds fade-out class to skeleton element', async () => {
    const skeleton = document.createElement('div');
    skeleton.id = 'skeleton';
    document.body.appendChild(skeleton);

    render(createElement(App));

    await waitFor(() => {
      expect(skeleton.classList.contains('fade-out')).toBe(true);
    });
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
});
