import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

const { mockInvoke, mockUseState, reactState } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockUseState: vi.fn(),
  reactState: { actualUseState: undefined as unknown as typeof import('react')['useState'] },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  reactState.actualUseState = actual.useState;
  mockUseState.mockImplementation(actual.useState);
  return {
    ...actual,
    useState: mockUseState,
  };
});

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

import plugin from '../index';
import VaultSettings, { maskSecretValue } from '../VaultSettings';

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
  mockUseState.mockImplementation(reactState.actualUseState);
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

  it('U011/vault-settings: plugin manifest lazy loads VaultSettings section', async () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.id).toBe('vault');
    expect(section?.label).toBe('Secret Vault');
    expect(section?.icon).toBe('LockOutlined');
    expect(section?.order).toBe(5);

    const mod = await section?.component();
    expect((mod as { default: unknown }).default).toBeDefined();
  });

  it('U011/vault-settings: maskSecretValue fully masks all inputs', () => {
    expect(maskSecretValue('abcdef')).toBe('••••••••');
    expect(maskSecretValue('abcd')).toBe('••••••••');
    expect(maskSecretValue('')).toBe('••••••••');
    expect(maskSecretValue('sk-long-api-key-12345')).toBe('••••••••');
  });

  it('U011/vault-settings: shows healthy status when vault_list succeeds', async () => {
    setupVault({});

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('Healthy — stored in system keychain')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: shows secret entries table with fully masked values', async () => {
    setupVault({
      'litellm:master_key': 'b6014e28-cd17-499e-a073-981ec4fe26c1',
    });

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('litellm:master_key')).toBeInTheDocument();
      const maskedCells = screen.getAllByText('••••••••');
      expect(maskedCells).toHaveLength(1);
    });
  });

  it('U011/vault-settings: masks secrets without revealing any characters', async () => {
    setupVault({
      'litellm:master_key': 'b6014e28-cd17-499e',
    });

    render(<VaultSettings />);

    await waitFor(() => {
      const expected = maskSecretValue('b6014e28-cd17-499e');
      const masked = screen.getByText(expected);
      expect(masked).toBeInTheDocument();
      expect(masked.textContent).not.toContain('b');
      expect(masked.textContent).not.toContain('6');
      expect(masked.textContent).not.toContain('0');
      expect(masked.textContent).not.toContain('4');
    });
  });

  it('U011/vault-settings: masks short secrets with minimum 8 bullets', async () => {
    setupVault({
      'my-test-secret': 'abc',
    });

    render(<VaultSettings />);

    await waitFor(() => {
      expect(screen.getByText('••••••••')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: add secret stores names without strict format validation', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), 'invalid-name');
    await user.type(screen.getByLabelText('Secret value'), 'super-secret');
    await user.click(screen.getByRole('button', { name: /Add$/ }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('vault_store', {
        key: 'invalid-name',
        value: 'super-secret',
      });
      expect(screen.getByText('invalid-name')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: add secret with whitespace-only name shows error', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), '   ');
    await user.type(screen.getByLabelText('Secret value'), 'super-secret');
    await user.click(screen.getByRole('button', { name: /Add$/ }));

    await waitFor(() => {
      expect(screen.getByText('Secret name is required.')).toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('vault_store', expect.anything());
  });

  it('U011/vault-settings: add secret accepts empty value and renders blank mask cell', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), 'my-test-secret');
    await user.click(screen.getByRole('button', { name: /Add$/ }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('vault_store', {
        key: 'my-test-secret',
        value: '',
      });
      expect(screen.getByText('my-test-secret')).toBeInTheDocument();
    });
  });

  it('U011/vault-settings: add secret calls vault_store and refreshes table', async () => {
    const user = userEvent.setup();
    const entries: Record<string, string> = {};
    setupVault(entries);

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), 'my-test-secret');
    await user.type(screen.getByLabelText('Secret value'), 'sk-new-secret');
    await user.click(screen.getByRole('button', { name: /Add$/ }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('vault_store', {
        key: 'my-test-secret',
        value: 'sk-new-secret',
      });
      expect(screen.getByText('my-test-secret')).toBeInTheDocument();
      expect(screen.getByText(maskSecretValue('sk-new-secret'))).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Secret name')).toHaveValue('');
    expect(screen.getByLabelText('Secret value')).toHaveValue('');
  });

  it('U011/vault-settings: delete secret shows confirmation dialog', async () => {
    const user = userEvent.setup();
    setupVault({
      'my-test-secret': 'sk-test-4f9x',
    });

    render(<VaultSettings />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete my-test-secret' });
    await user.click(deleteButton);

    expect(await screen.findByText('Delete my-test-secret?')).toBeInTheDocument();
    expect(screen.getByText('This permanently removes the secret from the vault.')).toBeInTheDocument();
  });

  it('U011/vault-settings: delete secret calls vault_delete and refreshes table', async () => {
    const user = userEvent.setup();
    const entries: Record<string, string> = {
      'my-test-secret': 'sk-test-4f9x',
    };
    setupVault(entries);

    render(<VaultSettings />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete my-test-secret' });
    await user.click(deleteButton);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('vault_delete', { key: 'my-test-secret' });
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

  it('U011/vault-settings: whitespace-only name shows error and does not submit', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), '   ');
    await user.type(screen.getByLabelText('Secret value'), 'value');
    await user.click(screen.getByRole('button', { name: /Add$/ }));

    await waitFor(() => {
      expect(screen.getByText('Secret name is required.')).toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('vault_store', expect.anything());
  });

  it('U011/vault-settings: trims name before storing and clears name error on change', async () => {
    const user = userEvent.setup();
    const entries: Record<string, string> = {};
    setupVault(entries);

    mockUseState.mockImplementation(reactState.actualUseState);

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), '  trimmed-secret  ');
    await user.type(screen.getByLabelText('Secret value'), 'value');
    await user.click(screen.getByRole('button', { name: /Add$/ }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('vault_store', {
        key: 'trimmed-secret',
        value: 'value',
      });
    });
  });

  it('U011/vault-settings: empty name shows error and prevents submit', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), '   ');
    await user.type(screen.getByLabelText('Secret value'), 'some-value');
    await user.click(screen.getByRole('button', { name: /Add$/ }));

    await waitFor(() => {
      expect(screen.getByText('Secret name is required.')).toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('vault_store', expect.anything());
  });

  it('U011/vault-settings: typing in name input clears name error', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);

    await user.type(screen.getByLabelText('Secret name'), 'test');
    await user.clear(screen.getByLabelText('Secret name'));
    await user.type(screen.getByLabelText('Secret name'), 'new-test');

    expect(screen.getByLabelText('Secret name')).toHaveValue('new-test');
  });

  it('U011/vault-settings: typing in name input when there is a name error clears the error', async () => {
    const user = userEvent.setup();
    setupVault({});

    render(<VaultSettings />);
    await user.type(screen.getByLabelText('Secret name'), '   ');
    await user.click(screen.getByRole('button', { name: /Add$/ }));

    await waitFor(() => {
      expect(screen.getByText('Secret name is required.')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Secret name'), 'test-key');

    await waitFor(() => {
      expect(screen.queryByText('Secret name is required.')).not.toBeInTheDocument();
    });
  });
});
