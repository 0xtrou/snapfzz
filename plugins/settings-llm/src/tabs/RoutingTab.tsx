// Routing strategy, fallback chains, and model aliases configuration.

import { useCallback, useEffect, useState } from 'react';
import { Radio, Select, Input, Skeleton, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { fetchWithToast, AppButton } from '@snapfzz/shared';
import {
  getBaseUrl,
  getMasterKey,
  getConfig,
  updateConfig,
  getModelGroups,
  getModelInfo,
  deleteModel,
  loadCustomProviders,
  type CustomProvider,
} from '../hooks/useLlmCommands';
import type { ComboConfig, ComposedPayloads } from '../routing/composer';
import ComboBuilder from './routing/ComboBuilder';
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

// --- constants ---

const STRATEGIES: { value: string; label: string; description: string }[] = [
  {
    value: 'simple-shuffle',
    label: 'Simple Shuffle',
    description: 'Weighted random distribution based on TPM/RPM limits. Best for maximizing throughput.',
  },
  {
    value: 'least-busy',
    label: 'Least Busy',
    description: 'Routes to the deployment with fewest active requests. Best for even load distribution.',
  },
  {
    value: 'latency-based-routing',
    label: 'Latency Based',
    description: 'Routes to the deployment with lowest recent response time. Best for speed.',
  },
  {
    value: 'usage-based-routing',
    label: 'Usage Based',
    description: 'Routes to underutilized deployments based on TPM/RPM usage. Best for capacity planning.',
  },
  {
    value: 'cost-based-routing',
    label: 'Cost Based',
    description: 'Routes to the cheapest available deployment. Best for cost optimization.',
  },
];

const DEFAULT_STRATEGY = 'simple-shuffle';

// --- Section wrapper (matches CacheTab style) ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          color: 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// --- Routing Strategy Section ---

interface StrategyProps {
  current: string;
  saved: string;
  modelGroups: string[];
  saving: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
}

function StrategySection({ current, saved, saving, onChange, onSave }: StrategyProps) {
  const isDirty = current !== saved;

  return (
    <Section title="Routing Strategy">
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
        Choose how requests are distributed across model deployments. The strategy applies to all model groups.
      </div>

      <Radio.Group
        value={current}
        onChange={(e) => onChange(e.target.value as string)}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {STRATEGIES.map((s) => (
          <Radio key={s.value} value={s.value}>
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {s.label}
                </span>
                {saved === s.value && (
                  <Tag color="success" style={{ fontSize: 11, lineHeight: '16px', padding: '0 6px' }}>
                    Active
                  </Tag>
                )}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.description}</span>
            </div>
          </Radio>
        ))}
      </Radio.Group>

      <div style={{ marginTop: 20 }}>
        <AppButton
          onClick={onSave}
          loading={saving}
          disabled={!isDirty}
        >
          Save Strategy
        </AppButton>
      </div>
    </Section>
  );
}

// --- Fallbacks Section ---

interface FallbacksProps {
  rules: FallbackRule[];
  saved: FallbackRule[];
  modelGroups: string[];
  saving: boolean;
  onChange: (rules: FallbackRule[]) => void;
  onSave: () => void;
}

