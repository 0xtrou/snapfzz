import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { AppButton, ConfirmAction } from '@snapfzz/shared';
import {
  listProviderKeys,
  deleteProviderKey,
  type ModelDeployment,
} from '../hooks/useLlmCommands';

const { Text } = Typography;

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', prefix: 'openai' },
  { id: 'anthropic', label: 'Anthropic', prefix: 'anthropic' },
  { id: 'google', label: 'Google AI', prefix: 'gemini' },
  { id: 'mistral', label: 'Mistral', prefix: 'mistral' },
  { id: 'cohere', label: 'Cohere', prefix: 'cohere' },
  { id: 'azure', label: 'Azure OpenAI', prefix: 'azure' },
];

interface ProviderEntry {
  provider: string;
  keyName: string;
  envVar: string;
}

export default function ProvidersTab() {
  const [entries, setEntries] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const allEntries: ProviderEntry[] = [];
      for (const provider of PROVIDERS) {
        const keys = await listProviderKeys(provider.id);
        for (const keyName of keys) {
          allEntries.push({
            provider: provider.id,
            keyName,
            envVar: `PROVIDER_${provider.id.toUpperCase()}_${keyName.toUpperCase()}`,
          });
        }
      }
      setEntries(allEntries);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const columns: TableColumnsType<ProviderEntry> = [
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      render: (provider: string) => {
        const info = PROVIDERS.find((p) => p.id === provider);
        return <Tag>{info?.label || provider}</Tag>;
      },
    },
    {
      title: 'Key Name',
      dataIndex: 'keyName',
      key: 'keyName',
      render: (name: string) => (
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}>
          {name}
        </Text>
      ),
    },
    {
      title: 'Env Var Reference',
      dataIndex: 'envVar',
      key: 'envVar',
      render: (envVar: string) => (
        <Text
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}
          type="secondary"
        >
          os.environ/{envVar}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 96,
      align: 'right',
      render: (_value, record) => (
        <ConfirmAction
          title={`Delete ${record.keyName}?`}
          description="This removes the API key from the vault."
          onConfirm={async () => {
            await deleteProviderKey(record.provider, record.keyName);
            await loadProviders();
          }}
          okText="Delete"
          danger
        >
          <AppButton aria-label={`Delete ${record.keyName}`} variant="danger" icon={<DeleteOutlined />} />
        </ConfirmAction>
      ),
    },
  ];

  async function handleAdd(values: { provider: string; keyName: string; keyValue: string }) {
    setSubmitting(true);
    try {
      const { storeProviderKey } = await import('../hooks/useLlmCommands');
      await storeProviderKey(values.provider, values.keyName, values.keyValue);
      setModalOpen(false);
      form.resetFields();
      await loadProviders();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            Provider API keys are stored securely in the vault and referenced via environment
            variables in the LiteLLM config.
          </Text>
          <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Add Provider Key
          </Button>
        </div>

        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : entries.length === 0 ? (
          <Empty
            description="No provider keys stored"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table<ProviderEntry>
            rowKey={(record) => `${record.provider}-${record.keyName}`}
            columns={columns}
            dataSource={entries}
            pagination={false}
          />
        )}
      </Space>

      <Modal
        title="Add Provider Key"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item
            name="provider"
            label="Provider"
            rules={[{ required: true, message: 'Select a provider' }]}
          >
            <Select placeholder="Select provider">
              {PROVIDERS.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="keyName"
            label="Key Name"
            rules={[{ required: true, message: 'Enter a key name' }]}
          >
            <Input placeholder="e.g., key_1, production" />
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