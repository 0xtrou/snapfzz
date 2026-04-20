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
let crashingPluginIds = new Set<string>();

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
      reportCrash: vi.fn(),
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

describe('A006/shell: Project App', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-app-ready');
    const existing = document.getElementById('skeleton');
    if (existing) existing.remove();
    snapshot = { ...emptySnapshot };
    crashingPluginIds = new Set<string>();
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

  it('A006/shell: keeps resizable 3-pane split (left/right + bottom)', () => {
    render(createElement(App));
    // Nested PanelGroups: outer vertical (top + bottom) + inner horizontal
    // (left + right). Count = 2 groups; 4 Panel wrappers (2 outer holding the
    // inner group + bottom, 2 inner for left/right); 2 resize handles.
    expect(screen.getAllByTestId('panel-group')).toHaveLength(2);
    expect(screen.getAllByTestId('panel')).toHaveLength(4);
    expect(screen.getAllByTestId('panel-resize-handle')).toHaveLength(2);
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

  it('A006/shell: renders active tab and bottom panel content from contributions', async () => {
    snapshot.leftPanelTabs = [
      { id: 'chat', label: 'Chat', icon: 'MessageOutlined', component: async () => ({ default: () => createElement('div', null, 'chat-content') }) } as TabContribution,
    ];
    snapshot.workspaceTabs = [
      { id: 'preview', label: 'Preview', icon: 'EyeOutlined', component: async () => ({ default: () => createElement('div', null, 'preview-content') }) } as TabContribution,
    ];
    snapshot.bottomPanels = [
      { id: 'agents', label: 'Agents', component: async () => ({ default: () => createElement('div', null, 'agents-panel') }) } as any,
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('chat-content')).toBeTruthy();
      expect(screen.getByText('preview-content')).toBeTruthy();
      expect(screen.getByText('agents-panel')).toBeTruthy();
    });
  });

  it('A006/shell: updates active tab content when selecting another tab', async () => {
    snapshot.leftPanelTabs = [
      { id: 'chat', label: 'Chat', icon: 'MessageOutlined', component: async () => ({ default: () => createElement('div', null, 'chat-content') }) } as TabContribution,
      { id: 'team', label: 'Team', icon: 'TeamOutlined', component: async () => ({ default: () => createElement('div', null, 'team-content') }) } as TabContribution,
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('chat-content')).toBeTruthy();
    });

    screen.getByRole('button', { name: /team/i }).click();

    await waitFor(() => {
      expect(screen.getByText('team-content')).toBeTruthy();
    });
  });

  it('A005/isolation: renders crash fallback when a plugin panel crashes', async () => {
    crashingPluginIds = new Set(['chat']);
    snapshot.leftPanelTabs = [
      { id: 'chat', label: 'Chat', icon: 'MessageOutlined', component: async () => ({ default: () => createElement('div', null, 'chat-content') }) } as TabContribution,
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('crashed:chat')).toBeTruthy();
    });
  });
});
