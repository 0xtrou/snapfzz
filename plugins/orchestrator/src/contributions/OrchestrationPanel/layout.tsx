// Per feedback/five-layer: presentational shell. Receives observation +
// events as props, composes PretextList<SubAgentRow> on the left and a
// conversation timeline on the right. No fetching, no state derivation.

import { useCallback, useState } from 'react';
import { Select } from 'antd';
import {
  FullscreenExitOutlined,
  FullscreenOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { AppButton, PretextList } from '@snapfzz/shared';
import type {
  OrchestrationEventHandlers,
  OrchestrationObservation,
  SubAgentRow,
} from './contracts';
import { SubAgentRowItem } from './parts/SubAgentRowItem';
import { ConversationTurnItem } from './parts/ConversationTurn';
import { EmptyState } from './parts/EmptyState';

interface Props {
  readonly observation: OrchestrationObservation;
  readonly events: OrchestrationEventHandlers;
}

// Grid template flips based on which (if any) pane is maximised. Hiding a
// pane via `display: none` keeps the PretextList / timeline virtualiser
// from calculating heights for a zero-width column.
type MaximizedPane = 'left' | 'right' | null;

function gridColumnsFor(pane: MaximizedPane): string {
  if (pane === 'left') return '1fr';
  if (pane === 'right') return '1fr';
  return '320px 1fr';
}

const rootStyle = (pane: MaximizedPane): React.CSSProperties => ({
  height: '100%',
  display: 'grid',
  gridTemplateColumns: gridColumnsFor(pane),
  background: 'var(--bg-default)',
});

const leftStyle: React.CSSProperties = {
  borderRight: '1px solid var(--border-default)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

// Per panel UX: both headers must match height exactly — the right header
// hosts an antd Select whose control is larger than a bare AppButton, so a
// fixed 44px with `boxSizing: border-box` is what keeps them aligned.
const HEADER_HEIGHT = 44;

const leftHeader: React.CSSProperties = {
  height: HEADER_HEIGHT,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  borderBottom: '1px solid var(--border-default)',
};

const leftTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const rightStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const rightHeader: React.CSSProperties = {
  height: HEADER_HEIGHT,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0 12px',
  borderBottom: '1px solid var(--border-default)',
  fontSize: 12,
  color: 'var(--text-secondary)',
};

const timelineStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
};

export function OrchestrationPanelLayout({ observation, events }: Props) {
  const {
    subAgents,
    selectedAgentId,
    selectedAgentChats,
    selectedChatId,
    conversation,
    loading,
  } = observation;

  const [maximized, setMaximized] = useState<MaximizedPane>(null);
  const toggleLeft = useCallback(
    () => setMaximized((p) => (p === 'left' ? null : 'left')),
    [],
  );
  const toggleRight = useCallback(
    () => setMaximized((p) => (p === 'right' ? null : 'right')),
    [],
  );

  const keyOf = useCallback((row: SubAgentRow) => row.id, []);
  const renderRow = useCallback(
    (row: SubAgentRow) => (
      <SubAgentRowItem
        row={row}
        selected={row.id === selectedAgentId}
        onSelect={events.onSelectAgent}
      />
    ),
    [selectedAgentId, events.onSelectAgent],
  );

  const selectedName = subAgents.find((a) => a.id === selectedAgentId)?.name ?? '';

  return (
    <div style={rootStyle(maximized)} data-testid="orchestration-panel">
      <div style={{ ...leftStyle, display: maximized === 'right' ? 'none' : leftStyle.display }}>
        <div style={leftHeader}>
          <span style={leftTitle}>Sub-agents · {subAgents.length}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <AppButton
              variant="text"
              icon={<ReloadOutlined />}
              onClick={events.onRefresh}
              aria-label="Refresh"
              data-testid="orchestration-refresh"
            />
            <AppButton
              variant="text"
              icon={maximized === 'left' ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleLeft}
              aria-label={maximized === 'left' ? 'Restore panes' : 'Maximise sub-agents list'}
              data-testid="orchestration-maximize-left"
            />
          </span>
        </div>
        {subAgents.length === 0 ? (
          <EmptyState
            title={loading ? 'Loading sub-agents…' : 'No sub-agents spawned yet'}
            description="The orchestrator will auto-create specialists when it delegates work (e.g. chat_with_agent, submit_to_agent). They will show up here when that happens."
          />
        ) : (
          <PretextList
            items={subAgents}
            renderItem={renderRow}
            keyExtractor={keyOf}
            estimateHeight={() => 52}
          />
        )}
      </div>

      <div style={{ ...rightStyle, display: maximized === 'left' ? 'none' : rightStyle.display }}>
        {selectedAgentId ? (
          <>
            <div style={rightHeader}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {selectedName || selectedAgentId}
              </span>
              {selectedAgentChats.length > 1 && (
                <Select
                  size="small"
                  value={selectedChatId ?? undefined}
                  onChange={events.onSelectChat}
                  style={{ minWidth: 220 }}
                  options={selectedAgentChats.map((c) => ({
                    label: c.session_id || c.id,
                    value: c.id,
                  }))}
                  data-testid="orchestration-chat-picker"
                />
              )}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11 }}>
                  {conversation.length} {conversation.length === 1 ? 'turn' : 'turns'}
                </span>
                <AppButton
                  variant="text"
                  icon={maximized === 'right' ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={toggleRight}
                  aria-label={maximized === 'right' ? 'Restore panes' : 'Maximise conversation'}
                  data-testid="orchestration-maximize-right"
                />
              </span>
            </div>

            {conversation.length === 0 ? (
              <EmptyState
                title="No turns yet"
                description="Waiting for messages from the orchestrator or this sub-agent…"
              />
            ) : (
              <div style={timelineStyle}>
                {conversation.map((t) => <ConversationTurnItem key={t.id} turn={t} />)}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title="Select a sub-agent"
            description="Pick a sub-agent on the left to view its conversation with the orchestrator."
          />
        )}
      </div>
    </div>
  );
}

export default OrchestrationPanelLayout;
