import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Radio,
  Skeleton,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { AppButton, ConfirmAction, fetchWithToast, PretextGrid } from '@snapfzz/shared';
import {
  type CustomProvider,
  type CustomProviderVariant,
  type DiscoveredModel,
  type ModelInfoDetails,
  deleteProviderKey,
  discoverModels,
  getBaseUrl,
  getMasterKey,
  getModelInfo,
  importModel,
  listProviderKeys,
  loadCustomProviders,
  saveCustomProviders,
  storeProviderKey,
} from '../hooks/useLlmCommands';
import {
  type CatalogModelEntry,
  getModelsForProvider,
  getProviderIds,
  getProviderInfo,
} from '../catalog';
import { PROVIDER_ICONS } from '../provider-icons';

const { Text, Title } = Typography;

// A013/Catalog: Curated display names for known providers.
// The catalog is the source of truth for which providers exist — this map only
// adds human-friendly labels. Providers in the catalog but not in this map
// get an auto-generated label from their ID.
const CURATED_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  gemini: 'Gemini',
  mistral: 'Mistral',
  cohere: 'Cohere',
  azure: 'Azure OpenAI',
  azure_ai: 'Azure AI',
  ollama: 'Ollama',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  together_ai: 'Together AI',
  fireworks_ai: 'Fireworks AI',
  bedrock: 'AWS Bedrock',
  vertex_ai: 'Google Vertex AI',
  replicate: 'Replicate',
  huggingface: 'Hugging Face',
  openrouter: 'OpenRouter',
  zhipu: 'Z.AI (Zhipu)',
  xai: 'xAI (Grok)',
  perplexity: 'Perplexity',
  databricks: 'Databricks',
  cloudflare: 'Cloudflare',
  ai21: 'AI21',
  nlp_cloud: 'NLP Cloud',
  cerebras: 'Cerebras',
  sambanova: 'SambaNova',
  voyage: 'Voyage',
  text_completion_openai: 'OpenAI Completions',
};

// Providers we want shown first, in this order. All other catalog providers
// follow alphabetically after these.
const PINNED_PROVIDER_ORDER = [
  'openai',
  'anthropic',
  'google',
  'mistral',
  'cohere',
  'azure',
  'ollama',
  'groq',
  'deepseek',
  'together_ai',
  'fireworks_ai',
  'bedrock',
  'vertex_ai',
  'replicate',
  'huggingface',
  'openrouter',
  'zhipu',
  'xai',
];

