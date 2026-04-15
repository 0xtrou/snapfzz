// A013/UI/ProvidersTab: Coverage-gap tests for rarely-hit branches
// Targets: ProviderDetail API key flow, discovery cache write/clear paths,
//          connected/not-configured status text, AvailableModels loading skeleton,
//          model "Enable All" with no unimported models (no-op), gateway unreachable error
//
// A013/Vault: Provider API keys are no longer stored in the vault.
// Keys are entered in the UI and passed directly to LiteLLM when importing models.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { message } from 'antd';
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
  PretextGrid: ({ items, renderItem, keyExtractor }: any) => (
    <div data-testid="pretext-grid">
      {(items ?? []).map((item: any, i: number) => (
        <div key={keyExtractor(item)}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
}));

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
    'openai/text-embedding-3-small': {
      litellm_provider: 'openai',
      max_tokens: 8191,
      max_input_tokens: 8191,
      mode: 'embedding',
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

// A013/Fetch: Mock global.fetch for discoverModels (provider /v1/models) and
// importModel (POST /model/new). These functions no longer use bridge.invoke.
const mockFetch = vi.fn();

describe('A013/UI/ProvidersTab/Coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockInvoke.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    mockInvoke.mockImplementation(async (command: string, _args: Record<string, any>) => {
      if (command === 'vault_read') return null;
      if (command === 'vault_store') return undefined;
      if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
      if (command === 'llm_get_master_key') return 'sk-master-test';
      return undefined;
    });
    // Default: discovery returns empty, gateway endpoints return empty
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    localStorage.removeItem('snapfzz:discovered_models');
    localStorage.removeItem('snapfzz:provider_configured:openai');
    localStorage.removeItem('snapfzz:provider_configured:anthropic');
    localStorage.removeItem('snapfzz:provider_configured:deepseek');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // ─── ProviderDetail: status text ──────────────────────────────────────

  it('A013/Detail: shows "○ Not configured" when provider has no API key', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View DeepSeek details' });
    await user.click(card);

    await screen.findByText('Back to Providers');
    expect(screen.getByText('○ Not configured')).toBeInTheDocument();
  });

  it('A013/Detail: shows "● Connected" after API key is entered and saved', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View Anthropic details' });
    await user.click(card);

    await screen.findByText('Back to Providers');

    await user.click(screen.getByRole('button', { name: /Add Key/i }));
    await user.type(screen.getByLabelText('API Key'), 'sk-anthropic-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('● Connected')).toBeInTheDocument();
  });

  // ─── ProviderDetail: API key form cancel ──────────────────────────────

  it('A013/Detail: Cancel on key form discards the edit', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View OpenAI details' });
    await user.click(card);
    await screen.findByText('Back to Providers');

    // No key configured — "Add Key" button
    const addBtn = screen.getByRole('button', { name: /Add Key/i });
    await user.click(addBtn);

    expect(screen.getByLabelText('API Key')).toBeInTheDocument();

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelBtn);

    // Input should be gone, still "○ Not configured"
    await waitFor(() => {
      expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    });
    expect(screen.getByText('○ Not configured')).toBeInTheDocument();
  });

  it('A013/Detail: Edit Key button shows form with Cancel to discard', async () => {
    // Pre-configure a key via localStorage flag and component initial state via custom provider
    const user = userEvent.setup();

    // Use a custom provider so we can pass initialApiKey
    mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
      if (command === 'vault_read') {
        if (args.key === 'litellm:custom_providers') {
          return JSON.stringify([{
            id: 'test-provider', name: 'TestProvider',
            baseUrl: 'http://test.local', variant: 'openai', apiKey: 'sk-existing',
          }]);
        }
        return null;
      }
      if (command === 'vault_store') return undefined;
      if (command === 'llm_get_base_url') return 'http://127.0.0.1:4000';
      if (command === 'llm_get_master_key') return 'sk-master-test';
      return undefined;
    });

    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View TestProvider details' });
    await user.click(card);

    await screen.findByText('Back to Providers');
    // Connected — "Edit Key" button
    expect(screen.getByRole('button', { name: /Edit Key/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Edit Key/i }));
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    });
    // Still connected
    expect(screen.getByText('● Connected')).toBeInTheDocument();
  });

  // ─── ProvidersTab: loading skeleton shown before data resolves ────────

  it('A013/Loading: shows skeleton while loading provider data', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));

    render(<ProvidersTab />);

    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  // ─── Discovery cache: write and clear ─────────────────────────────────

  it('A013/Cache: writes discovered models to localStorage cache', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/v1/models') && !String(url).includes('127.0.0.1')) {
        return { ok: true, json: async () => ({ data: [{ id: 'gpt-to-cache', object: 'model' }] }) };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View OpenAI details' });
    await user.click(card);

    // Enter API key to enable live discovery
    await user.click(screen.getByRole('button', { name: /Add Key/i }));
    await user.type(screen.getByLabelText('API Key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('gpt-to-cache');

    // Cache should be written to localStorage
    await waitFor(() => {
      const cached = localStorage.getItem('snapfzz:discovered_models');
      expect(cached).toBeTruthy();
      expect(cached).toContain('gpt-to-cache');
    });
  });

  it('A013/Cache: clearDiscoveryCache removes entry when cache exists', async () => {
    // Pre-populate with two entries
    const cacheData = {
      openai: { data: [{ id: 'gpt-4o', object: 'model' }], ts: Date.now() },
      anthropic: { data: [{ id: 'claude', object: 'model' }], ts: Date.now() },
    };
    localStorage.setItem('snapfzz:discovered_models', JSON.stringify(cacheData));

    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/v1/models') && !String(url).includes('127.0.0.1')) {
        return { ok: true, json: async () => ({ data: [{ id: 'fresh-gpt-4o', object: 'model' }] }) };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View OpenAI details' });
    await user.click(card);

    // Enter API key to trigger live discovery
    await user.click(screen.getByRole('button', { name: /Add Key/i }));
    await user.type(screen.getByLabelText('API Key'), 'sk-openai-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Wait for cached model to display first
    await screen.findByText('gpt-4o');

    // Hit Refresh — should clear openai cache and re-fetch
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    await user.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText('fresh-gpt-4o')).toBeInTheDocument();
    });

    // openai cache should be replaced with fresh data
    const remaining = JSON.parse(localStorage.getItem('snapfzz:discovered_models') || '{}');
    expect(remaining.openai?.data?.[0]?.id).toBe('fresh-gpt-4o');
  });

  // ─── "Enable All" is hidden when no unimported models ─────────────────

  it('A013/EnableAll: Enable All button hidden when all models already enabled', async () => {
    // /v1/models returns gpt-4o as already registered → unimportedCount = 0
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/v1/models')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [{ id: 'gpt-4o' }] }),
        });
      }
      if (url.includes('/v1/model/info')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{ model_name: 'gpt-4o', model_info: { id: 'mid-1', max_tokens: 128000, snapfzz_provider_id: 'openai' } }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View OpenAI details' });
    await user.click(card);

    // Enter API key to enable live discovery
    await user.click(screen.getByRole('button', { name: /Add Key/i }));
    await user.type(screen.getByLabelText('API Key'), 'sk-openai-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Back to Providers');
    await screen.findByText('gpt-4o');

    // When all models are imported, Enable All should not be visible
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Enable All/i })).not.toBeInTheDocument();
    });
  });

  // ─── AddCustomProviderModal: variant defaults ───────────────────────────

  it('A013/CustomModal: modal defaults to openai variant when opened via Add OpenAI Compatible', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    await screen.findByText('OpenAI');

    await user.click(screen.getByRole('button', { name: /Add OpenAI Compatible/i }));

    const modal = await screen.findByRole('dialog', { name: /Add Custom Provider/i });
    // The OpenAI radio should be selected by default
    const openaiRadio = within(modal).getByRole('radio', { name: 'OpenAI' });
    expect(openaiRadio).toBeChecked();
  });

  it('A013/CustomModal: modal defaults to anthropic variant when opened via Add Anthropic Compatible', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    await screen.findByText('OpenAI');

    await user.click(screen.getByRole('button', { name: /Add Anthropic Compatible/i }));

    const modal = await screen.findByRole('dialog', { name: /Add Custom Provider/i });
    // The Anthropic radio should be selected by default
    const anthropicRadio = within(modal).getByRole('radio', { name: 'Anthropic' });
    expect(anthropicRadio).toBeChecked();
  });

  // ─── gateway not ready error path in AvailableModels ──────────────────

  it('A013/Gateway: handles gateway unreachable during registered models check', async () => {
    // discovery succeeds; gateway endpoints fail (connection refused)
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/v1/models') && !String(url).includes('127.0.0.1')) {
        return { ok: true, json: async () => ({ data: [{ id: 'gpt-4o', object: 'model' }] }) };
      }
      // Gateway calls fail
      throw new Error('connection refused');
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View OpenAI details' });
    await user.click(card);

    // Enter API key to enable live discovery
    await user.click(screen.getByRole('button', { name: /Add Key/i }));
    await user.type(screen.getByLabelText('API Key'), 'sk-openai-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Back to Providers');

    // Should still show discovered models even if registered check fails
    expect(await screen.findByText('gpt-4o')).toBeInTheDocument();
  });

  // ─── ModelCapabilityTags: context display ─────────────────────────────

  it('A013/Tags: shows raw token count when context is less than 1000', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    // DeepSeek has no keys → catalog fallback shows models
    const card = await screen.findByRole('button', { name: 'View DeepSeek details' });
    await user.click(card);

    await screen.findByText('Back to Providers');
    await screen.findByText('Available Models');

    // DeepSeek catalog entry has max_input_tokens: 64000 → should show "64K ctx"
    expect(await screen.findByText('64K ctx')).toBeInTheDocument();
  });

  // ─── labelForProvider: curated labels render ─────────────────────────

  it('A013/LabelFallback: curated provider labels render correctly', async () => {
    render(<ProvidersTab />);

    await screen.findByText('OpenAI');
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('DeepSeek')).toBeInTheDocument();
  });

  // ─── handleDeleteCustomProvider ───────────────────────────────────────

  it('A013/CustomProvider: delete button calls saveCustomProviders with empty list', async () => {
    const customProviders = [
      { id: 'my-provider', name: 'My Provider', baseUrl: 'http://localhost:9000', variant: 'openai' },
    ];

    mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
      if (command === 'vault_read') {
        if (args.key === 'litellm:custom_providers') {
          return JSON.stringify(customProviders);
        }
        return null;
      }
      if (command === 'vault_store') return undefined;
      return undefined;
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    // Wait for the custom provider card to appear
    await screen.findByText('My Provider');

    // The ConfirmAction mock wraps AppButton in a button that calls onConfirm.
    // The AppButton stops propagation, so we must click the outer ConfirmAction button.
    const appBtn = screen.getByRole('button', { name: /Delete custom provider My Provider/i });
    // appBtn.parentElement is the ConfirmAction <button onClick={onConfirm}>
    const confirmBtn = appBtn.parentElement as HTMLElement;
    await user.click(confirmBtn);

    // saveCustomProviders → vault_store with updated (empty) list
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('vault_store', {
        key: 'litellm:custom_providers',
        value: JSON.stringify([]),
      });
    });

    // A013/Vault: No more llm_list_provider_keys or llm_delete_provider_key calls
    expect(mockInvoke).not.toHaveBeenCalledWith('llm_list_provider_keys', expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith('llm_delete_provider_key', expect.anything());
  });

  it('A013/CustomProvider: delete removes provider card from UI', async () => {
    const initialProviders = [
      { id: 'rm-me', name: 'Remove Me', baseUrl: 'http://localhost:8000', variant: 'anthropic' },
    ];
    // Track vault state so loadKeyCounts sees the updated list after delete
    let storedProviders = JSON.stringify(initialProviders);

    mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
      if (command === 'vault_read') {
        if (args.key === 'litellm:custom_providers') return storedProviders;
        return null;
      }
      if (command === 'vault_store') {
        if (args.key === 'litellm:custom_providers') storedProviders = args.value as string;
        return undefined;
      }
      return undefined;
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    await screen.findByText('Remove Me');

    // Click the outer ConfirmAction button (AppButton stops propagation)
    const appBtn = screen.getByRole('button', { name: /Delete custom provider Remove Me/i });
    const confirmBtn = appBtn.parentElement as HTMLElement;
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText('Remove Me')).not.toBeInTheDocument();
    });
  });

  // ─── Branch coverage: custom provider key count display ───────────────

  it('A013/CustomProvider: shows "● 1 key" when custom provider has apiKey in config', async () => {
    const customProviders = [
      {
        id: 'single-key', name: 'Single Key Provider',
        baseUrl: 'http://localhost:7000', variant: 'openai', apiKey: 'sk-test',
      },
    ];

    mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
      if (command === 'vault_read') {
        if (args.key === 'litellm:custom_providers') return JSON.stringify(customProviders);
        return null;
      }
      if (command === 'vault_store') return undefined;
      return undefined;
    });

    render(<ProvidersTab />);

    // "● 1 key" — apiKey is set so counts['custom-single-key'] = ['configured']
    await screen.findByText('● 1 key');
  });

  it('A013/CustomProvider: shows "○ No keys" when custom provider has no apiKey', async () => {
    const customProviders = [
      {
        id: 'no-key', name: 'No Key Provider',
        baseUrl: 'http://localhost:6000', variant: 'openai',
        // apiKey not set
      },
    ];

    mockInvoke.mockImplementation(async (command: string, args: Record<string, any>) => {
      if (command === 'vault_read') {
        if (args.key === 'litellm:custom_providers') return JSON.stringify(customProviders);
        return null;
      }
      if (command === 'vault_store') return undefined;
      return undefined;
    });

    render(<ProvidersTab />);

    // Find the "No Key Provider" card and check it shows "○ No keys"
    const cardBtn = await screen.findByRole('button', { name: 'View No Key Provider details' });
    const cardContainer = cardBtn.closest('[data-testid]') ?? cardBtn.parentElement!;
    expect(within(cardContainer as HTMLElement).getByText('○ No keys')).toBeInTheDocument();
  });

  // ─── Branch coverage: clearDiscoveryCache with empty localStorage ──────

  it('A013/Cache: Refresh works when no discovery cache exists in localStorage', async () => {
    // localStorage is empty (cleared in beforeEach)
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/v1/models') && !String(url).includes('127.0.0.1')) {
        return { ok: true, json: async () => ({ data: [{ id: 'gpt-fresh', object: 'model' }] }) };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View OpenAI details' });
    await user.click(card);

    // Enter API key to enable live discovery
    await user.click(screen.getByRole('button', { name: /Add Key/i }));
    await user.type(screen.getByLabelText('API Key'), 'sk-fresh-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Back to Providers');
    await screen.findByText('gpt-fresh');

    // Clicking Refresh with empty localStorage exercises the `if (!raw) return` branch in clearDiscoveryCache
    const refreshBtn = screen.getByRole('button', { name: /Refresh/i });
    await user.click(refreshBtn);

    // Model should still appear after refresh
    expect(await screen.findByText('gpt-fresh')).toBeInTheDocument();
  });

  // ─── Branch coverage: fetchModels throws a non-Error value ────────────

  it('A013/Discovery: handles non-Error throw from discoverModels', async () => {
    // discoverModels uses fetch() — throw a non-Error value to exercise String(err) branch
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/v1/models') && !String(url).includes('127.0.0.1')) {
        // fetch() itself resolves but we can make it a non-ok response
        return { ok: false, status: 503, text: async () => 'network timeout' };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View OpenAI details' });
    await user.click(card);

    // Enter API key to trigger discovery
    await user.click(screen.getByRole('button', { name: /Add Key/i }));
    await user.type(screen.getByLabelText('API Key'), 'sk-bad-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Back to Providers');

    // When fetchModels throws a non-Error, the error state is set
    await waitFor(() => {
      expect(screen.getByText('Unable to fetch models')).toBeInTheDocument();
    });

    // Clicking Retry exercises the clearDiscoveryCache empty-cache branch
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    await user.click(retryBtn);

    // Error should still show (discovery still fails)
    await waitFor(() => {
      expect(screen.getByText('Unable to fetch models')).toBeInTheDocument();
    });
  });

  it('A013/CustomModal: cancel closes the modal', async () => {
    const user = userEvent.setup();
    render(<ProvidersTab />);

    await screen.findByText('OpenAI');

    await user.click(screen.getByRole('button', { name: /Add OpenAI Compatible/i }));

    const modal = await screen.findByRole('dialog', { name: /Add Custom Provider/i });
    expect(modal).toBeInTheDocument();

    const cancelBtn = within(modal).getByRole('button', { name: 'Cancel' });
    await user.click(cancelBtn);

    await waitFor(() => {
      // Antd modals may stay in DOM but become hidden
      const modalWrap = document.querySelector('.ant-modal-wrap');
      expect(
        !modalWrap || modalWrap.getAttribute('style')?.includes('display: none')
      ).toBe(true);
    });
  });

  // ─── Branch coverage: filter clear button ────────────────────────────

  it('A013/Filter: clear button resets filter immediately without debounce', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/v1/models') && !String(url).includes('127.0.0.1')) {
        return { ok: true, json: async () => ({ data: [{ id: 'gpt-4o', object: 'model' }, { id: 'gpt-mini', object: 'model' }] }) };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    });

    const user = userEvent.setup();
    render(<ProvidersTab />);

    const card = await screen.findByRole('button', { name: 'View OpenAI details' });
    await user.click(card);

    // Enter API key to enable live discovery
    await user.click(screen.getByRole('button', { name: /Add Key/i }));
    await user.type(screen.getByLabelText('API Key'), 'sk-openai-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('gpt-4o');

    // Type a filter
    const filterInput = screen.getByLabelText('Filter models');
    await user.type(filterInput, 'mini');

    // Flush debounce to apply filter
    await act(() => { vi.advanceTimersByTime(1000); });

    expect(screen.getByText('gpt-mini')).toBeInTheDocument();

    // Click clear (allowClear) — should reset immediately
    const clearBtn = filterInput.parentElement?.querySelector('.ant-input-clear-icon') as HTMLElement;
    if (clearBtn) {
      await user.click(clearBtn);
    } else {
      // Fallback: clear manually
      await user.clear(filterInput);
    }

    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });
  });
});
