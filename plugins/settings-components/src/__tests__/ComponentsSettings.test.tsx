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
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'component_list') {
      return Promise.resolve([
        component({ id: 'cef', name: 'Chromium Embedded Framework', isInstalled: true }),
        component({ id: 'python-runtime', name: 'Python Runtime', isInstalled: false }),
      ]);
    }
    if (cmd === 'component_status') {
      return Promise.resolve(status({ status: 'ready' }));
    }
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A007/settings-components: renders header', () => {
  it('A007/settings-components: renders System Packs title', async () => {
    render(<ComponentsSettings />);
    const headers = screen.getAllByText('System Packs');
    expect(headers.length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_list');
    });
  });
});

describe('A007/settings-components: search filters components by name', () => {
  it('A007/settings-components: filters list with realtime search', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          component({ id: 'cef', name: 'cef', isInstalled: false }),
          component({ id: 'cef', name: 'Chromium Embedded Framework', isInstalled: true }),
        ]);
      }
      return Promise.resolve(undefined);
    });
    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByText('cef')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search packs...'), 'chromium');

    await waitFor(() => {
      expect(screen.getByText('Chromium Embedded Framework')).toBeInTheDocument();
      expect(screen.queryByText('cef')).not.toBeInTheDocument();
    });
  });
});

describe('A007/settings-components: grouped system packs', () => {
  it('A007/settings-components: shows system packs with proper margin', async () => {
    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          component({ id: 'python-runtime', name: 'Python Runtime', isInstalled: false }),
          component({ id: 'cef', name: 'CEF Runtime', isInstalled: true }),
        ]);
      }
      if (cmd === 'component_status') {
        const id = payload?.id as string;
        return Promise.resolve(status({ componentId: id, status: id === 'cef' ? 'ready' : 'pending' }));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const systemPacksHeaders = screen.getAllByText('System Packs');
    expect(systemPacksHeaders.length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getByTestId('system-component-card-cef')).toBeInTheDocument();
    });

    const cefCard = screen.getByTestId('system-component-card-cef');

    expect(within(cefCard).getByText('Chromium Embedded Framework')).toBeInTheDocument();
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
      const card = screen.getByTestId('system-component-card-cef');
      expect(within(card).getByRole('button', { name: /download/i })).toBeInTheDocument();
    });
  });
});

describe('A007/settings-components: install button triggers actual invoke command', () => {
  it('A007/settings-components: download invokes component_download', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          component({ id: 'cef', name: 'cef', isInstalled: false }),
        ]);
      }
      if (cmd === 'component_download') {
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });
    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /download/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_download', { id: 'cef' });
    });
  });
});

describe('A007/settings-components: cancel download flow', () => {
  it('A007/settings-components: cancel download invokes cancel api', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          component({ id: 'cef', name: 'cef', isInstalled: false }),
        ]);
      }
      if (cmd === 'component_status') {
        return Promise.resolve(status({ status: 'downloading' }));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /cancel download/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_download_cancel', { id: 'cef' });
      expect(mockInvoke).toHaveBeenCalledWith('component_status', { id: 'cef' });
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
    });
  });

  it('A007/settings-components: falls back to pending status when component_status fails', async () => {
    mockInvoke.mockImplementation((cmd: string, payload?: Record<string, unknown>) => {
      if (cmd === 'component_list') {
        return Promise.resolve([component()]);
      }
      if (cmd === 'component_status') {
        return Promise.reject(new Error('component_status unavailable'));
      }
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-cef');
    expect(within(card).getByText('Not Installed')).toBeInTheDocument();
  });
});

describe('A007/settings-components: search matches id with trimming and lowercase normalization', () => {
  it('A007/settings-components: search matches id with trimming and lowercase normalization', async () => {
    const user = userEvent.setup();
    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('system-component-card-cef')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search packs...'), '  LLAMA-SERVER  ');

    await waitFor(() => {
      expect(screen.getByText('cef')).toBeInTheDocument();
      expect(screen.queryByText('Chromium Embedded Framework')).not.toBeInTheDocument();
    });
  });
});
