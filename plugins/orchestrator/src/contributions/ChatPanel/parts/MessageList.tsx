// Per feedback/small-components: virtualized message list. Wraps PretextList so layout.tsx
// stays free of virtualization details. Presentational leaf.

import { useCallback, useMemo } from 'react';
import { PretextList } from '@snapfzz/shared';
import type { ChatMessage } from '../../../types';
import { createHeightEstimator, keyOfMessage, isPendingMessage } from '../data';
import { MessageRow } from './MessageRow';

interface MessageListProps {
  readonly messages: ChatMessage[];
  readonly pendingMessageId: string | null;
}

export function MessageList({ messages, pendingMessageId }: MessageListProps) {
  // Per A001/Performance: estimator is memoized across renders so the virtualizer's
  // cache is not rebuilt on every parent update.
  const estimator = useMemo(() => createHeightEstimator(), []);

  const renderItem = useCallback(
    (msg: ChatMessage) => <MessageRow message={msg} isPending={isPendingMessage(msg, pendingMessageId)} />,
    [pendingMessageId],
  );

  return (
    <div style={{ height: '100%', padding: '12px 12px 6px' }}>
      <PretextList
        items={messages}
        estimateHeight={estimator.estimate}
        renderItem={renderItem}
        keyExtractor={keyOfMessage}
        followOutput
      />
    </div>
  );
}

export default MessageList;
