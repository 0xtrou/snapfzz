import { useCallback, useEffect, useState } from 'react';
import { Empty, message, Select, Skeleton, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { getSpendLogs, getBaseUrl, getMasterKey, type SpendLog } from '../hooks/useLlmCommands';

const { Text } = Typography;

export default function AuditLogTab() {
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [masterKey, setMasterKey] = useState<string>('');
  const [logs, setLogs] = useState<SpendLog[]>([]);
  const [modelFilter, setModelFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    try {
      const result = await getSpendLogs(baseUrl, masterKey, {});
      setLogs(result);
    } catch (err) {
      console.error('[AuditLogTab] Failed to load spend logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, masterKey]);

  useEffect(() => {
    Promise.all([getBaseUrl(), getMasterKey()])
      .then(([url, key]) => {
        setBaseUrl(url);
        setMasterKey(key);
      })
      .catch(() => message.error('Failed to get LiteLLM URL'));
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const columns: TableColumnsType<SpendLog> = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: string) => {
        const date = new Date(ts);
        return date.toLocaleString();
      },
    },
    {
      title: 'Request ID',
      dataIndex: 'request_id',
      key: 'request_id',
      render: (id: string) => (
        <Text
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}
          ellipsis
        >
          {id}
        </Text>
      ),
    },
    {
      title: 'API Key',
      dataIndex: 'api_key',
      key: 'api_key',
      render: (key: string) => (
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}>
          {key.length > 12 ? `${key.slice(0, 4)}...${key.slice(-4)}` : key}
        </Text>
      ),
    },
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      render: (model: string) => <Text>{model}</Text>,
    },
    {
      title: 'Spend',
      dataIndex: 'spend',
      key: 'spend',
      align: 'right',
      render: (spend: number) => (
        <Text style={{ fontFamily: 'var(--font-mono)' }}>
          ${(spend || 0).toFixed(6)}
        </Text>
      ),
    },
  ];

  const uniqueModels = [...new Set(logs.map((l) => l.model))];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
        <Select
          allowClear
          placeholder="Filter by model"
          style={{ width: 200 }}
          value={modelFilter}
          onChange={setModelFilter}
        >
          {uniqueModels.map((m) => (
            <Select.Option key={m} value={m}>
              {m}
            </Select.Option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : logs.length === 0 ? (
        <Empty description="No spend logs found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table<SpendLog>
          rowKey="request_id"
          columns={columns}
          dataSource={modelFilter ? logs.filter((log) => log.model === modelFilter) : logs}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      )}
    </div>
  );
}