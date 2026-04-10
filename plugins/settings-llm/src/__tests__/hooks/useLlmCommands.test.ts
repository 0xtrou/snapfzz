// A013/Hooks: Tauri command wrappers for LLM operations

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: mockInvoke,
  }),
}));

describe('A013/Hooks: useLlmCommands', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
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

  describe('A013/Keys: Virtual key management', () => {
    it('generates key with correct parameters', async () => {
      mockInvoke.mockResolvedValue({ key: 'sk-gen-123' });
      const { generateKey } = await import('../../hooks/useLlmCommands');
      const params = {
        models: ['gpt-4o'],
        max_budget: 100,
        budget_duration: '30d',
        metadata: {},
      };
      const result = await generateKey('http://localhost:4000', params);
      expect(result.key).toBe('sk-gen-123');
      expect(mockInvoke).toHaveBeenCalledWith('llm_generate_key', {
        base_url: 'http://localhost:4000',
        params,
      });
    });

    it('lists keys with pagination', async () => {
      mockInvoke.mockResolvedValue({ keys: [{ key: 'sk-1' }], total_count: 1 });
      const { listKeys } = await import('../../hooks/useLlmCommands');
      const result = await listKeys('http://localhost:4000', 1, 10);
      expect(result.keys).toHaveLength(1);
      expect(mockInvoke).toHaveBeenCalledWith('llm_list_keys', {
        base_url: 'http://localhost:4000',
        page: 1,
        size: 10,
      });
    });

    it('deletes key', async () => {
      mockInvoke.mockResolvedValue(true);
      const { deleteKey } = await import('../../hooks/useLlmCommands');
      const result = await deleteKey('http://localhost:4000', 'sk-test');
      expect(result).toBe(true);
    });

    it('gets key info', async () => {
      mockInvoke.mockResolvedValue({ key: 'sk-test', models: ['gpt-4o'] });
      const { getKeyInfo } = await import('../../hooks/useLlmCommands');
      const result = await getKeyInfo('http://localhost:4000', 'sk-test');
      expect(result.key).toBe('sk-test');
    });

    it('updates key', async () => {
      mockInvoke.mockResolvedValue({ key: 'sk-test', models: ['gpt-4o', 'claude'] });
      const { updateKey } = await import('../../hooks/useLlmCommands');
      const params = { models: ['gpt-4o', 'claude'] };
      const result = await updateKey('http://localhost:4000', 'sk-test', params);
      expect(result.models).toContain('claude');
    });
  });

  describe('A013/Spend: Spend tracking', () => {
    it('gets spend logs with filters', async () => {
      mockInvoke.mockResolvedValue([{ request_id: 'req-1', model: 'gpt-4o', spend: 0.01 }]);
      const { getSpendLogs } = await import('../../hooks/useLlmCommands');
      const filters = { model: 'gpt-4o', size: 100 };
      const result = await getSpendLogs('http://localhost:4000', filters);
      expect(result).toHaveLength(1);
    });

    it('gets key spend', async () => {
      mockInvoke.mockResolvedValue({ key: 'sk-test', spend: 1.23 });
      const { getKeySpend } = await import('../../hooks/useLlmCommands');
      const result = await getKeySpend('http://localhost:4000', 'sk-test');
      expect(result.spend).toBe(1.23);
    });

    it('gets global spend', async () => {
      mockInvoke.mockResolvedValue({ total_spend: 10.5, by_provider: {} });
      const { getGlobalSpend } = await import('../../hooks/useLlmCommands');
      const result = await getGlobalSpend('http://localhost:4000');
      expect(result.total_spend).toBe(10.5);
    });

    it('gets models list', async () => {
      mockInvoke.mockResolvedValue({ data: [{ id: 'gpt-4o' }] });
      const { getModels } = await import('../../hooks/useLlmCommands');
      const result = await getModels('http://localhost:4000');
      expect(result.data).toHaveLength(1);
    });
  });
});