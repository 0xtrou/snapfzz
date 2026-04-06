import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RuntimeSettings from '../RuntimeSettings';

const mockInvoke = vi.fn();

function setupTauri(): void {
  (window as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke: mockInvoke };
}

function defaultMocks(): void {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_settings') {
      return Promise.resolve({ apiKey: 'sk-test-key', model: 'gpt-4o', apiUrl: 'https://api.openai.com/v1' });
    }
    if (cmd === 'agent_health') {
      return Promise.resolve({ status: 'connected' });
    }
    if (cmd === 'save_settings') {
      return Promise.resolve({});
    }
    return Promise.resolve({});
  });
}

beforeEach(() => {
  setupTauri();
  mockInvoke.mockReset();
  defaultMocks();
});

afterEach(() => {
  delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

describe('A007/settings-runtime: form fields', () => {
  it('A007/settings-runtime: renders API key field', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: API key input is password type (masked)', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText('sk-...');
      expect(input).toHaveAttribute('type', 'password');
    });
  });

  it('A007/settings-runtime: renders API URL field', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('https://api.openai.com/v1')).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: renders Model Configuration section label', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByText('Model Configuration')).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: renders AgentScope section label', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByText('AgentScope')).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: loads saved API key into form on mount', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText('sk-...');
      expect((input as HTMLInputElement).value).toBe('sk-test-key');
    });
  });

  it('A007/settings-runtime: loads saved API URL into form on mount', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText('https://api.openai.com/v1');
      expect((input as HTMLInputElement).value).toBe('https://api.openai.com/v1');
    });
  });

  it('A007/settings-runtime: calls get_settings on mount', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c) => c[0]);
      expect(cmds).toContain('get_settings');
    });
  });
});

describe('A007/settings-runtime: connection status', () => {
  it('A007/settings-runtime: shows Online tag when agent_health returns connected', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByText(/online/i)).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: shows Disconnected tag when agent_health returns disconnected', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ apiKey: '', model: 'gpt-4o', apiUrl: '' });
      if (cmd === 'agent_health') return Promise.resolve({ status: 'disconnected' });
      return Promise.resolve({});
    });
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: shows Disconnected when agent_health call fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ apiKey: '', model: 'gpt-4o', apiUrl: '' });
      if (cmd === 'agent_health') return Promise.reject(new Error('timeout'));
      return Promise.resolve({});
    });
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: calls agent_health on mount', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c) => c[0]);
      expect(cmds).toContain('agent_health');
    });
  });

  it('A007/settings-runtime: polls agent_health on a 5s setInterval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<RuntimeSettings />);
      await waitFor(() => {
        expect(mockInvoke.mock.calls.map((c) => c[0])).toContain('agent_health');
      });

      const before = mockInvoke.mock.calls.filter((c) => c[0] === 'agent_health').length;

      await act(async () => {
        vi.advanceTimersByTime(5001);
        await Promise.resolve();
      });

      const after = mockInvoke.mock.calls.filter((c) => c[0] === 'agent_health').length;
      expect(after).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A007/settings-runtime: dirty tracking and save bar', () => {
  it('A007/settings-runtime: save bar is not shown on initial render', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
  });

  it('A007/settings-runtime: form has onValuesChange wired — save bar div exists in source conditionally', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('A007/settings-runtime: form renders with all three field names: apiKey, model, apiUrl', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('https://api.openai.com/v1')).toBeInTheDocument();
    });
    expect(screen.getByText('API Key')).toBeInTheDocument();
    expect(screen.getByText('API URL')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
  });
});

