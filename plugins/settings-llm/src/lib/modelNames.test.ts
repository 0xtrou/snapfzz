// Tests for shared provider/model name resolution utilities.

import { describe, it, expect } from 'vitest';
import { buildProviderLookup, resolveProviderName, resolveModelName } from './modelNames';
import type { CustomProvider, SpendLog } from '../hooks/useLlmCommands';

// --- helpers ---

function makeProvider(id: string, name: string, baseUrl: string): CustomProvider {
  return { id, name, baseUrl, variant: 'openai' };
}

function makeLog(overrides: Partial<SpendLog>): SpendLog {
  return {
    request_id: 'req-test',
    api_key: 'sk-test',
    model: 'openai/gpt-4o',
    spend: 0,
    ...overrides,
  };
}

// --- buildProviderLookup ---

describe('buildProviderLookup', () => {
  it('builds byModelId from snapfzz_provider_id', () => {
    const providers = [makeProvider('prov-1', 'Solo Engineer', 'https://llm.solo.engineer/v1')];
    const modelInfos = [
      {
        model_name: 'solo-engineer/coder',
        model_info: { id: 'uuid-abc', snapfzz_provider_id: 'custom-prov-1' },
        litellm_params: { api_base: 'https://llm.solo.engineer/v1' },
      },
    ];
    const lookup = buildProviderLookup(providers, modelInfos);
    expect(lookup.byModelId.get('uuid-abc')).toBe('Solo Engineer');
  });

  it('falls back to api_base when snapfzz_provider_id is missing', () => {
    const providers = [makeProvider('prov-2', 'My Provider', 'https://api.myprovider.com/v1')];
    const modelInfos = [
      {
        model_name: 'my-provider/model',
        model_info: { id: 'uuid-xyz' },
        litellm_params: { api_base: 'https://api.myprovider.com/v1' },
      },
    ];
    const lookup = buildProviderLookup(providers, modelInfos);
    expect(lookup.byModelId.get('uuid-xyz')).toBe('My Provider');
  });

  it('normalises trailing slashes and /v1 in byApiBase', () => {
    const providers = [makeProvider('p1', 'Provider A', 'https://a.example.com/v1/')];
    const lookup = buildProviderLookup(providers, []);
    expect(lookup.byApiBase.get('https://a.example.com')).toBe('Provider A');
    expect(lookup.byApiBase.get('https://a.example.com/v1')).toBe('Provider A');
    expect(lookup.byApiBase.get('https://a.example.com/')).toBe('Provider A');
    expect(lookup.byApiBase.get('https://a.example.com/v1/')).toBe('Provider A');
  });

  it('first provider with a given base wins', () => {
    const providers = [
      makeProvider('p1', 'First', 'https://shared.example.com'),
      makeProvider('p2', 'Second', 'https://shared.example.com'),
    ];
    const lookup = buildProviderLookup(providers, []);
    expect(lookup.byApiBase.get('https://shared.example.com')).toBe('First');
  });

  it('populates providerNames from custom providers', () => {
    const providers = [
      makeProvider('p1', 'solo-engineer', 'https://llm.solo.engineer/v1'),
      makeProvider('p2', 'bcp-cloud', 'https://bcp.example.com/v1'),
    ];
    const lookup = buildProviderLookup(providers, []);
    expect(lookup.providerNames.has('solo-engineer')).toBe(true);
    expect(lookup.providerNames.has('bcp-cloud')).toBe(true);
    expect(lookup.providerNames.has('unknown')).toBe(false);
  });

  it('returns empty maps for empty inputs', () => {
    const lookup = buildProviderLookup([], []);
    expect(lookup.byModelId.size).toBe(0);
    expect(lookup.byApiBase.size).toBe(0);
    expect(lookup.providerNames.size).toBe(0);
  });
});

// --- resolveProviderName ---

