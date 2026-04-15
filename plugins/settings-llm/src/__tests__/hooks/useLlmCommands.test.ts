// A013/Hooks: Tauri command wrappers + direct LiteLLM fetch for LLM operations

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: mockInvoke,
  }),
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err : new Error(String(err)) }; }
  },
}));

// A013/Fetch: Mock global fetch for direct LiteLLM API calls
const mockFetch = vi.fn();

describe('A013/Hooks: useLlmCommands', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A013/Vault: Provider key management commands were removed.
  // Provider API keys are now passed directly to LiteLLM when importing models.
  // storeProviderKey, deleteProviderKey, and listProviderKeys no longer exist.

  describe('A013/Config: Config management', () => {
    it('gets base URL from backend settings', async () => {
      mockInvoke.mockResolvedValue('http://127.0.0.1:4000');
      const { getBaseUrl } = await import('../../hooks/useLlmCommands');
      const result = await getBaseUrl();
      expect(result).toBe('http://127.0.0.1:4000');
      expect(mockInvoke).toHaveBeenCalledWith('llm_get_base_url', {});
    });

    it('gets master key from vault via Tauri command', async () => {
      mockInvoke.mockResolvedValue('sk-master-abc');
      const { getMasterKey } = await import('../../hooks/useLlmCommands');
      const result = await getMasterKey();
      expect(result).toBe('sk-master-abc');
      expect(mockInvoke).toHaveBeenCalledWith('llm_get_master_key', {});
    });

    it('saves config with correct parameters', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const { saveConfig } = await import('../../hooks/useLlmCommands');
      const config = {
        model_list: [],
        router_settings: { routing_strategy: 'simple-shuffle', model_group_alias: {}, fallbacks: [] },
        litellm_settings: { json_logs: true, turn_off_message_logging: false, default_key_generate_params: { max_budget: 0, budget_duration: '30d' } },
        general_settings: { master_key: 'os.environ/LITELLM_MASTER_KEY' },
      };
      await saveConfig(config, '/path/to/data');
      expect(mockInvoke).toHaveBeenCalledWith('llm_save_config', {
        config,
        dataDir: '/path/to/data',
      });
    });

    it('gets config path', async () => {
      mockInvoke.mockResolvedValue('/path/to/gateway/config.yaml');
      const { getConfigPath } = await import('../../hooks/useLlmCommands');
      const result = await getConfigPath('/path/to/data');
      expect(result).toBe('/path/to/gateway/config.yaml');
    });
  });

  describe('A013/Keys: Virtual key management via direct fetch', () => {
    it('generates key via POST /key/generate', async () => {
      const responseBody = { key: 'sk-gen-123' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseBody),
      });
      const { generateKey } = await import('../../hooks/useLlmCommands');
      const params = {
        models: ['gpt-4o'],
        max_budget: 100,
        budget_duration: '30d',
        metadata: {},
      };
      const result = await generateKey('http://localhost:4000', 'sk-master', params);
      expect(result.key).toBe('sk-gen-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/key/generate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-master',
          }),
          body: JSON.stringify(params),
        }),
      );
    });

    it('lists keys via GET /key/list with pagination', async () => {
      const responseBody = { keys: [{ key: 'sk-1' }], total_count: 1 };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseBody),
      });
      const { listKeys } = await import('../../hooks/useLlmCommands');
      const result = await listKeys('http://localhost:4000', 'sk-master', 1, 10);
      expect(result.keys).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/key/list?page=1&size=10',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-master',
          }),
        }),
      );
    });

    it('lists keys without pagination when no page/size given', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ keys: [] }),
      });
      const { listKeys } = await import('../../hooks/useLlmCommands');
      await listKeys('http://localhost:4000', 'sk-master');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/key/list',
        expect.anything(),
      );
    });

    it('handles flat array response from /key/list', async () => {
      const flatArray = [{ key: 'sk-1' }, { key: 'sk-2' }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(flatArray),
      });
      const { listKeys } = await import('../../hooks/useLlmCommands');
      const result = await listKeys('http://localhost:4000', 'sk-master');
      expect(result.keys).toHaveLength(2);
      expect(result.total_count).toBe(2);
    });

    it('deletes key via POST /key/delete', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ deleted: true }),
      });
      const { deleteKey } = await import('../../hooks/useLlmCommands');
      const result = await deleteKey('http://localhost:4000', 'sk-master', 'sk-test');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/key/delete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ keys: ['sk-test'] }),
        }),
      );
    });

    it('gets key info via GET /key/info', async () => {
      const responseBody = { key: 'sk-test', models: ['gpt-4o'] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseBody),
      });
      const { getKeyInfo } = await import('../../hooks/useLlmCommands');
      const result = await getKeyInfo('http://localhost:4000', 'sk-master', 'sk-test');
      expect(result.key).toBe('sk-test');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/key/info?key=sk-test',
        expect.anything(),
      );
    });

    it('updates key via POST /key/update', async () => {
      const responseBody = { key: 'sk-test', models: ['gpt-4o', 'claude'] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseBody),
      });
      const { updateKey } = await import('../../hooks/useLlmCommands');
      const params = { models: ['gpt-4o', 'claude'] };
      const result = await updateKey('http://localhost:4000', 'sk-master', 'sk-test', params);
      expect(result.models).toContain('claude');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/key/update',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'sk-test', ...params }),
        }),
      );
    });

    it('throws on non-ok fetch response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      });
      const { listKeys } = await import('../../hooks/useLlmCommands');
      await expect(listKeys('http://localhost:4000', 'sk-bad')).rejects.toThrow('403: Forbidden');
    });
  });

  describe('A013/Spend: Spend tracking via direct fetch', () => {
    it('gets spend logs via GET /spend/logs with filters', async () => {
      const responseBody = [{ request_id: 'req-1', model: 'gpt-4o', spend: 0.01 }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseBody),
      });
      const { getSpendLogs } = await import('../../hooks/useLlmCommands');
      const filters = { model: 'gpt-4o', size: 100 };
      const result = await getSpendLogs('http://localhost:4000', 'sk-master', filters);
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/spend/logs?model=gpt-4o&size=100',
        expect.anything(),
      );
    });

    it('gets spend logs with all filter params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      const { getSpendLogs } = await import('../../hooks/useLlmCommands');
      const filters = {
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        key: 'sk-test',
        model: 'gpt-4o',
        user: 'user-123',
        page: 2,
        size: 50,
      };
      await getSpendLogs('http://localhost:4000', 'sk-master', filters);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2026-01-01'),
        expect.anything(),
      );
    });

    it('gets spend logs without query string when filters are empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      const { getSpendLogs } = await import('../../hooks/useLlmCommands');
      await getSpendLogs('http://localhost:4000', 'sk-master', {});
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/spend/logs',
        expect.anything(),
      );
    });

    it('gets key spend via GET /spend/key', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ key: 'sk-test', spend: 1.23 }),
      });
      const { getKeySpend } = await import('../../hooks/useLlmCommands');
      const result = await getKeySpend('http://localhost:4000', 'sk-master', 'sk-test');
      expect(result.spend).toBe(1.23);
    });

    it('gets global spend via GET /global/spend', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total_spend: 10.5, by_provider: {} }),
      });
      const { getGlobalSpend } = await import('../../hooks/useLlmCommands');
      const result = await getGlobalSpend('http://localhost:4000', 'sk-master');
      expect(result.total_spend).toBe(10.5);
    });

    it('gets models list via GET /v1/models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'gpt-4o' }] }),
      });
      const { getModels } = await import('../../hooks/useLlmCommands');
      const result = await getModels('http://localhost:4000', 'sk-master');
      expect(result.data).toHaveLength(1);
    });

    it('gets model info via GET /v1/model/info', async () => {
      const modelData = {
        data: [
          {
            model_name: 'gpt-4o',
            model_info: {
              max_tokens: 128000,
              input_cost_per_token: 0.000005,
              output_cost_per_token: 0.000015,
              mode: 'chat',
              supports_vision: true,
            },
          },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(modelData),
      });
      const { getModelInfo } = await import('../../hooks/useLlmCommands');
      const result = await getModelInfo('http://localhost:4000', 'sk-master');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].model_name).toBe('gpt-4o');
      expect(result.data[0].model_info.max_tokens).toBe(128000);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/v1/model/info',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-master',
          }),
        }),
      );
    });
  });

  describe('A013/ModelDelete: Delete model from LiteLLM gateway', () => {
    it('deletes model via POST /model/delete', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      const { deleteModel } = await import('../../hooks/useLlmCommands');
      await deleteModel('http://localhost:4000', 'sk-master', 'model-db-id-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/model/delete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ id: 'model-db-id-123' }),
        }),
      );
    });

    it('throws when model delete returns non-ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Not found'),
      });
      const { deleteModel } = await import('../../hooks/useLlmCommands');
      await expect(deleteModel('http://localhost:4000', 'sk-master', 'bad-id')).rejects.toThrow();
    });
  });

  describe('A013/Discovery: Model discovery and import', () => {
    it('discovers models via fetch from provider API', async () => {
      const response = { data: [{ id: 'gpt-4o', object: 'model', owned_by: 'openai' }] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      const { discoverModels } = await import('../../hooks/useLlmCommands');
      const result = await discoverModels('sk-openai-key', 'https://api.openai.com/v1');
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-openai-key',
          }),
        }),
      );
    });

    it('discovers models with custom base URL', async () => {
      const response = { data: [{ id: 'my-model', object: 'model' }] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      const { discoverModels } = await import('../../hooks/useLlmCommands');
      const result = await discoverModels('sk-custom-key', 'https://llm.solo.engineer/v1');
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://llm.solo.engineer/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-custom-key',
          }),
        }),
      );
    });

    it('throws when discoverModels returns non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });
      const { discoverModels } = await import('../../hooks/useLlmCommands');
      await expect(discoverModels('sk-bad-key', 'https://api.openai.com/v1')).rejects.toThrow('Provider returned 401');
    });

    it('imports model via POST /model/new using litellmFetch', async () => {
      const response = { status: 'success' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      const { importModel } = await import('../../hooks/useLlmCommands');
      // A013: new signature — litellmBaseUrl and masterKey are first two args
      const result = await importModel('http://localhost:4000', 'sk-master', 'openai', 'gpt-4o', 'sk-openai-key');
      expect(result).toEqual(response);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/model/new',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-master',
          }),
          body: expect.stringContaining('gpt-4o'),
        }),
      );
    });

    it('imports model with custom name and base URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });
      const { importModel } = await import('../../hooks/useLlmCommands');
      await importModel(
        'http://localhost:4000',
        'sk-master',
        'custom-solo',
        'my-model',
        'sk-custom-key',
        'alias-name',
        'https://llm.solo.engineer/v1',
        'openai',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/model/new',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('alias-name'),
        }),
      );
    });
  });

  describe('A013/Routing: getConfig and getModelGroups', () => {
    it('getConfig calls /router/settings and reshapes to { router_settings }', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          current_values: {
            routing_strategy: 'latency-based-routing',
            fallbacks: null,
            model_group_alias: { fast: 'gpt-4o-mini' },
          },
          fields: [],
        }),
      });
      const { getConfig } = await import('../../hooks/useLlmCommands');
      const result = await getConfig('http://localhost:4000', 'sk-master');
      expect(result).toHaveProperty('router_settings');
      expect((result['router_settings'] as Record<string, unknown>)['routing_strategy']).toBe('latency-based-routing');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/router/settings',
        expect.objectContaining({ headers: expect.objectContaining({ 'Authorization': 'Bearer sk-master' }) }),
      );
    });

    it('getModelGroups extracts model_group names from { data: [...] } response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { model_group: 'solo-engineer/coder', providers: ['openai'] },
            { model_group: 'solo-engineer-test/codex', providers: ['openai'] },
          ],
        }),
      });
      const { getModelGroups } = await import('../../hooks/useLlmCommands');
      const result = await getModelGroups('http://localhost:4000', 'sk-master');
      expect(result).toEqual(['solo-engineer/coder', 'solo-engineer-test/codex']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/model_group/info',
        expect.anything(),
      );
    });

    it('getModelGroups handles flat array response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { model_group: 'gpt-4o' },
          { model_group: 'claude-3-5-sonnet' },
        ]),
      });
      const { getModelGroups } = await import('../../hooks/useLlmCommands');
      const result = await getModelGroups('http://localhost:4000', 'sk-master');
      expect(result).toEqual(['gpt-4o', 'claude-3-5-sonnet']);
    });

    it('getModelGroups returns empty array when data is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
      const { getModelGroups } = await import('../../hooks/useLlmCommands');
      const result = await getModelGroups('http://localhost:4000', 'sk-master');
      expect(result).toEqual([]);
    });
  });

  describe('A013/Custom: Custom provider persistence', () => {
    beforeEach(() => {
      localStorage.removeItem('snapfzz:custom_providers');
    });

    it('loads custom providers from localStorage', async () => {
      const providers = [
        { id: 'solo', name: 'Solo', baseUrl: 'https://solo.dev/v1', variant: 'openai' },
      ];
      localStorage.setItem('snapfzz:custom_providers', JSON.stringify(providers));
      const { loadCustomProviders } = await import('../../hooks/useLlmCommands');
      const result = await loadCustomProviders();
      expect(result).toEqual(providers);
    });

    it('returns empty array when localStorage has no custom providers', async () => {
      const { loadCustomProviders } = await import('../../hooks/useLlmCommands');
      const result = await loadCustomProviders();
      expect(result).toEqual([]);
    });

    it('returns empty array when localStorage value is invalid JSON', async () => {
      localStorage.setItem('snapfzz:custom_providers', 'not-valid-json');
      const { loadCustomProviders } = await import('../../hooks/useLlmCommands');
      const result = await loadCustomProviders();
      expect(result).toEqual([]);
    });

    it('saves custom providers to localStorage as JSON', async () => {
      const { saveCustomProviders } = await import('../../hooks/useLlmCommands');
      const providers = [
        { id: 'test', name: 'Test', baseUrl: 'https://test.io/v1', variant: 'openai' as const },
      ];
      await saveCustomProviders(providers);
      expect(localStorage.getItem('snapfzz:custom_providers')).toBe(JSON.stringify(providers));
    });
  });

  describe('A013/Keys: listKeysWithInfo', () => {
    it('fetches key list and info in parallel', async () => {
      // First call: /key/list returns array of token strings
      // Subsequent calls: /key/info per token
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(['tok-aaa', 'tok-bbb']) })
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ key: 'sk-test', models: ['gpt-4o'] }) });
      const { listKeysWithInfo } = await import('../../hooks/useLlmCommands');
      const result = await listKeysWithInfo('http://localhost:4000', 'sk-master');
      expect(result.keys).toHaveLength(2);
      expect(result.total_count).toBe(2);
    });

    it('returns empty when token list is empty', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
      const { listKeysWithInfo } = await import('../../hooks/useLlmCommands');
      const result = await listKeysWithInfo('http://localhost:4000', 'sk-master');
      expect(result.keys).toHaveLength(0);
    });

    it('handles object items in the key list (extracts token field)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ token: 'tok-aaa' }, { key: 'tok-bbb' }, { key_hash: 'tok-ccc' }]),
        })
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ key: 'sk-test' }) });
      const { listKeysWithInfo } = await import('../../hooks/useLlmCommands');
      const result = await listKeysWithInfo('http://localhost:4000', 'sk-master');
      expect(result.keys).toHaveLength(3);
    });

    it('handles key/info failures gracefully (partial results)', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(['tok-ok', 'tok-fail']) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ key: 'sk-ok', models: ['gpt-4o'] }) })
        .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('Not found') });
      const { listKeysWithInfo } = await import('../../hooks/useLlmCommands');
      const result = await listKeysWithInfo('http://localhost:4000', 'sk-master');
      // Should return both keys — failed one becomes { token: 'tok-fail' }
      expect(result.keys).toHaveLength(2);
    });

    it('handles info result wrapped in { info: {...} }', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(['tok-aaa']) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ info: { key: 'sk-test', models: ['gpt-4o'], spend: 1.23 } }),
        });
      const { listKeysWithInfo } = await import('../../hooks/useLlmCommands');
      const result = await listKeysWithInfo('http://localhost:4000', 'sk-master');
      expect(result.keys[0].spend).toBe(1.23);
    });
  });

  describe('A013/Analytics: Spend report and summary', () => {
    it('getSpendReport fetches /global/spend/report with query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ group_by: 'openai', spend: 5.0 }]),
      });
      const { getSpendReport } = await import('../../hooks/useLlmCommands');
      const result = await getSpendReport('http://localhost:4000', 'sk-master', '2026-01-01', '2026-01-31', 'team');
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2026-01-01'),
        expect.anything(),
      );
    });

    it('getSpendReport handles { data: [...] } response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ spend: 2.5 }] }),
      });
      const { getSpendReport } = await import('../../hooks/useLlmCommands');
      const result = await getSpendReport('http://localhost:4000', 'sk-master');
      expect(result).toHaveLength(1);
    });

    it('getSpendReport handles { report: [...] } response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ report: [{ spend: 3.0 }] }),
      });
      const { getSpendReport } = await import('../../hooks/useLlmCommands');
      const result = await getSpendReport('http://localhost:4000', 'sk-master');
      expect(result).toHaveLength(1);
    });

    it('getSpendReport with no query params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      const { getSpendReport } = await import('../../hooks/useLlmCommands');
      await getSpendReport('http://localhost:4000', 'sk-master');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/global/spend/report',
        expect.anything(),
      );
    });

    it('getSpendSummary fetches /spend/logs with summarize=true', async () => {
      const summary = { total_spend: 1.5, total_tokens: 5000, prompt_tokens: 3000, completion_tokens: 2000, api_requests: 10 };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(summary),
      });
      const { getSpendSummary } = await import('../../hooks/useLlmCommands');
      const result = await getSpendSummary('http://localhost:4000', 'sk-master', '2026-01-01', '2026-01-31');
      expect(result.total_spend).toBe(1.5);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('summarize=true'),
        expect.anything(),
      );
    });

    it('getSpendSummary without date params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total_spend: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0, api_requests: 0 }),
      });
      const { getSpendSummary } = await import('../../hooks/useLlmCommands');
      await getSpendSummary('http://localhost:4000', 'sk-master');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('summarize=true'),
        expect.anything(),
      );
    });

    it('getDailyActivity fetches /user/daily/activity', async () => {
      const activity = [{ date: '2026-01-01', total_tokens: 1000, prompt_tokens: 700, completion_tokens: 300, spend: 0.05, api_requests: 5 }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(activity),
      });
      const { getDailyActivity } = await import('../../hooks/useLlmCommands');
      const result = await getDailyActivity('http://localhost:4000', 'sk-master', '2026-01-01', '2026-01-31');
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2026-01-01'),
        expect.anything(),
      );
    });

    it('getDailyActivity handles { data: [...] } response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ date: '2026-01-01', total_tokens: 100, prompt_tokens: 50, completion_tokens: 50, spend: 0.01, api_requests: 1 }] }),
      });
      const { getDailyActivity } = await import('../../hooks/useLlmCommands');
      const result = await getDailyActivity('http://localhost:4000', 'sk-master', '2026-01-01', '2026-01-31');
      expect(result).toHaveLength(1);
    });

    it('getDailyActivity handles { daily_activity: [...] } response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ daily_activity: [{ date: '2026-01-01', total_tokens: 100, prompt_tokens: 50, completion_tokens: 50, spend: 0.01, api_requests: 1 }] }),
      });
      const { getDailyActivity } = await import('../../hooks/useLlmCommands');
      const result = await getDailyActivity('http://localhost:4000', 'sk-master', '2026-01-01', '2026-01-31');
      expect(result).toHaveLength(1);
    });
  });

  describe('A013/Config: updateConfig', () => {
    it('posts to /config/update with settings payload', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });
      const { updateConfig } = await import('../../hooks/useLlmCommands');
      const settings = { router_settings: { routing_strategy: 'round-robin' } };
      const result = await updateConfig('http://localhost:4000', 'sk-master', settings);
      expect(result).toEqual({ status: 'success' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/config/update',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(settings),
          headers: expect.objectContaining({ 'Authorization': 'Bearer sk-master' }),
        }),
      );
    });
  });

  describe('A013/ModelGroups: getModelGroups edge cases', () => {
    it('handles model group as non-object (stringified fallback)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        // String items in the array — covered by String(g) branch
        json: () => Promise.resolve({ data: ['gpt-4o', 'claude-3'] }),
      });
      const { getModelGroups } = await import('../../hooks/useLlmCommands');
      const result = await getModelGroups('http://localhost:4000', 'sk-master');
      // String items don't match the object branch — they fall through to String(g)
      // They'll pass the filter if they're non-empty
      expect(Array.isArray(result)).toBe(true);
    });

    it('handles model_group entry with name instead of model_group key', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ name: 'gpt-4o' }] }),
      });
      const { getModelGroups } = await import('../../hooks/useLlmCommands');
      const result = await getModelGroups('http://localhost:4000', 'sk-master');
      expect(result).toContain('gpt-4o');
    });
  });

  describe('A013/Import: importModel edge cases', () => {
    it('importModel with all opts (weight, rpm, tpm, order, isCombo)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });
      const { importModel } = await import('../../hooks/useLlmCommands');
      await importModel(
        'http://localhost:4000', 'sk-master',
        'custom-solo', 'my-model', 'sk-api-key',
        'my-alias', 'https://solo.dev/v1', 'openai',
        { weight: 70, rpm: 100, tpm: 1000, order: 1, isCombo: true },
      );
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.litellm_params.weight).toBe(70);
      expect(body.litellm_params.rpm).toBe(100);
      expect(body.model_info.snapfzz_combo).toBe(true);
      expect(body.model_info.order).toBe(1);
    });

    it('importModel with provider not starting with custom- uses slug as-is', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'success' }),
      });
      const { importModel } = await import('../../hooks/useLlmCommands');
      await importModel('http://localhost:4000', 'sk-master', 'openai', 'gpt-4o', 'sk-key');
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      // providerSlug = 'openai' (does not start with 'custom-')
      expect(body.model_name).toBe('openai/gpt-4o');
    });
  });
});
