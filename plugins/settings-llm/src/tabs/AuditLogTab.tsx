import { useCallback, useEffect, useState } from 'react';
import {
  DatePicker,
  Empty,
  Select,
  Skeleton,
  Table,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { getSpendLogs, type SpendLog } from '../hooks/useLlmCommands';

const { Text } = Typography;

const { RangePicker } = DatePicker;

const DEFAULT_BASE_URL = 'http://127.0.0.1:4000';

export default function AuditLogTab() {
  const [logs, setLogs] = useState<SpendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelFilter, setModelFilter] = useState<string | undefined>();

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSpendLogs(DEFAULT_BASE_URL, {
        model: modelFilter,
        size: 100,
      });
      setLogs(result || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [modelFilter]);

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
          dataSource={logs}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      )}
    </div>
  );
}