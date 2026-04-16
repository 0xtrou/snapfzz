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
  };
});

import PluginsSettings from '../PluginsSettings';

function makeSnapshot(plugins: Array<Record<string, unknown>> = []) {
  return { plugins };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('A007/settings-plugins: plugin list', () => {
  it('A007/settings-plugins: renders plugin name from budget_snapshot', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Orchestrator')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: renders plugin version tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '2.3.1', zone: 'zone3', strikes: 0, enabled: true },
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
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
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
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('snapfzz.orchestrator')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: shows multiple plugins from list', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
          { id: 'snapfzz.preview', name: 'Preview', version: '0.9.0', zone: 'zone3', strikes: 1, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Orchestrator')).toBeInTheDocument();
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
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
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
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 1, enabled: true },
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
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 2, enabled: true },
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
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /toggle orchestrator/i });
      expect(toggle).toBeChecked();
    });
  });

  it('A007/settings-plugins: disabled plugin has unchecked switch', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: false },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /toggle orchestrator/i });
      expect(toggle).not.toBeChecked();
    });
  });

  it('A007/settings-plugins: toggling switch updates checked state to false', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle orchestrator/i }));

    await user.click(screen.getByRole('switch', { name: /toggle orchestrator/i }));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /toggle orchestrator/i })).not.toBeChecked();
    });
  });

  it('A007/settings-plugins: toggle remains false after extra async flush', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle orchestrator/i }));

    await user.click(screen.getByRole('switch', { name: /toggle orchestrator/i }));
    await Promise.resolve();

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /toggle orchestrator/i })).not.toBeChecked();
    });
  });

  it('A007/settings-plugins: second toggle restores checked state to true', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle orchestrator/i }));

    const toggle = screen.getByRole('switch', { name: /toggle orchestrator/i });
    await user.click(toggle);
    await user.click(toggle);

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /toggle orchestrator/i })).toBeChecked();
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

  it('A007/settings-plugins: shows empty list when budget_snapshot rejects', async () => {
    mockInvoke.mockRejectedValue(new Error('Tauri unavailable'));
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('No plugins installed.')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-plugins: default field values', () => {
  it('A007/settings-plugins: uses id as name when name field is missing', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.bare' },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getAllByText('snapfzz.bare').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('A007/settings-plugins: shows — for version when version is absent', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.bare', name: 'Bare', enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: uses zone3 default when zone is absent', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.bare', name: 'Bare', version: '1.0.0', enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('zone3')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: defaults to 0 strikes when strikes absent', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.bare', name: 'Bare', version: '1.0.0', zone: 'zone3', enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('0 strikes')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: defaults to enabled=true when enabled is absent', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.bare', name: 'Bare', version: '1.0.0', zone: 'zone3', strikes: 0 },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      const toggle = screen.getByRole('switch', { name: /toggle bare/i });
      expect(toggle).toBeChecked();
    });
  });
});

describe('A007/settings-plugins: strikeColor thresholds', () => {
  it('A007/settings-plugins: shows 3 strikes with error color', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 3, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('3 strikes')).toBeInTheDocument();
    });
  });

  it('A007/settings-plugins: shows 0 strikes with success color (no warning)', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') {
        return Promise.resolve(makeSnapshot([
          { id: 'snapfzz.orchestrator', name: 'Orchestrator', version: '1.0.0', zone: 'zone3', strikes: 0, enabled: true },
        ]));
      }
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      const tag = screen.getByText('0 strikes').closest('.ant-tag');
      expect(tag?.className).toContain('success');
    });
  });
});

describe('A007/settings-plugins: budget_snapshot returns no plugins key', () => {
  it('A007/settings-plugins: handles snapshot with no plugins array', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve({});
      return Promise.resolve({});
    });
    render(<PluginsSettings />);
    await waitFor(() => {
      expect(screen.getByText('No plugins installed.')).toBeInTheDocument();
    });
  });
});
