import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Radio,
  Skeleton,
  Switch,
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
import { AppButton, ConfirmAction } from '@snapfzz/shared';
import {
  type CustomProvider,
  type CustomProviderVariant,
  type DiscoveredModel,
  deleteProviderKey,
  discoverModels,
  importModel,
  listProviderKeys,
  loadCustomProviders,
  saveCustomProviders,
  storeProviderKey,
} from '../hooks/useLlmCommands';
import { PROVIDER_ICONS } from '../provider-icons';

const { Text, Title } = Typography;

// Per A013/Config: all supported LLM providers
const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google AI' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'cohere', label: 'Cohere' },
  { id: 'azure', label: 'Azure OpenAI' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'groq', label: 'Groq' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'together_ai', label: 'Together AI' },
  { id: 'fireworks_ai', label: 'Fireworks AI' },
  { id: 'bedrock', label: 'AWS Bedrock' },
  { id: 'vertex_ai', label: 'Google Vertex AI' },
  { id: 'replicate', label: 'Replicate' },
  { id: 'huggingface', label: 'Hugging Face' },
  { id: 'openrouter', label: 'OpenRouter' },
];

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
};

interface ProviderKeyEntry {
  keyName: string;
  envVar: string;
}

interface ProviderKeyCounts {
  [providerId: string]: string[];
}

// Per A013/UI: state for provider enable/disable toggles (visual-only for now)
interface ToggleState {
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
  enabled,
  onToggle,
  onClick,
}: {
  provider: (typeof PROVIDERS)[number];
  keyCount: number;
  enabled: boolean;
  onToggle: (checked: boolean) => void;
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
        transition: 'transform 0.15s ease, border-color 0.15s ease',
        willChange: 'transform',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
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
        <Text
          style={{
            fontSize: 13,
            color:
              keyCount > 0 ? 'var(--color-success)' : 'var(--text-muted)',
          }}
        >
          {keyCount > 0 ? `● ${keyCount} key${keyCount !== 1 ? 's' : ''}` : '○ No keys'}
        </Text>

        <Switch
          size="small"
          checked={enabled}
          onClick={(checked, e) => {
            e.stopPropagation();
            onToggle(checked);
          }}
          aria-label={`Toggle ${provider.label}`}
        />
      </div>
    </div>
  );
}

// ─── Custom Provider Card ────────────────────────────────────────────────

function CustomProviderCard({
  provider,
  keyCount,
  enabled,
  onToggle,
  onClick,
  onDelete,
}: {
  provider: CustomProvider;
  keyCount: number;
  enabled: boolean;
  onToggle: (checked: boolean) => void;
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
        transition: 'transform 0.15s ease, border-color 0.15s ease',
        willChange: 'transform',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.borderColor = 'var(--border-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
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

        <Switch
          size="small"
          checked={enabled}
          onClick={(checked, e) => {
            e.stopPropagation();
            onToggle(checked);
          }}
          aria-label={`Toggle ${provider.name}`}
        />
      </div>
    </div>
  );
}

// ─── Discovered Model Chip ──────────────────────────────────────────────

