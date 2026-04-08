import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

import ComponentsSettings from '../ComponentsSettings';

function component(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cef',
    name: 'Chromium Embedded Framework',
    version: 'v146.0.10',
    platform: 'macos-arm64',
    platformDisplay: 'macOS (Apple Silicon)',
    downloadUrl: 'https://cef-builds.spotifycdn.com/macos-arm64/cef_binary.tar',
    installPath: '/Users/test/.snapfzz/runtime/cef',
    size: 124_000_000,
    checksum: 'abc123',
    checksumAlgorithm: 'sha256',
    isInstalled: false,
    ...overrides,
  };
}

function status(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    componentId: 'cef',
    bytesDownloaded: 0,
    bytesTotal: 0,
    percent: 0,
    status: 'pending',
    ...overrides,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
    if (cmd === 'component_list') {
      return Promise.resolve([
        component({ id: 'cef', name: 'Chromium Embedded Framework', isInstalled: true }),
        component({ id: 'llama-server', name: 'llama-server', isInstalled: false, installPath: '/Users/test/.snapfzz/runtime/llama', downloadUrl: 'https://example.com/llama-server.tar.gz' }),
      ]);
    }

    if (cmd === 'component_status') {
      const id = payload?.id as string;
      if (id === 'cef') return Promise.resolve(status({ componentId: 'cef', status: 'ready', percent: 100 }));
      return Promise.resolve(status({ componentId: 'llama-server', status: 'pending', percent: 0 }));
    }

    if (cmd === 'component_download') return Promise.resolve([status({ status: 'ready', percent: 100 })]);
    if (cmd === 'component_download_cancel') return Promise.resolve(undefined);
    if (cmd === 'component_uninstall') return Promise.resolve(undefined);
    if (cmd === 'open_path') return Promise.resolve(undefined);

    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('A007/settings-components: renders header', () => {
  it('A007/settings-components: renders System Components title', async () => {
    render(<ComponentsSettings />);
    expect(screen.getByText('System Packs')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_list');
    });
  });
});

describe('A007/settings-components: search filters components by name', () => {
  it('A007/settings-components: filters list with realtime search', async () => {
    const user = userEvent.setup();
    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByText('llama-server')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search packs...'), 'chromium');

    await waitFor(() => {
      expect(screen.getByText('Chromium Embedded Framework')).toBeInTheDocument();
      expect(screen.queryByText('llama-server')).not.toBeInTheDocument();
    });
  });
});

describe('A007/settings-components: grouped system packs', () => {
  it('A007/settings-components: groups standalone and python ecosystem packs in dependency order', async () => {
    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          component({ id: 'litellm', name: 'LiteLLM', isInstalled: false }),
          component({ id: 'cef', name: 'Chromium Embedded Framework', isInstalled: true }),
          component({ id: 'uv', name: 'uv', isInstalled: true, installPath: '/Users/test/.snapfzz/runtime/uv', downloadUrl: 'https://example.com/uv.tar.gz' }),
          component({ id: 'agentscope', name: 'AgentScope', isInstalled: false }),
          component({ id: 'python', name: 'Python', isInstalled: false }),
        ]);
      }
      if (cmd === 'component_status') {
        const id = payload?.id as string;
        return Promise.resolve(status({ componentId: id, status: id === 'cef' || id === 'uv' ? 'ready' : 'pending' }));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Standalone')).toBeInTheDocument();
      expect(screen.getAllByText('Python Ecosystem').length).toBeGreaterThan(0);
      expect(screen.getByText('1. Python')).toBeInTheDocument();
      expect(screen.getByText('2. AgentScope')).toBeInTheDocument();
      expect(screen.getByText('3. LiteLLM')).toBeInTheDocument();
    });

    const cefCard = screen.getByTestId('system-component-card-cef');
    const uvCard = screen.getByTestId('system-component-card-uv');
    const pythonCard = screen.getByTestId('system-component-card-python');
    const agentScopeCard = screen.getByTestId('system-component-card-agentscope');
    const liteLlmCard = screen.getByTestId('system-component-card-litellm');

    expect(within(cefCard).getByText('Chromium Embedded Framework')).toBeInTheDocument();
    expect(screen.getByText('Foundation Runtime')).toBeInTheDocument();
    expect(screen.getByText('Agent Integrations')).toBeInTheDocument();
    expect(within(pythonCard).getByText('1st')).toBeInTheDocument();
    expect(within(agentScopeCard).getByText('2nd')).toBeInTheDocument();
    expect(within(liteLlmCard).getByText('3rd')).toBeInTheDocument();
    expect(within(uvCard).getByText('Required by Python')).toBeInTheDocument();
    expect(within(pythonCard).getByText('Requires uv')).toBeInTheDocument();
    expect(within(agentScopeCard).getByText('Requires Python')).toBeInTheDocument();
    expect(within(liteLlmCard).getByText('Requires Python')).toBeInTheDocument();
    expect(within(agentScopeCard).getByRole('button', { name: /download/i })).toBeDisabled();
    expect(within(liteLlmCard).getByRole('button', { name: /download/i })).toBeDisabled();
  });
});

