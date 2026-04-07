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

import VaultSettings from '../VaultSettings';

function setupVault(entries: Record<string, string>) {
  mockInvoke.mockImplementation((command: string, args?: { key?: string; value?: string }) => {
    if (command === 'vault_list') {
      return Promise.resolve(Object.keys(entries));
    }
    if (command === 'vault_read') {
      return Promise.resolve(entries[args?.key ?? ''] ?? '');
    }
    if (command === 'vault_store') {
      if (args?.key) {
        entries[args.key] = args.value ?? '';
      }
      return Promise.resolve(undefined);
    }
    if (command === 'vault_delete') {
      if (args?.key) {
        delete entries[args.key];
      }
      return Promise.resolve(undefined);
    }
    if (command === 'vault_has') {
      return Promise.resolve(Boolean(args?.key && entries[args.key]));
    }
    return Promise.resolve(undefined);
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('U011/vault-settings', () => {
  it('U011/vault-settings: renders master key status section', async () => {
    setupVault({});

    render(<VaultSettings />);

    expect(screen.getByText('Secret Vault')).toBeInTheDocument();
    expect(screen.getByTestId('master-key-status')).toBeInTheDocument();
    expect(screen.getByText('Master Key')).toBeInTheDocument();
  });

  it('U011/vault-settings: shows healthy status when vault_list succeeds', async () => {
    setupVault({});

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('Healthy — stored in system keychain')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: shows secret entries table with masked values', async () => {
    setupVault({
      'provider:openai:apiKey': 'sk-test-4f9x',
      'provider:anthropic:apiKey': 'an-test-1234',
    });

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('provider:openai:apiKey')).toBeInTheDocument();
      expect(screen.getByText('provider:anthropic:apiKey')).toBeInTheDocument();
      expect(screen.getByText('••••••••4f9x')).toBeInTheDocument();
      expect(screen.getByText('••••••••1234')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: masks secrets showing only last 4 chars', async () => {
    setupVault({
      'provider:openai:apiKey': 'sk-1234567890',
    });

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('•••••••••7890')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: masks short secrets (≤4 chars) fully', async () => {
    setupVault({
      'provider:openai:apiKey': 'abc',
    });

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('•••')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: add secret validates name format', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), 'invalid-name');
    await user.type(screen.getByLabelText('Secret value'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Name must match provider:{id}:apiKey or custom:{name}.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith('vault_store', expect.anything());
  });

  it('U011/vault-settings: add secret rejects empty name', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret value'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Secret name is required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith('vault_store', expect.anything());
  });

  it('U011/vault-settings: add secret rejects empty value', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), 'provider:openai:apiKey');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Secret value is required.')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith('vault_store', expect.anything());
  });

  it('U011/vault-settings: add secret calls vault_store and refreshes table', async () => {
    const user = userEvent.setup();
    const entries: Record<string, string> = {};
    setupVault(entries);

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), 'provider:openai:apiKey');
    await user.type(screen.getByLabelText('Secret value'), 'sk-new-secret');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('vault_store', {
        key: 'provider:openai:apiKey',
        value: 'sk-new-secret',
      });
      expect(screen.getByText('provider:openai:apiKey')).toBeInTheDocument();
      expect(screen.getByText('•••••••••cret')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Secret name')).toHaveValue('');
    expect(screen.getByLabelText('Secret value')).toHaveValue('');
  });

  it('U011/vault-settings: delete secret shows confirmation dialog', async () => {
    const user = userEvent.setup();
    setupVault({
      'provider:openai:apiKey': 'sk-test-4f9x',
    });

    render(<VaultSettings />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete provider:openai:apiKey' });
    await user.click(deleteButton);

    expect(await screen.findByText('Delete provider:openai:apiKey?')).toBeInTheDocument();
    expect(screen.getByText('This permanently removes the secret from the vault.')).toBeInTheDocument();
  });

  it('U011/vault-settings: delete secret calls vault_delete and refreshes table', async () => {
    const user = userEvent.setup();
    const entries: Record<string, string> = {
      'provider:openai:apiKey': 'sk-test-4f9x',
    };
    setupVault(entries);

    render(<VaultSettings />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete provider:openai:apiKey' });
    await user.click(deleteButton);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('vault_delete', { key: 'provider:openai:apiKey' });
      expect(screen.getByText('No secrets stored')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: loading state shows skeleton', () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'vault_list') {
        return new Promise(() => undefined);
      }
      return Promise.resolve(undefined);
    });

    render(<VaultSettings />);

    expect(screen.getByTestId('vault-loading')).toBeInTheDocument();
  });

  it('U011/vault-settings: empty vault shows empty state message', async () => {
    setupVault({});

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('No secrets stored')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: vault_list failure shows error state', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'vault_list') {
        return Promise.reject(new Error('vault unavailable'));
      }
      return Promise.resolve(undefined);
    });

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('Missing — secrets are unencrypted. Restart to regenerate.')).toBeInTheDocument();
      expect(screen.getByText('Unable to read vault secrets.')).toBeInTheDocument();
    });
  });
});
