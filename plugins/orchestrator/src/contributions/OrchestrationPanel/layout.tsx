// Per feedback/five-layer: presentational shell. Receives observation +
// events as props, composes PretextList<SubAgentRow> on the left and a
// conversation timeline on the right. No fetching, no state derivation.
//
// Per-pane maximise lives at the SHELL level now (project/src/app/App.tsx)
// across the three global panels (left sidebar / workspace / bottom), not
// inside this contribution — so the orchestration panel itself stays simple.

import { useCallback, useEffect, useState } from 'react';
import { Select } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { AppButton, PretextList } from '@snapfzz/shared';
import type {
  ConversationTurn,
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

const rootStyle: React.CSSProperties = {
  height: '100%',
  display: 'grid',
  gridTemplateColumns: '320px 1fr',
  background: 'var(--bg-default)',
};

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
  minHeight: HEADER_HEIGHT,
  maxHeight: HEADER_HEIGHT,
  flexShrink: 0,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  borderBottom: '1px solid var(--border-default)',
};

const headerTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  lineHeight: '1',
};

// Kept under the old export name for call-site continuity.
const leftTitle = headerTitle;

const rightStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const rightHeader: React.CSSProperties = {
  height: HEADER_HEIGHT,
  minHeight: HEADER_HEIGHT,
  maxHeight: HEADER_HEIGHT,
  flexShrink: 0,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  // Right padding reserves the top-right corner for the shell-level maximise
  // button that overlays the bottom panel (App.tsx BottomPanel). 56px = 28px
  // button + 8px right-gutter + 20px breathing room to avoid any visual
  // collision with the turn counter.
  padding: '0 56px 0 12px',
  borderBottom: '1px solid var(--border-default)',
  fontSize: 12,
  lineHeight: '1',
  color: 'var(--text-secondary)',
};

const timelineStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
};

/** Collapsed height = single header row. Matches ConversationTurn padding + header. */
const COLLAPSED_ROW_HEIGHT = 36;

/** Estimate height of an expanded turn from its text length. Cheap heuristic:
 *  ~60 chars per rendered line × 22px line-height, plus 44px for header +
 *  padding + bottom border. Clamped so virtualisation never starves the
 *  viewport of items nor wastes memory on giant preallocated rows. */
function estimateExpandedHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / 60));
  return Math.min(44 + lines * 22, 640);
}

export function OrchestrationPanelLayout({ observation, events }: Props) {
  const {
    subAgents,
    selectedAgentId,
    selectedAgentChats,
    selectedChatId,
    conversation,
    loading,
  } = observation;

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

  // ─── Turn expand/collapse state ─────────────────────────────────────────────
  // Default-expand every text/MSG turn — that's the human-readable content on
  // both sides of the conversation (orchestrator prompts + sub-agent replies).
  // Reasoning, tool calls/results, and media stay collapsed so the timeline
  // leads with prose and hides machine noise. Clicking a row's header toggles
  // expansion; PretextList re-measures via estimateHeight.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [userTouchedIds, setUserTouchedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    // Short-circuit before calling setState at all when nothing needs expanding.
    // The Set functional-update form still schedules a render; avoiding the call
    // entirely prevents the extra re-render cycle on every poll tick when all
    // text turns are already in the expanded set.
    const toAdd = conversation.filter(
      (t) => t.kind === 'text' && !expandedIds.has(t.id) && !userTouchedIds.has(t.id),
    );
    if (toAdd.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const t of toAdd) next.add(t.id);
      return next;
    });
  }, [conversation, userTouchedIds, expandedIds]);

  const toggleTurn = useCallback((id: string) => {
    setUserTouchedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id); return next;
    });
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Slice to a mutable array only when the reference actually changes — avoids
  // creating a new array identity on every render when conversation is stable,
  // which previously caused PretextList's items-dependent memos to re-run even
  // when signature-diff had already blocked the setTurns call.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const turnItems = conversation as unknown as ConversationTurn[];
  const turnKey = useCallback((t: ConversationTurn) => t.id, []);
  const turnHeight = useCallback(
    (t: ConversationTurn) => (expandedIds.has(t.id) ? estimateExpandedHeight(t.text) : COLLAPSED_ROW_HEIGHT),
    [expandedIds],
  );
  const renderTurn = useCallback(
    (t: ConversationTurn) => (
      <ConversationTurnItem
        turn={t}
        expanded={expandedIds.has(t.id)}
        onToggle={() => toggleTurn(t.id)}
      />
    ),
    [expandedIds, toggleTurn],
  );

  return (
    <div style={rootStyle} data-testid="orchestration-panel">
      <div style={leftStyle}>
        <div style={leftHeader}>
          <span style={leftTitle}>Sub-agents · {subAgents.length}</span>
          <AppButton
            variant="text"
            icon={<ReloadOutlined />}
            onClick={events.onRefresh}
            aria-label="Refresh"
            data-testid="orchestration-refresh"
          />
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

      <div style={rightStyle}>
        {selectedAgentId ? (
          <>
            <div style={rightHeader}>
              <span style={headerTitle}>
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
              <span style={{ marginLeft: 'auto', fontSize: 11 }}>
                {conversation.length} {conversation.length === 1 ? 'turn' : 'turns'}
              </span>
            </div>

            {conversation.length === 0 ? (
              <EmptyState
                title="No turns yet"
                description="Waiting for messages from the orchestrator or this sub-agent…"
              />
            ) : (
              <div style={timelineStyle}>
                <PretextList
                  items={turnItems}
                  renderItem={renderTurn}
                  keyExtractor={turnKey}
                  estimateHeight={turnHeight}
                  followOutput
                />
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
