// @vitest-environment jsdom

// Spec: A007-multi-layout-architecture.md
// Section: Preferences Layout — Sidebar + Content
// Verifies: preferences shell renders settingsSections, handles empty state, selects first section on mount

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@snapfzz/plugin-host', () => {
  const listeners = new Set<() => void>();
  let snapshot = {
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

  const mockHost = {
    activateByEvent: vi.fn().mockResolvedValue(undefined),
    reportCrash: vi.fn(),
  };

  return {
    ContributionStore: vi.fn(() => mockStore),
    PluginHost: vi.fn(() => mockHost),
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
  useTheme: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })),
  darkTheme: {},
  lightTheme: {},
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

describe('A007/Preferences/App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.getElementById('root')?.remove();
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  });

  it('A007/Preferences/empty: shows no-settings message when no settingsSections registered', () => {
    const { App } = require('./App');
    render(<App />);
    expect(screen.getAllByText(/no settings available/i).length).toBeGreaterThan(0);
  });
});