describe('resolveProviderName', () => {
  const providers = [makeProvider('se', 'solo-engineer', 'https://llm.solo.engineer/v1')];
  const modelInfos = [
    {
      model_name: 'solo-engineer/bcp/glm-5',
      model_info: { id: 'model-uuid-1', snapfzz_provider_id: 'custom-se' },
      litellm_params: { api_base: 'https://llm.solo.engineer/v1' },
    },
  ];

  it('resolves via model_id (highest priority)', () => {
    const lookup = buildProviderLookup(providers, modelInfos);
    const log = makeLog({ model_id: 'model-uuid-1', api_base: 'https://something-else.com' });
    expect(resolveProviderName(log, lookup)).toBe('solo-engineer');
  });

  it('resolves via api_base when model_id is absent', () => {
    const lookup = buildProviderLookup(providers, modelInfos);
    const log = makeLog({ api_base: 'https://llm.solo.engineer/v1' });
    expect(resolveProviderName(log, lookup)).toBe('solo-engineer');
  });

  it('resolves via api_base with trailing slash', () => {
    const lookup = buildProviderLookup(providers, modelInfos);
    const log = makeLog({ api_base: 'https://llm.solo.engineer/v1/' });
    expect(resolveProviderName(log, lookup)).toBe('solo-engineer');
  });

  it('extracts provider from model_group first segment when lookup misses', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: 'openai/gpt-4o', api_base: undefined });
    expect(resolveProviderName(log, lookup)).toBe('openai');
  });

  it('extracts first segment of multi-slash model_group correctly', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: 'solo-engineer/bcp/glm-5', api_base: undefined });
    // First segment is provider, not second or third
    expect(resolveProviderName(log, lookup)).toBe('solo-engineer');
  });

  it('falls back to hostname when no model_group slash and no lookup match', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: '', model: 'gpt-4o', api_base: 'https://api.openai.com/v1' });
    expect(resolveProviderName(log, lookup)).toBe('openai.com');
  });

  it('strips api. prefix from hostname', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: '', model: 'claude', api_base: 'https://api.anthropic.com' });
    expect(resolveProviderName(log, lookup)).toBe('anthropic.com');
  });

  it('strips llm. prefix from hostname', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: '', model: 'coder', api_base: 'https://llm.solo.engineer' });
    expect(resolveProviderName(log, lookup)).toBe('solo.engineer');
  });

  it('returns "unknown" when nothing resolves', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: '', model: 'gpt-4o', api_base: undefined });
    expect(resolveProviderName(log, lookup)).toBe('unknown');
  });
});

// --- resolveModelName ---

describe('resolveModelName', () => {
  it('strips known provider prefix from model_group', () => {
    const providers = [makeProvider('se', 'solo-engineer', 'https://llm.solo.engineer/v1')];
    const lookup = buildProviderLookup(providers, []);
    const log = makeLog({ model_group: 'solo-engineer/bcp/glm-5' });
    expect(resolveModelName(log, lookup)).toBe('bcp/glm-5');
  });

  it('strips first segment naively when provider not in lookup', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: 'openai/gpt-4o' });
    expect(resolveModelName(log, lookup)).toBe('gpt-4o');
  });

  it('returns model_group as-is when there is no slash', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: 'gpt-4o' });
    expect(resolveModelName(log, lookup)).toBe('gpt-4o');
  });

  it('falls back to model when model_group is absent', () => {
    const lookup = buildProviderLookup([], []);
    const log = makeLog({ model_group: undefined, model: 'openai/gpt-4o' });
    expect(resolveModelName(log, lookup)).toBe('gpt-4o');
  });

  it('returns "unknown" when both model_group and model are absent', () => {
    const lookup = buildProviderLookup([], []);
    // model is required in SpendLog but test the empty-string fallback path
    const log = makeLog({ model_group: '', model: '' });
    expect(resolveModelName(log, lookup)).toBe('unknown');
  });

  it('handles model_group with exactly two segments correctly', () => {
    const providers = [makeProvider('p1', 'solo-engineer', 'https://x.com')];
    const lookup = buildProviderLookup(providers, []);
    const log = makeLog({ model_group: 'solo-engineer/coder' });
    expect(resolveModelName(log, lookup)).toBe('coder');
  });

  it('handles model_group with three segments — strips only provider prefix', () => {
    const providers = [makeProvider('p1', 'solo-engineer', 'https://x.com')];
    const lookup = buildProviderLookup(providers, []);
    const log = makeLog({ model_group: 'solo-engineer/bcp/glm-5' });
    // "bcp/glm-5" — the full model including its own slash, not just "glm-5"
    expect(resolveModelName(log, lookup)).toBe('bcp/glm-5');
  });
});