function FallbacksSection({ rules, saved, modelGroups, saving, onChange, onSave }: FallbacksProps) {
  const isDirty = JSON.stringify(rules) !== JSON.stringify(saved);

  const addRule = () => {
    onChange([...rules, { model: '', fallbacks: [] }]);
  };

  const removeRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
  };

  const updateRule = (idx: number, patch: Partial<FallbackRule>) => {
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const groupOptions = modelGroups.map((g) => ({ label: g, value: g }));

  return (
    <Section title="Fallback Chains">
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
        When a model fails, requests automatically fall back to the next model in the chain.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rules.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
            No fallback rules defined. Add a rule to configure automatic failover.
          </div>
        )}

        {rules.map((rule, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'var(--bg-subtle)',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ flex: '0 0 180px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
                Primary Model
              </div>
              <Select
                value={rule.model || undefined}
                placeholder="Select model"
                options={groupOptions}
                style={{ width: '100%' }}
                onChange={(v) => updateRule(idx, { model: v as string })}
                showSearch
                filterOption={(input, opt) =>
                  (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </div>

            <div style={{ fontSize: 18, color: 'var(--text-muted)', flexShrink: 0, marginTop: 20 }}>→</div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
                Fallback Models (in order)
              </div>
              <Select
                mode="multiple"
                value={rule.fallbacks}
                placeholder="Select fallback models"
                options={groupOptions.filter((o) => o.value !== rule.model)}
                style={{ width: '100%' }}
                onChange={(v) => updateRule(idx, { fallbacks: v as string[] })}
                showSearch
                filterOption={(input, opt) =>
                  (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </div>

            <AppButton
              variant="text"
              icon={<DeleteOutlined />}
              onClick={() => removeRule(idx)}
              style={{ marginTop: 20, color: 'var(--text-muted)', flexShrink: 0 }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <AppButton icon={<PlusOutlined />} onClick={addRule} variant="text">
          Add Rule
        </AppButton>
        <AppButton
          onClick={onSave}
          loading={saving}
          disabled={!isDirty}
        >
          Save Fallbacks
        </AppButton>
      </div>
    </Section>
  );
}

// --- Aliases Section ---

interface AliasEntry {
  alias: string;
  target: string;
}

interface AliasesProps {
  aliases: AliasEntry[];
  saved: AliasEntry[];
  modelGroups: string[];
  saving: boolean;
  onChange: (aliases: AliasEntry[]) => void;
  onSave: () => void;
}

function AliasesSection({ aliases, saved, modelGroups, saving, onChange, onSave }: AliasesProps) {
  const isDirty = JSON.stringify(aliases) !== JSON.stringify(saved);

  const addAlias = () => {
    onChange([...aliases, { alias: '', target: '' }]);
  };

  const removeAlias = (idx: number) => {
    onChange(aliases.filter((_, i) => i !== idx));
  };

  const updateAlias = (idx: number, patch: Partial<AliasEntry>) => {
    onChange(aliases.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const groupOptions = modelGroups.map((g) => ({ label: g, value: g }));

  return (
    <Section title="Model Aliases">
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
        Map short names to model groups. Users can request the alias and get routed to the target.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {aliases.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
            No aliases defined. Add an alias to create a short name for a model group.
          </div>
        )}

        {aliases.map((entry, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              background: 'var(--bg-subtle)',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ flex: '0 0 200px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
                Alias
              </div>
              <Input
                value={entry.alias}
                placeholder="e.g. fast, smart"
                onChange={(e) => updateAlias(idx, { alias: e.target.value })}
              />
            </div>

            <div style={{ fontSize: 18, color: 'var(--text-muted)', flexShrink: 0, marginTop: 20 }}>→</div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
                Target Model Group
              </div>
              <Select
                value={entry.target || undefined}
                placeholder="Select model group"
                options={groupOptions}
                style={{ width: '100%' }}
                onChange={(v) => updateAlias(idx, { target: v as string })}
                showSearch
                filterOption={(input, opt) =>
                  (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </div>

            <AppButton
              variant="text"
              icon={<DeleteOutlined />}
              onClick={() => removeAlias(idx)}
              style={{ marginTop: 20, color: 'var(--text-muted)', flexShrink: 0 }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <AppButton icon={<PlusOutlined />} onClick={addAlias} variant="text">
          Add Alias
        </AppButton>
        <AppButton
          onClick={onSave}
          loading={saving}
          disabled={!isDirty}
        >
          Save Aliases
        </AppButton>
      </div>
    </Section>
  );
}

// --- helpers ---

function aliasMapToEntries(map: Record<string, string>): AliasEntry[] {
  return Object.entries(map).map(([alias, target]) => ({ alias, target }));
}

function entriesToAliasMap(entries: AliasEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { alias, target } of entries) {
    if (alias.trim() && target.trim()) map[alias.trim()] = target.trim();
  }
  return map;
}

// Build ComboConfig list from /v1/model/info by grouping by model_name.
// Deployments are reconstructed from litellm_params.
function buildCombosFromModelInfo(data: { data: Array<{ model_name: string; litellm_params?: { api_base?: string; model?: string; api_key?: string }; model_info?: { snapfzz_provider_id?: string } }> }): ComboConfig[] {
  const grouped: Record<string, ComboConfig> = {};
  for (const entry of data.data) {
    const groupName = entry.model_name;
    if (!grouped[groupName]) {
      grouped[groupName] = { name: groupName, strategy: 'round-robin', deployments: [] };
    }
    grouped[groupName].deployments.push({
      provider: (entry.model_info as Record<string, string> | undefined)?.snapfzz_provider_id ?? '',
      model: entry.litellm_params?.model?.replace(/^openai\//, '') ?? '',
      apiBase: entry.litellm_params?.api_base ?? '',
    });
  }
  return Object.values(grouped);
}

// --- main component ---

export default function RoutingTab() {
  const [baseUrl, setBaseUrl] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [modelGroups, setModelGroups] = useState<string[]>([]);

  // Combo state
  const [combos, setCombos] = useState<ComboConfig[]>([]);
  const [providers, setProviders] = useState<CustomProvider[]>([]);
  const [editingCombo, setEditingCombo] = useState<ComboConfig | null>(null);
  const [creatingCombo, setCreatingCombo] = useState(false);

  // Strategy state
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [savedStrategy, setSavedStrategy] = useState(DEFAULT_STRATEGY);
  const [savingStrategy, setSavingStrategy] = useState(false);

  // Fallbacks state
  const [fallbacks, setFallbacks] = useState<FallbackRule[]>([]);
  const [savedFallbacks, setSavedFallbacks] = useState<FallbackRule[]>([]);
  const [savingFallbacks, setSavingFallbacks] = useState(false);

  // Aliases state
  const [aliases, setAliases] = useState<AliasEntry[]>([]);
  const [savedAliases, setSavedAliases] = useState<AliasEntry[]>([]);
  const [savingAliases, setSavingAliases] = useState(false);

  const loadData = useCallback(async (url: string, key: string) => {
    setLoading(true);
    try {
      const [configData, groups, modelInfoResult, customProviders] = await Promise.allSettled([
        getConfig(url, key),
        getModelGroups(url, key),
        getModelInfo(url, key),
        loadCustomProviders(),
      ]);

      if (groups.status === 'fulfilled') {
        setModelGroups(groups.value);
      }

      if (configData.status === 'fulfilled') {
        const router = (configData.value['router_settings'] ?? {}) as Partial<RoutingConfig>;
        const strat = typeof router.routing_strategy === 'string' ? router.routing_strategy : DEFAULT_STRATEGY;
        const fb: FallbackRule[] = Array.isArray(router.fallbacks) ? router.fallbacks : [];
        const aliasEntries = aliasMapToEntries(
          router.model_group_alias && typeof router.model_group_alias === 'object'
            ? router.model_group_alias as Record<string, string>
            : {},
        );

        setStrategy(strat);
        setSavedStrategy(strat);
        setFallbacks(fb);
        setSavedFallbacks(fb);
        setAliases(aliasEntries);
        setSavedAliases(aliasEntries);
      }

      if (modelInfoResult.status === 'fulfilled') {
        setCombos(buildCombosFromModelInfo(modelInfoResult.value as Parameters<typeof buildCombosFromModelInfo>[0]));
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

  const saveStrategy = useCallback(async () => {
    setSavingStrategy(true);
    const { error } = await fetchWithToast(
      () => updateConfig(baseUrl, masterKey, { router_settings: { routing_strategy: strategy } }),
      { successMessage: 'Routing strategy saved', errorMessage: 'Failed to save strategy' },
    );
    setSavingStrategy(false);
    if (!error) setSavedStrategy(strategy);
  }, [baseUrl, masterKey, strategy]);

  const saveFallbacks = useCallback(async () => {
    setSavingFallbacks(true);
    const validFallbacks = fallbacks.filter((r) => r.model.trim());
    const { error } = await fetchWithToast(
      () => updateConfig(baseUrl, masterKey, { router_settings: { fallbacks: validFallbacks } }),
      { successMessage: 'Fallback chains saved', errorMessage: 'Failed to save fallbacks' },
    );
    setSavingFallbacks(false);
    if (!error) setSavedFallbacks(validFallbacks);
  }, [baseUrl, masterKey, fallbacks]);

  const saveAliases = useCallback(async () => {
    setSavingAliases(true);
    const aliasMap = entriesToAliasMap(aliases);
    const { error } = await fetchWithToast(
      () => updateConfig(baseUrl, masterKey, { router_settings: { model_group_alias: aliasMap } }),
      { successMessage: 'Model aliases saved', errorMessage: 'Failed to save aliases' },
    );
    setSavingAliases(false);
    if (!error) {
      const saved = aliasMapToEntries(aliasMap);
      setSavedAliases(saved);
    }
  }, [baseUrl, masterKey, aliases]);

  const handleComboSave = useCallback(async (payloads: ComposedPayloads) => {
    const { error } = await fetchWithToast(
      async () => {
        // Create each model deployment
        await Promise.all(
          payloads.modelsToCreate.map((payload) =>
            fetch(`${baseUrl}/model/new`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${masterKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }),
          ),
        );
        // Delete stale models
        await Promise.all(
          payloads.modelsToDelete.map((id) => deleteModel(baseUrl, masterKey, id)),
        );
        // Apply config update
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
  }, [baseUrl, masterKey, loadData]);

  const handleComboDelete = useCallback(async (name: string) => {
    const combo = combos.find((c) => c.name === name);
    if (!combo) return;
    const { error } = await fetchWithToast(
      async () => {
        // Delete via model/delete by model_name — LiteLLM removes by group name
        await fetch(`${baseUrl}/model/delete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${masterKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_name: name }),
        });
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
          onSave={handleComboSave}
          onCancel={() => { setCreatingCombo(false); setEditingCombo(null); }}
        />
      ) : (
        <Section title="Combos">
          <ComboList
            combos={combos}
            onEdit={(combo) => setEditingCombo(combo)}
            onCreate={() => setCreatingCombo(true)}
            onDelete={handleComboDelete}
          />
        </Section>
      )}

      {/* Strategy, Fallbacks, and Aliases are now managed per-combo via the Combo Builder */}
    </div>
  );
}
