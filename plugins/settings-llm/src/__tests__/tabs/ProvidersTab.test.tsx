// Spec: A013-llm-providers.md
// Section: Settings Plugin UI — Providers Tab
// Verifies: card grid view, drill-in detail view, key CRUD operations, toggle state

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
        if (args.providerId === 'openai') return ['primary'];
        if (args.providerId === 'anthropic') return ['prod', 'dev'];
        return [];
      }
      return undefined;
    });
  });

  describe('Grid View', () => {
    it('A013/Grid: renders a card for each provider with key counts', async () => {
      render(<ProvidersTab />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('llm_list_provider_keys', { providerId: 'openai' });
      });

      expect(await screen.findByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(screen.getByText('Google AI')).toBeInTheDocument();
      expect(screen.getByText('Mistral')).toBeInTheDocument();
    });

    it('A013/Grid: shows key count badges per provider', async () => {
      render(<ProvidersTab />);

      expect(await screen.findByText('● 1 key')).toBeInTheDocument();
      expect(screen.getByText('● 2 keys')).toBeInTheDocument();
      // Providers with no keys show muted text
      const noKeyTexts = screen.getAllByText('○ No keys');
      expect(noKeyTexts.length).toBeGreaterThan(0);
    });

    it('A013/Grid: each card has a toggle switch', async () => {
      render(<ProvidersTab />);

      await screen.findByText('OpenAI');

      const toggles = screen.getAllByRole('switch');
      expect(toggles.length).toBe(9);
    });

    it('A013/Grid: toggle can be clicked without navigating to detail', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      await screen.findByText('OpenAI');

      const openaiToggle = screen.getByRole('switch', { name: 'Toggle OpenAI' });
      // OpenAI has keys, so toggle should be checked by default
      expect(openaiToggle).toBeChecked();

      await user.click(openaiToggle);
      expect(openaiToggle).not.toBeChecked();

      // Should still be on grid view (not detail)
      expect(screen.queryByText('Back to Providers')).not.toBeInTheDocument();
    });

    it('A013/Grid: clicking a card navigates to detail view', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      const openaiCard = await screen.findByRole('button', { name: 'View OpenAI details' });
      await user.click(openaiCard);

      expect(await screen.findByText('Back to Providers')).toBeInTheDocument();
    });
  });

  describe('Detail View', () => {
    async function navigateToOpenAI() {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      const openaiCard = await screen.findByRole('button', { name: 'View OpenAI details' });
      await user.click(openaiCard);

      await screen.findByText('Back to Providers');
      return user;
    }

    it('A013/Detail: shows provider name, connection count, and key entries', async () => {
      await navigateToOpenAI();

      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('1 connection')).toBeInTheDocument();
      expect(screen.getByText('primary')).toBeInTheDocument();
      expect(screen.getByText('ENV: os.environ/PROVIDER_OPENAI_PRIMARY')).toBeInTheDocument();
    });

    it('A013/Detail: shows connected status for each key', async () => {
      await navigateToOpenAI();

      expect(screen.getByText('● Connected')).toBeInTheDocument();
    });

    it('A013/Detail: back button returns to grid view', async () => {
      const user = await navigateToOpenAI();

      const backBtn = screen.getByRole('button', { name: 'Back to Providers' });
      await user.click(backBtn);

      await waitFor(() => {
        expect(screen.queryByText('Back to Providers')).not.toBeInTheDocument();
      });
      // Grid should be visible again
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });

    it('A013/Detail: delete button invokes llm_delete_provider_key', async () => {
      const user = await navigateToOpenAI();

      const deleteButton = screen.getByRole('button', { name: 'Delete primary' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('llm_delete_provider_key', {
          providerId: 'openai',
          keyName: 'primary',
        });
      });
    });

    it('A013/Detail: add key modal invokes llm_store_provider_key', async () => {
      const user = await navigateToOpenAI();

      const addBtn = screen.getByRole('button', { name: /Add Key/i });
      await user.click(addBtn);

      const modal = await screen.findByRole('dialog', { name: /Add Provider Key/i });
      const keyNameInput = within(modal).getByLabelText(/Key Name/i);
      const keyValueInput = within(modal).getByLabelText(/API Key/i);

      await user.type(keyNameInput, 'staging');
      await user.type(keyValueInput, 'sk-staging-value');

      await user.click(within(modal).getByRole('button', { name: 'OK' }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('llm_store_provider_key', {
          providerId: 'openai',
          keyName: 'staging',
          keyValue: 'sk-staging-value',
        });
      });
    });

    it('A013/Detail: edit opens modal with key name pre-filled and disabled', async () => {
      const user = await navigateToOpenAI();

      const editButton = screen.getByRole('button', { name: 'Edit primary' });
      await user.click(editButton);

      const modal = await screen.findByRole('dialog', { name: /Edit Key: primary/i });
      const keyNameInput = within(modal).getByLabelText(/Key Name/i);

      expect(keyNameInput).toHaveValue('primary');
      expect(keyNameInput).toBeDisabled();
    });
  });

  describe('Empty State', () => {
    it('A013/Detail: shows empty state when provider has no keys', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      const googleCard = await screen.findByRole('button', { name: 'View Google AI details' });
      await user.click(googleCard);

      await screen.findByText('Back to Providers');
      expect(screen.getByText(/No API keys configured for Google AI/i)).toBeInTheDocument();
    });
  });
});
