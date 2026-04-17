// ComboList — shows existing combos as cards with create/edit/delete actions.
// Per A013/Orchestrator: system combos (e.g. `orchestrator`) render with a lock badge
// and disabled Edit/Delete — they're mutated by the orchestrator plugin, not the UI.

import { useState } from 'react';
import { Tag, Modal, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, LockOutlined } from '@ant-design/icons';
import { AppButton } from '@snapfzz/shared';
import type { ComboConfig } from '../../routing/composer';
import { SYSTEM_COMBO_LABEL, SYSTEM_COMBO_TOOLTIP, isSystemCombo } from '../../routing/systemCombo';

export interface ComboListProps {
  combos: ComboConfig[];
  onEdit: (combo: ComboConfig) => void;
  onCreate: () => void;
  onDelete: (name: string) => Promise<void>;
  loadData: () => Promise<void>;
  loading: boolean;
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

export default function ComboList({ combos, onEdit, onCreate, onDelete, loadData, loading }: ComboListProps) {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 16 }}>
        <AppButton style={{ marginRight: 8 }} variant="text" icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Refresh</AppButton>
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
        {combos.map((combo) => {
          const isSystem = isSystemCombo(combo.name);

          return (
            <div
              key={combo.name}
              data-testid={`combo-row-${combo.name}`}
              data-system={String(isSystem)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 18px',
                background: 'var(--bg-default)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                cursor: isSystem ? 'default' : 'pointer',
                transition: 'border-color 0.15s',
                opacity: isSystem ? 0.85 : 1,
              }}
              onClick={() => { if (!isSystem) onEdit(combo); }}
              onMouseEnter={(e) => {
                if (isSystem) return;
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-info)';
              }}
              onMouseLeave={(e) => {
                if (isSystem) return;
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-default)';
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* inline-flex avoids a `display: flex` substring collision with existing
                    tests that locate the card via `.closest('[style*="display: flex"]')`. */}
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {combo.name}
                  {isSystem && (
                    <Tooltip title={SYSTEM_COMBO_TOOLTIP}>
                      <Tag icon={<LockOutlined />} color="default" style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px' }}>
                        {SYSTEM_COMBO_LABEL}
                      </Tag>
                    </Tooltip>
                  )}
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
                {/* Only wrap disabled system buttons with a Tooltip — the tooltip span
                    interferes with click dispatch in some test harnesses, so keep the
                    non-system path unwrapped to preserve existing test behavior. */}
                {isSystem ? (
                  <Tooltip title={SYSTEM_COMBO_TOOLTIP}>
                    <AppButton
                      variant="text"
                      icon={<EditOutlined />}
                      disabled
                      style={{ color: 'var(--text-muted)' }}
                      data-testid={`combo-edit-${combo.name}`}
                    />
                  </Tooltip>
                ) : (
                  <AppButton
                    variant="text"
                    icon={<EditOutlined />}
                    onClick={() => onEdit(combo)}
                    style={{ color: 'var(--text-muted)' }}
                    data-testid={`combo-edit-${combo.name}`}
                  />
                )}
                {isSystem ? (
                  <Tooltip title={SYSTEM_COMBO_TOOLTIP}>
                    <AppButton
                      variant="text"
                      icon={<DeleteOutlined />}
                      disabled
                      style={{ color: 'var(--text-muted)' }}
                      data-testid={`combo-delete-${combo.name}`}
                    />
                  </Tooltip>
                ) : (
                  <AppButton
                    variant="text"
                    icon={<DeleteOutlined />}
                    loading={deletingName === combo.name}
                    onClick={() => setConfirmTarget(combo.name)}
                    style={{ color: 'var(--text-muted)' }}
                    data-testid={`combo-delete-${combo.name}`}
                  />
                )}
              </div>
            </div>
          );
        })}
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
