// A013/Hooks: Tauri command wrappers + direct LiteLLM fetch for LLM operations

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: mockInvoke,
  }),
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

  describe('A013/Vault: Provider key management', () => {
    it('stores provider key with correct parameters', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const { storeProviderKey } = await import('../../hooks/useLlmCommands');
      await storeProviderKey('openai', 'key_1', 'sk-test');
      expect(mockInvoke).toHaveBeenCalledWith('llm_store_provider_key', {
        providerId: 'openai',
        keyName: 'key_1',
        keyValue: 'sk-test',
      });
    });

    it('deletes provider key with correct parameters', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const { deleteProviderKey } = await import('../../hooks/useLlmCommands');
      await deleteProviderKey('anthropic', 'prod');
      expect(mockInvoke).toHaveBeenCalledWith('llm_delete_provider_key', {
        providerId: 'anthropic',
        keyName: 'prod',
      });
    });

    it('lists provider keys', async () => {
      mockInvoke.mockResolvedValue(['key_1', 'key_2']);
      const { listProviderKeys } = await import('../../hooks/useLlmCommands');
      const result = await listProviderKeys('openai');
      expect(result).toEqual(['key_1', 'key_2']);
      expect(mockInvoke).toHaveBeenCalledWith('llm_list_provider_keys', {
        providerId: 'openai',
      });
    });
  });

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
        data_dir: '/path/to/data',
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

  describe('A013/Custom: Custom provider persistence', () => {
    it('loads custom providers from vault', async () => {
      const providers = [
        { id: 'solo', name: 'Solo', baseUrl: 'https://solo.dev/v1', variant: 'openai' },
      ];
      mockInvoke.mockResolvedValue(JSON.stringify(providers));
      const { loadCustomProviders } = await import('../../hooks/useLlmCommands');
      const result = await loadCustomProviders();
      expect(result).toEqual(providers);
      expect(mockInvoke).toHaveBeenCalledWith('vault_read', {
        key: 'litellm:custom_providers',
      });
    });

    it('returns empty array when vault has no custom providers', async () => {
      mockInvoke.mockResolvedValue(null);
      const { loadCustomProviders } = await import('../../hooks/useLlmCommands');
      const result = await loadCustomProviders();
      expect(result).toEqual([]);
    });

    it('returns empty array when vault_read throws', async () => {
      mockInvoke.mockRejectedValue(new Error('vault locked'));
      const { loadCustomProviders } = await import('../../hooks/useLlmCommands');
      const result = await loadCustomProviders();
      expect(result).toEqual([]);
    });

    it('saves custom providers to vault as JSON', async () => {
      mockInvoke.mockResolvedValue(undefined);
      const { saveCustomProviders } = await import('../../hooks/useLlmCommands');
      const providers = [
        { id: 'test', name: 'Test', baseUrl: 'https://test.io/v1', variant: 'openai' as const },
      ];
      await saveCustomProviders(providers);
      expect(mockInvoke).toHaveBeenCalledWith('vault_store', {
        key: 'litellm:custom_providers',
        value: JSON.stringify(providers),
      });
    });
  });
});
