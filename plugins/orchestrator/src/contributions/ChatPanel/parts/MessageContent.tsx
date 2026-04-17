// Per feedback/small-components: vertical stack of block renderers for one message.

import type { ChatMessage } from '../../../types';
import { BlockRenderer } from './BlockRenderer';

interface MessageContentProps {
  readonly message: ChatMessage;
}

export function MessageContent({ message }: MessageContentProps) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {message.content.map((block, idx) => (
        <BlockRenderer key={`${message.id}-${block.type}-${idx}`} block={block} />
      ))}
    </div>
  );
}

export default MessageContent;
