import { createElement } from 'react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { SettingsSectionContribution } from '@snapfzz/plugin-sdk';

const emptySnapshot = {
  leftPanelTabs: [] as unknown[],
  workspaceTabs: [] as unknown[],
  bottomPanels: [] as unknown[],
  statusItems: [] as unknown[],
  commands: [] as unknown[],
  shortcuts: [] as unknown[],
  settings: [] as unknown[],
  genericComponents: [] as unknown[],
  settingsSections: [] as SettingsSectionContribution[],
};

let snapshot = { ...emptySnapshot };
let crashingSectionIds = new Set<string>();

const { PluginHostMock, registerDiscoveredPluginsMock } = vi.hoisted(() => ({
  PluginHostMock: vi.fn().mockImplementation(function () {
    return {
      activateByEvent: vi.fn().mockResolvedValue(undefined),
      reportCrash: vi.fn(),
    };
  }),
  registerDiscoveredPluginsMock: vi.fn().mockResolvedValue(undefined),
}));

function createSection(id: string, label: string, icon: string, order: number, content: string): SettingsSectionContribution {
  return {
    id,
    label,
    icon,
    order,
    component: async () => ({ default: () => createElement('div', null, content) }),
  };
}

function createThrowingSection(id: string, label: string): SettingsSectionContribution {
  return {
    id,
    label,
    icon: 'BugOutlined',
    order: 1,
    component: async () => ({
      default: () => {
        throw new Error('section crash');
      },
    }),
  };
}

vi.mock('@snapfzz/plugin-host', () => ({
  ContributionStore: class ContributionStore {
    getSnapshot() {
      return snapshot;
    }

    subscribe() {
      return () => undefined;
    }
  },
  PluginHost: PluginHostMock,
  useContributionStore: vi.fn((getStore: () => { getSnapshot: () => typeof snapshot }) => getStore().getSnapshot()),
  PluginHostProvider: ({ children }: { children: ReactNode }) => createElement('div', { 'data-testid': 'plugin-host-provider' }, children),
  PluginErrorBoundary: ({
    children,
    pluginId,
    onCrash,
  }: {
    children: ReactNode;
    pluginId?: string;
    onCrash?: (pluginId: string, error: Error) => void;
  }) => {
    if (pluginId && crashingSectionIds.has(pluginId)) {
      onCrash?.(pluginId, new Error('section crash'));
      return createElement('div', null, `crashed:${pluginId}`);
    }

    return children;
  },
  registerDiscoveredPlugins: registerDiscoveredPluginsMock,
}));

vi.mock('@snapfzz/shared', () => ({
  darkTheme: {},
  lightTheme: {},
  WindowShell: ({ children, title, statusBarContent }: { children: React.ReactNode; title: string; statusBarContent?: React.ReactNode }) =>
    createElement('div', { 'data-testid': 'window-shell' },
      createElement('span', null, title),
      statusBarContent,
      children,
    ),
  AntIcon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }, name),
}));

import { App } from './App';

const initialPluginHostCalls = PluginHostMock.mock.calls.map((call: unknown[]) => ({ surface: call[1] }));

describe('A007/Preferences/App', () => {
  beforeEach(() => {
    cleanup();
    registerDiscoveredPluginsMock.mockClear();
    snapshot = { ...emptySnapshot };
    crashingSectionIds = new Set<string>();
    document.documentElement.removeAttribute('data-app-ready');
    const skeleton = document.getElementById('skeleton');
    if (skeleton) skeleton.remove();
  });

  afterEach(() => {
    cleanup();
  });

  it('sets data-app-ready and fades skeleton on hydration', async () => {
    const skeleton = document.createElement('div');
    skeleton.id = 'skeleton';
    document.body.appendChild(skeleton);

    render(createElement(App));

    expect(document.documentElement.getAttribute('data-app-ready')).toBe('true');
    await waitFor(() => {
      expect(skeleton.classList.contains('fade-out')).toBe(true);
    });
  });

  it('shows no-settings message when no settingsSections are registered', () => {
    render(createElement(App));

    expect(screen.getAllByText(/no settings available/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('● Connected')).toBeTruthy();
  });

  it('renders sorted settings sections and selects first section automatically', async () => {
    snapshot.settingsSections = [
      createSection('advanced', 'Advanced', 'ToolOutlined', 20, 'advanced-content'),
      createSection('general', 'General', 'SettingOutlined', 10, 'general-content'),
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('General')).toBeTruthy();
      expect(screen.getByText('Advanced')).toBeTruthy();
      expect(screen.getByText('general-content')).toBeTruthy();
    });

    const sectionButtons = screen.getAllByRole('button');
    expect(sectionButtons[0]?.textContent).toContain('General');
    expect(sectionButtons[1]?.textContent).toContain('Advanced');
  });

  it('switches section content when selecting another sidebar item', async () => {
    snapshot.settingsSections = [
      createSection('general', 'General', 'SettingOutlined', 1, 'general-content'),
      createSection('plugins', 'Plugins', 'AppstoreOutlined', 2, 'plugins-content'),
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('general-content')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /plugins/i }));

    await waitFor(() => {
      expect(screen.getByText('plugins-content')).toBeTruthy();
    });
  });

  it('creates PluginHost with preferences surface', () => {
    render(createElement(App));

    const surfaces = initialPluginHostCalls.map((call) => call.surface);
    expect(surfaces).toContain('preferences');
  });

  it('renders plugin boundary fallback when selected section crashes', async () => {
    crashingSectionIds = new Set(['broken']);
    snapshot.settingsSections = [
      createThrowingSection('broken', 'Broken'),
    ];

    render(createElement(App));

    await waitFor(() => {
      expect(screen.getByText('crashed:broken')).toBeTruthy();
    });
  });
});
