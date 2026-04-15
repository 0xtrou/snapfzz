// Routing strategy, fallback chains, and model aliases configuration.

import { useCallback, useEffect, useState } from 'react';
import {  Skeleton, message } from 'antd';
import { fetchWithToast } from '@snapfzz/shared';
import {
  getBaseUrl,
  getMasterKey,
  getConfig,
  updateConfig,
  getModelInfo,
  deleteModel,
  importModel,
  loadCustomProviders,
  type CustomProvider,
} from '../hooks/useLlmCommands';
import type { ComboConfig, ComposedPayloads } from '../routing/composer';
import ComboBuilder, { type AvailableModelInfo } from './routing/ComboBuilder';
import ComboList from './routing/ComboList';

// --- types ---

interface FallbackRule {
  model: string;
  fallbacks: string[];
}

interface RoutingConfig {
  routing_strategy: string;
  model_group_alias: Record<string, string>;
  fallbacks: FallbackRule[];
}


const DEFAULT_STRATEGY = 'simple-shuffle';

interface AliasEntry {
  alias: string;
  target: string;
}

// --- helpers ---

function aliasMapToEntries(map: Record<string, string>): AliasEntry[] {
  return Object.entries(map).map(([alias, target]) => ({ alias, target }));
}

// Reverse-map LiteLLM's routing_strategy + per-deployment fields back to our RoutingStrategy.
// simple-shuffle is overloaded: round-robin (no weight/order), weighted (has weight), priority (has order).
function decodeLitellmStrategy(
  litellmStrategy: string,
  hasWeights: boolean,
  hasOrder: boolean,
): ComboConfig['strategy'] {
  switch (litellmStrategy) {
    case 'least-busy': return 'least-busy';
    case 'cost-based-routing': return 'cost-optimized';
    case 'latency-based-routing': return 'latency-optimized';
    case 'usage-based-routing': return hasOrder ? 'fill-first' : 'least-busy';
    case 'simple-shuffle':
    default:
      if (hasWeights) return 'weighted';
      if (hasOrder) return 'priority';
      return 'round-robin';
  }
}

// Build ComboConfig list from /v1/model/info by grouping by model_name.
// Deployments are reconstructed from litellm_params + model_info.
// Only user-created combos are included: model names with a slash are
// individual provider/model deployments managed by the Providers tab.
interface ModelInfoEntry {
  model_name: string;
  litellm_params?: { api_base?: string; model?: string; api_key?: string; weight?: number; rpm?: number; tpm?: number };
  model_info?: { id?: string; snapfzz_provider_id?: string; order?: number };
}

function buildCombosFromModelInfo(data: { data: ModelInfoEntry[] }, litellmStrategy: string): ComboConfig[] {
  const grouped: Record<string, { config: ComboConfig; hasWeights: boolean; hasOrder: boolean }> = {};
  for (const entry of data.data) {
    const groupName = entry.model_name;
    if (groupName.includes('/')) continue;
    if (!grouped[groupName]) {
      grouped[groupName] = {
        config: { name: groupName, strategy: 'round-robin', deployments: [] },
        hasWeights: false,
        hasOrder: false,
      };
    }
    const weight = entry.litellm_params?.weight;
    const order = (entry.model_info as Record<string, unknown> | undefined)?.order as number | undefined;
    if (weight !== undefined && weight !== null) grouped[groupName].hasWeights = true;
    if (order !== undefined && order !== null) grouped[groupName].hasOrder = true;

    grouped[groupName].config.deployments.push({
      id: (entry.model_info as Record<string, string> | undefined)?.id,
      provider: (entry.model_info as Record<string, string> | undefined)?.snapfzz_provider_id ?? '',
      model: entry.litellm_params?.model ?? '',
      apiBase: entry.litellm_params?.api_base ?? '',
      apiKey: entry.litellm_params?.api_key ?? '',
      weight: weight,
      rpmLimit: entry.litellm_params?.rpm,
      tpmLimit: entry.litellm_params?.tpm,
    });
  }

  return Object.values(grouped).map(({ config, hasWeights, hasOrder }) => {
    config.strategy = decodeLitellmStrategy(litellmStrategy, hasWeights, hasOrder);
    // Detect apiType from first deployment's model prefix
    const firstModel = config.deployments[0]?.model ?? '';
    config.apiType = firstModel.startsWith('anthropic/') ? 'anthropic' : 'openai';
    return config;
  });
}

// --- main component ---

