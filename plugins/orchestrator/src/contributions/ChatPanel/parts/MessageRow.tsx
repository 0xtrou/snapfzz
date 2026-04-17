// Per feedback/small-components + project/SparkDesignFirst: a single Bubble row for one message.
// Uses Spark Bubble for avatar/content/msgStatus. Presentational only.

import { Bubble } from '@agentscope-ai/chat';
import { ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../../../types';
import { MessageContent } from './MessageContent';

interface MessageRowProps {
  readonly message: ChatMessage;
  readonly isPending: boolean;
}

export function MessageRow({ message, isPending }: MessageRowProps) {
  const isUser = message.role === 'user';
  return (
    <Bubble
      avatar={{ icon: isUser ? <UserOutlined /> : <ThunderboltOutlined /> }}
      content={<MessageContent message={message} />}
      msgStatus={isPending ? 'generating' : 'finished'}
      styles={{
        content: { background: isUser ? 'var(--bg-subtle)' : 'var(--bg-default)' },
      }}
    />
  );
}

export default MessageRow;
