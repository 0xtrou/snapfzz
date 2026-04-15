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

  it('deduplicates deployments with the same model value', () => {
    const dupDep: Deployment = { ...dep1, weight: 99 };
    const config: ComboConfig = {
      name: 'dedup-group',
      strategy: 'weighted',
      deployments: [dep1, dupDep, dep2],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(2);
    // First occurrence wins — dep1's weight, not dupDep's
    expect(result.modelsToCreate[0].litellm_params.weight).toBe(70);
    expect(result.modelsToCreate[1].litellm_params.weight).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// apiType prefix
// ---------------------------------------------------------------------------

describe('apiType prefix', () => {
  it('prefixes model with anthropic/ when apiType is anthropic', () => {
    const config: ComboConfig = {
      name: 'anthropic-group',
      strategy: 'round-robin',
      deployments: [dep1, dep2],
      apiType: 'anthropic',
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].litellm_params.model).toBe('anthropic/gpt-fast');
    expect(result.modelsToCreate[1].litellm_params.model).toBe('anthropic/gpt-cheap');
  });

  it('strips existing openai/ prefix and re-prefixes with anthropic/ when apiType is anthropic', () => {
    const depWithPrefix: Deployment = {
      provider: 'provider-x',
      model: 'openai/claude-3-opus',
      apiKey: 'key-x',
    };
    const config: ComboConfig = {
      name: 'reprefix-group',
      strategy: 'round-robin',
      deployments: [depWithPrefix],
      apiType: 'anthropic',
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].litellm_params.model).toBe('anthropic/claude-3-opus');
  });

  it('defaults to openai/ prefix when no apiType is specified', () => {
    const config: ComboConfig = {
      name: 'default-prefix-group',
      strategy: 'round-robin',
      deployments: [dep1],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].litellm_params.model).toBe('openai/gpt-fast');
  });

  it('applies anthropic/ prefix in weighted strategy', () => {
    const config: ComboConfig = {
      name: 'anthropic-weighted-group',
      strategy: 'weighted',
      deployments: [dep1, dep2],
      apiType: 'anthropic',
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].litellm_params.model).toBe('anthropic/gpt-fast');
    expect(result.modelsToCreate[1].litellm_params.model).toBe('anthropic/gpt-cheap');
  });

  it('applies anthropic/ prefix in priority strategy', () => {
    const config: ComboConfig = {
      name: 'anthropic-priority-group',
      strategy: 'priority',
      deployments: [dep1, dep2],
      apiType: 'anthropic',
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].litellm_params.model).toBe('anthropic/gpt-fast');
    expect(result.modelsToCreate[1].litellm_params.model).toBe('anthropic/gpt-cheap');
  });
});

// ---------------------------------------------------------------------------
// RPM / TPM passthrough
// ---------------------------------------------------------------------------

