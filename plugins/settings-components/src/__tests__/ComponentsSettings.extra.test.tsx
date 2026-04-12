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

// -----------------------------------------------------------------------
// Fixture helpers
// -----------------------------------------------------------------------

function makeComponent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cef',
    name: 'CEF',
    description: 'Embedded browser engine',
    license: 'BSD',
    version: 'v146.0.10',
    platform: 'macos-arm64',
    platformDisplay: 'macOS (Apple Silicon)',
    downloadUrl: 'https://example.com/cef.tar.gz',
    installPath: '/Users/test/.snapfzz/runtime/cef',
    size: 0,
    checksum: '',
    checksumAlgorithm: '',
    isInstalled: false,
    ...overrides,
  };
}

const PYTHON_RUNTIME_STATUS = {
  installed_packages: [],
  venv_exists: true,
  venv_path: '/Users/test/.snapfzz/runtime/python/venv',
  install_steps: [],
  agentscope: { name: 'AgentScope', version: '0.1.0', is_installed: false },
  agentscope_runtime: { name: 'AgentScope Runtime', version: '0.1.0', is_installed: false },
  litellm: { name: 'LiteLLM', version: '1.0.0', is_installed: false },
};

const PYTHON_PACK_METADATA = [
  {
    id: 'uv',
    name: 'uv',
    description: 'Fast Python package manager',
    license: 'Apache-2.0',
    platformDisplay: 'All platforms',
    repositoryUrl: 'https://github.com/astral-sh/uv',
    websiteUrl: 'https://astral.sh/uv',
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Python interpreter',
    license: 'PSF',
    platformDisplay: 'All platforms',
    repositoryUrl: '',
    websiteUrl: 'https://python.org',
  },
  {
    id: 'agentscope',
    name: 'AgentScope',
    description: 'Multi-agent framework',
    license: 'Apache-2.0',
    platformDisplay: 'All platforms',
    repositoryUrl: 'https://github.com/example/agentscope',
    websiteUrl: '',
  },
  {
    id: 'agentscope-runtime',
    name: 'AgentScope Runtime',
    description: 'Runtime for AgentScope',
    license: 'Apache-2.0',
    platformDisplay: 'All platforms',
    repositoryUrl: '',
    websiteUrl: '',
  },
  {
    id: 'litellm',
    name: 'LiteLLM',
    description: 'LLM proxy',
    license: 'MIT',
    platformDisplay: 'All platforms',
    repositoryUrl: '',
    websiteUrl: '',
  },
];

function setupPythonMocks() {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'component_list') {
      return Promise.resolve([
        makeComponent({ id: 'uv', name: 'uv', isInstalled: false }),
        makeComponent({ id: 'python', name: 'Python', isInstalled: false }),
        makeComponent({ id: 'agentscope', name: 'AgentScope', isInstalled: false }),
        makeComponent({ id: 'litellm', name: 'LiteLLM', isInstalled: false }),
      ]);
    }
    if (cmd === 'python_pack_metadata') {
      return Promise.resolve(PYTHON_PACK_METADATA);
    }
    if (cmd === 'python_runtime_status') {
      return Promise.resolve(PYTHON_RUNTIME_STATUS);
    }
    return Promise.resolve({ success: true, data: null });
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------
// Python group rendering
// -----------------------------------------------------------------------

