// Spec: A013-llm-providers.md
// Section: Settings Plugin UI — Providers Tab
// Verifies: card grid view, drill-in detail view, key CRUD operations, toggle state,
//           custom providers, available models

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const mockFetch = vi.fn();

describe('A013/UI/ProvidersTab', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    mockInvoke.mockImplementation(async (command: string, args: Record<string, string>) => {
      if (command === 'llm_list_provider_keys') {
        if (args.providerId === 'openai') return ['primary'];
        if (args.providerId === 'anthropic') return ['prod', 'dev'];
        return [];
      }
      if (command === 'vault_read') {
        if (args.key === 'litellm:custom_providers') return null;
        return null;
      }
      if (command === 'vault_store') return undefined;
      if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
      if (command === 'llm_get_master_key') return 'sk-master-test';
      return undefined;
    });

    // Default: /v1/model/info returns empty
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
      text: () => Promise.resolve('{}'),
    });

    // Clear model info cache before each test
    localStorage.removeItem('snapfzz:model_info');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      expect(toggles.length).toBe(16);
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

    it('A013/Grid: shows Built-in Providers and Custom Providers sections', async () => {
      render(<ProvidersTab />);

      expect(await screen.findByText('Built-in Providers')).toBeInTheDocument();
      expect(screen.getByText('Custom Providers')).toBeInTheDocument();
    });

    it('A013/Grid: shows empty state for custom providers when none configured', async () => {
      render(<ProvidersTab />);

      expect(
        await screen.findByText(/No custom providers configured/),
      ).toBeInTheDocument();
    });

    it('A013/Grid: shows Add OpenAI Compatible and Add Anthropic Compatible buttons', async () => {
      render(<ProvidersTab />);

      await screen.findByText('OpenAI');

      expect(
        screen.getByRole('button', { name: /Add OpenAI Compatible/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Add Anthropic Compatible/i }),
      ).toBeInTheDocument();
    });
  });

  describe('Custom Providers', () => {
    it('A013/Custom: renders custom provider cards when vault has data', async () => {
      mockInvoke.mockImplementation(async (command: string, args: Record<string, string>) => {
        if (command === 'llm_list_provider_keys') {
          if (args.providerId === 'openai') return ['primary'];
          if (args.providerId === 'anthropic') return ['prod', 'dev'];
          if (args.providerId === 'custom-solo-eng') return ['default'];
          return [];
        }
        if (command === 'vault_read') {
          if (args.key === 'litellm:custom_providers') {
            return JSON.stringify([
              {
                id: 'solo-eng',
                name: 'llm.solo.engineer',
                baseUrl: 'https://llm.solo.engineer/v1',
                variant: 'openai',
              },
            ]);
          }
          return null;
        }
        if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
        if (command === 'llm_get_master_key') return 'sk-master-test';
        return undefined;
      });

      render(<ProvidersTab />);

      expect(await screen.findByText('llm.solo.engineer')).toBeInTheDocument();
      expect(screen.getByText('https://llm.solo.engineer/v1')).toBeInTheDocument();
    });

    it('A013/Custom: clicking Add OpenAI Compatible opens modal', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      await screen.findByText('OpenAI');

      const addBtn = screen.getByRole('button', { name: /Add OpenAI Compatible/i });
      await user.click(addBtn);

      expect(await screen.findByText('Add Custom Provider')).toBeInTheDocument();
    });

    it('A013/Custom: add modal stores provider config and key', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      await screen.findByText('OpenAI');

      const addBtn = screen.getByRole('button', { name: /Add OpenAI Compatible/i });
      await user.click(addBtn);

      const modal = await screen.findByRole('dialog', { name: /Add Custom Provider/i });

      const nameInput = within(modal).getByLabelText(/Name/i);
      const urlInput = within(modal).getByLabelText(/Base URL/i);
      const keyInput = within(modal).getByLabelText(/API Key/i);

      await user.type(nameInput, 'my-provider');
      await user.type(urlInput, 'https://api.example.com/v1');
      await user.type(keyInput, 'sk-custom-key');

      await user.click(within(modal).getByRole('button', { name: 'OK' }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('vault_store', {
          key: 'litellm:custom_providers',
          value: expect.stringContaining('my-provider'),
        });
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('llm_store_provider_key', {
          providerId: 'custom-my-provider',
          keyName: 'default',
          keyValue: 'sk-custom-key',
        });
      });
    });

    it('A013/Custom: clicking custom provider card navigates to detail', async () => {
      mockInvoke.mockImplementation(async (command: string, args: Record<string, string>) => {
        if (command === 'llm_list_provider_keys') {
          if (args.providerId === 'custom-solo-eng') return ['default'];
          return [];
        }
        if (command === 'vault_read') {
          if (args.key === 'litellm:custom_providers') {
            return JSON.stringify([
              {
                id: 'solo-eng',
                name: 'solo-eng',
                baseUrl: 'https://llm.solo.engineer/v1',
                variant: 'openai',
              },
            ]);
          }
          return null;
        }
        if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
        if (command === 'llm_get_master_key') return 'sk-master-test';
        return undefined;
      });

      const user = userEvent.setup();
      render(<ProvidersTab />);

      const card = await screen.findByRole('button', { name: 'View solo-eng details' });
      await user.click(card);

      expect(await screen.findByText('Back to Providers')).toBeInTheDocument();
      expect(screen.getByText('solo-eng')).toBeInTheDocument();
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

    it('A013/Detail: shows Available Models section', async () => {
      await navigateToOpenAI();

      expect(await screen.findByText('Available Models')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    });

    it('A013/Detail: shows model chips from LiteLLM /v1/model/info', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { model_name: 'openai/gpt-4o', model_info: { max_tokens: 128000, mode: 'chat', input_cost_per_token: 0.000005 } },
              { model_name: 'openai/gpt-4o-mini', model_info: { max_tokens: 128000, mode: 'chat' } },
              { model_name: 'anthropic/claude-3', model_info: { max_tokens: 200000, mode: 'chat' } },
            ],
          }),
        text: () => Promise.resolve(''),
      });

      await navigateToOpenAI();

      // Should only show openai-prefixed models
      expect(await screen.findByText('gpt-4o')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
      // Anthropic model should not appear
      expect(screen.queryByText('claude-3')).not.toBeInTheDocument();
    });

    it('A013/Detail: model filter narrows displayed models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { model_name: 'openai/gpt-4o', model_info: { mode: 'chat' } },
              { model_name: 'openai/gpt-4o-mini', model_info: { mode: 'chat' } },
              { model_name: 'openai/gpt-3.5-turbo', model_info: { mode: 'chat' } },
            ],
          }),
        text: () => Promise.resolve(''),
      });

      const user = await navigateToOpenAI();

      await screen.findByText('gpt-4o');

      const filterInput = screen.getByLabelText('Filter models');
      await user.type(filterInput, 'mini');

      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
      expect(screen.queryByText('gpt-3.5-turbo')).not.toBeInTheDocument();
      expect(screen.getByText('1/3 active')).toBeInTheDocument();
    });

    it('A013/Detail: shows error state when model fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
        json: () => Promise.reject(new Error('fail')),
      });

      await navigateToOpenAI();

      expect(await screen.findByText('Unable to fetch models')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('A013/Detail: copy button is present for each model chip', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ model_name: 'openai/gpt-4o', model_info: { mode: 'chat' } }],
          }),
        text: () => Promise.resolve(''),
      });

      await navigateToOpenAI();

      const copyBtn = await screen.findByRole('button', { name: 'Copy gpt-4o' });
      expect(copyBtn).toBeInTheDocument();
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
