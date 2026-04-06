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
  vi.useFakeTimers();
});

afterEach(() => {
  delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.useRealTimers();
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

  it('A007/settings-runtime: renders Model selector', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => {
      expect(screen.getByText('AgentScope')).toBeInTheDocument();
      expect(screen.getByText('Model Configuration')).toBeInTheDocument();
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
      expect(mockInvoke).toHaveBeenCalledWith('get_settings');
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
      expect(mockInvoke).toHaveBeenCalledWith('agent_health');
    });
  });

  it('A007/settings-runtime: polls agent_health every 5 seconds', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('agent_health'));

    const callsBefore = mockInvoke.mock.calls.filter((c) => c[0] === 'agent_health').length;

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      const callsAfter = mockInvoke.mock.calls.filter((c) => c[0] === 'agent_health').length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});

describe('A007/settings-runtime: dirty tracking and save bar', () => {
  it('A007/settings-runtime: save bar is not shown on initial render', async () => {
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
  });

  it('A007/settings-runtime: changing API URL shows unsaved changes bar', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('https://api.openai.com/v1'));

    const urlInput = screen.getByPlaceholderText('https://api.openai.com/v1');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://custom.openai.com/v1');

    await waitFor(() => {
      expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: save bar shows Save Changes button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));

    const apiKey = screen.getByPlaceholderText('sk-...');
    await user.clear(apiKey);
    await user.type(apiKey, 'sk-new');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: save bar shows Discard button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));

    const apiKey = screen.getByPlaceholderText('sk-...');
    await user.clear(apiKey);
    await user.type(apiKey, 'sk-new');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    });
  });
});

describe('A007/settings-runtime: save behaviour', () => {
  it('A007/settings-runtime: Save Changes calls save_settings with correct args', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));

    const apiKey = screen.getByPlaceholderText('sk-...');
    await user.clear(apiKey);
    await user.type(apiKey, 'sk-saved-key');

    await waitFor(() => screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'save_settings',
        expect.objectContaining({
          settings: expect.objectContaining({ apiKey: 'sk-saved-key' }),
        }),
      );
    });
  });

  it('A007/settings-runtime: save_settings receives model and apiUrl too', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));

    const apiKey = screen.getByPlaceholderText('sk-...');
    await user.clear(apiKey);
    await user.type(apiKey, 'sk-full');

    await waitFor(() => screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      const call = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
      expect(call?.[1]?.settings).toMatchObject({ model: 'gpt-4o', apiUrl: 'https://api.openai.com/v1' });
    });
  });

  it('A007/settings-runtime: save bar hides after successful save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));

    const apiKey = screen.getByPlaceholderText('sk-...');
    await user.clear(apiKey);
    await user.type(apiKey, 'sk-ok');

    await waitFor(() => screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: shows success message after save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));

    const apiKey = screen.getByPlaceholderText('sk-...');
    await user.clear(apiKey);
    await user.type(apiKey, 'sk-success');

    await waitFor(() => screen.getByRole('button', { name: 'Save Changes' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully')).toBeInTheDocument();
    });
  });

  it('A007/settings-runtime: Discard reloads settings and clears dirty state', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RuntimeSettings />);
    await waitFor(() => screen.getByPlaceholderText('sk-...'));

    const apiKey = screen.getByPlaceholderText('sk-...');
    await user.clear(apiKey);
    await user.type(apiKey, 'sk-discard-me');

    await waitFor(() => screen.getByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
    });
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