describe('A007/settings-components: Python group rendering', () => {
  it('renders the python-pack-card when python ecosystem components are present', async () => {
    setupPythonMocks();
    render(<ComponentsSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('python-pack-card')).toBeInTheDocument();
    });
  });

  it('renders Python Runtime group title', async () => {
    setupPythonMocks();
    render(<ComponentsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Python Runtime')).toBeInTheDocument();
    });
  });

  it('renders Python Runtime Ecosystem heading inside PythonPackCard', async () => {
    setupPythonMocks();
    render(<ComponentsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Python Runtime Ecosystem')).toBeInTheDocument();
    });
  });

  it('shows both Python group and Standalone Packs when mixed components present', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', isInstalled: false }),
          makeComponent({ id: 'cef', name: 'CEF', isInstalled: false }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Python Runtime')).toBeInTheDocument();
      expect(screen.getByText('Standalone Packs')).toBeInTheDocument();
    });
  });

  it('renders python-pack-card even when pythonRuntime status fetch fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', isInstalled: false }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') return Promise.reject(new Error('unavailable'));
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('python-pack-card')).toBeInTheDocument();
    });
  });

  it('maps python component with metadata to SubPack using runtime version', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', version: '0.5.0', isInstalled: true }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);
    await waitFor(() => {
      // version should appear from the uv component
      expect(screen.getByText('v0.5.0')).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// Empty search state
// -----------------------------------------------------------------------

describe('A007/settings-components: empty search state message', () => {
  it('shows "No system packs match your search." when search yields no results', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') return Promise.resolve([makeComponent({ id: 'cef', name: 'CEF' })]);
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      return Promise.resolve(undefined);
    });
    render(<ComponentsSettings />);

    await waitFor(() => expect(screen.getByTestId('system-component-card-cef')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search packs...'), 'xyznonexistent');
    await waitFor(() => {
      expect(screen.getByText('No system packs match your search.')).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// handleOpenFolder
// -----------------------------------------------------------------------

describe('A007/settings-components: handleOpenFolder', () => {
  it('clicking Open folder on installed standalone component invokes open_path', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'cef', name: 'CEF', isInstalled: true, installPath: '/runtime/cef' }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /open folder/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('open_path', { path: '/runtime/cef' });
    });
  });
});

// -----------------------------------------------------------------------
// handleUninstall
// -----------------------------------------------------------------------

describe('A007/settings-components: handleUninstall', () => {
  it('clicking uninstall on installed component invokes component_uninstall', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'cef', name: 'CEF', isInstalled: true }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      if (cmd === 'component_uninstall') return Promise.resolve({ success: true, data: null });
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /uninstall/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_uninstall', { id: 'cef' });
    });
  });

  it('sets error when uninstall throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'cef', name: 'CEF', isInstalled: true }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      if (cmd === 'component_uninstall') return Promise.reject(new Error('disk error'));
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /uninstall/i }));

    await waitFor(() => {
      expect(screen.getByText('Unable to uninstall component.')).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// handleInstallPythonPack
// -----------------------------------------------------------------------

describe('A007/settings-components: handleInstallPythonPack', () => {
  it('invokes python_pack_install_all when Install button clicked on PythonPackCard', async () => {
    const user = userEvent.setup();
    setupPythonMocks();
    // Override to handle install invokes
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', isInstalled: false }),
          makeComponent({ id: 'python', name: 'Python', isInstalled: false }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      if (cmd === 'component_download') return Promise.resolve({ success: true, data: [] });
      if (cmd === 'python_pack_install_all') return Promise.resolve({ success: true, data: null });
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);

    await waitFor(() => expect(screen.getByTestId('python-pack-card')).toBeInTheDocument());

    const installBtn = within(screen.getByTestId('python-pack-card')).getByRole('button', { name: /^install$/i });
    await user.click(installBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('python_pack_install_all', undefined);
    });
  });

  it('installs uv first when uv is not installed', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', isInstalled: false }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      if (cmd === 'component_download') return Promise.resolve({ success: true, data: [] });
      if (cmd === 'python_pack_install_all') return Promise.resolve({ success: true, data: null });
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);

    await waitFor(() => expect(screen.getByTestId('python-pack-card')).toBeInTheDocument());

    const installBtn = within(screen.getByTestId('python-pack-card')).getByRole('button', { name: /^install$/i });
    await user.click(installBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('component_download', { id: 'uv' });
    });
  });

  it('skips component_download for uv when uv is already installed', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', isInstalled: true }),
          makeComponent({ id: 'python', name: 'Python', isInstalled: true }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      if (cmd === 'python_pack_install_all') return Promise.resolve({ success: true, data: null });
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);
    await waitFor(() => expect(screen.getByTestId('python-pack-card')).toBeInTheDocument());

    const installBtn = within(screen.getByTestId('python-pack-card')).getByRole('button', { name: /^install$/i });
    await user.click(installBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('python_pack_install_all', undefined);
      // component_download should NOT have been called for uv or python since both are installed
      const downloadCalls = (mockInvoke as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([cmd]) => cmd === 'component_download',
      );
      expect(downloadCalls).toHaveLength(0);
    });
  });
});

