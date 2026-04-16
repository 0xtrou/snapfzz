import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@snapfzz/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@snapfzz/shared')>();
  return {
    ...actual,
    createTauriBridge: () => ({
      isAvailable: true,
      invoke: mockInvoke,
      listen: vi.fn().mockResolvedValue(() => {}),
    }),
    fetchWithToast: async (fn: () => Promise<unknown>, _opts?: unknown) => {
      try {
        const data = await fn();
        return { data, error: null };
      } catch (err) {
        return { data: null, error: err };
      }
    },
  };
});

import PluginsSettings from '../PluginsSettings';

function makeSystemPlugin(overrides: Record<string, unknown> = {}) {
  return {
    pluginId: 'snapfzz.orchestrator',
    manifest: {
      name: 'Orchestrator',
      version: '1.2.3',
      runtimes: { python: ['snapfzz.orchestrator>=1.0.0'] },
      ...((overrides.manifest as Record<string, unknown>) ?? {}),
    },
    distPath: '/home/.snapfzz/plugins/snapfzz.orchestrator/dist',
    ...overrides,
  };
}

function setupMocks(systemPlugins: unknown[] = [], budgetPlugins: unknown[] = []) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'budget_snapshot') return Promise.resolve({ plugins: budgetPlugins });
    if (cmd === 'list_installed_plugins') return Promise.resolve(systemPlugins);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('A020/settings-plugins: system plugins section', () => {
  it('renders system plugin name from manifest', async () => {
    setupMocks([makeSystemPlugin()]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Orchestrator')).toBeInTheDocument();
    });
  });

  it('renders system plugin version tag', async () => {
    setupMocks([makeSystemPlugin()]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('1.2.3')).toBeInTheDocument();
    });
  });

  it('renders system plugin id as description', async () => {
    setupMocks([makeSystemPlugin()]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('snapfzz.orchestrator')).toBeInTheDocument();
    });
  });

  it('falls back to pluginId as name when manifest name is absent', async () => {
    setupMocks([makeSystemPlugin({ pluginId: 'snapfzz.noname', manifest: { version: '0.1.0' } })]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getAllByText('snapfzz.noname').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows — for version when manifest version is absent', async () => {
    setupMocks([makeSystemPlugin({ manifest: { name: 'Bare' } })]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('shows Reload button for each system plugin', async () => {
    setupMocks([makeSystemPlugin()]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reload orchestrator/i })).toBeInTheDocument();
    });
  });

  it('shows multiple system plugins', async () => {
    setupMocks([
      makeSystemPlugin({ pluginId: 'snapfzz.orchestrator', manifest: { name: 'Orchestrator', version: '1.0.0' } }),
      makeSystemPlugin({ pluginId: 'snapfzz.preview', manifest: { name: 'Preview', version: '0.5.0' } }),
    ]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Orchestrator')).toBeInTheDocument();
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });

  it('shows empty state when list_installed_plugins returns empty array', async () => {
    setupMocks([]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('No plugins installed.')).toBeInTheDocument();
    });
  });

  it('shows empty state when list_installed_plugins rejects', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve({ plugins: [] });
      if (cmd === 'list_installed_plugins') return Promise.reject(new Error('tauri unavailable'));
      return Promise.resolve(null);
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('No plugins installed.')).toBeInTheDocument();
    });
  });

  it('shows system type tag for system plugins', async () => {
    setupMocks([makeSystemPlugin()]);
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('system')).toBeInTheDocument();
    });
  });
});

describe('A020/settings-plugins: reload button', () => {
  it('calls install_system_plugin on reload', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve({ plugins: [] });
      if (cmd === 'list_installed_plugins') return Promise.resolve([makeSystemPlugin()]);
      return Promise.resolve(null);
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reload orchestrator/i }));

    await user.click(screen.getByRole('button', { name: /reload orchestrator/i }));
    // Confirm the popover
    await waitFor(() => screen.getByRole('button', { name: /^Reload$/i }));
    await user.click(screen.getByRole('button', { name: /^Reload$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('install_system_plugin', { pluginId: 'snapfzz.orchestrator', force: true });
    });
  });

  it('calls install_plugin_runtime with python declaration on reload', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve({ plugins: [] });
      if (cmd === 'list_installed_plugins') return Promise.resolve([makeSystemPlugin()]);
      return Promise.resolve(null);
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reload orchestrator/i }));

    await user.click(screen.getByRole('button', { name: /reload orchestrator/i }));
    await waitFor(() => screen.getByRole('button', { name: /^Reload$/i }));
    await user.click(screen.getByRole('button', { name: /^Reload$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('install_plugin_runtime', { declaration: 'snapfzz.orchestrator>=1.0.0' });
    });
  });

  it('does not call install_plugin_runtime when no python runtime in manifest', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve({ plugins: [] });
      if (cmd === 'list_installed_plugins') return Promise.resolve([
        makeSystemPlugin({ manifest: { name: 'NoRuntime', version: '1.0.0' } }),
      ]);
      return Promise.resolve(null);
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reload noruntime/i }));

    await user.click(screen.getByRole('button', { name: /reload noruntime/i }));
    await waitFor(() => screen.getByRole('button', { name: /^Reload$/i }));
    await user.click(screen.getByRole('button', { name: /^Reload$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('install_system_plugin', { pluginId: 'snapfzz.orchestrator', force: true });
      expect(mockInvoke).not.toHaveBeenCalledWith('install_plugin_runtime', expect.anything());
    });
  });

  it('independent reload loading state per plugin', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve({ plugins: [] });
      if (cmd === 'list_installed_plugins') return Promise.resolve([
        makeSystemPlugin({ pluginId: 'snapfzz.orchestrator', manifest: { name: 'Orchestrator', version: '1.0.0' } }),
        makeSystemPlugin({ pluginId: 'snapfzz.preview', manifest: { name: 'Preview', version: '0.5.0' } }),
      ]);
      return Promise.resolve(null);
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reload orchestrator/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reload preview/i })).toBeInTheDocument();
    });

    // Click orchestrator reload — preview button should remain enabled
    await user.click(screen.getByRole('button', { name: /reload orchestrator/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reload preview/i })).not.toBeDisabled();
    });
  });
});
