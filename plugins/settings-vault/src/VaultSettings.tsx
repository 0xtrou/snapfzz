import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, Input, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { createTauriBridge, ConfirmAction, SettingsHeader, AppButton } from '@snapfzz/shared';

const { Text } = Typography;

const bridge = createTauriBridge();

interface SecretEntry {
  name: string;
  masked: string;
}

type VaultStatus = 'healthy' | 'missing';

function maskSecretValue(raw: string): string {
  return raw.length > 4 ? `${'•'.repeat(raw.length - 4)}${raw.slice(-4)}` : '•'.repeat(raw.length);
}

// Per A011/SecretVault: raw secret values are read only long enough to compute a masked display string.
// React state stores { name, masked } only — never decrypted values.
async function loadMaskedEntries(names: string[]): Promise<SecretEntry[]> {
  return Promise.all(
    names.map(async (name) => {
      const raw = await bridge.invoke<string>('vault_read', { key: name });
      const masked = maskSecretValue(raw);
      return { name, masked };
    }),
  );
}

export default function VaultSettings() {
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VaultStatus>('healthy');
  const [statusMessage, setStatusMessage] = useState('Healthy — stored in system keychain');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      // Per U011/MasterKeyStatus: vault_list success means the master key is healthy for this UI.
      const names = await bridge.invoke<string[]>('vault_list');
      const entries = await loadMaskedEntries(names);
      setSecrets(entries);
      setStatus('healthy');
      setStatusMessage('Healthy — stored in system keychain');
    } catch {
      setSecrets([]);
      setStatus('missing');
      setStatusMessage('Missing — secrets are unencrypted. Restart to regenerate.');
      setLoadError('Unable to read vault secrets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecrets();
  }, [loadSecrets]);

  const statusTone = useMemo(() => {
    switch (status) {
      case 'healthy':
        return { color: 'success' as const, label: 'Healthy' };
      default:
        return { color: 'error' as const, label: 'Missing' };
    }
  }, [status]);

  const columns = useMemo<TableColumnsType<SecretEntry>>(
    () => [
      {
        title: 'Name',
        dataIndex: 'name',
        key: 'name',
        render: (name: string) => (
          <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}>{name}</Text>
        ),
      },
      {
        title: 'Value',
        dataIndex: 'masked',
        key: 'masked',
        render: (masked: string) => (
          <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}>{masked}</Text>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 96,
        align: 'right',
        render: (_value, record) => (
          <ConfirmAction
            title={`Delete ${record.name}?`}
            description="This permanently removes the secret from the vault."
            onConfirm={async () => {
              setDeletingName(record.name);
              try {
                await bridge.invoke<void>('vault_delete', { key: record.name });
                await loadSecrets();
              } finally {
                setDeletingName(null);
              }
            }}
            okText="Delete"
            danger
          >
            <AppButton
              aria-label={`Delete ${record.name}`}
              variant="danger"
              icon={<DeleteOutlined />}
              loading={deletingName === record.name}
            />
          </ConfirmAction>
        ),
      },
    ],
    [deletingName, loadSecrets],
  );

  async function handleAdd(): Promise<void> {
    const trimmedName = newName.trim();

    if (!trimmedName) {
      setNameError('Secret name is required.');
      return;
    }

    setSubmitting(true);
    try {
      await bridge.invoke<void>('vault_store', { key: trimmedName, value: newValue });
      setNewName('');
      setNewValue('');
      setNameError(null);
      await loadSecrets();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader title="Secret Vault" />
      <div style={{ padding: '16px 32px', maxWidth: 840 }}>
        <Space direction="vertical" size={32} style={{ width: '100%' }}>
          <section>
            <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
              Master Key
            </Text>
            <div
              data-testid="master-key-status"
              style={{
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                background: 'var(--bg-secondary, var(--bg-subtle))',
                padding: '16px',
              }}
            >
              <Space direction="vertical" size={4}>
                <Space size={8} align="center">
                  <Tag color={statusTone.color}>{statusTone.label}</Tag>
                  <Text>{statusMessage}</Text>
                </Space>
                {loadError ? (
                  <Text type="danger">{loadError}</Text>
                ) : (
                  <Text type="secondary">Vault connection verified for this device.</Text>
                )}
              </Space>
            </div>
          </section>

          <section>
            <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
              Stored Secrets ({secrets.length})
            </Text>
            {loading ? (
              <div data-testid="vault-loading">
                <Skeleton active paragraph={{ rows: 4 }} />
              </div>
            ) : secrets.length === 0 ? (
              <div
                style={{
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  background: 'var(--bg-secondary, var(--bg-subtle))',
                  padding: '24px 16px',
                }}
              >
                <Empty description="No secrets stored" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <Table<SecretEntry>
                rowKey="name"
                columns={columns}
                dataSource={secrets}
                pagination={false}
              />
            )}
          </section>

          <section>
            <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
              Add Secret
            </Text>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  aria-label="Secret name"
                  placeholder="Secret name"
                  value={newName}
                  status={nameError ? 'error' : undefined}
                  onChange={(event) => {
                    setNewName(event.target.value);
                    if (nameError) setNameError(null);
                  }}
                />
                <Input.Password
                  aria-label="Secret value"
                  placeholder="Secret value"
                  value={newValue}
                  onChange={(event) => {
                    setNewValue(event.target.value);
                  }}
                />
                <AppButton icon={<PlusOutlined />} loading={submitting} onClick={() => void handleAdd()}>
                  Add
                </AppButton>
              </Space.Compact>
              {nameError && <Text type="danger">{nameError}</Text>}
            </Space>
          </section>
        </Space>
      </div>
    </div>
  );
}

export { maskSecretValue };
