// Spec: A013-llm-providers.md
// Section: Settings Plugin UI — Providers Tab
// Verifies: card grid view, drill-in detail view, key CRUD operations, toggle state,
//           custom providers, available models, catalog integration

import { act, render, screen, waitFor, within } from '@testing-library/react';
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
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err : new Error(String(err)) }; }
  },
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
  // PretextGrid: flat render in tests — jsdom has no layout engine for
  // virtualization. Renders all items so assertions can find them.
  PretextGrid: ({ items, renderItem, keyExtractor }: any) => (
    <div data-testid="pretext-grid">
      {(items ?? []).map((item: any, i: number) => (
        <div key={keyExtractor(item)}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
}));

// A013/Catalog: Mock the catalog module so tests are deterministic and fast.
// The real catalog has 2656 entries — tests use a small fixture instead.
vi.mock('../../catalog', () => {
  const MOCK_CATALOG: Record<string, any> = {
    'openai/gpt-4o': {
      litellm_provider: 'openai',
      max_tokens: 128000,
      max_input_tokens: 128000,
      max_output_tokens: 16384,
      input_cost_per_token: 0.000005,
      output_cost_per_token: 0.000015,
      mode: 'chat',
      supports_vision: true,
      supports_function_calling: true,
      supports_reasoning: false,
    },
    'openai/gpt-4o-mini': {
      litellm_provider: 'openai',
      max_tokens: 128000,
      max_input_tokens: 128000,
      max_output_tokens: 16384,
      input_cost_per_token: 0.00000015,
      output_cost_per_token: 0.0000006,
      mode: 'chat',
      supports_vision: true,
      supports_function_calling: true,
      supports_reasoning: false,
    },
    'anthropic/claude-sonnet-4-20250514': {
      litellm_provider: 'anthropic',
      max_input_tokens: 200000,
      max_output_tokens: 16000,
      input_cost_per_token: 0.000003,
      output_cost_per_token: 0.000015,
      mode: 'chat',
      supports_vision: true,
      supports_function_calling: true,
      supports_reasoning: true,
    },
    'deepseek/deepseek-chat': {
      litellm_provider: 'deepseek',
      max_input_tokens: 64000,
      max_output_tokens: 8192,
      input_cost_per_token: 0.00000014,
      output_cost_per_token: 0.00000028,
      mode: 'chat',
      supports_function_calling: true,
    },
    'text-embedding-3-small': {
      litellm_provider: 'openai',
      max_tokens: 8191,
      max_input_tokens: 8191,
      mode: 'embedding',
    },
  };

  const entries = Object.entries(MOCK_CATALOG);

  return {
    getProviderIds: () => {
      const ids = new Set<string>();
      for (const [, v] of entries) {
        if (v.litellm_provider) ids.add(v.litellm_provider);
      }
      return [...ids].sort();
    },
    getModelsForProvider: (providerId: string) =>
      entries
        .filter(([, v]) => v.litellm_provider === providerId)
        .map(([id, info]) => ({ id, info })),
    getCatalogModelInfo: (modelId: string) => MOCK_CATALOG[modelId],
    getProviderInfo: (providerId: string) => {
      const models = entries.filter(([, v]) => v.litellm_provider === providerId);
      const modes = [...new Set(models.map(([, v]) => v.mode).filter(Boolean))];
      return { modelCount: models.length, modes };
    },
  };
});


describe('A013/UI/ProvidersTab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockInvoke.mockReset();
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
      if (command === 'llm_discover_models') return { data: [] };
      if (command === 'llm_import_model') return { status: 'success' };
      return undefined;
    });

    // Clear discovery cache before each test
    localStorage.removeItem('snapfzz:discovered_models');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Grid View', () => {
    it('A013/Grid: renders a card for each catalog provider with key counts', async () => {
      render(<ProvidersTab />);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('llm_list_provider_keys', { providerId: 'openai' });
      });

      // Catalog mock has openai, anthropic, deepseek
      expect(await screen.findByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(screen.getByText('DeepSeek')).toBeInTheDocument();
    });

    it('A013/Grid: shows key count badges per provider', async () => {
      render(<ProvidersTab />);

      expect(await screen.findByText('● 1 key')).toBeInTheDocument();
      expect(screen.getByText('● 2 keys')).toBeInTheDocument();
      // Providers with no keys show muted text
      const noKeyTexts = screen.getAllByText('○ No keys');
      expect(noKeyTexts.length).toBeGreaterThan(0);
    });

    it('A013/Grid: shows catalog model count on provider cards', async () => {
      render(<ProvidersTab />);

      // Mock catalog has 3 openai models (gpt-4o, gpt-4o-mini, text-embedding-3-small)
      expect(await screen.findByText('3 models')).toBeInTheDocument();
      // Anthropic and DeepSeek each have 1 model in the mock catalog
      const singleModelTexts = screen.getAllByText('1 model');
      expect(singleModelTexts.length).toBe(2);
    });

    it('A013/Grid: clicking a card navigates to detail view', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      const openaiCard = await screen.findByRole('button', { name: 'View OpenAI details' });
      await user.click(openaiCard);

      expect(await screen.findByText('Back to Providers')).toBeInTheDocument();
    });

    it('A013/Grid: shows Custom Providers and Providers sections', async () => {
      render(<ProvidersTab />);

      await screen.findByText('OpenAI');

      expect(screen.getByText('Custom Providers')).toBeInTheDocument();
      // Built-in section label is "Providers"
      expect(screen.getByText('Providers')).toBeInTheDocument();
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
      expect(screen.queryByText(/ENV: os\.environ/)).not.toBeInTheDocument();
    });

    it('A013/Detail: does not show base URL for built-in providers', async () => {
      await navigateToOpenAI();

      // Built-in providers should not display a base URL — LiteLLM routes internally
      expect(screen.queryByText(/api\.openai\.com/)).not.toBeInTheDocument();
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

    it('A013/Detail: shows Available Models section with live discovery when keys exist', async () => {
      await navigateToOpenAI();

      expect(await screen.findByText('Available Models')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    });

    it('A013/Detail: discovers models from provider API via Tauri command', async () => {
      mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
        if (command === 'llm_list_provider_keys') {
          if (args.providerId === 'openai') return ['primary'];
          if (args.providerId === 'anthropic') return ['prod', 'dev'];
          return [];
        }
        if (command === 'vault_read') return null;
        if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
        if (command === 'llm_get_master_key') return 'sk-master-test';
        if (command === 'llm_discover_models') {
          return {
            data: [
              { id: 'gpt-4o', object: 'model', owned_by: 'openai' },
              { id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' },
            ],
          };
        }
        if (command === 'llm_import_model') return { status: 'success' };
        return undefined;
      });

      await navigateToOpenAI();

      expect(await screen.findByText('gpt-4o')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
      expect(mockInvoke).toHaveBeenCalledWith('llm_discover_models', {
        providerId: 'openai',
        baseUrl: null,
      });
    });

    it('A013/Detail: model filter narrows displayed models', async () => {
      mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
        if (command === 'llm_list_provider_keys') {
          if (args.providerId === 'openai') return ['primary'];
          if (args.providerId === 'anthropic') return ['prod', 'dev'];
          return [];
        }
        if (command === 'vault_read') return null;
        if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
        if (command === 'llm_get_master_key') return 'sk-master-test';
        if (command === 'llm_discover_models') {
          return {
            data: [
              { id: 'gpt-4o', object: 'model' },
              { id: 'gpt-4o-mini', object: 'model' },
              { id: 'gpt-3.5-turbo', object: 'model' },
            ],
          };
        }
        return undefined;
      });

      const user = await navigateToOpenAI();

      await screen.findByText('gpt-4o');

      const filterInput = screen.getByLabelText('Filter models');
      await user.type(filterInput, 'mini');

      // Filter is debounced — flush the timer to apply it
      await act(() => { vi.advanceTimersByTime(1000); });

      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
      expect(screen.queryByText('gpt-3.5-turbo')).not.toBeInTheDocument();
      expect(screen.getByText('1/3 active')).toBeInTheDocument();
    });

    it('A013/Detail: shows error state when model discovery fails', async () => {
      mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
        if (command === 'llm_list_provider_keys') {
          if (args.providerId === 'openai') return ['primary'];
          if (args.providerId === 'anthropic') return ['prod', 'dev'];
          return [];
        }
        if (command === 'vault_read') return null;
        if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
        if (command === 'llm_get_master_key') return 'sk-master-test';
        if (command === 'llm_discover_models') throw new Error('Provider returned 401');
        return undefined;
      });

      await navigateToOpenAI();

      expect(await screen.findByText('Unable to fetch models')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('A013/Detail: copy button is present for each discovered model', async () => {
      mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
        if (command === 'llm_list_provider_keys') {
          if (args.providerId === 'openai') return ['primary'];
          if (args.providerId === 'anthropic') return ['prod', 'dev'];
          return [];
        }
        if (command === 'vault_read') return null;
        if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
        if (command === 'llm_get_master_key') return 'sk-master-test';
        if (command === 'llm_discover_models') {
          return { data: [{ id: 'gpt-4o', object: 'model' }] };
        }
        return undefined;
      });

      await navigateToOpenAI();

      const copyBtn = await screen.findByRole('button', { name: 'Copy gpt-4o' });
      expect(copyBtn).toBeInTheDocument();
    });

    it('A013/Detail: import button calls llm_import_model and shows checkmark', async () => {
      mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
        if (command === 'llm_list_provider_keys') {
          if (args.providerId === 'openai') return ['primary'];
          if (args.providerId === 'anthropic') return ['prod', 'dev'];
          return [];
        }
        if (command === 'vault_read') return null;
        if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
        if (command === 'llm_get_master_key') return 'sk-master-test';
        if (command === 'llm_discover_models') {
          return { data: [{ id: 'gpt-4o', object: 'model' }] };
        }
        if (command === 'llm_import_model') return { status: 'success' };
        return undefined;
      });

      const user = await navigateToOpenAI();

      // The model chip uses a Switch with aria-label="Enable <model-id>"
      const enableSwitch = await screen.findByRole('switch', { name: 'Enable gpt-4o' });
      await user.click(enableSwitch);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('llm_import_model', expect.objectContaining({
          providerId: 'openai',
          modelId: 'gpt-4o',
          modelName: null,
          baseUrl: null,
        }));
      });
    });

    it('A013/Detail: model chips show catalog metadata (mode, context, pricing, capabilities)', async () => {
      mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
        if (command === 'llm_list_provider_keys') {
          if (args.providerId === 'openai') return ['primary'];
          if (args.providerId === 'anthropic') return ['prod', 'dev'];
          return [];
        }
        if (command === 'vault_read') return null;
        if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
        if (command === 'llm_get_master_key') return 'sk-master-test';
        if (command === 'llm_discover_models') {
          return { data: [{ id: 'gpt-4o', object: 'model' }] };
        }
        return undefined;
      });

      await navigateToOpenAI();

      await screen.findByText('gpt-4o');

      // Catalog metadata tags from mock: mode=chat, supports_vision, supports_function_calling
      // The catalog lookup matches "gpt-4o" to "openai/gpt-4o" via the short-id mapping.
      expect(await screen.findByText('chat')).toBeInTheDocument();
      expect(screen.getByText('Vision')).toBeInTheDocument();
      expect(screen.getByText('Tools')).toBeInTheDocument();
      expect(screen.getByText('128K ctx')).toBeInTheDocument();
      expect(screen.getByText('$5.00/M in · $15.00/M out')).toBeInTheDocument();
    });
  });

  describe('Catalog Fallback', () => {
    it('A013/Catalog: shows catalog models when provider has no keys', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      // DeepSeek has no keys in the mock
      const deepseekCard = await screen.findByRole('button', { name: 'View DeepSeek details' });
      await user.click(deepseekCard);

      await screen.findByText('Back to Providers');

      // Should show Available Models from catalog (not from API discovery)
      expect(await screen.findByText('Available Models')).toBeInTheDocument();
      expect(screen.getByText('from catalog')).toBeInTheDocument();
      expect(screen.getByText('deepseek/deepseek-chat')).toBeInTheDocument();

      // Should NOT call llm_discover_models since no keys
      expect(mockInvoke).not.toHaveBeenCalledWith(
        'llm_discover_models',
        expect.anything(),
      );
    });

    it('A013/Catalog: hides Enable All and Refresh buttons when showing catalog', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      const deepseekCard = await screen.findByRole('button', { name: 'View DeepSeek details' });
      await user.click(deepseekCard);

      await screen.findByText('Available Models');

      // Catalog mode should not show Refresh or Enable All
      expect(screen.queryByRole('button', { name: /Refresh/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Enable All/i })).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('A013/Detail: shows empty state when provider has no keys', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      const deepseekCard = await screen.findByRole('button', { name: 'View DeepSeek details' });
      await user.click(deepseekCard);

      await screen.findByText('Back to Providers');
      expect(screen.getByText(/No API keys configured for DeepSeek/i)).toBeInTheDocument();
    });

    it('A013/Detail: still shows Available Models from catalog when no keys exist', async () => {
      const user = userEvent.setup();
      render(<ProvidersTab />);

      const deepseekCard = await screen.findByRole('button', { name: 'View DeepSeek details' });
      await user.click(deepseekCard);

      await screen.findByText('Back to Providers');
      // Models should be shown from catalog even without keys
      expect(await screen.findByText('Available Models')).toBeInTheDocument();
    });
  });
});