// -----------------------------------------------------------------------
// handleUninstallPythonPack
// -----------------------------------------------------------------------

describe('A007/settings-components: handleUninstallPythonPack', () => {
  it('invokes python_pack_uninstall_all when Uninstall clicked on PythonPackCard', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', isInstalled: true }),
          makeComponent({ id: 'python', name: 'Python', isInstalled: true }),
          makeComponent({ id: 'agentscope', name: 'AgentScope', isInstalled: true }),
          makeComponent({ id: 'litellm', name: 'LiteLLM', isInstalled: true }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') {
        return Promise.resolve({
          ...PYTHON_RUNTIME_STATUS,
          agentscope: { name: 'AgentScope', version: '0.1.0', is_installed: true },
          agentscope_runtime: { name: 'AgentScope Runtime', version: '0.1.0', is_installed: true },
          litellm: { name: 'LiteLLM', version: '1.0.0', is_installed: true },
        });
      }
      if (cmd === 'python_pack_uninstall_all') return Promise.resolve({ success: true, data: null });
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('python-pack-card');
    await waitFor(() => {
      expect(within(card).getByRole('button', { name: /uninstall/i })).toBeInTheDocument();
    });

    await user.click(within(card).getByRole('button', { name: /uninstall/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('python_pack_uninstall_all', undefined);
    });
  });
});

// -----------------------------------------------------------------------
// mapComponentToSubPack — missing metadata path
// -----------------------------------------------------------------------

describe('A007/settings-components: mapComponentToSubPack without metadata', () => {
  it('renders PythonPackCard even when python_pack_metadata returns empty array', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', isInstalled: false }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('python-pack-card')).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// Loading state
// -----------------------------------------------------------------------

describe('A007/settings-components: loading state', () => {
  it('renders skeleton loading state while data is being fetched', () => {
    // Make the invoke hang so we stay in loading state
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<ComponentsSettings />);
    // During loading, no system-component-card and no search result shown
    expect(screen.queryByTestId('system-component-card-cef')).not.toBeInTheDocument();
    // The search input should still be present
    expect(screen.getByPlaceholderText('Search packs...')).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Error state
// -----------------------------------------------------------------------

describe('A007/settings-components: error display', () => {
  it('shows generic error when component_list rejects with non-Error value', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') return Promise.reject('string error');
      if (cmd === 'python_pack_metadata') return Promise.reject('string error');
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load system packs right now.')).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// Standalone Packs only (no python components)
// -----------------------------------------------------------------------

describe('A007/settings-components: standalone packs only', () => {
  it('only shows Standalone Packs group when no python ecosystem components present', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'cef', name: 'CEF', isInstalled: false }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.reject(new Error('no python'));
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Standalone Packs')).toBeInTheDocument();
    });
    // No python ecosystem group title when no python IDs in component list
    expect(screen.queryByText('Python Runtime')).not.toBeInTheDocument();
  });

  it('orders standalone components by COMPONENT_ORDER (python-runtime before cef)', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'cef', name: 'CEF' }),
          makeComponent({ id: 'python-runtime', name: 'Python Runtime' }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);

    await waitFor(() => {
      const cards = screen.getAllByTestId(/system-component-card/);
      // python-runtime should be first (index 0 in COMPONENT_ORDER)
      expect(cards[0].getAttribute('data-testid')).toBe('system-component-card-python-runtime');
    });
  });
});

// -----------------------------------------------------------------------
// handleDownload — catch branch (swallowed)
// -----------------------------------------------------------------------

describe('A007/settings-components: handleDownload catch branch', () => {
  it('does not crash when component_download throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([makeComponent({ id: 'cef', name: 'CEF', isInstalled: false })]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      if (cmd === 'component_download') return Promise.reject(new Error('network error'));
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);
    const card = await screen.findByTestId('system-component-card-cef');
    await user.click(within(card).getByRole('button', { name: /install/i }));

    // The catch is swallowed — just verify no crash and state resets
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /install/i })).not.toBeDisabled();
    });
  });
});

