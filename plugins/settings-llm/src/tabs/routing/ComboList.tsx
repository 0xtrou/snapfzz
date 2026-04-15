// ComboList — shows existing combos as cards with create/edit/delete actions.

import { useState } from 'react';
import { Tag, Modal } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { AppButton } from '@snapfzz/shared';
import type { ComboConfig } from '../../routing/composer';

export interface ComboListProps {
  combos: ComboConfig[];
  onEdit: (combo: ComboConfig) => void;
  onCreate: () => void;
  onDelete: (name: string) => Promise<void>;
}

const STRATEGY_COLORS: Record<string, string> = {
  'round-robin': 'blue',
  'weighted': 'purple',
  'priority': 'orange',
  'least-busy': 'cyan',
  'cost-optimized': 'green',
  'latency-optimized': 'geekblue',
  'fill-first': 'gold',
};

export default function ComboList({ combos, onEdit, onCreate, onDelete }: ComboListProps) {
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (!confirmTarget) return;
    setDeletingName(confirmTarget);
    try {
      await onDelete(confirmTarget);
    } finally {
      setDeletingName(null);
      setConfirmTarget(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 6 }}>
        <AppButton icon={<PlusOutlined />} onClick={onCreate}>
          Create Combo
        </AppButton>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        A combo groups multiple models under one name with a routing strategy. Use the combo name as the <code style={{ fontSize: 11, padding: '1px 5px', background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 4 }}>model</code> parameter in your API calls — requests are automatically distributed across the models in the combo.
      </div>

      {combos.length === 0 && (
        <div
          style={{
            padding: '32px 24px',
            background: 'var(--bg-default)',
            border: '1px dashed var(--border-default)',
            borderRadius: 8,
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          No routing combos created. Create a combo to group multiple model deployments under one name with a routing strategy.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {combos.map((combo) => (
          <div
            key={combo.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              background: 'var(--bg-default)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onClick={() => onEdit(combo)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-info)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-default)';
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {combo.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {combo.deployments.length} deployment{combo.deployments.length !== 1 ? 's' : ''}
              </div>
            </div>

            <Tag color={STRATEGY_COLORS[combo.strategy] ?? 'default'} style={{ flexShrink: 0 }}>
              {combo.strategy}
            </Tag>

            <div
              style={{ display: 'flex', gap: 4, flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <AppButton
                variant="text"
                icon={<EditOutlined />}
                onClick={() => onEdit(combo)}
                style={{ color: 'var(--text-muted)' }}
              />
              <AppButton
                variant="text"
                icon={<DeleteOutlined />}
                loading={deletingName === combo.name}
                onClick={() => setConfirmTarget(combo.name)}
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          </div>
        ))}
      </div>

      <Modal
        title="Delete Combo"
        open={confirmTarget !== null}
        onOk={handleDeleteConfirm}
        onCancel={() => setConfirmTarget(null)}
        okText="Delete"
        okButtonProps={{ danger: true, loading: !!deletingName }}
      >
        <p style={{ fontSize: 13 }}>
          Delete combo <strong>{confirmTarget}</strong>? This will remove all its deployments from the gateway.
        </p>
      </Modal>
    </div>
  );
}
