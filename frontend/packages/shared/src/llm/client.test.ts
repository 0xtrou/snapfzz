// Per A013/LLMProviders: unit tests for the shared LlmGatewayClient factory.
// All Rust IPC + fetch are mocked — no jsdom needed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mock createTauriBridge before the module under test is imported
// ────────────────────────────────────────────────────────────
const mockInvoke = vi.fn();

vi.mock('../lib/tauri-bridge', () => ({
  createTauriBridge: () => ({
    invoke: mockInvoke,
    listen: vi.fn(),
    isAvailable: true,
  }),
}));

import { createLlmGatewayClient } from './client';

const BASE = 'http://localhost:4000';
const KEY = 'sk-master';

function makeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: vi.fn().mockResolvedValue(ok ? '' : JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  // Default: return base URL + master key
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'llm_get_base_url') return Promise.resolve(BASE);
    if (cmd === 'llm_get_master_key') return Promise.resolve(KEY);
    return Promise.reject(new Error(`unexpected cmd: ${cmd}`));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A013/LlmGatewayClient: getBaseUrl + getMasterKey', () => {
  it('A013/client: getBaseUrl invokes llm_get_base_url', async () => {
    const client = createLlmGatewayClient();
    const url = await client.getBaseUrl();
    expect(url).toBe(BASE);
    expect(mockInvoke).toHaveBeenCalledWith('llm_get_base_url', {});
  });

  it('A013/client: getMasterKey invokes llm_get_master_key', async () => {
    const client = createLlmGatewayClient();
    const key = await client.getMasterKey();
    expect(key).toBe(KEY);
    expect(mockInvoke).toHaveBeenCalledWith('llm_get_master_key', {});
  });

  it('A013/client: getBaseUrl is cached — Rust invoked only once per client', async () => {
    const client = createLlmGatewayClient();
    await client.getBaseUrl();
    await client.getBaseUrl();
    const calls = mockInvoke.mock.calls.filter((c) => c[0] === 'llm_get_base_url');
    expect(calls).toHaveLength(1);
  });

  it('A013/client: getMasterKey is cached — Rust invoked only once per client', async () => {
    const client = createLlmGatewayClient();
    await client.getMasterKey();
    await client.getMasterKey();
    const calls = mockInvoke.mock.calls.filter((c) => c[0] === 'llm_get_master_key');
    expect(calls).toHaveLength(1);
  });
});

describe('A013/LlmGatewayClient: listModels', () => {
  it('A013/client: listModels calls /v1/models with Bearer header', async () => {
    const payload = { data: [{ id: 'gpt-4' }] };
    const fetchMock = makeFetch(payload);
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    const result = await client.listModels();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/models`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    expect(result.data[0].id).toBe('gpt-4');
  });

  it('A013/client: listModels throws on 4xx response', async () => {
    const fetchMock = makeFetch({ error: 'unauthorized' }, false, 401);
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    await expect(client.listModels()).rejects.toThrow('LiteLLM 401');
  });
});

describe('A013/LlmGatewayClient: getModelInfo', () => {
  it('A013/client: getModelInfo calls /v1/model/info and returns data array', async () => {
    const payload = {
      data: [
        {
          model_name: 'openai/gpt-4',
          model_info: { supports_vision: true, input_cost_per_token: 0.00001 },
        },
      ],
    };
    const fetchMock = makeFetch(payload);
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    const result = await client.getModelInfo();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].model_info.supports_vision).toBe(true);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/model/info`);
  });

  it('A013/client: getModelInfo throws on 5xx response', async () => {
    const fetchMock = makeFetch('gateway error', false, 503);
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    await expect(client.getModelInfo()).rejects.toThrow('LiteLLM 503');
  });
});

describe('A013/LlmGatewayClient: getModelGroups', () => {
  it('A013/client: parses { data: [{model_group}] } shape', async () => {
    const payload = { data: [{ model_group: 'fast' }, { model_group: 'smart' }] };
    const fetchMock = makeFetch(payload);
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    const groups = await client.getModelGroups();

    expect(groups).toEqual([{ name: 'fast' }, { name: 'smart' }]);
  });

  it('A013/client: parses flat array of strings', async () => {
    const fetchMock = makeFetch(['fast', 'smart']);
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    const groups = await client.getModelGroups();

    expect(groups).toEqual([{ name: 'fast' }, { name: 'smart' }]);
  });

  it('A013/client: filters out empty entries', async () => {
    const fetchMock = makeFetch(['fast', '', null, 'smart']);
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    const groups = await client.getModelGroups();

    expect(groups).toEqual([{ name: 'fast' }, { name: 'smart' }]);
  });

  it('A013/client: returns empty array when payload is empty', async () => {
    const fetchMock = makeFetch({ data: [] });
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    const groups = await client.getModelGroups();

    expect(groups).toHaveLength(0);
  });

  it('A013/client: parses { name } shape instead of model_group', async () => {
    const payload = { data: [{ name: 'turbo' }] };
    const fetchMock = makeFetch(payload);
    vi.stubGlobal('fetch', fetchMock);

    const client = createLlmGatewayClient();
    const groups = await client.getModelGroups();

    expect(groups).toEqual([{ name: 'turbo' }]);
  });
});

describe('A013/LlmGatewayClient: cache reuse across methods', () => {
  it('A013/client: listModels + getModelInfo share cached base URL and key', async () => {
    vi.stubGlobal('fetch', makeFetch({ data: [] }));
    const client = createLlmGatewayClient();
    await client.listModels();
    await client.getModelInfo();
    // Both calls share base url + key — each Tauri command invoked only once
    const baseCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'llm_get_base_url');
    const keyCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'llm_get_master_key');
    expect(baseCalls).toHaveLength(1);
    expect(keyCalls).toHaveLength(1);
  });
});