export default function RoutingTab() {
  const [baseUrl, setBaseUrl] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [loading, setLoading] = useState(true);

  // Combo state
  const [combos, setCombos] = useState<ComboConfig[]>([]);
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [availableModelInfo, setAvailableModelInfo] = useState<AvailableModelInfo[]>([]);
  const [editingCombo, setEditingCombo] = useState<ComboConfig | null>(null);
  const [creatingCombo, setCreatingCombo] = useState(false);


  const loadData = useCallback(async (url: string, key: string) => {
    setLoading(true);
    try {
      const [configData, modelInfoResult, customProviders] = await Promise.allSettled([
        getConfig(url, key),
        getModelInfo(url, key),
        loadCustomProviders(),
      ]);


      let litellmStrat = DEFAULT_STRATEGY;
      if (configData.status === 'fulfilled') {
        const router = (configData.value['router_settings'] ?? {}) as Partial<RoutingConfig>;
        litellmStrat = typeof router.routing_strategy === 'string' ? router.routing_strategy : DEFAULT_STRATEGY;
      }

      if (modelInfoResult.status === 'fulfilled') {
        const infoData = modelInfoResult.value as { data: ModelInfoEntry[] };
        // Build available model list first — needed to resolve combo deployment names.
        const seenModelNames = new Set<string>();
        const modelInfoList: AvailableModelInfo[] = infoData.data
          .filter((entry) => {
            if (!entry.model_name.includes('/')) return false;
            if ((entry.model_info as Record<string, unknown> | undefined)?.snapfzz_combo) return false;
            if (seenModelNames.has(entry.model_name)) return false;
            seenModelNames.add(entry.model_name);
            return true;
          })
          .map((entry) => ({
            name: entry.model_name,
            apiBase: entry.litellm_params?.api_base,
            model: entry.litellm_params?.model,
            provider: (entry.model_info as Record<string, string> | undefined)?.snapfzz_provider_id,
            apiKey: entry.litellm_params?.api_key,
          }));
        setAvailableModelInfo(modelInfoList);

        // Build combos, then resolve each deployment's modelName from available models.
        // Combo deployments only have litellm_params.model (e.g. "openai/coder") —
        // resolve to the user-facing model_name (e.g. "solo-engineer/coder").
        // Match on BOTH model AND provider to handle cases where different providers
        // share the same bare model name (e.g. solo-engineer/coder vs solo-engineer-test/coder).
        const loadedCombos = buildCombosFromModelInfo(infoData, litellmStrat);
        for (const combo of loadedCombos) {
          for (const dep of combo.deployments) {
            if (!dep.modelName) {
              const match = modelInfoList.find((m) =>
                m.model === dep.model && m.provider === dep.provider,
              ) ?? modelInfoList.find((m) => m.model === dep.model);
              if (match) dep.modelName = match.name;
            }
          }
        }
        setCombos(loadedCombos);
      }

      if (customProviders.status === 'fulfilled') {
        setProviders(customProviders.value);
      }
    } catch {
      message.error('Failed to load routing config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([getBaseUrl(), getMasterKey()])
      .then(([url, key]) => {
        setBaseUrl(url);
        setMasterKey(key);
        void loadData(url, key);
      })
      .catch(() => message.error('Failed to connect to gateway'));
  }, [loadData]);

  const handleComboSave = useCallback(async (payloads: ComposedPayloads) => {
    const { error } = await fetchWithToast(
      async () => {
        // When editing an existing combo, delete each deployment by its model_id first.
        if (editingCombo) {
          const idsToDelete = editingCombo.deployments
            .map((d) => d.id)
            .filter((id): id is string => !!id);
          await Promise.all(
            idsToDelete.map((id) => deleteModel(baseUrl, masterKey, id)),
          );
        }
        // Create each deployment via LiteLLM /model/new directly.
        // The API key comes from the CustomProvider config (stored in vault blob).
        for (const payload of payloads.modelsToCreate) {
          const providerId = payload.model_info?.snapfzz_provider_id ?? '';
          const provider = providers.find((p) => `custom-${p.id}` === providerId);
          const apiKey = provider?.apiKey ?? '';
          const providerBaseUrl = provider?.baseUrl;
          const litellmModel = payload.litellm_params.model;
          const bareModel = litellmModel.includes('/')
            ? litellmModel.split('/').slice(1).join('/')
            : litellmModel;
          const variant = litellmModel.includes('/') ? litellmModel.split('/')[0] : 'openai';
          await importModel(
            baseUrl,
            masterKey,
            providerId,
            bareModel,
            apiKey,
            payload.model_name,
            providerBaseUrl,
            variant,
            {
              weight: payload.litellm_params.weight,
              rpm: payload.litellm_params.rpm,
              tpm: payload.litellm_params.tpm,
              order: payload.model_info?.order,
              isCombo: true,
            },
          );
        }
        // Apply config update (routing strategy, fallbacks)
        if (payloads.configUpdate) {
          await updateConfig(baseUrl, masterKey, payloads.configUpdate as unknown as Record<string, unknown>);
        }
      },
      { successMessage: 'Combo saved', errorMessage: 'Failed to save combo' },
    );
    if (!error) {
      setCreatingCombo(false);
      setEditingCombo(null);
      void loadData(baseUrl, masterKey);
    }
  }, [baseUrl, masterKey, editingCombo, providers, loadData]);

  const handleComboDelete = useCallback(async (name: string) => {
    const combo = combos.find((c) => c.name === name);
    if (!combo) return;
    const { error } = await fetchWithToast(
      async () => {
        // Delete each deployment by its model_id — LiteLLM requires { id: "model-uuid" }
        const idsToDelete = combo.deployments
          .map((d) => d.id)
          .filter((id): id is string => !!id);
        await Promise.all(
          idsToDelete.map((id) =>
            fetch(`${baseUrl}/model/delete`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${masterKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            }),
          ),
        );
      },
      { successMessage: 'Combo deleted', errorMessage: 'Failed to delete combo' },
    );
    if (!error) {
      setCombos((prev) => prev.filter((c) => c.name !== name));
    }
  }, [baseUrl, masterKey, combos]);

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 20 }}>
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }

  const showBuilder = creatingCombo || editingCombo !== null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--bg-subtle)', borderRadius: 8, padding: 20 }}>
      {showBuilder ? (
        <ComboBuilder
          existingCombo={editingCombo ?? undefined}
          providers={providers}
          availableModels={availableModelInfo}
          onSave={handleComboSave}
          onCancel={() => { setCreatingCombo(false); setEditingCombo(null); }}
        />
      ) : (
        <ComboList
          loading={loading}
          loadData={()=> loadData(baseUrl, masterKey)}
          combos={combos}
          onEdit={(combo) => setEditingCombo(combo)}
          onCreate={() => setCreatingCombo(true)}
          onDelete={handleComboDelete}
        />
      )}

      {/* Strategy, Fallbacks, and Aliases are now managed per-combo via the Combo Builder */}
    </div>
  );
}