describe('RPM and TPM passthrough', () => {
  it('sets litellm_params.rpm and tpm from rpmLimit and tpmLimit', () => {
    const depWithLimits: Deployment = {
      provider: 'provider-limits',
      model: 'gpt-limited',
      apiKey: 'key-limits',
      rpmLimit: 500,
      tpmLimit: 50000,
    };
    const config: ComboConfig = {
      name: 'limits-group',
      strategy: 'round-robin',
      deployments: [depWithLimits],
    };

    const result = composeCombo(config);
    const payload = result.modelsToCreate[0];

    expect(payload.litellm_params.rpm).toBe(500);
    expect(payload.litellm_params.tpm).toBe(50000);
  });

  it('omits rpm and tpm when deployment has no limits', () => {
    const depNoLimits: Deployment = {
      provider: 'provider-nolimits',
      model: 'gpt-unlimited',
      apiKey: 'key-nolimits',
    };
    const config: ComboConfig = {
      name: 'nolimits-group',
      strategy: 'round-robin',
      deployments: [depNoLimits],
    };

    const result = composeCombo(config);
    const payload = result.modelsToCreate[0];

    expect(payload.litellm_params.rpm).toBeUndefined();
    expect(payload.litellm_params.tpm).toBeUndefined();
  });

  it('passes rpm/tpm through in weighted strategy', () => {
    const config: ComboConfig = {
      name: 'weighted-limits-group',
      strategy: 'weighted',
      deployments: [dep1],
    };

    const result = composeCombo(config);
    const payload = result.modelsToCreate[0];

    // dep1 has rpmLimit: 100, tpmLimit: 10000
    expect(payload.litellm_params.rpm).toBe(100);
    expect(payload.litellm_params.tpm).toBe(10000);
  });

  it('passes rpm/tpm through in priority strategy', () => {
    const config: ComboConfig = {
      name: 'priority-limits-group',
      strategy: 'priority',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    // dep1 has limits, dep2 does not
    expect(result.modelsToCreate[0].litellm_params.rpm).toBe(100);
    expect(result.modelsToCreate[0].litellm_params.tpm).toBe(10000);
    expect(result.modelsToCreate[1].litellm_params.rpm).toBeUndefined();
    expect(result.modelsToCreate[1].litellm_params.tpm).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// modelName deduplication
// ---------------------------------------------------------------------------

describe('modelName deduplication', () => {
  it('keeps both deployments when modelNames differ even if model values differ', () => {
    const depA: Deployment = {
      provider: 'provider-a',
      model: 'gpt-4',
      modelName: 'provider-a/gpt-4',
      apiKey: 'key-a',
    };
    const depB: Deployment = {
      provider: 'provider-b',
      model: 'gpt-4',
      modelName: 'provider-b/gpt-4',
      apiKey: 'key-b',
    };
    const config: ComboConfig = {
      name: 'multi-provider-group',
      strategy: 'round-robin',
      deployments: [depA, depB],
    };

    const result = composeCombo(config);

    // Different modelNames mean different providers — both should be kept
    expect(result.modelsToCreate).toHaveLength(2);
  });

  it('drops second deployment when modelNames are identical — first occurrence wins', () => {
    const depOriginal: Deployment = {
      provider: 'provider-a',
      model: 'gpt-4',
      modelName: 'shared/gpt-4',
      apiKey: 'key-original',
    };
    const depDuplicate: Deployment = {
      provider: 'provider-b',
      model: 'gpt-4-turbo',
      modelName: 'shared/gpt-4',
      apiKey: 'key-duplicate',
    };
    const config: ComboConfig = {
      name: 'dedup-modelname-group',
      strategy: 'round-robin',
      deployments: [depOriginal, depDuplicate],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(1);
    expect(result.modelsToCreate[0].litellm_params.api_key).toBe('key-original');
  });

  it('uses model as dedup key when modelName is absent', () => {
    const depX: Deployment = { provider: 'px', model: 'shared-model', apiKey: 'key-x' };
    const depY: Deployment = { provider: 'py', model: 'shared-model', apiKey: 'key-y' };
    const config: ComboConfig = {
      name: 'dedup-model-group',
      strategy: 'round-robin',
      deployments: [depX, depY],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(1);
    expect(result.modelsToCreate[0].litellm_params.api_key).toBe('key-x');
  });
});

// ---------------------------------------------------------------------------
// snapfzz_combo flag
// ---------------------------------------------------------------------------

describe('snapfzz_combo flag', () => {
  it('is true on every payload for round-robin', () => {
    const config: ComboConfig = {
      name: 'flag-group',
      strategy: 'round-robin',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    for (const payload of result.modelsToCreate) {
      expect(payload.model_info?.snapfzz_combo).toBe(true);
    }
  });

  it('is true on every payload for weighted', () => {
    const config: ComboConfig = {
      name: 'flag-group',
      strategy: 'weighted',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    for (const payload of result.modelsToCreate) {
      expect(payload.model_info?.snapfzz_combo).toBe(true);
    }
  });

  it('is true on every payload for priority', () => {
    const config: ComboConfig = {
      name: 'flag-group',
      strategy: 'priority',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    for (const payload of result.modelsToCreate) {
      expect(payload.model_info?.snapfzz_combo).toBe(true);
    }
  });

  it('is true on every payload for least-busy', () => {
    const config: ComboConfig = {
      name: 'flag-group',
      strategy: 'least-busy',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    for (const payload of result.modelsToCreate) {
      expect(payload.model_info?.snapfzz_combo).toBe(true);
    }
  });

  it('is true on every payload for cost-optimized', () => {
    const config: ComboConfig = {
      name: 'flag-group',
      strategy: 'cost-optimized',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    for (const payload of result.modelsToCreate) {
      expect(payload.model_info?.snapfzz_combo).toBe(true);
    }
  });

  it('is true on every payload for latency-optimized', () => {
    const config: ComboConfig = {
      name: 'flag-group',
      strategy: 'latency-optimized',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    for (const payload of result.modelsToCreate) {
      expect(payload.model_info?.snapfzz_combo).toBe(true);
    }
  });

  it('is true on every payload for fill-first', () => {
    const config: ComboConfig = {
      name: 'flag-group',
      strategy: 'fill-first',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    for (const payload of result.modelsToCreate) {
      expect(payload.model_info?.snapfzz_combo).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Empty deployments
// ---------------------------------------------------------------------------

describe('empty deployments', () => {
  it('produces empty modelsToCreate when deployments array is empty', () => {
    const config: ComboConfig = {
      name: 'empty-group',
      strategy: 'round-robin',
      deployments: [],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(0);
    expect(result.modelsToCreate).toEqual([]);
  });

  it('still emits configUpdate when deployments array is empty', () => {
    const config: ComboConfig = {
      name: 'empty-group',
      strategy: 'weighted',
      deployments: [],
    };

    const result = composeCombo(config);

    expect(result.configUpdate).not.toBeNull();
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });
});

// ---------------------------------------------------------------------------
// configUpdate always present
// ---------------------------------------------------------------------------

describe('configUpdate always present', () => {
  const strategies: Array<ComboConfig['strategy']> = [
    'round-robin',
    'weighted',
    'priority',
    'least-busy',
    'cost-optimized',
    'latency-optimized',
    'fill-first',
  ];

  for (const strategy of strategies) {
    it(`returns non-null configUpdate for strategy: ${strategy}`, () => {
      const config: ComboConfig = {
        name: 'always-config-group',
        strategy,
        deployments: [dep1],
      };

      const result = composeCombo(config);

      expect(result.configUpdate).not.toBeNull();
      expect(result.configUpdate?.router_settings.routing_strategy).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// Per-strategy full payload verification
// ---------------------------------------------------------------------------

describe('round-robin: no weight or order on any deployment', () => {
  it('all deployments have no weight and no order', () => {
    const config: ComboConfig = {
      name: 'rr-full',
      strategy: 'round-robin',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(3);
    for (const payload of result.modelsToCreate) {
      expect(payload.litellm_params.weight).toBeUndefined();
      expect(payload.model_info?.order).toBeUndefined();
    }
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });
});

describe('weighted: all deployments carry weight', () => {
  it('weights match deployment declarations exactly', () => {
    const config: ComboConfig = {
      name: 'w-full',
      strategy: 'weighted',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate[0].litellm_params.weight).toBe(dep1.weight);
    expect(result.modelsToCreate[1].litellm_params.weight).toBe(dep2.weight);
    for (const payload of result.modelsToCreate) {
      expect(payload.model_info?.order).toBeUndefined();
    }
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });
});

describe('priority: 1-based order, no weight', () => {
  it('order is 1-based and weight is absent', () => {
    const config: ComboConfig = {
      name: 'p-full',
      strategy: 'priority',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    result.modelsToCreate.forEach((payload, i) => {
      expect(payload.model_info?.order).toBe(i + 1);
      expect(payload.litellm_params.weight).toBeUndefined();
    });
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });
});

describe('least-busy: no weight or order', () => {
  it('all deployments lack weight and order', () => {
    const config: ComboConfig = {
      name: 'lb-full',
      strategy: 'least-busy',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(3);
    for (const payload of result.modelsToCreate) {
      expect(payload.litellm_params.weight).toBeUndefined();
      expect(payload.model_info?.order).toBeUndefined();
    }
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('least-busy');
  });
});

describe('cost-optimized: no weight or order', () => {
  it('all deployments lack weight and order', () => {
    const config: ComboConfig = {
      name: 'co-full',
      strategy: 'cost-optimized',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(2);
    for (const payload of result.modelsToCreate) {
      expect(payload.litellm_params.weight).toBeUndefined();
      expect(payload.model_info?.order).toBeUndefined();
    }
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('cost-based-routing');
  });
});

describe('latency-optimized: no weight or order', () => {
  it('all deployments lack weight and order', () => {
    const config: ComboConfig = {
      name: 'lo-full',
      strategy: 'latency-optimized',
      deployments: [dep1, dep2],
    };

    const result = composeCombo(config);

    expect(result.modelsToCreate).toHaveLength(2);
    for (const payload of result.modelsToCreate) {
      expect(payload.litellm_params.weight).toBeUndefined();
      expect(payload.model_info?.order).toBeUndefined();
    }
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('latency-based-routing');
  });
});

describe('fill-first: 1-based order, no weight', () => {
  it('order is 1-based and weight is absent', () => {
    const config: ComboConfig = {
      name: 'ff-full',
      strategy: 'fill-first',
      deployments: [dep1, dep2, dep3],
    };

    const result = composeCombo(config);

    result.modelsToCreate.forEach((payload, i) => {
      expect(payload.model_info?.order).toBe(i + 1);
      expect(payload.litellm_params.weight).toBeUndefined();
    });
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('usage-based-routing');
  });
});