describe('A007/settings-components: shows installed badge for installed components', () => {
  it('A007/settings-components: displays Installed tag for ready component', async () => {
    render(<ComponentsSettings />);

    await waitFor(() => {
      const card = screen.getByTestId('system-component-card-cef');
      expect(within(card).getByText('Installed')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-components: shows download button for uninstalled components', () => {
  it('A007/settings-components: displays Download action for uninstalled component', async () => {
    render(<ComponentsSettings />);

    await waitFor(() => {
      const card = screen.getByTestId('system-component-card-llama-server');
      expect(within(card).getByRole('button', { name: /download/i })).toBeInTheDocument();
    });
  });
});

describe('A007/settings-components: uninstall button calls component_uninstall', () => {
  it('A007/settings-components: uninstall invokes component_uninstall command', async () => {
    const user = userEvent.setup();
    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('system-component-card-cef')).toBeInTheDocument();
    });

    const card = screen.getByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /uninstall/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_uninstall', { id: 'cef' });
    });
  });
});

describe('A007/settings-components: open folder button calls open_path', () => {
  it('A007/settings-components: open folder invokes open_path command', async () => {
    const user = userEvent.setup();
    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('system-component-card-cef')).toBeInTheDocument();
    });

    const card = screen.getByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /open folder/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('open_path', { path: '/Users/test/.snapfzz/runtime/cef' });
    });
  });
});

describe('A007/settings-components: error and fallback paths', () => {
  it('A007/settings-components: shows load error when component_list fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') return Promise.reject(new Error('offline'));
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load system packs right now.')).toBeInTheDocument();
      expect(screen.getByText('No system packs match your search.')).toBeInTheDocument();
    });
  });

  it('A007/settings-components: falls back to pending status when component_status fails', async () => {
    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([component({ id: 'broken', name: 'Broken Component', isInstalled: false })]);
      }
      if (cmd === 'component_status') {
        const id = payload?.id as string;
        if (id === 'broken') return Promise.reject(new Error('status failed'));
        return Promise.resolve(status({ componentId: id, status: 'pending' }));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      const card = screen.getByTestId('system-component-card-broken');
      expect(within(card).getByText('Not Installed')).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: /download/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-components: installed component stays installed when status lookup fails', async () => {
    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([component({ id: 'cef', name: 'Chromium Embedded Framework', isInstalled: true })]);
      }
      if (cmd === 'component_status') {
        const id = payload?.id as string;
        if (id === 'cef') return Promise.reject(new Error('status failed'));
        return Promise.resolve(status({ componentId: id, status: 'pending' }));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      const card = screen.getByTestId('system-component-card-cef');
      expect(within(card).getByText('Installed')).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: /open folder/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-components: download failure triggers status refresh path', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([component({ id: 'llama-server', name: 'llama-server', isInstalled: false })]);
      }
      if (cmd === 'component_status') {
        return Promise.resolve(status({ componentId: (payload?.id as string) || 'llama-server', status: 'pending' }));
      }
      if (cmd === 'component_download') {
        return Promise.reject(new Error('download failed'));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-llama-server');
    await user.click(within(card).getByRole('button', { name: /download/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_download', { id: 'llama-server' });
      expect(mockInvoke).toHaveBeenCalledWith('component_status', { id: 'llama-server' });
    });
  });

  it('A007/settings-components: cancel download errors are swallowed', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([component({ id: 'llama-server', name: 'llama-server', isInstalled: false })]);
      }
      if (cmd === 'component_status') {
        return Promise.resolve(status({ componentId: (payload?.id as string) || 'llama-server', status: 'downloading', percent: 42 }));
      }
      if (cmd === 'component_download_cancel') {
        return Promise.reject(new Error('cancel failed'));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-llama-server');
    await user.click(within(card).getByRole('button', { name: /cancel download/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_download_cancel', { id: 'llama-server' });
    });

    expect(screen.queryByText('Unable to uninstall component.')).not.toBeInTheDocument();
  });

  it('A007/settings-components: uninstall failure shows inline error', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([component({ id: 'cef', isInstalled: true })]);
      }
      if (cmd === 'component_status') {
        return Promise.resolve(status({ componentId: 'cef', status: 'ready' }));
      }
      if (cmd === 'component_uninstall') {
        return Promise.reject(new Error('cannot uninstall'));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /uninstall/i }));

    await waitFor(() => {
      expect(screen.getByText('Unable to uninstall component.')).toBeInTheDocument();
    });
  });

  it('A007/settings-components: successful download refreshes list', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([component({ id: 'llama-server', name: 'llama-server', isInstalled: false })]);
      }
      if (cmd === 'component_status') {
        return Promise.resolve(status({ componentId: (payload?.id as string) || 'llama-server', status: 'pending' }));
      }
      if (cmd === 'component_download') {
        return Promise.resolve([status({ componentId: 'llama-server', status: 'ready', percent: 100 })]);
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-llama-server');
    await user.click(within(card).getByRole('button', { name: /download/i }));

    await waitFor(() => {
      const listCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'component_list');
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('A007/settings-components: successful cancel refreshes status', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([component({ id: 'llama-server', name: 'llama-server', isInstalled: false })]);
      }
      if (cmd === 'component_status') {
        return Promise.resolve(status({ componentId: (payload?.id as string) || 'llama-server', status: 'downloading', percent: 35 }));
      }
      if (cmd === 'component_download_cancel') {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-llama-server');
    await user.click(within(card).getByRole('button', { name: /cancel download/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_download_cancel', { id: 'llama-server' });
      expect(mockInvoke).toHaveBeenCalledWith('component_status', { id: 'llama-server' });
    });
  });

  it('A007/settings-components: search matches id with trimming and lowercase normalization', async () => {
    const user = userEvent.setup();
    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('system-component-card-llama-server')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search packs...'), '  LLAMA-SERVER  ');

    await waitFor(() => {
      expect(screen.getByText('llama-server')).toBeInTheDocument();
      expect(screen.queryByText('Chromium Embedded Framework')).not.toBeInTheDocument();
    });
  });
});

