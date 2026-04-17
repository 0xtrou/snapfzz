// Per feedback/five-layer: presentational shell. Receives all state + callbacks via props —
// no hooks for business logic, no external state reads. Composes small leaf parts.
// Per A013/ModelPicker: accepts composerPrefix so ChatPanel index can thread ModelPicker chip
// into the Spark Sender without this file needing to know about ModelPicker internals.

import type { ReactNode } from 'react';
import type { ChatPanelEventHandlers, ChatPanelObservation, SuggestionPrompt } from './contracts';
import { EmptyHero } from './parts/EmptyHero';
import { MessageList } from './parts/MessageList';
import { ChatComposer } from './parts/ChatComposer';

interface ChatPanelLayoutProps {
  readonly observation: ChatPanelObservation;
  readonly events: ChatPanelEventHandlers;
  readonly suggestions: readonly SuggestionPrompt[];
  /** Optional prefix node forwarded to ChatComposer → Spark Sender's prefix slot. */
  readonly composerPrefix?: ReactNode;
}

export function ChatPanelLayout({ observation, events, suggestions, composerPrefix }: ChatPanelLayoutProps) {
  const { messages, isStreaming, pendingMessageId, isEmpty } = observation;
  const { onSubmit, onCancel, onPick } = events;

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: '1fr auto',
        background: 'var(--bg-default)',
        // Per A001/Performance: `contain: content` keeps the panel from triggering parent
        // reflow while the virtualized list scrolls or the streaming cursor paints.
        contain: 'content',
      }}
    >
      <div style={{ overflow: 'hidden', position: 'relative' }}>
        {isEmpty ? (
          <EmptyHero suggestions={suggestions} onPick={onPick} disabled={isStreaming} />
        ) : (
          <MessageList messages={messages} pendingMessageId={pendingMessageId} />
        )}
      </div>

      <ChatComposer
        loading={isStreaming}
        onSubmit={onSubmit}
        onCancel={onCancel}
        prefix={composerPrefix}
      />
    </div>
  );
}

export default ChatPanelLayout;