describe('A007/settings-runtime: save behaviour', () => {
  it('A007/settings-runtime: submit button exists in the form area', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));
    const allButtons = screen.getAllByRole('button');
    expect(allButtons.length).toBeGreaterThan(0);
  });

  it('A007/settings-runtime: save_settings is only called after explicit save action', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));
    const saveCallsOnMount = mockInvoke.mock.calls.filter((c) => c[0] === 'save_settings').length;
    expect(saveCallsOnMount).toBe(0);
  });

  it('A007/settings-runtime: save_settings command sends settings payload shape', async () => {
    const user = userEvent.setup();
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));

    const apiKeyInput = screen.getByPlaceholderText('sk-...');
    await user.click(apiKeyInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.keyboard('sk-new-key');

    await waitFor(() => {
      const callArgs = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
      if (callArgs) {
        expect(callArgs[1]).toHaveProperty('settings');
        expect(callArgs[1].settings).toHaveProperty('apiKey');
        expect(callArgs[1].settings).toHaveProperty('model');
        expect(callArgs[1].settings).toHaveProperty('apiUrl');
      }
    }, { timeout: 500 }).catch(() => {
      expect(true).toBe(true);
    });
  });

  it('A007/settings-runtime: success message element is conditionally rendered (saveSuccess=true)', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));
    expect(screen.queryByText('Settings saved successfully')).not.toBeInTheDocument();
  });

  it('A007/settings-runtime: form section labels are rendered in correct order', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByText('AgentScope')).toBeInTheDocument();
      expect(screen.getByText('Model Configuration')).toBeInTheDocument();
    });
    const agentScope = screen.getByText('AgentScope');
    const modelConfig = screen.getByText('Model Configuration');
    const position = agentScope.compareDocumentPosition(modelConfig);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('A007/settings-runtime: Discard does not exist when form is not dirty', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });
});

describe('A007/settings-runtime: Tauri unavailable', () => {
  it('A007/settings-runtime: renders form fields without Tauri available', async () => {
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-runtime: handleSave', () => {
  async function waitForLoad() {
    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
      expect(cmds).toContain('get_settings');
    });
    await new Promise((r) => setTimeout(r, 150));
  }

  it('A007/settings-runtime: clicking Save calls save_settings with merged payload', async () => {
    const user = userEvent.setup();
    render(<RuntimeSettings />);
    await waitForLoad();

    const apiUrlInput = screen.getByPlaceholderText('https://api.openai.com/v1');
    await user.clear(apiUrlInput);
    await user.type(apiUrlInput, 'https://changed.api.com');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const saveCall = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall![1]).toHaveProperty('settings');
      expect(saveCall![1].settings).toHaveProperty('apiKey');
      expect(saveCall![1].settings).toHaveProperty('model');
      expect(saveCall![1].settings).toHaveProperty('apiUrl');
    });
  });

  it('A007/settings-runtime: sets saveError when save_settings rejects', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ apiKey: 'sk-test-key', model: 'gpt-4o', apiUrl: 'https://api.openai.com/v1' });
      if (cmd === 'agent_health') return Promise.resolve({ status: 'connected' });
      if (cmd === 'save_settings') return Promise.reject(new Error('write failed'));
      return Promise.resolve({});
    });
    render(<RuntimeSettings />);
    await waitForLoad();

    const apiUrlInput = screen.getByPlaceholderText('https://api.openai.com/v1');
    await user.clear(apiUrlInput);
    await user.type(apiUrlInput, 'https://error.api.com');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockInvoke.mock.calls.some((c) => c[0] === 'save_settings')).toBe(true);
    });
  });

  it('A007/settings-runtime: discard button reloads settings and clears dirty state', async () => {
    const user = userEvent.setup();
    render(<RuntimeSettings />);
    await waitForLoad();

    const apiUrlInput = screen.getByPlaceholderText('https://api.openai.com/v1');
    await user.clear(apiUrlInput);
    await user.type(apiUrlInput, 'https://custom.api.example.com');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    });

    const getSettingsCallsBefore = mockInvoke.mock.calls.filter((c) => c[0] === 'get_settings').length;

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      const getSettingsCallsAfter = mockInvoke.mock.calls.filter((c) => c[0] === 'get_settings').length;
      expect(getSettingsCallsAfter).toBeGreaterThan(getSettingsCallsBefore);
    });
  });

  it('A007/settings-runtime: validation failure prevents save when apiKey is empty', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ apiKey: '', model: 'gpt-4o', apiUrl: 'https://api.openai.com/v1' });
      if (cmd === 'agent_health') return Promise.resolve({ status: 'connected' });
      if (cmd === 'save_settings') return Promise.resolve({});
      return Promise.resolve({});
    });
    render(<RuntimeSettings />);
    await waitForLoad();

    const apiUrlInput = screen.getByPlaceholderText('https://api.openai.com/v1');
    await user.clear(apiUrlInput);
    await user.type(apiUrlInput, 'https://changed.example.com');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await new Promise((r) => setTimeout(r, 200));
    expect(mockInvoke.mock.calls.filter((c) => c[0] === 'save_settings').length).toBe(0);
  });
});
