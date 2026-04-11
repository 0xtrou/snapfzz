import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { AppButton, ConfirmAction } from '@snapfzz/shared';
import {
  listProviderKeys,
  deleteProviderKey,
  storeProviderKey,
} from '../hooks/useLlmCommands';

const { Text, Title } = Typography;

// Per A013/Config: all supported LLM providers with CDN icon mapping
const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', icon: 'openai' },
  { id: 'anthropic', label: 'Anthropic', icon: 'anthropic' },
  { id: 'google', label: 'Google AI', icon: 'google' },
  { id: 'mistral', label: 'Mistral', icon: 'mistral' },
  { id: 'cohere', label: 'Cohere', icon: 'cohere' },
  { id: 'azure', label: 'Azure OpenAI', icon: 'azure' },
  { id: 'ollama', label: 'Ollama', icon: 'ollama' },
  { id: 'groq', label: 'Groq', icon: 'groq' },
  { id: 'deepseek', label: 'DeepSeek', icon: 'deepseek' },
];

const ICON_CDN_BASE =
  'https://raw.githubusercontent.com/xandemon/developer-icons/main/icons';

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

function iconUrl(iconName: string): string {
  return `${ICON_CDN_BASE}/${iconName}.svg`;
}

/**
 * Fallback avatar: colored circle with the first letter of the provider name.
 * Uses var(--bg-subtle) background and var(--text-primary) foreground.
 */
function ProviderIconFallback({ label }: { label: string }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'var(--bg-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        fontWeight: 600,
        color: 'var(--text-primary)',
        flexShrink: 0,
      }}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}

function ProviderIcon({
  iconName,
  label,
  size = 40,
}: {
  iconName: string;
  label: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <ProviderIconFallback label={label} />;
  }

  return (
    <img
      src={iconUrl(iconName)}
      alt={`${label} icon`}
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
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
      <ProviderIcon iconName={provider.icon} label={provider.label} />

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

// ─── Provider Detail (drill-in) ─────────────────────────────────────────

function ProviderDetail({
  providerId,
  onBack,
}: {
  providerId: string;
  onBack: () => void;
}) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
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

  if (!provider) return null;

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
          <ProviderIcon
            iconName={provider.icon}
            label={provider.label}
            size={36}
          />
          <div>
            <Title level={4} style={{ margin: 0, color: 'var(--text-primary)' }}>
              {provider.label}
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
            No API keys configured for {provider.label}.
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

// ─── Main Component ─────────────────────────────────────────────────────

export default function ProvidersTab() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [keyCounts, setKeyCounts] = useState<ProviderKeyCounts>({});
  const [toggleState, setToggleState] = useState<ToggleState>({});
  const [loading, setLoading] = useState(true);

  const loadKeyCounts = useCallback(async () => {
    setLoading(true);
    try {
      const counts: ProviderKeyCounts = {};
      for (const provider of PROVIDERS) {
        const keys = await listProviderKeys(provider.id);
        counts[provider.id] = keys;
      }
      setKeyCounts(counts);

      // Per A013/UI: auto-enable providers that have keys configured
      const newToggle: ToggleState = {};
      for (const provider of PROVIDERS) {
        newToggle[provider.id] =
          toggleState[provider.id] ?? (counts[provider.id]?.length ?? 0) > 0;
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

  if (selectedProvider) {
    return (
      <ProviderDetail
        providerId={selectedProvider}
        onBack={handleBack}
      />
    );
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
      )}
    </div>
  );
}
