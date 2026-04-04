import type { ChatMessage, RenderableTextBlock } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { ImageContent } from './ImageContent';
import { TextContent } from './TextContent';
import { ThinkingCallout } from './ThinkingCallout';
import { ToolResultInline } from './ToolResultInline';
import { ToolUseCard } from './ToolUseCard';
import { VideoPlayer } from './VideoPlayer';

interface MessageBubbleProps {
  message: ChatMessage;
}

function roleLabel(role: ChatMessage['role'], name: string): string {
  if (role === 'user') {
    return `👤 ${name}`;
  }

  if (role === 'assistant') {
    return `🎯 ${name}`;
  }

  return name;
}

function bubbleBackground(role: ChatMessage['role']): string {
  if (role === 'user') {
    return 'var(--bg-default)';
  }

  if (role === 'assistant') {
    return 'var(--bg-subtle)';
  }

  return 'var(--bg-default)';
}

function renderTextBlock(block: RenderableTextBlock, key: string) {
  return <TextContent key={key} block={block} />;
}

// Per chat/SPEC ContentBlockMap: MessageBubble dispatches each block.type to its dedicated renderer.
export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <article
      style={{
        marginTop: message.groupedWithPrevious ? 6 : 14,
        padding: '12px 14px',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        background: bubbleBackground(message.role),
        display: 'grid',
        gap: 10,
        contentVisibility: 'auto',
        containIntrinsicSize: '1px 80px',
      }}
    >
      {!message.groupedWithPrevious ? (
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>{roleLabel(message.role, message.name)}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{message.timestampLabel}</span>
        </header>
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {message.content.map((block, index) => {
          const key = `${message.id}-${block.type}-${index}`;

          if (block.type === 'text') {
            return renderTextBlock(block, key);
          }

          if (block.type === 'thinking') {
            return <ThinkingCallout key={key} block={block} />;
          }

          if (block.type === 'tool_use') {
            return <ToolUseCard key={key} block={block} />;
          }

          if (block.type === 'tool_result') {
            return <ToolResultInline key={key} block={block} />;
          }

          if (block.type === 'image') {
            return <ImageContent key={key} block={block} />;
          }

          if (block.type === 'audio') {
            return <AudioPlayer key={key} block={block} />;
          }

          return <VideoPlayer key={key} block={block} />;
        })}
      </div>

      {message.groupedWithPrevious ? (
        <footer style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{message.timestampLabel}</span>
        </footer>
      ) : null}
    </article>
  );
}