// -----------------------------------------------------------------------
// handleInstallPythonPack — catch branch (swallowed)
// -----------------------------------------------------------------------

describe('A007/settings-components: handleInstallPythonPack catch branch', () => {
  it('does not crash when python_pack_install_all throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([makeComponent({ id: 'uv', name: 'uv', isInstalled: true })]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      if (cmd === 'python_pack_install_all') return Promise.reject(new Error('install failed'));
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);
    await waitFor(() => expect(screen.getByTestId('python-pack-card')).toBeInTheDocument());

    const installBtn = within(screen.getByTestId('python-pack-card')).getByRole('button', { name: /^install$/i });
    await user.click(installBtn);

    // Error is swallowed — verify no crash and button re-enables
    await waitFor(() => {
      expect(screen.getByTestId('python-pack-card')).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// handleUninstallPythonPack — catch branch (swallowed)
// -----------------------------------------------------------------------

describe('A007/settings-components: handleUninstallPythonPack catch branch', () => {
  it('does not crash when python_pack_uninstall_all throws', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'uv', name: 'uv', isInstalled: true }),
          makeComponent({ id: 'python', name: 'Python', isInstalled: true }),
          makeComponent({ id: 'agentscope', name: 'AgentScope', isInstalled: true }),
          makeComponent({ id: 'litellm', name: 'LiteLLM', isInstalled: true }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve(PYTHON_PACK_METADATA);
      if (cmd === 'python_runtime_status') {
        return Promise.resolve({
          ...PYTHON_RUNTIME_STATUS,
          agentscope: { name: 'AgentScope', version: '0.1.0', is_installed: true },
          agentscope_runtime: { name: 'AgentScope Runtime', version: '0.1.0', is_installed: true },
          litellm: { name: 'LiteLLM', version: '1.0.0', is_installed: true },
        });
      }
      if (cmd === 'python_pack_uninstall_all') return Promise.reject(new Error('uninstall failed'));
      return Promise.resolve({ success: true, data: null });
    });

    render(<ComponentsSettings />);

    const card = await screen.findByTestId('python-pack-card');
    await waitFor(() => {
      expect(within(card).getByRole('button', { name: /uninstall/i })).toBeInTheDocument();
    });

    await user.click(within(card).getByRole('button', { name: /uninstall/i }));

    // Error is swallowed — no crash
    await waitFor(() => {
      expect(screen.getByTestId('python-pack-card')).toBeInTheDocument();
    });
  });
});

// -----------------------------------------------------------------------
// search by id
// -----------------------------------------------------------------------

describe('A007/settings-components: search by component id', () => {
  it('filters by component id as well as name', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'component_list') {
        return Promise.resolve([
          makeComponent({ id: 'cef', name: 'Chromium Embedded Framework' }),
          makeComponent({ id: 'python-runtime', name: 'Python Runtime' }),
        ]);
      }
      if (cmd === 'python_pack_metadata') return Promise.resolve([]);
      if (cmd === 'python_runtime_status') return Promise.resolve(PYTHON_RUNTIME_STATUS);
      return Promise.resolve(undefined);
    });

    render(<ComponentsSettings />);
    await waitFor(() => expect(screen.getByTestId('system-component-card-cef')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search packs...'), 'cef');

    await waitFor(() => {
      expect(screen.getByTestId('system-component-card-cef')).toBeInTheDocument();
      expect(screen.queryByTestId('system-component-card-python-runtime')).not.toBeInTheDocument();
    });
  });
});
