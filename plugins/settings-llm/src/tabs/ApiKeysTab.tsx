import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { AppButton, ConfirmAction, fetchWithToast } from '@snapfzz/shared';
import {
  listKeysWithInfo,
  deleteKey,
  getBaseUrl,
  getMasterKey,
  getModels,
  type KeyInfo,
  type KeyGenerateParams,
} from '../hooks/useLlmCommands';

const { Text } = Typography;

const BUDGET_DURATIONS = [
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: '1 year' },
];

const MODELS_CACHE_KEY = 'snapfzz:available_models';
const MAX_VISIBLE_TAGS = 3;

function resolveKey(record: KeyInfo): string {
  // LiteLLM returns `token` as the key hash, `key` as the short display form
  return record.token || record.key || '';
}

function maskKey(key: string): string {
  if (!key) return '\u2022\u2022\u2022\u2022';
  return '\u2022'.repeat(8);
}

function resolveAlias(record: KeyInfo): string {
  // key_alias may be null or empty string — treat as unset
  if (record.key_alias && String(record.key_alias).trim()) return String(record.key_alias);
  if (record.key_name && String(record.key_name).trim()) return String(record.key_name);
  return '-';
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function loadCachedModels(): string[] {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

export default function ApiKeysTab({ active }: { active?: boolean }) {
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [masterKey, setMasterKey] = useState<string>('');
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>(loadCachedModels);
  const [modelsLoading, setModelsLoading] = useState(false);

  const fetchModels = useCallback(async (url: string, key: string) => {
    if (!url || !key) return;
    setModelsLoading(true);
    try {
      const data = await getModels(url, key);
      const models = (data.data || []).map((m) => m.id);
      setAvailableModels(models);
      localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(models));
    } catch (err) {
      console.error('[ApiKeysTab] Failed to fetch models:', err);
      const cached = loadCachedModels();
      if (cached.length > 0) {
        setAvailableModels(cached);
      }
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    const { data } = await fetchWithToast(
      () => listKeysWithInfo(baseUrl, masterKey),
      { errorMessage: 'Failed to load keys', showSuccessToast: false },
    );
    if (data) setKeys(data.keys || []);
    else setKeys([]);
    setLoading(false);
  }, [baseUrl, masterKey]);

  useEffect(() => {
    Promise.all([getBaseUrl(), getMasterKey()])
      .then(([url, key]) => {
        setBaseUrl(url);
        setMasterKey(key);
      })
      .catch(() => message.error('Failed to get gateway URL'));
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  // Refresh data when tab becomes active (tab switch, not remount)
  useEffect(() => {
    if (active && baseUrl && masterKey) {
      void loadKeys();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (baseUrl && masterKey) {
      void fetchModels(baseUrl, masterKey);
    }
  }, [baseUrl, masterKey, fetchModels]);

  const columns: TableColumnsType<KeyInfo> = [
    {
      title: 'Key',
      key: 'key',
      width: 160,
      render: (_: unknown, record: KeyInfo) => (
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}>
          {maskKey(resolveKey(record))}
        </Text>
      ),
    },
    {
      title: 'Alias',
      key: 'alias',
      width: 140,
      render: (_: unknown, record: KeyInfo) => (
        <Text>{resolveAlias(record)}</Text>
      ),
    },
    {
      title: 'Models',
      dataIndex: 'models',
      key: 'models',
      render: (models: string[] | undefined) => {
        if (!models || models.length === 0) {
          return <Tag color="green">All models</Tag>;
        }
        const visible = models.slice(0, MAX_VISIBLE_TAGS);
        const remaining = models.length - MAX_VISIBLE_TAGS;
        return (
          <Space size={4} wrap>
            {visible.map((m) => <Tag key={m}>{m}</Tag>)}
            {remaining > 0 && (
              <Tooltip title={models.slice(MAX_VISIBLE_TAGS).join(', ')}>
                <Tag>+{remaining} more</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Spend',
      dataIndex: 'spend',
      key: 'spend',
      width: 100,
      render: (spend: number) => `$${(spend || 0).toFixed(2)}`,
    },
    {
      title: 'Budget',
      dataIndex: 'max_budget',
      key: 'max_budget',
      width: 100,
      render: (budget: number | null | undefined) => (budget != null ? `$${budget.toFixed(2)}` : 'Unlimited'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 96,
      align: 'right',
      render: (_value, record) => (
        <ConfirmAction
          title={`Delete key ${maskKey(resolveKey(record))}?`}
          description="This permanently removes the virtual key."
          onConfirm={async () => {
            if (!baseUrl || !masterKey) return;
            const { error } = await fetchWithToast(
              () => deleteKey(baseUrl, masterKey, resolveKey(record)),
              { successMessage: 'Key deleted', errorMessage: 'Failed to delete key' },
            );
            if (!error) await loadKeys();
          }}
          okText="Delete"
          danger
        >
          <AppButton
            aria-label={`Delete key ${maskKey(resolveKey(record))}`}
            variant="danger"
            icon={<DeleteOutlined />}
          />
        </ConfirmAction>
      ),
    },
  ];

  const expandedRowRender = (record: KeyInfo) => {
    const models = record.models || [];
    const spent = record.spend || 0;
    const budget = record.max_budget;
    const duration = record.budget_duration || '-';
    const expires = formatDate(record.expires ?? undefined);

    return (
      <div style={{ padding: '8px 0' }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div>
            <Text type="secondary">Alias: </Text>
            <Text>{resolveAlias(record)}</Text>
          </div>
          <div>
            <Text type="secondary">Allowed Models: </Text>
            {models.length === 0 ? (
              <Tag color="green">All models</Tag>
            ) : (
              <Space size={4} wrap>
                {models.map((m) => <Tag key={m}>{m}</Tag>)}
              </Space>
            )}
          </div>
          <div>
            <Text type="secondary">Budget: </Text>
            <Text>
              ${spent.toFixed(2)} / {budget != null ? `$${budget.toFixed(2)}` : 'Unlimited'}
            </Text>
          </div>
          <div>
            <Text type="secondary">Budget Cycle: </Text>
            <Text>{duration}</Text>
            {record.budget_reset_at && (
              <Text type="secondary"> (resets {formatDate(record.budget_reset_at)})</Text>
            )}
          </div>
          <div>
            <Text type="secondary">Expires: </Text>
            <Text>{expires === '-' ? 'Never' : expires}</Text>
          </div>
        </Space>
      </div>
    );
  };

  async function handleCreate(values: {
    key_alias?: string;
    models: string[];
    max_budget: number;
    budget_duration: string;
  }) {
    if (!baseUrl || !masterKey) {
      message.error('Gateway URL not configured');
      return;
    }
    setSubmitting(true);
    const { generateKey } = await import('../hooks/useLlmCommands');
    const params: KeyGenerateParams = {
      models: values.models,
      // null = unlimited in LiteLLM. 0 means "zero budget" (blocked).
      max_budget: values.max_budget != null && values.max_budget > 0 ? values.max_budget : null as unknown as number,
      budget_duration: values.budget_duration || '30d',
      metadata: {},
    };
    if (values.key_alias) {
      params.key_alias = values.key_alias;
    }
    const { data: result } = await fetchWithToast(
      () => generateKey(baseUrl, masterKey, params),
      { successMessage: 'Key created successfully', errorMessage: 'Failed to create key' },
    );
    if (result) {
      setGeneratedKey(result.key);
      await loadKeys();
    }
    setSubmitting(false);
  }

  return (
    <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 20 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            Virtual keys with budgets for accessing the LLM gateway. Use these keys in your tools
            instead of provider keys.
          </Text>
          <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Create Key
          </Button>
        </div>

        <div style={{ background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 16 }}><Skeleton active paragraph={{ rows: 4 }} /></div>
          ) : keys.length === 0 ? (
            <Empty description="No virtual keys created" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
          ) : (
            <Table<KeyInfo>
              rowKey={(r, index) => `${resolveKey(r)}-${index}`}
              columns={columns}
              dataSource={keys}
              pagination={false}
              size="small"
              expandable={{ expandedRowRender }}
            />
          )}
        </div>
      </Space>

      <Modal
        title="Create Virtual Key"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
          setGeneratedKey(null);
        }}
        footer={generatedKey ? null : undefined}
        onOk={() => form.submit()}
        confirmLoading={submitting}
      >
        {generatedKey ? (
          <div style={{ padding: '16px 0' }}>
            <Text type="secondary">Your new key has been created. Copy it now - it won't be shown again.</Text>
            <div style={{ marginTop: 16 }}>
              <Input.Password
                value={generatedKey}
                readOnly
                visibilityToggle
              />
            </div>
            <Button
              type="primary"
              style={{ marginTop: 16 }}
              onClick={() => {
                navigator.clipboard.writeText(generatedKey);
              }}
            >
              Copy to Clipboard
            </Button>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item
              name="key_alias"
              label="Key Alias"
            >
              <Input placeholder="e.g., dev-key, staging-key" />
            </Form.Item>
            <Form.Item
              name="models"
              label="Allowed Models"
              rules={[{ required: true, message: 'Select at least one model' }]}
            >
              <Select
                mode="multiple"
                placeholder="Select models from connected providers"
                showSearch
                loading={modelsLoading}
                filterOption={(input, option) =>
                  (option?.value as string).toLowerCase().includes(input.toLowerCase())
                }
                options={availableModels.map((m) => ({ value: m, label: m }))}
                notFoundContent={
                  modelsLoading ? (
                    <span>Loading models...</span>
                  ) : availableModels.length === 0 ? (
                    <Space direction="vertical" size={4} align="center" style={{ padding: 8 }}>
                      <Text type="secondary">No models found</Text>
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => void fetchModels(baseUrl, masterKey)}
                      >
                        Refresh
                      </Button>
                    </Space>
                  ) : (
                    'No matches'
                  )
                }
              />
            </Form.Item>
            <Form.Item name="max_budget" label="Max Budget ($)">
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="Leave empty for unlimited" />
            </Form.Item>
            <Form.Item name="budget_duration" label="Budget Duration" initialValue="30d">
              <Select>
                {BUDGET_DURATIONS.map((d) => (
                  <Select.Option key={d.value} value={d.value}>
                    {d.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
