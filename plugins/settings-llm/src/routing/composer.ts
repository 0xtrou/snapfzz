// Strategy Composer — pure logic module.
// Translates user routing choices into LiteLLM API payloads.
// No UI, no API calls, no side effects.

export type RoutingStrategy =
  | 'round-robin'       // Equal weight distribution
  | 'weighted'          // Custom weights per deployment
  | 'priority'          // Ordered failover (try first, cascade)
  | 'least-busy'        // LiteLLM native: fewest active requests
  | 'cost-optimized'    // LiteLLM native: cheapest deployment
  | 'latency-optimized' // LiteLLM native: lowest latency
  | 'fill-first';       // Use primary until RPM limit, then overflow

export interface Deployment {
  id?: string;       // Existing model_id (for updates)
  provider: string;  // e.g. "custom-solo-engineer"
  model: string;     // e.g. "coder"
  apiKey?: string;   // Provider API key (from vault)
  apiBase?: string;  // e.g. "https://llm.solo.engineer/v1"
  weight?: number;   // 0-100, for weighted strategy
  rpmLimit?: number; // Requests per minute limit
  tpmLimit?: number; // Tokens per minute limit
}

export interface ComboConfig {
  name: string;           // Model group name (what users request)
  strategy: RoutingStrategy;
  deployments: Deployment[];
  fallbacks?: string[];   // Other combo names to fallback to
}

export interface ModelNewPayload {
  model_name: string;
  litellm_params: {
    model: string;    // "openai/<model>" for SDK routing
    api_key: string;
    api_base?: string;
    rpm?: number;
    tpm?: number;
    weight?: number;
  };
  model_info?: {
    snapfzz_provider_id: string;
    order?: number; // For priority strategy
  };
}

export interface ConfigUpdatePayload {
  router_settings: {
    routing_strategy: string; // LiteLLM native strategy name
    fallbacks?: Array<Record<string, string[]>>;
  };
}

export interface ComposedPayloads {
  modelsToCreate: ModelNewPayload[];
  modelsToDelete: string[];    // model_ids to remove
  configUpdate: ConfigUpdatePayload | null;
}

// Maps RoutingStrategy to the LiteLLM router_settings.routing_strategy value.
// "simple-shuffle" is the LiteLLM default so strategies that resolve to it
// still emit a configUpdate so the caller has a consistent shape.
const LITELLM_STRATEGY: Record<RoutingStrategy, string> = {
  'round-robin': 'simple-shuffle',
  'weighted': 'simple-shuffle',
  'priority': 'simple-shuffle',
  'least-busy': 'least-busy',
  'cost-optimized': 'cost-based-routing',
  'latency-optimized': 'latency-based-routing',
  'fill-first': 'usage-based-routing',
};

function buildModelPayload(
  modelName: string,
  deployment: Deployment,
  extras: { weight?: number; order?: number } = {},
): ModelNewPayload {
  const litellmParams: ModelNewPayload['litellm_params'] = {
    model: `openai/${deployment.model}`,
    api_key: deployment.apiKey ?? '',
  };

  if (deployment.apiBase !== undefined) {
    litellmParams.api_base = deployment.apiBase;
  }
  if (deployment.rpmLimit !== undefined) {
    litellmParams.rpm = deployment.rpmLimit;
  }
  if (deployment.tpmLimit !== undefined) {
    litellmParams.tpm = deployment.tpmLimit;
  }
  if (extras.weight !== undefined) {
    litellmParams.weight = extras.weight;
  }

  const modelInfo: ModelNewPayload['model_info'] = {
    snapfzz_provider_id: deployment.provider,
  };
  if (extras.order !== undefined) {
    modelInfo.order = extras.order;
  }

  return {
    model_name: modelName,
    litellm_params: litellmParams,
    model_info: modelInfo,
  };
}

export function composeCombo(config: ComboConfig): ComposedPayloads {
  const { name, strategy, deployments, fallbacks } = config;

  const modelsToCreate: ModelNewPayload[] = [];

  switch (strategy) {
    case 'round-robin': {
      // All deployments get equal weight — omitting weight field means equal.
      for (const deployment of deployments) {
        modelsToCreate.push(buildModelPayload(name, deployment));
      }
      break;
    }

    case 'weighted': {
      // Each deployment carries its declared weight.
      for (const deployment of deployments) {
        modelsToCreate.push(
          buildModelPayload(name, deployment, { weight: deployment.weight }),
        );
      }
      break;
    }

    case 'priority': {
      // order = index + 1; LiteLLM tries order=1 first, cascades on failure.
      deployments.forEach((deployment, index) => {
        modelsToCreate.push(
          buildModelPayload(name, deployment, { order: index + 1 }),
        );
      });
      break;
    }

    case 'fill-first': {
      // First deployment handles all traffic until RPM exhausted (order=1),
      // then overflow to subsequent deployments (order=2+).
      deployments.forEach((deployment, index) => {
        modelsToCreate.push(
          buildModelPayload(name, deployment, { order: index + 1 }),
        );
      });
      break;
    }

    case 'least-busy':
    case 'cost-optimized':
    case 'latency-optimized': {
      // LiteLLM handles distribution natively — no weight/order needed.
      for (const deployment of deployments) {
        modelsToCreate.push(buildModelPayload(name, deployment));
      }
      break;
    }
  }

  // configUpdate is always emitted so the caller gets a consistent shape.
  const routerSettings: ConfigUpdatePayload['router_settings'] = {
    routing_strategy: LITELLM_STRATEGY[strategy],
  };

  if (fallbacks && fallbacks.length > 0) {
    routerSettings.fallbacks = [{ [name]: fallbacks }];
  }

  const configUpdate: ConfigUpdatePayload = {
    router_settings: routerSettings,
  };

  // modelsToDelete is empty at compose time — the caller resolves deletes by
  // diffing existing model_ids against what was just created.
  return {
    modelsToCreate,
    modelsToDelete: [],
    configUpdate,
  };
}
