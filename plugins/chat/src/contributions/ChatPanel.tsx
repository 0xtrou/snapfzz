import { useCallback, useMemo, useState } from 'react';
import { PretextList, PretextBubble, PretextMarkdown, PretextInput } from '@snapfzz/shared';
import { ThinkingCallout } from '../components/ThinkingCallout';
import { ToolUseCard } from '../components/ToolUseCard';
import { ToolResultInline } from '../components/ToolResultInline';
import { ImageContent } from '../components/ImageContent';
import { AudioPlayer } from '../components/AudioPlayer';
import { VideoPlayer } from '../components/VideoPlayer';
import { ThinkingIndicator } from '../components/ThinkingIndicator';
import { ScrollPill } from '../components/ScrollPill';
import { useChat } from '../hooks/use-chat';
import type { ChatMessage, RenderableContentBlock } from '../types';
import { prepare, layout } from '@snapfzz/shared';

const MESSAGE_FONT = '14px Inter';
const MESSAGE_LINE_HEIGHT = 22;
const BUBBLE_PADDING = 46;
const BUBBLE_GAP = 14;

function extractPlainText(content: RenderableContentBlock[]): string {
  return content
    .filter((b): b is RenderableContentBlock & { type: 'text' } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

function estimateMessageHeight(message: ChatMessage): number {
  const text = extractPlainText(message.content);
  if (!text) return 100;
  const prepared = prepare(text, MESSAGE_FONT);
  const { height } = layout(prepared, 500, MESSAGE_LINE_HEIGHT);
  return height + BUBBLE_PADDING + BUBBLE_GAP;
}

function renderBlock(block: RenderableContentBlock, key: string) {
  if (block.type === 'text') return <PretextMarkdown key={key} text={block.text} font={MESSAGE_FONT} lineHeight={MESSAGE_LINE_HEIGHT} />;
  if (block.type === 'thinking') return <ThinkingCallout key={key} block={block} />;
  if (block.type === 'tool_use') return <ToolUseCard key={key} block={block} />;
  if (block.type === 'tool_result') return <ToolResultInline key={key} block={block} />;
  if (block.type === 'image') return <ImageContent key={key} block={block} />;
  if (block.type === 'audio') return <AudioPlayer key={key} block={block} />;
  return <VideoPlayer key={key} block={block} />;
}

function MessageRow({ message }: { message: ChatMessage }) {
  return (
    <PretextBubble variant={message.role === 'user' ? 'user' : 'assistant'} grouped={message.groupedWithPrevious}>
      {!message.groupedWithPrevious && (
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            {message.role === 'user' ? `👤 ${message.name}` : `🎯 ${message.name}`}
          </strong>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{message.timestampLabel}</span>
        </header>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {message.content.map((block, idx) => renderBlock(block, `${message.id}-${block.type}-${idx}`))}
      </div>
    </PretextBubble>
  );
}

function EmptyState() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      Ask the orchestrator anything to start.
    </div>
  );
}

function ChatPanel() {
  const { messages, isStreaming, pendingMessageId, send, stop } = useChat();
  const [atBottom, setAtBottom] = useState(true);
  const [inputValue, setInputValue] = useState('');

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    send(text);
    setInputValue('');
  }, [inputValue, send]);

  const keyExtractor = useCallback((msg: ChatMessage) => msg.id, []);
  const renderItem = useCallback((msg: ChatMessage) => <MessageRow message={msg} />, []);

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr auto auto', background: 'var(--bg-default)', contain: 'content' }}>
      <div style={{ height: '100%', padding: '12px 12px 6px' }}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <PretextList
            items={messages}
            estimateHeight={estimateMessageHeight}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            followOutput
            onAtBottomChange={setAtBottom}
          />
        )}
      </div>

      <div style={{ padding: '0 12px' }}>
        <ThinkingIndicator visible={isStreaming && Boolean(pendingMessageId)} />
      </div>

      <div style={{ padding: '8px 12px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <PretextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSend}
            placeholder="Ask the orchestrator anything..."
            disabled={isStreaming}
          />
        </div>
        <button
          type="button"
          onClick={isStreaming ? stop : handleSend}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--bg-primary)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isStreaming ? 'Stop ⎋' : 'Send ⌘↵'}
        </button>
      </div>

      <ScrollPill visible={!atBottom && messages.length > 0} onClick={() => setAtBottom(true)} />
    </div>
  );
}

export default ChatPanel;
