import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProvidersTab from '../../tabs/ProvidersTab';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: mockInvoke,
  }),
  AppButton: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  ConfirmAction: ({ children, onConfirm }: any) => (
    <button type="button" onClick={onConfirm}>
      {children}
    </button>
  ),
}));

describe('A013/UI/ProvidersTab', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation(async (command: string, args: Record<string, string>) => {
      if (command === 'llm_list_provider_keys') {
        if (args.provider_id === 'openai') return ['primary'];
        return [];
      }
      return undefined;
    });
  });

  it('A013/Vault: displays provider keys from llm_list_provider_keys results', async () => {
    render(<ProvidersTab />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('llm_list_provider_keys', { provider_id: 'openai' });
    });

    expect(await screen.findByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
    expect(screen.getByText('os.environ/PROVIDER_OPENAI_PRIMARY')).toBeInTheDocument();
  });

  it('A013/Vault: invokes llm_delete_provider_key for selected provider key', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete primary' });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('llm_delete_provider_key', {
        provider_id: 'openai',
        key_name: 'primary',
      });
    });
  });

  it('A013/Vault: invokes llm_store_provider_key on add provider key submit', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    await screen.findByText('OpenAI');
    const addButton = await screen.findByRole('button', { name: /Add Provider Key/i });
    await user.click(addButton);

    const modal = await screen.findByRole('dialog', { name: 'Add Provider Key' });
    const keyNameInput = within(modal).getByLabelText(/Key Name/i);
    const keyValueInput = within(modal).getByLabelText(/API Key/i);

    await user.click(within(modal).getByRole('combobox'));
    await user.click(await screen.findByTitle('OpenAI'));

    await user.type(keyNameInput, 'prod');
    await user.type(keyValueInput, 'sk-prod-value');

    await user.click(within(modal).getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('llm_store_provider_key', {
        providerId: 'openai',
        keyName: 'prod',
        keyValue: 'sk-prod-value',
      });
    });
  });
});
