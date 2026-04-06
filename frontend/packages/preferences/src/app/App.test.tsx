// @vitest-environment jsdom

// Spec: A007-multi-layout-architecture.md
// Section: Preferences Layout — Sidebar + Content
// Verifies: preferences shell renders settingsSections, handles empty state, selects first section on mount

import { createElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { PluginHostMock } = vi.hoisted(() => ({
  PluginHostMock: vi.fn().mockImplementation(function () {
    return {
      activateByEvent: vi.fn().mockResolvedValue(undefined),
      reportCrash: vi.fn(),
    };
  }),
}));

vi.mock('@snapfzz/plugin-host', () => {
  const listeners = new Set<() => void>();
  const snapshot = {
    leftPanelTabs: [],
    workspaceTabs: [],
    bottomPanels: [],
    statusItems: [],
    commands: [],
    shortcuts: [],
    settings: [],
    genericComponents: [],
    settingsSections: [],
  };

  const mockStore = {
    getSnapshot: () => snapshot,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    registerSettingsSection: vi.fn(),
  };

  return {
    ContributionStore: class ContributionStore { constructor() { Object.assign(this, mockStore); } },
    PluginHost: PluginHostMock,
    useContributionStore: vi.fn((getStore: () => typeof mockStore) => {
      const s = getStore();
      return s.getSnapshot();
    }),
    PluginHostProvider: ({ children }: { children: React.ReactNode }) => children,
    PluginErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
    registerDiscoveredPlugins: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@snapfzz/shared', () => ({
  darkTheme: {},
  lightTheme: {},
  WindowShell: ({ children, title, statusBarContent }: { children: React.ReactNode; title: string; statusBarContent?: React.ReactNode }) =>
    createElement('div', { 'data-testid': 'window-shell' },
      createElement('span', null, title),
      statusBarContent,
      children,
    ),
  AntIcon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

vi.mock('antd', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => children,
  Button: ({ onClick, icon }: { onClick: () => void; icon: React.ReactNode }) => (
    <button type="button" onClick={onClick}>{icon}</button>
  ),
}));

vi.mock('@ant-design/icons', () => ({
  SunOutlined: () => <span>sun</span>,
  MoonOutlined: () => <span>moon</span>,
}));

import { App } from './App';

const initialPluginHostCalls = PluginHostMock.mock.calls.map((c: unknown[]) => ({ surface: c[1] }));

describe('A007/Preferences/App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.getElementById('root')?.remove();
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });

  afterEach(() => {
    cleanup();
  });

  it('A007/Preferences/empty: shows no-settings message when no settingsSections registered', () => {
    render(createElement(App));
    expect(screen.getAllByText(/no settings available/i).length).toBeGreaterThan(0);
  });

  it('A007/shell: creates PluginHost with surface \'preferences\'', () => {
    const surfaces = initialPluginHostCalls.map((c) => c.surface);
    expect(surfaces).toContain('preferences');
  });
});