function DiscoveredModelChip({
  model,
  imported,
  importing,
  onImport,
  onCopy,
}: {
  model: DiscoveredModel;
  imported: boolean;
  importing: boolean;
  onImport: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        minWidth: 0,
      }}
    >
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
          onClick={onCopy}
          aria-label={`Copy ${model.id}`}
        />
        <Switch
          size="small"
          checked={imported}
          loading={importing}
          onChange={() => { if (!imported) onImport(); }}
          aria-label={`Enable ${model.id}`}
        />
      </div>
    </div>
  );
}

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
  baseUrl,
}: {
  providerId: string;
  baseUrl?: string;
}) {
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [fetched, setFetched] = useState(false);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importAllLoading, setImportAllLoading] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
  }, [providerId, baseUrl]);

  const handleRefresh = useCallback(async () => {
    clearDiscoveryCache(providerId);
    await fetchModels();
  }, [fetchModels, providerId]);

  // Fetch discovered models + check which are already registered in the gateway
  useEffect(() => {
    void fetchModels();
    // Load already-enabled models from the gateway
    (async () => {
      try {
        const { getBaseUrl, getMasterKey, getModels } = await import('../hooks/useLlmCommands');
        const [url, key] = await Promise.all([getBaseUrl(), getMasterKey()]);
        const response = await getModels(url, key);
        const registered = new Set((response?.data ?? []).map((m: { id: string }) => m.id));
        setImportedIds(registered);
      } catch {
        // Gateway not ready — no pre-check
      }
    })();
  }, [fetchModels]);

  const filteredModels = useMemo(() => {
    if (!filter) return models;
    const lower = filter.toLowerCase();
    return models.filter((m) => m.id.toLowerCase().includes(lower));
  }, [models, filter]);

  const unimportedCount = filteredModels.filter((m) => !importedIds.has(m.id)).length;

  const handleImport = useCallback(
    async (modelId: string) => {
      setImportingId(modelId);
      try {
        await importModel(providerId, modelId, undefined, baseUrl);
        setImportedIds((prev) => new Set(prev).add(modelId));
        message.success(`${modelId} enabled`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(`Failed to enable ${modelId}: ${msg}`);
      } finally {
        setImportingId(null);
      }
    },
    [providerId, baseUrl],
  );

  const handleImportAll = useCallback(async () => {
    const toImport = filteredModels.filter((m) => !importedIds.has(m.id));
    if (toImport.length === 0) return;
    setImportAllLoading(true);
    let succeeded = 0;
    let failed = 0;
    for (const model of toImport) {
      try {
        await importModel(providerId, model.id, undefined, baseUrl);
        setImportedIds((prev) => new Set(prev).add(model.id));
        succeeded++;
      } catch {
        failed++;
      }
    }
    if (failed === 0) {
      message.success(`Imported ${succeeded} model${succeeded !== 1 ? 's' : ''}`);
    } else {
      message.warning(`Imported ${succeeded}, failed ${failed}`);
    }
    setImportAllLoading(false);
  }, [providerId, baseUrl, importedIds, filteredModels]);

  const handleCopy = useCallback(async (modelId: string) => {
    try {
      await navigator.clipboard.writeText(modelId);
      message.success('Model ID copied');
    } catch {
      message.error('Failed to copy');
    }
  }, []);

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <Title level={5} style={{ margin: 0, color: 'var(--text-primary)' }}>
          Available Models
        </Title>
        <div style={{ display: 'flex', gap: 8 }}>
          {models.length > 0 && unimportedCount > 0 && (
            <Button
              icon={<PlusOutlined />}
              onClick={() => void handleImportAll()}
              loading={importAllLoading}
              size="small"
            >
              Enable All ({unimportedCount})
            </Button>
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void handleRefresh()}
            loading={loading}
            size="small"
          >
            Refresh
          </Button>
        </div>
      </div>

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
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              allowClear
              style={{ flex: 1, maxWidth: 320 }}
              aria-label="Filter models"
            />
            <Text style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
              {filteredModels.length}/{models.length} active
            </Text>
          </div>

          {filteredModels.length === 0 ? (
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 8,
              }}
            >
              {filteredModels.map((model) => (
                <DiscoveredModelChip
                  key={model.id}
                  model={model}
                  imported={importedIds.has(model.id)}
                  importing={importingId === model.id}
                  onImport={() => void handleImport(model.id)}
                  onCopy={() => void handleCopy(model.id)}
                />
              ))}
            </div>
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
    try {
      const keyNames = await listProviderKeys(providerId);
      setKeys(
        keyNames.map((keyName) => ({
          keyName,
          envVar: `PROVIDER_${providerId.toUpperCase()}_${keyName.toUpperCase()}`,
        })),
      );
    } catch (error) {
      console.error(`[ProviderDetail] Failed to load keys for ${providerId}:`, error);
      setKeys([]);
    } finally {
      setLoading(false);
    }
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

            <Text
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm, 13px)',
                color: 'var(--text-secondary)',
              }}
            >
              {maskKey(entry.keyName)}
            </Text>

            <Text
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm, 13px)',
                color: 'var(--text-muted)',
              }}
            >
              ENV: os.environ/{entry.envVar}
            </Text>

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

      {/* Available Models — only shown when the provider has at least one key */}
      {keys.length > 0 && <AvailableModels providerId={providerId} baseUrl={baseUrl} />}

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

  const loadKeyCounts = useCallback(async () => {
    setLoading(true);
    try {
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
    } catch (error) {
      console.error('[ProvidersTab] Failed to load provider key counts:', error);
      setKeyCounts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeyCounts();
  }, [loadKeyCounts]);

  // Reload counts when navigating back from detail
  const handleBack = useCallback(() => {
    setSelectedProvider(null);
    void loadKeyCounts();
  }, [loadKeyCounts]);

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
    await saveCustomProviders(updated);
    // Delete all keys for this custom provider
    const keys = await listProviderKeys(`custom-${cpId}`);
    for (const keyName of keys) {
      await deleteProviderKey(`custom-${cpId}`, keyName);
    }
    setCustomProviders(updated);
    await loadKeyCounts();
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
          {/* Built-in Providers */}
          <div style={{ marginBottom: 8 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Built-in Providers
            </Text>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16,
              contain: 'layout paint',
            }}
          >
            {PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                keyCount={keyCounts[provider.id]?.length ?? 0}
                enabled={toggleState[provider.id] ?? false}
                onToggle={(checked) =>
                  setToggleState((prev) => ({ ...prev, [provider.id]: checked }))
                }
                onClick={() => setSelectedProvider(provider.id)}
              />
            ))}
          </div>

          {/* Custom Providers */}
          <div
            style={{
              marginTop: 32,
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
                    enabled={toggleState[cpKey] ?? false}
                    onToggle={(checked) =>
                      setToggleState((prev) => ({ ...prev, [cpKey]: checked }))
                    }
                    onClick={() => setSelectedProvider(cpKey)}
                    onDelete={() => void handleDeleteCustomProvider(cp.id)}
                  />
                );
              })}
            </div>
          )}
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
