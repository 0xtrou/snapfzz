import { describe, it, expect } from 'vitest';
import { composeCombo } from './composer';
import type { ComboConfig, Deployment } from './composer';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const dep1: Deployment = {
  provider: 'provider-a',
  model: 'gpt-fast',
  apiKey: 'key-a',
  apiBase: 'https://api.a.com/v1',
  weight: 70,
  rpmLimit: 100,
  tpmLimit: 10000,
};

const dep2: Deployment = {
  provider: 'provider-b',
  model: 'gpt-cheap',
  apiKey: 'key-b',
  weight: 30,
};

const dep3: Deployment = {
  provider: 'provider-c',
  model: 'gpt-backup',
  apiKey: 'key-c',
};

// ---------------------------------------------------------------------------
// round-robin
// ---------------------------------------------------------------------------

describe('round-robin strategy', () => {
  it('creates one payload per deployment with no weight or order fields', () => {
    const config: ComboConfig = {
      name: 'my-group',
      strategy: 'round-robin',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(2);

    for (const payload of result.modelsToCreate) {
      expect(payload.model_name).toBe('my-group');
      expect(payload.litellm_params.weight).toBeUndefined();
      expect(payload.model_info?.order).toBeUndefined();
    }
  });

  it('sets routing_strategy to simple-shuffle', () => {
    const config: ComboConfig = {
      name: 'my-group',
      strategy: 'round-robin',
      deployments: [dep1],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });
});

// ---------------------------------------------------------------------------
// weighted
// ---------------------------------------------------------------------------

describe('weighted strategy', () => {
  it('preserves custom weight values per deployment', () => {
    const config: ComboConfig = {
      name: 'weighted-group',
      strategy: 'weighted',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].litellm_params.weight).toBe(70);
    expect(result.modelsToCreate[1].litellm_params.weight).toBe(30);
  });

  it('sets routing_strategy to simple-shuffle', () => {
    const config: ComboConfig = {
      name: 'weighted-group',
      strategy: 'weighted',
      deployments: [dep1],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });
});

// ---------------------------------------------------------------------------
// priority
// ---------------------------------------------------------------------------

describe('priority strategy', () => {
  it('assigns order fields starting at 1 in deployment order', () => {
    const config: ComboConfig = {
      name: 'priority-group',
      strategy: 'priority',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].model_info?.order).toBe(1);
    expect(result.modelsToCreate[1].model_info?.order).toBe(2);
    expect(result.modelsToCreate[2].model_info?.order).toBe(3);
  });

  it('sets routing_strategy to simple-shuffle', () => {
    const config: ComboConfig = {
      name: 'priority-group',
      strategy: 'priority',
      deployments: [dep1],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });
});

// ---------------------------------------------------------------------------
// fill-first
// ---------------------------------------------------------------------------

describe('fill-first strategy', () => {
  it('assigns order=1 to first deployment and increments for the rest', () => {
    const config: ComboConfig = {
      name: 'fill-group',
      strategy: 'fill-first',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].model_info?.order).toBe(1);
    expect(result.modelsToCreate[1].model_info?.order).toBe(2);
    expect(result.modelsToCreate[2].model_info?.order).toBe(3);
  });

  it('sets routing_strategy to usage-based-routing', () => {
    const config: ComboConfig = {
      name: 'fill-group',
      strategy: 'fill-first',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.routing_strategy).toBe('usage-based-routing');
  });
});

// ---------------------------------------------------------------------------
// least-busy
// ---------------------------------------------------------------------------

describe('least-busy strategy', () => {
  it('sets routing_strategy to least-busy and omits weight/order', () => {
    const config: ComboConfig = {
      name: 'lb-group',
      strategy: 'least-busy',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.routing_strategy).toBe('least-busy');

    for (const payload of result.modelsToCreate) {
      expect(payload.litellm_params.weight).toBeUndefined();
      expect(payload.model_info?.order).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// cost-optimized
// ---------------------------------------------------------------------------

describe('cost-optimized strategy', () => {
  it('sets routing_strategy to cost-based-routing', () => {
    const config: ComboConfig = {
      name: 'cost-group',
      strategy: 'cost-optimized',
      deployments: [dep1],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.routing_strategy).toBe('cost-based-routing');
  });
});

// ---------------------------------------------------------------------------
// latency-optimized
// ---------------------------------------------------------------------------

describe('latency-optimized strategy', () => {
  it('sets routing_strategy to latency-based-routing', () => {
    const config: ComboConfig = {
      name: 'latency-group',
      strategy: 'latency-optimized',
      deployments: [dep1],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.routing_strategy).toBe('latency-based-routing');
  });
});

// ---------------------------------------------------------------------------
// fallbacks
// ---------------------------------------------------------------------------

describe('fallbacks', () => {
  it('encodes fallbacks as [{groupName: [fallbackNames]}] in router_settings', () => {
    const config: ComboConfig = {
      name: 'primary-group',
      strategy: 'round-robin',
      deployments: [dep1],
      fallbacks: ['backup-group', 'emergency-group'],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.fallbacks).toEqual([
      { 'primary-group': ['backup-group', 'emergency-group'] },
    ]);
  });

  it('omits fallbacks key when no fallbacks are provided', () => {
    const config: ComboConfig = {
      name: 'primary-group',
      strategy: 'round-robin',
      deployments: [dep1],
    };

    const result = composeCombo(config);

    expect(result.configUpdate?.router_settings.fallbacks).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Payload shape correctness
// ---------------------------------------------------------------------------

describe('payload shape', () => {
  it('prefixes model with openai/ and maps rpm/tpm/apiBase from deployment', () => {
    const config: ComboConfig = {
      name: 'shape-group',
      strategy: 'round-robin',
      deployments: [dep1],
    };

    const result = composeCombo(config);
    const payload = result.modelsToCreate[0];

    expect(payload.litellm_params.model).toBe('openai/gpt-fast');
    expect(payload.litellm_params.api_key).toBe('key-a');
    expect(payload.litellm_params.api_base).toBe('https://api.a.com/v1');
    expect(payload.litellm_params.rpm).toBe(100);
    expect(payload.litellm_params.tpm).toBe(10000);
    expect(payload.model_info?.snapfzz_provider_id).toBe('provider-a');
  });

  it('omits api_base when deployment has none', () => {
    const config: ComboConfig = {
      name: 'shape-group',
      strategy: 'round-robin',
      deployments: [dep2],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].litellm_params.api_base).toBeUndefined();
  });

  it('always returns an empty modelsToDelete array', () => {
    const config: ComboConfig = {
      name: 'shape-group',
      strategy: 'round-robin',
      deployments: [dep1],
    };

    const result = composeCombo(config);

    expect(result.modelsToDelete).toEqual([]);
  });
});
