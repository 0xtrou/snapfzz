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
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { AppButton, ConfirmAction } from '@snapfzz/shared';
import {
  listKeys,
  deleteKey,
  getBaseUrl,
  type KeyInfo,
  type KeyGenerateParams,
} from '../hooks/useLlmCommands';

const { Text } = Typography;

const BUDGET_DURATIONS = [
  { value: '1d', label: '1 Day' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
];

function maskKey(key: string): string {
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 4)}${'•'.repeat(key.length - 8)}${key.slice(-4)}`;
}

export default function ApiKeysTab() {
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    if (!baseUrl) return;
    setLoading(true);
    try {
      const response = await listKeys(baseUrl);
      setKeys(response.keys || []);
    } catch (err) {
      console.error('[ApiKeysTab] Failed to load keys:', err);
      message.error(`Failed to load keys: ${err instanceof Error ? err.message : String(err)}`);
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    getBaseUrl()
      .then(setBaseUrl)
      .catch(() => message.error('Failed to get LiteLLM URL'));
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const columns: TableColumnsType<KeyInfo> = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (key: string) => (
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}>
          {maskKey(key)}
        </Text>
      ),
    },
    {
      title: 'Models',
      dataIndex: 'models',
      key: 'models',
      render: (models: string[]) => (
        <Space size={4} wrap>
          {models?.map((m) => <Tag key={m}>{m}</Tag>)}
        </Space>
      ),
    },
    {
      title: 'Spend',
      dataIndex: 'spend',
      key: 'spend',
      render: (spend: number) => `$${(spend || 0).toFixed(4)}`,
    },
    {
      title: 'Budget',
      dataIndex: 'max_budget',
      key: 'max_budget',
      render: (budget: number) => (budget ? `$${budget.toFixed(2)}` : 'Unlimited'),
    },
    {
      title: 'Duration',
      dataIndex: 'budget_duration',
      key: 'budget_duration',
      render: (duration: string) => duration || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 96,
      align: 'right',
      render: (_value, record) => (
        <ConfirmAction
          title={`Delete key ${maskKey(record.key)}?`}
          description="This permanently removes the virtual key."
          onConfirm={async () => {
            if (!baseUrl) return;
            await deleteKey(baseUrl, record.key);
            await loadKeys();
          }}
          okText="Delete"
          danger
        >
          <AppButton
            aria-label={`Delete key ${maskKey(record.key)}`}
            variant="danger"
            icon={<DeleteOutlined />}
          />
        </ConfirmAction>
      ),
    },
  ];

  async function handleCreate(values: {
    models: string[];
    max_budget: number;
    budget_duration: string;
  }) {
    if (!baseUrl) {
      message.error('LiteLLM URL not configured');
      return;
    }
    setSubmitting(true);
    try {
      const { generateKey } = await import('../hooks/useLlmCommands');
      const params: KeyGenerateParams = {
        models: values.models,
        max_budget: values.max_budget || 0,
        budget_duration: values.budget_duration || '30d',
        metadata: {},
      };
      const result = await generateKey(baseUrl, params);
      setGeneratedKey(result.key);
      await loadKeys();
    } catch (err) {
      message.error(`Failed to create key: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            Virtual keys with budgets for accessing LiteLLM gateway. Use these keys in your tools
            instead of provider keys.
          </Text>
          <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Create Key
          </Button>
        </div>

        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : keys.length === 0 ? (
          <Empty description="No virtual keys created" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table<KeyInfo> rowKey="key" columns={columns} dataSource={keys} pagination={false} />
        )}
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
              name="models"
              label="Allowed Models"
              rules={[{ required: true, message: 'Select at least one model' }]}
            >
              <Select
                mode="multiple"
                placeholder="Select models (e.g., gpt-4o, claude-sonnet)"
              >
                <Select.Option value="gpt-4o">gpt-4o</Select.Option>
                <Select.Option value="gpt-4o-mini">gpt-4o-mini</Select.Option>
                <Select.Option value="claude-sonnet">claude-sonnet</Select.Option>
                <Select.Option value="claude-haiku">claude-haiku</Select.Option>
                <Select.Option value="gemini-pro">gemini-pro</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="max_budget" label="Max Budget ($)">
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0 = unlimited" />
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