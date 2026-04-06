import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PluginsSettings from '../PluginsSettings';

const mockInvoke = vi.fn();

function makeSnapshot(plugins: Array<Record<string, unknown>> = []) {
  return { plugins };
}

beforeEach(() => {
  (window as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke: mockInvoke };
  mockInvoke.mockReset();
});

afterEach(() => {
  delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('A007/settings-plugins: plugin list', () => {
  it('A007/settings-plugins: renders plugin name from budget_snapshot', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: renders plugin version tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '2.3.1', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('2.3.1')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: renders plugin zone tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('zone3')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: renders plugin id as description', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('snapfzz.chat')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: shows multiple plugins from list', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
          { id: 'snapfzz.preview', name: 'Preview', version: '0.9.0', zone: 'zone3', strikes: 1, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: shows empty state when no plugins', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve(makeSnapshot([]));
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('No plugins installed.')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: falls back to id as name when name is absent', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.noname', version: '1.0.0', zone: 'zone2', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getAllByText('snapfzz.noname').length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('A007/settings-plugins: strikes display', () => {
  it('A007/settings-plugins: shows 0 strikes tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('0 strikes')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: shows 1 strike (singular) tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 1, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('1 strike')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: shows 2 strikes tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 2, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('2 strikes')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-plugins: enable/disable toggle', () => {
  it('A007/settings-plugins: enabled plugin has checked switch', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /toggle chat/i });
      expect(toggle).toBeChecked();
    });
  });

  it('A007/settings-plugins: disabled plugin has unchecked switch', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: false },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /toggle chat/i });
      expect(toggle).not.toBeChecked();
    });
  });

  it('A007/settings-plugins: toggling calls set_plugin_enabled with id and enabled=false', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle chat/i }));

    await user.click(screen.getByRole('switch', { name: /toggle chat/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_plugin_enabled', { id: 'snapfzz.chat', enabled: false });
    });
  });

  it('A007/settings-plugins: toggle optimistically updates switch before Tauri confirms', async () => {
    const user = userEvent.setup();
    let resolveDisable!: () => void;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      if (cmd === 'set_plugin_enabled') {
        return new Promise((resolve) => { resolveDisable = () => resolve(undefined); });
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle chat/i }));

    await user.click(screen.getByRole('switch', { name: /toggle chat/i }));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /toggle chat/i })).not.toBeChecked();
    });
    resolveDisable();
  });

  it('A007/settings-plugins: toggle reverts on set_plugin_enabled failure', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.chat', name: 'Chat', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      if (cmd === 'set_plugin_enabled') return Promise.reject(new Error('forbidden'));
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle chat/i }));

    await user.click(screen.getByRole('switch', { name: /toggle chat/i }));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /toggle chat/i })).toBeChecked();
    });
  });
});

describe('A007/settings-plugins: Tauri unavailable', () => {
  it('A007/settings-plugins: shows empty list when budget_snapshot rejects', async () => {
    mockInvoke.mockRejectedValue(new Error('no tauri'));
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('No plugins installed.')).toBeInTheDocument();
    });
  });
});
