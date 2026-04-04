import { useCallback, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Composer } from '../components/Composer';
import { MessageBubble } from '../components/MessageBubble';
import { ScrollPill } from '../components/ScrollPill';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { useChat } from '../hooks/use-chat';

function chatPanelShellStyle(): React.CSSProperties {
  return {
    height: '100%',
    display: 'grid',
    gridTemplateRows: '1fr auto',
    background: 'var(--bg-default)',
    color: 'var(--text-primary)',
    contain: 'content',
    position: 'relative',
  };
}

function messageListStyle(): React.CSSProperties {
  return {
    height: '100%',
    padding: '12px 12px 6px',
  };
}

function EmptyState() {
  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--text-muted)',
        fontSize: 14,
      }}
    >
      Ask the orchestrator anything to start.
    </div>
  );
}

// Per A001/Performance: chat list uses react-virtuoso virtual rendering for smooth streaming under long history.
function ChatPanel() {
  const { messages, isStreaming, pendingMessageId, send, stop } = useChat();
  const [atBottom, setAtBottom] = useState(true);
  const virtuosoRef = useRef<Virtuoso | null>(null);

  const showScrollPill = useMemo(() => {
    if (messages.length === 0) {
      return false;
    }

    return !atBottom;
  }, [atBottom, messages.length]);

  const onScrollPillClick = useCallback(() => {
    setAtBottom(true);
    virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div style={chatPanelShellStyle()}>
      <div style={messageListStyle()}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            followOutput="smooth"
            atBottomStateChange={setAtBottom}
            itemContent={(_, message) => <MessageBubble message={message} />}
            style={{ height: '100%' }}
          />
        )}
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <ThinkingIndicator visible={isStreaming && Boolean(pendingMessageId)} />
      </div>

      <Composer
        disabled={false}
        isStreaming={isStreaming}
        onSend={send}
        onStop={stop}
      />

      <ScrollPill visible={showScrollPill} onClick={onScrollPillClick} />
    </div>
  );
}

export default ChatPanel;
