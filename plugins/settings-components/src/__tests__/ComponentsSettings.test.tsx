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
    description: 'Embedded browser engine',
    license: 'BSD',
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

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'component_list') {
      return Promise.resolve([
        component({ id: 'cef', name: 'Chromium Embedded Framework', isInstalled: true }),
        component({ id: 'python-runtime', name: 'Python Runtime', isInstalled: false }),
      ]);
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
          component({ id: 'cef2', name: 'Chromium Embedded Framework', isInstalled: true }),
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
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          component({ id: 'python-runtime', name: 'Python Runtime', isInstalled: false }),
          component({ id: 'cef', name: 'CEF Runtime', isInstalled: true }),
        ]);
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

    expect(within(cefCard).getByText('CEF Runtime')).toBeInTheDocument();
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

describe('A007/settings-components: shows install button for uninstalled components', () => {
  it('A007/settings-components: displays Install action for uninstalled component', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          component({ id: 'cef', name: 'cef', isInstalled: false }),
        ]);
      }
      return Promise.resolve(undefined);
    });
    render(<ComponentsSettings />);

    await waitFor(() => {
      const card = screen.getByTestId('system-component-card-cef');
      expect(within(card).getByRole('button', { name: /install/i })).toBeInTheDocument();
    });
  });
});

describe('A007/settings-components: install button triggers actual invoke command', () => {
  it('A007/settings-components: install invokes component_download', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          component({ id: 'cef', name: 'cef', isInstalled: false }),
        ]);
      }
      if (cmd === 'component_download') {
        return Promise.resolve({ success: true, data: [] });
      }
      return Promise.resolve(undefined);
    });
    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_download', { id: 'cef' });
    });
  });
});

describe('A007/settings-components: error and fallback paths', () => {
  it('A007/settings-components: shows load error when component_list fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') return Promise.reject(new Error('offline'));
      if (cmd === 'python_pack_metadata') return Promise.reject(new Error('offline'));
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByText('offline')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-components: search shows no results for non-matching query', () => {
  it('A007/settings-components: search with non-matching text shows empty state', async () => {
    const user = userEvent.setup();
    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('system-component-card-cef')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search packs...'), 'nonexistent-pack');

    await waitFor(() => {
      expect(screen.queryByTestId('system-component-card-cef')).not.toBeInTheDocument();
    });
  });
});
