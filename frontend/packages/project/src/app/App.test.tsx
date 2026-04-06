// @vitest-environment jsdom
// Spec: A003-instant-loading.md
// Section: LoadingSequence, SkeletonBehavior
// Verifies: project shell skeleton fades out on hydration, structural areas render from store
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { TabContribution, StatusItemContribution } from '@snapfzz/plugin-sdk';

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

vi.mock('@snapfzz/shared', () => ({
  darkTheme: { algorithm: undefined, token: {} },
  lightTheme: { algorithm: undefined, token: {} },
  WindowShell: ({ children, statusBarContent }: { children: React.ReactNode; title?: string; statusBarContent?: React.ReactNode }) =>
    createElement('div', { 'data-testid': 'window-shell' },
      createElement('span', null, 'Project Window'),
      statusBarContent,
      children,
    ),
  AntIcon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('antd', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'config' }, children),
}));

vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children, ...props }: any) => createElement('div', { 'data-testid': 'panel-group', ...props }, children),
  Panel: ({ children, ...props }: any) => createElement('div', { 'data-testid': 'panel', ...props }, children),
  PanelResizeHandle: (props: any) => createElement('div', { 'data-testid': 'panel-resize-handle', ...props }),
}));

const { PluginHostMock } = vi.hoisted(() => ({
  PluginHostMock: vi.fn().mockImplementation(function () {
    return {
      getPlugin: () => undefined,
      register: () => undefined,
      activateAll: () => Promise.resolve(),
      activateByEvent: () => Promise.resolve(),
      deactivate: () => Promise.resolve(),
    };
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

describe('A006/shell: Project App', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-app-ready');
    const existing = document.getElementById('skeleton');
    if (existing) existing.remove();
    snapshot = { ...emptySnapshot };
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

  it('A006/shell: renders structural shell areas', () => {
    render(createElement(App));

    expect(screen.getByText('Project Window')).toBeTruthy();
    expect(screen.getAllByText('No tabs available — install plugins to see content')).toHaveLength(2);
    expect(screen.getByText('No agent panels — plugins will provide agent network')).toBeTruthy();
  });

  it('A006/shell: uses plugin host provider wrapper', () => {
    render(createElement(App));
    expect(screen.getByTestId('plugin-host-provider')).toBeTruthy();
  });

  it('A006/shell: keeps resizable panel split with two panels', () => {
    render(createElement(App));
    expect(screen.getByTestId('panel-group')).toBeTruthy();
    expect(screen.getAllByTestId('panel')).toHaveLength(2);
    expect(screen.getByTestId('panel-resize-handle')).toBeTruthy();
  });

  it('A006/shell: renders contribution tabs when store has data', async () => {
    snapshot.leftPanelTabs = [
      { id: 'chat', label: 'Chat', icon: '💬', component: async () => ({ default: () => createElement('div', null, 'chat-content') }) } as TabContribution,
    ];
    snapshot.workspaceTabs = [
      { id: 'kb', label: 'KB', icon: '📚', component: async () => ({ default: () => createElement('div', null, 'kb-content') }) } as TabContribution,
    ];

    render(createElement(App));

    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('KB')).toBeTruthy();
  });

  it('A007/shell: creates PluginHost with surface \'project\'', () => {
    const surfaceArgs = PluginHostMock.mock.calls.map((c: unknown[]) => c[1]);
    expect(surfaceArgs).toContain('project');
  });

  it('A006/shell: renders status items from contributions', async () => {
    snapshot.statusItems = [
      { id: 's-left', position: 'left', component: async () => ({ default: () => createElement('span', null, 'left-status') }) } as StatusItemContribution,
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('left-status')).toBeTruthy();
    });
  });
});