function labelForProvider(id: string): string {
  return CURATED_LABELS[id] ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Build the provider list from the catalog, respecting pinned order.
function buildProviderList(): { id: string; label: string }[] {
  const catalogIds = new Set(getProviderIds());

  // Pinned providers shown first (only those present in catalog)
  const pinned = PINNED_PROVIDER_ORDER.filter((id) => catalogIds.has(id));
  const pinnedSet = new Set(pinned);

  // Remaining catalog providers follow alphabetically
  const rest = [...catalogIds].filter((id) => !pinnedSet.has(id)).sort();

  return [...pinned, ...rest].map((id) => ({ id, label: labelForProvider(id) }));
}

const PROVIDERS = buildProviderList();

// Popular providers shown by default in the filter — well-known services most
// users will want to configure. Kept as a Set for O(1) lookup.
const POPULAR_PROVIDER_IDS = new Set([
  'openai', 'anthropic', 'google', 'azure', 'mistral',
  'deepseek', 'groq', 'ollama', 'together_ai', 'openrouter',
  'bedrock', 'vertex_ai', 'cohere', 'xai', 'zhipu',
]);

// Brand colors for provider icon circles. Hex literals are intentional —
// these represent brand identity, not theme colors.
const PROVIDER_BRAND_COLORS: Record<string, string> = {
  openai: '#10A37F',
  anthropic: '#D4A574',
  google: '#4285F4',
  mistral: '#FF7000',
  cohere: '#39594D',
  azure: '#0078D4',
  ollama: '#FFFFFF',
  groq: '#F55036',
  deepseek: '#4D6BFE',
  together_ai: '#0F6FFF',
  fireworks_ai: '#FF6E1A',
  bedrock: '#FF9900',
  vertex_ai: '#1A73E8',
  replicate: '#262626',
  huggingface: '#FFD21E',
  openrouter: '#6366F1',
  zhipu: '#4C83FF',
  xai: '#000000',
};

interface ProviderKeyEntry {
  keyName: string;
  envVar: string;
}

interface ProviderKeyCounts {
  [providerId: string]: string[];
}

// Per A013/UI: state for provider enable/disable toggles (visual-only for now)
// Removed: ToggleState was used for provider card toggles (now removed).
// Keep this line to avoid git conflicts with nearby code.
interface _ToggleState_Removed {
  [providerId: string]: boolean;
}

/**
 * Branded avatar for a provider. Renders the real SVG logo when one exists
 * in PROVIDER_ICONS; otherwise falls back to a colored circle with the
 * first letter of the label.
 */
function ProviderIcon({
  providerId,
  label,
  size = 40,
}: {
  providerId: string;
  label: string;
  size?: number;
}) {
  const iconUrl = PROVIDER_ICONS[providerId];
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={`${label} icon`}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          flexShrink: 0,
        }}
      />
    );
  }

  const bg = PROVIDER_BRAND_COLORS[providerId] ?? 'var(--bg-subtle)';
  // Providers with very light brand colors need a dark letter to stay readable.
  const lightBgs = new Set(['#FFFFFF', '#FFD21E']);
  const color = lightBgs.has(bg) ? 'var(--text-primary)' : '#ffffff';
  const fontSize = Math.round(size * 0.45);

  return (
    <div
      aria-label={`${label} icon`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border: lightBgs.has(bg) ? '1px solid var(--border-default)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 700,
        color,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Provider Card ───────────────────────────────────────────────────────

function ProviderCard({
  provider,
  keyCount,
  catalogModelCount,
  onClick,
}: {
  provider: (typeof PROVIDERS)[number];
  keyCount: number;
  catalogModelCount: number;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View ${provider.label} details`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="provider-card"
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        cursor: 'pointer',
        transition: 'border-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-info)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
      }}
    >
      <ProviderIcon providerId={provider.id} label={provider.label} />

      <Text
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {provider.label}
      </Text>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text
            style={{
              fontSize: 13,
              color:
                keyCount > 0 ? 'var(--color-success)' : 'var(--text-muted)',
            }}
          >
            {keyCount > 0 ? `● ${keyCount} key${keyCount !== 1 ? 's' : ''}` : '○ No keys'}
          </Text>
          {catalogModelCount > 0 && (
            <Text
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              {catalogModelCount} model{catalogModelCount !== 1 ? 's' : ''}
            </Text>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Custom Provider Card ────────────────────────────────────────────────

function CustomProviderCard({
  provider,
  keyCount,
  onClick,
  onDelete,
}: {
  provider: CustomProvider;
  keyCount: number;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View ${provider.name} details`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="provider-card"
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        cursor: 'pointer',
        transition: 'border-color 0.15s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-info)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <GlobalOutlined
          style={{
            fontSize: 32,
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        />
        <ConfirmAction
          title={`Delete ${provider.name}?`}
          description="This removes the custom provider and its stored keys."
          onConfirm={async () => {
            onDelete();
          }}
          okText="Delete"
          danger
        >
          <AppButton
            aria-label={`Delete custom provider ${provider.name}`}
            variant="danger"
            icon={<DeleteOutlined />}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          />
        </ConfirmAction>
      </div>

      <Text
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {provider.name}
      </Text>

      <Text
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {provider.baseUrl}
      </Text>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: 13,
            color:
              keyCount > 0 ? 'var(--color-success)' : 'var(--text-muted)',
          }}
        >
          {keyCount > 0 ? `● ${keyCount} key${keyCount !== 1 ? 's' : ''}` : '○ No keys'}
        </Text>
      </div>
    </div>
  );
}

// ─── Discovered Model Chip ──────────────────────────────────────────────

function ModelCapabilityTags({ info }: { info: ModelInfoDetails | CatalogModelEntry }) {
  const contextTokens = info.max_input_tokens ?? info.max_tokens;
  const contextLabel = contextTokens
    ? contextTokens >= 1000
      ? `${Math.round(contextTokens / 1000)}K ctx`
      : `${contextTokens} ctx`
    : null;

  const inputCost = info.input_cost_per_token;
  const outputCost = info.output_cost_per_token;
  const pricingLabel =
    inputCost != null && outputCost != null
      ? `$${(inputCost * 1_000_000).toFixed(2)}/M in · $${(outputCost * 1_000_000).toFixed(2)}/M out`
      : null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
      {info.mode && (
        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
          {info.mode}
        </Tag>
      )}
      {info.supports_vision && (
        <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
          Vision
        </Tag>
      )}
      {info.supports_function_calling && (
        <Tag color="green" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
          Tools
        </Tag>
      )}
      {info.supports_reasoning && (
        <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
          Reasoning
        </Tag>
      )}
      {contextLabel && (
        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
          {contextLabel}
        </Tag>
      )}
      {pricingLabel && (
        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
          {pricingLabel}
        </Tag>
      )}
    </div>
  );
}

// Per A001/Performance: memoized to prevent re-render of every visible chip
// when sibling state changes (filter input, import toggle on another chip).
const DiscoveredModelChip = React.memo(function DiscoveredModelChip({
  model,
  imported,
  importing,
  disabled,
  onImport,
  onDisable,
  onCopy,
  registeredInfo,
  catalogInfo,
}: {
  model: DiscoveredModel;
  imported: boolean;
  importing: boolean;
  /** When true, the toggle is greyed out (no API key configured). */
  disabled?: boolean;
  onImport: (id: string) => void;
  onDisable: (id: string) => void;
  onCopy: (id: string) => void;
  registeredInfo?: ModelInfoDetails;
  catalogInfo?: CatalogModelEntry;
}) {
  // Show metadata from the gateway (registered) if available, otherwise from the catalog.
  const displayInfo = registeredInfo ?? catalogInfo;

  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        minWidth: 0,
        minHeight: 100,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {model.id}
          </Text>
          {model.owned_by && (
            <Text
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {model.owned_by}
            </Text>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => onCopy(model.id)}
            aria-label={`Copy ${model.id}`}
          />
          <Tooltip title={disabled ? 'Add an API key for this provider first' : undefined}>
            <Switch
              size="small"
              checked={imported}
              loading={importing}
              disabled={disabled}
              onChange={() => { imported ? onDisable(model.id) : onImport(model.id); }}
              aria-label={`Enable ${model.id}`}
            />
          </Tooltip>
        </div>
      </div>

      {displayInfo && <ModelCapabilityTags info={displayInfo} />}
    </div>
  );
});

// ─── Discovery Cache ────────────────────────────────────────────────────

const DISCOVERY_CACHE_KEY = 'snapfzz:discovered_models';
const DISCOVERY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface DiscoveryCache {
  [providerId: string]: { data: DiscoveredModel[]; ts: number };
}

function readDiscoveryCache(providerId: string): DiscoveredModel[] | null {
  try {
    const raw = localStorage.getItem(DISCOVERY_CACHE_KEY);
    if (!raw) return null;
    const parsed: DiscoveryCache = JSON.parse(raw);
    const entry = parsed[providerId];
    if (!entry || Date.now() - entry.ts > DISCOVERY_CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeDiscoveryCache(providerId: string, data: DiscoveredModel[]): void {
  try {
    const raw = localStorage.getItem(DISCOVERY_CACHE_KEY);
    const parsed: DiscoveryCache = raw ? JSON.parse(raw) : {};
    parsed[providerId] = { data, ts: Date.now() };
    localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // localStorage may be full or unavailable; silently ignore
  }
}

function clearDiscoveryCache(providerId: string): void {
  try {
    const raw = localStorage.getItem(DISCOVERY_CACHE_KEY);
    if (!raw) return;
    const parsed: DiscoveryCache = JSON.parse(raw);
    delete parsed[providerId];
    localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // silently ignore
  }
}

// ─── Available Models Section ────────────────────────────────────────────

function AvailableModels({
  providerId,
  hasKeys,
  baseUrl,
}: {
  providerId: string;
  hasKeys: boolean;
  baseUrl?: string;
}) {
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterInput, setFilterInput] = useState('');
  const [filter, setFilter] = useState('');
  const [fetched, setFetched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleFilterChange = useCallback((value: string) => {
    setFilterInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilter(value), 1000);
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current), []);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importAllLoading, setImportAllLoading] = useState(false);
  const [registeredInfoMap, setRegisteredInfoMap] = useState<Record<string, ModelInfoDetails>>({});
  const [usingCatalog, setUsingCatalog] = useState(false);
  const [modelTypeFilter, setModelTypeFilter] = useState<string>('chat');

  // Build a catalog lookup for this provider (keyed by short model id).
  const catalogLookup = useMemo(() => {
    const lookup: Record<string, CatalogModelEntry> = {};
    for (const { id, info } of getModelsForProvider(providerId)) {
      lookup[id] = info;
      // Also key by the short id (after the slash) for matching against discovered models
      const shortId = id.includes('/') ? id.split('/').slice(1).join('/') : id;
      if (shortId !== id) {
        lookup[shortId] = info;
      }
    }
    return lookup;
  }, [providerId]);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUsingCatalog(false);
    try {
      if (!hasKeys) {
        // No API key configured: show catalog models as the preloaded list.
        const catalogModels = getModelsForProvider(providerId);
        const asDiscovered: DiscoveredModel[] = catalogModels.map(({ id }) => ({
          id,
          object: 'model',
        }));
        setModels(asDiscovered);
        setFetched(true);
        setUsingCatalog(true);
        return;
      }

      const cached = readDiscoveryCache(providerId);
      if (cached) {
        setModels(cached);
        setFetched(true);
        setLoading(false);
        return;
      }
      const response = await discoverModels(providerId, baseUrl);
      const data = response?.data ?? [];
      setModels(data);
      writeDiscoveryCache(providerId, data);
      setFetched(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [providerId, baseUrl, hasKeys]);

  const handleRefresh = useCallback(async () => {
    clearDiscoveryCache(providerId);
    await fetchModels();
  }, [fetchModels, providerId]);

  // Fetch discovered models + check which are already registered in the gateway
  useEffect(() => {
    void fetchModels();
    // Load already-enabled models and their metadata from the gateway — only when provider has keys
    if (!hasKeys) return;
    (async () => {
      try {
        const [url, key] = await Promise.all([getBaseUrl(), getMasterKey()]);
        const [modelsRes, infoRes] = await Promise.all([
          (async () => {
            const { getModels } = await import('../hooks/useLlmCommands');
            return getModels(url, key);
          })(),
          getModelInfo(url, key).catch(() => ({ data: [] })),
        ]);
        // Model IDs from gateway may be "provider-slug/model-id" — extract the
        // base model-id so it matches discovered model IDs from the provider API.
        const registered = new Set<string>();
        for (const m of (modelsRes?.data ?? []) as { id: string }[]) {
          registered.add(m.id);
          // Also add the bare model ID (after last slash) for matching
          const bare = m.id.includes('/') ? m.id.split('/').pop()! : m.id;
          registered.add(bare);
        }
        setImportedIds(registered);

        // Build a lookup from model_name -> model_info for capability tags
        const infoMap: Record<string, ModelInfoDetails> = {};
        for (const entry of infoRes.data) {
          if (entry.model_info) {
            infoMap[entry.model_name] = entry.model_info;
          }
        }
        setRegisteredInfoMap(infoMap);
      } catch {
        // Gateway not ready — no pre-check
      }
    })();
  }, [fetchModels]);

  // Per A001/Performance: single-pass computation — filter, classify, sort, count
  // in one useMemo instead of 5 cascading memos.
  const { displayModels, modelTypes, hasMultipleTypes, unimportedCount, typeCounts } = useMemo(() => {
    const lower = filter ? filter.toLowerCase() : '';
    const filtered: DiscoveredModel[] = [];
    const counts: Record<string, number> = {};

    // Single pass: filter by text + count per type
    for (const m of models) {
      if (lower && !m.id.toLowerCase().includes(lower)) continue;
      filtered.push(m);
      const mode = catalogLookup[m.id]?.mode || 'chat';
      counts[mode] = (counts[mode] ?? 0) + 1;
    }

    // Model type tabs: 'chat' first, then rest alphabetically
    const typeKeys = Object.keys(counts).sort();
    const orderedTypes = ['all', ...typeKeys.filter((t) => t === 'chat'), ...typeKeys.filter((t) => t !== 'chat')];
    const multipleTypes = typeKeys.length >= 2;
    counts['all'] = filtered.length;

    // Apply type filter
    let list = filtered;
    if (multipleTypes && modelTypeFilter !== 'all') {
      list = filtered.filter((m) => (catalogLookup[m.id]?.mode || 'chat') === modelTypeFilter);
    }

    // Sort: imported first, then by name length (shortest = flagship)
    list.sort((a, b) => {
      const ai = importedIds.has(a.id) ? 0 : 1;
      const bi = importedIds.has(b.id) ? 0 : 1;
      return ai !== bi ? ai - bi : a.id.length - b.id.length;
    });

    return {
      displayModels: list,
      modelTypes: orderedTypes,
      hasMultipleTypes: multipleTypes,
      unimportedCount: list.filter((m) => !importedIds.has(m.id)).length,
      typeCounts: counts,
    };
  }, [models, filter, modelTypeFilter, catalogLookup, importedIds]);

  const handleImport = useCallback(
    async (modelId: string) => {
      setImportingId(modelId);
      const { data } = await fetchWithToast(
        () => importModel(providerId, modelId, undefined, baseUrl),
        { successMessage: `${modelId} enabled`, errorMessage: `Failed to enable ${modelId}` },
      );
      if (data !== undefined) setImportedIds((prev) => new Set(prev).add(modelId));
      setImportingId(null);
    },
    [providerId, baseUrl],
  );

  const handleImportAll = useCallback(async () => {
    const toImport = displayModels.filter((m) => !importedIds.has(m.id));
    if (toImport.length === 0) return;
    setImportAllLoading(true);
    let succeeded = 0;
    let failed = 0;
    for (const model of toImport) {
      const { data } = await fetchWithToast(
        () => importModel(providerId, model.id, undefined, baseUrl),
        { showSuccessToast: false, errorMessage: `Failed to enable ${model.id}` },
      );
      if (data !== undefined) {
        setImportedIds((prev) => new Set(prev).add(model.id));
        succeeded++;
      } else {
        failed++;
      }
    }
    if (failed === 0) {
      message.success(`Imported ${succeeded} model${succeeded !== 1 ? 's' : ''}`);
    } else {
      message.warning(`Imported ${succeeded}, failed ${failed}`);
    }
    setImportAllLoading(false);
  }, [providerId, baseUrl, importedIds, displayModels]);

  const handleDisable = useCallback(
    async (modelId: string) => {
      setImportingId(modelId);
      const { data } = await fetchWithToast(
        async () => {
          const [url, key] = await Promise.all([getBaseUrl(), getMasterKey()]);
          // Get the model's DB ID from model/info
          const infoRes = await getModelInfo(url, key);
          // model_name may be "provider-slug/model-id" or just "model-id"
          const entry = (infoRes.data ?? []).find((e: { model_name: string }) =>
            e.model_name === modelId || e.model_name.endsWith(`/${modelId}`));
          const dbId = entry?.model_info?.id;
          if (!dbId) throw new Error('Model not found in gateway');
          const { deleteModel } = await import('../hooks/useLlmCommands');
          await deleteModel(url, key, dbId);
          return true;
        },
        { successMessage: `${modelId} disabled`, errorMessage: `Failed to disable ${modelId}` },
      );
      if (data !== undefined) {
        setImportedIds((prev) => { const next = new Set(prev); next.delete(modelId); return next; });
      }
      setImportingId(null);
    },
    [],
  );

  const handleCopy = useCallback(async (modelId: string) => {
    await fetchWithToast(
      () => navigator.clipboard.writeText(modelId),
      { successMessage: 'Model ID copied', errorMessage: 'Failed to copy' },
    );
  }, []);

  const modelKeyExtractor = useCallback((model: DiscoveredModel) => model.id, []);

  const renderModelItem = useCallback(
    (model: DiscoveredModel) => (
      <DiscoveredModelChip
        model={model}
        imported={importedIds.has(model.id)}
        importing={importingId === model.id}
        disabled={usingCatalog}
        onImport={handleImport}
        onDisable={handleDisable}
        onCopy={handleCopy}
        registeredInfo={registeredInfoMap[model.id]}
        catalogInfo={catalogLookup[model.id]}
      />
    ),
    [importedIds, importingId, usingCatalog, handleImport, handleDisable, handleCopy, registeredInfoMap, catalogLookup],
  );

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <Title level={5} style={{ margin: 0, color: 'var(--text-primary)' }}>
            Available Models
          </Title>
          {usingCatalog && (
            <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
              from catalog
            </Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {models.length > 0 && unimportedCount > 0 && !usingCatalog && (
            <Button
              icon={<PlusOutlined />}
              onClick={() => void handleImportAll()}
              loading={importAllLoading}
              size="small"
            >
              Enable All ({unimportedCount})
            </Button>
          )}
          {!usingCatalog && (
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void handleRefresh()}
              loading={loading}
              size="small"
            >
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Only show type filter when there are 2+ distinct types with models */}
      {hasMultipleTypes && (
      <div style={{ marginBottom: 12, overflowX: 'auto' }}>
        <Radio.Group
          value={modelTypeFilter}
          onChange={(e) => setModelTypeFilter(e.target.value as string)}
          size="small"
        >
          {modelTypes.map((type) => {
            const count = typeCounts[type] ?? 0;
            if (type !== 'all' && count === 0) return null;
            return (
              <Radio.Button key={type} value={type}>
                {type === 'all' ? 'All' : type.replace(/_/g, ' ')} ({count})
              </Radio.Button>
            );
          })}
        </Radio.Group>
      </div>
      )}

      {error ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            border: '1px dashed var(--border-default)',
            borderRadius: 8,
          }}
        >
          <Text style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
            Unable to fetch models
          </Text>
          <Button size="small" onClick={() => void handleRefresh()}>
            Retry
          </Button>
        </div>
      ) : loading && !fetched ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
              gap: 12,
            }}
          >
            <Input
              prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
              placeholder="Filter models..."
              value={filterInput}
              onChange={(e) => handleFilterChange(e.target.value)}
              allowClear
              onClear={() => { setFilterInput(''); setFilter(''); clearTimeout(debounceRef.current); }}
              style={{ flex: 1, maxWidth: 320 }}
              aria-label="Filter models"
            />
            <Text style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
              {displayModels.length}/{models.length} active
            </Text>
          </div>

          {displayModels.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                border: '1px dashed var(--border-default)',
                borderRadius: 8,
              }}
            >
              <Text style={{ color: 'var(--text-muted)' }}>
                {models.length === 0
                  ? 'No models available for this provider.'
                  : 'No models match your filter.'}
              </Text>
            </div>
          ) : (
            // Per A001/Performance: PretextGrid virtualizes rows — only visible
            // rows mount in DOM. Responsive columns via ResizeObserver.
            <PretextGrid
              items={displayModels}
              renderItem={renderModelItem}
              keyExtractor={modelKeyExtractor}
              columnMinWidth={240}
              rowHeight={110}
              gap={8}
              scroll={false}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Provider Detail (drill-in) ─────────────────────────────────────────

function ProviderDetail({
  providerId,
  providerLabel,
  isCustom,
  baseUrl,
  onBack,
}: {
  providerId: string;
  providerLabel: string;
  isCustom?: boolean;
  baseUrl?: string;
  onBack: () => void;
}) {
  const [keys, setKeys] = useState<ProviderKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    const { data: keyNames, error } = await fetchWithToast(
      () => listProviderKeys(providerId),
      { errorMessage: 'Failed to load provider keys', showSuccessToast: false },
    );
    if (keyNames) {
      setKeys(
        keyNames.map((keyName) => ({
          keyName,
          envVar: `PROVIDER_${providerId.toUpperCase()}_${keyName.toUpperCase()}`,
        })),
      );
    } else {
      if (error) console.error(`[ProviderDetail] Failed to load keys for ${providerId}:`, error);
      setKeys([]);
    }
    setLoading(false);
  }, [providerId]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleAddOrEdit(values: { keyName: string; keyValue: string }) {
    setSubmitting(true);
    try {
      await storeProviderKey(providerId, values.keyName, values.keyValue);
      setModalOpen(false);
      setEditingKey(null);
      form.resetFields();
      await loadKeys();
    } finally {
      setSubmitting(false);
    }
  }

  function openAddModal() {
    setEditingKey(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEditModal(keyName: string) {
    setEditingKey(keyName);
    form.setFieldsValue({ keyName, keyValue: '' });
    setModalOpen(true);
  }

  const maskKey = (name: string) => {
    if (name.length <= 8) return name.replace(/./g, '\u2022');
    return name.slice(0, 4) + '\u2022'.repeat(12) + name.slice(-4);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          aria-label="Back to Providers"
        >
          Back to Providers
        </Button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isCustom ? (
            <GlobalOutlined
              style={{
                fontSize: 28,
                color: 'var(--text-secondary)',
                flexShrink: 0,
              }}
            />
          ) : (
            <ProviderIcon
              providerId={providerId}
              label={providerLabel}
              size={36}
            />
          )}
          <div>
            <Title level={4} style={{ margin: 0, color: 'var(--text-primary)' }}>
              {providerLabel}
            </Title>
            <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {keys.length} connection{keys.length !== 1 ? 's' : ''}
            </Text>
            {isCustom && baseUrl && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                {baseUrl}
              </Text>
            )}
          </div>
        </div>

        <Button icon={<PlusOutlined />} onClick={openAddModal}>
          Add Key
        </Button>
      </div>

      {/* Key list */}
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : keys.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-muted)',
            border: '1px dashed var(--border-default)',
            borderRadius: 8,
          }}
        >
          <Text style={{ color: 'var(--text-muted)' }}>
            No API keys configured for {providerLabel}.
          </Text>
        </div>
      ) : (
        keys.map((entry) => (
          <div
            key={entry.keyName}
            style={{
              background: 'var(--bg-default)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  fontSize: 14,
                }}
              >
                {entry.keyName}
              </Text>
              <Text
                style={{
                  color: 'var(--color-success)',
                  fontSize: 12,
                }}
              >
                ● Connected
              </Text>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 4,
              }}
            >
              <AppButton
                aria-label={`Edit ${entry.keyName}`}
                icon={<EditOutlined />}
                onClick={() => openEditModal(entry.keyName)}
              />
              <ConfirmAction
                title={`Delete ${entry.keyName}?`}
                description="This removes the API key from the vault."
                onConfirm={async () => {
                  await deleteProviderKey(providerId, entry.keyName);
                  await loadKeys();
                }}
                okText="Delete"
                danger
              >
                <AppButton
                  aria-label={`Delete ${entry.keyName}`}
                  variant="danger"
                  icon={<DeleteOutlined />}
                />
              </ConfirmAction>
            </div>
          </div>
        ))
      )}

      {/* Available Models: live discovery when keys exist, catalog fallback otherwise */}
      <AvailableModels providerId={providerId} hasKeys={keys.length > 0} baseUrl={baseUrl} />

      {/* Add / Edit Key Modal */}
      <Modal
        title={editingKey ? `Edit Key: ${editingKey}` : 'Add Provider Key'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingKey(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleAddOrEdit}>
          <Form.Item
            name="keyName"
            label="Key Name"
            rules={[{ required: true, message: 'Enter a key name' }]}
          >
            <Input
              placeholder="e.g., production, dev-testing"
              disabled={editingKey !== null}
            />
          </Form.Item>
          <Form.Item
            name="keyValue"
            label="API Key"
            rules={[{ required: true, message: 'Enter the API key' }]}
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ─── Add Custom Provider Modal ───────────────────────────────────────────

function AddCustomProviderModal({
  open,
  defaultVariant,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  defaultVariant: CustomProviderVariant;
  onCancel: () => void;
  onSubmit: (values: {
    name: string;
    baseUrl: string;
    apiKey: string;
    variant: CustomProviderVariant;
  }) => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ variant: defaultVariant });
    }
  }, [open, defaultVariant, form]);

  async function handleFinish(values: {
    name: string;
    baseUrl: string;
    apiKey: string;
    variant: CustomProviderVariant;
  }) {
    setSubmitting(true);
    try {
      onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Add Custom Provider"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={submitting}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label="Name"
          rules={[
            { required: true, message: 'Enter a provider name' },
            {
              pattern: /^[a-zA-Z0-9._-]+$/,
              message: 'Only letters, numbers, dots, hyphens, and underscores',
            },
          ]}
        >
          <Input placeholder="e.g., llm.solo.engineer" />
        </Form.Item>
        <Form.Item
          name="baseUrl"
          label="Base URL"
          rules={[
            { required: true, message: 'Enter the base URL' },
            { type: 'url', message: 'Enter a valid URL' },
          ]}
        >
          <Input placeholder="e.g., https://llm.solo.engineer/v1" />
        </Form.Item>
        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[{ required: true, message: 'Enter the API key' }]}
        >
          <Input.Password placeholder="sk-..." />
        </Form.Item>
        <Form.Item name="variant" label="Compatible with">
          <Radio.Group>
            <Radio value="openai">OpenAI</Radio>
            <Radio value="anthropic">Anthropic</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function ProvidersTab() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [keyCounts, setKeyCounts] = useState<ProviderKeyCounts>({});
  const [toggleState, setToggleState] = useState<ToggleState>({});
  const [loading, setLoading] = useState(true);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customModalVariant, setCustomModalVariant] =
    useState<CustomProviderVariant>('openai');
  const [providerFilter, setProviderFilter] = useState<'popular' | 'connected' | 'all'>('popular');

  const loadKeyCounts = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchWithToast(
      async () => {
        const [counts, customs] = await Promise.all([
          (async () => {
            const c: ProviderKeyCounts = {};
            for (const provider of PROVIDERS) {
              const keys = await listProviderKeys(provider.id);
              c[provider.id] = keys;
            }
            return c;
          })(),
          loadCustomProviders(),
        ]);

        // Load key counts for custom providers too
        for (const cp of customs) {
          const keys = await listProviderKeys(`custom-${cp.id}`);
          counts[`custom-${cp.id}`] = keys;
        }

        return { counts, customs };
      },
      { errorMessage: 'Failed to load providers', showSuccessToast: false },
    );

    if (data) {
      const { counts, customs } = data;
      setKeyCounts(counts);
      setCustomProviders(customs);

      // Per A013/UI: auto-enable providers that have keys configured
      const newToggle: ToggleState = {};
      for (const provider of PROVIDERS) {
        newToggle[provider.id] =
          toggleState[provider.id] ?? (counts[provider.id]?.length ?? 0) > 0;
      }
      for (const cp of customs) {
        const cpKey = `custom-${cp.id}`;
        newToggle[cpKey] = toggleState[cpKey] ?? (counts[cpKey]?.length ?? 0) > 0;
      }
      setToggleState(newToggle);
    } else {
      setKeyCounts({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadKeyCounts();
  }, [loadKeyCounts]);

  const filteredProviders = useMemo(() => {
    let list: typeof PROVIDERS;
    switch (providerFilter) {
      case 'popular': list = PROVIDERS.filter((p) => POPULAR_PROVIDER_IDS.has(p.id)); break;
      case 'connected': list = PROVIDERS.filter((p) => (keyCounts[p.id]?.length ?? 0) > 0); break;
      case 'all': list = [...PROVIDERS]; break;
    }
    // Sort: connected (has keys) first, then alphabetical
    return list.sort((a, b) => {
      const aConnected = (keyCounts[a.id]?.length ?? 0) > 0 ? 0 : 1;
      const bConnected = (keyCounts[b.id]?.length ?? 0) > 0 ? 0 : 1;
      if (aConnected !== bConnected) return aConnected - bConnected;
      return a.label.localeCompare(b.label);
    });
  }, [providerFilter, keyCounts]);

  // Reload counts when navigating back from detail
  const handleBack = useCallback(() => {
    setSelectedProvider(null);
    void loadKeyCounts();
  }, [loadKeyCounts]);

  const providerKeyExtractor = useCallback(
    (provider: (typeof PROVIDERS)[number]) => provider.id,
    [],
  );

  const renderProviderItem = useCallback(
    (provider: (typeof PROVIDERS)[number]) => (
      <ProviderCard
        provider={provider}
        keyCount={keyCounts[provider.id]?.length ?? 0}
        catalogModelCount={getProviderInfo(provider.id).modelCount}
        onClick={() => setSelectedProvider(provider.id)}
      />
    ),
    [keyCounts],
  );

  async function handleAddCustomProvider(values: {
    name: string;
    baseUrl: string;
    apiKey: string;
    variant: CustomProviderVariant;
  }) {
    const id = values.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
    const newProvider: CustomProvider = {
      id,
      name: values.name,
      baseUrl: values.baseUrl,
      variant: values.variant,
    };

    const updated = [...customProviders, newProvider];
    await saveCustomProviders(updated);
    await storeProviderKey(`custom-${id}`, 'default', values.apiKey);

    setCustomProviders(updated);
    setCustomModalOpen(false);
    await loadKeyCounts();
  }

  async function handleDeleteCustomProvider(cpId: string) {
    const updated = customProviders.filter((cp) => cp.id !== cpId);
    await fetchWithToast(
      async () => {
        await saveCustomProviders(updated);
        // Delete all keys for this custom provider
        const keys = await listProviderKeys(`custom-${cpId}`);
        for (const keyName of keys) {
          await deleteProviderKey(`custom-${cpId}`, keyName);
        }
        setCustomProviders(updated);
        await loadKeyCounts();
      },
      { successMessage: 'Custom provider deleted', errorMessage: 'Failed to delete custom provider' },
    );
  }

  if (selectedProvider) {
    const builtIn = PROVIDERS.find((p) => p.id === selectedProvider);
    if (builtIn) {
      return (
        <ProviderDetail
          providerId={builtIn.id}
          providerLabel={builtIn.label}
          onBack={handleBack}
        />
      );
    }

    // Custom provider — strip "custom-" prefix to find config
    const cpId = selectedProvider.startsWith('custom-')
      ? selectedProvider.slice(7)
      : selectedProvider;
    const custom = customProviders.find((cp) => cp.id === cpId);
    if (custom) {
      return (
        <ProviderDetail
          providerId={`custom-${custom.id}`}
          providerLabel={custom.name}
          isCustom
          baseUrl={custom.baseUrl}
          onBack={handleBack}
        />
      );
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text style={{ color: 'var(--text-secondary)' }}>
          Provider API keys are stored securely in the vault and referenced via
          environment variables in the gateway config.
        </Text>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          {/* Custom Providers — shown above built-ins */}
          <div
            style={{
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Custom Providers
            </Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setCustomModalVariant('openai');
                  setCustomModalOpen(true);
                }}
              >
                Add OpenAI Compatible
              </Button>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setCustomModalVariant('anthropic');
                  setCustomModalOpen(true);
                }}
              >
                Add Anthropic Compatible
              </Button>
            </div>
          </div>

          {customProviders.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                border: '1px dashed var(--border-default)',
                borderRadius: 8,
              }}
            >
              <Text style={{ color: 'var(--text-muted)' }}>
                No custom providers configured. Add an OpenAI or Anthropic compatible endpoint above.
              </Text>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 16,
                contain: 'layout paint',
              }}
            >
              {customProviders.map((cp) => {
                const cpKey = `custom-${cp.id}`;
                return (
                  <CustomProviderCard
                    key={cpKey}
                    provider={cp}
                    keyCount={keyCounts[cpKey]?.length ?? 0}
                    onClick={() => setSelectedProvider(cpKey)}
                    onDelete={() => void handleDeleteCustomProvider(cp.id)}
                  />
                );
              })}
            </div>
          )}

          {/* Providers (built-in) with filter */}
          <div
            style={{
              marginTop: 32,
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}
            >
              Providers
            </Text>
            <Radio.Group
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value as 'popular' | 'connected' | 'all')}
              size="small"
            >
              <Radio.Button value="popular">
                Popular ({PROVIDERS.filter((p) => POPULAR_PROVIDER_IDS.has(p.id)).length})
              </Radio.Button>
              <Radio.Button value="connected">
                Connected ({PROVIDERS.filter((p) => (keyCounts[p.id]?.length ?? 0) > 0).length})
              </Radio.Button>
              <Radio.Button value="all">
                All ({PROVIDERS.length})
              </Radio.Button>
            </Radio.Group>
          </div>
          {/* Per A001/Performance: PretextGrid virtualizes the provider card
              grid — only visible rows in DOM. */}
          <PretextGrid
            items={filteredProviders}
            renderItem={renderProviderItem}
            keyExtractor={providerKeyExtractor}
            columnMinWidth={200}
            rowHeight={172}
            gap={12}
            scroll={false}
          />
        </>
      )}

      <AddCustomProviderModal
        open={customModalOpen}
        defaultVariant={customModalVariant}
        onCancel={() => setCustomModalOpen(false)}
        onSubmit={(values) => void handleAddCustomProvider(values)}
      />
    </div>
  );
}
