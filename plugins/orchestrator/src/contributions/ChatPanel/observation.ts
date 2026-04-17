// Per feedback/five-layer: observation layer — reads external state, produces a read-only
// view for the layout. No writes, no side effects.

import { useMemo } from 'react';
import { useChat } from '../../hooks/use-chat';
import type { ChatPanelObservation } from './contracts';

/** Pulls the chat runtime snapshot and projects the fields the layout needs. */
export function useChatPanelObservation(): ChatPanelObservation {
  const { messages, isStreaming, pendingMessageId } = useChat();

  return useMemo<ChatPanelObservation>(
    () => ({
      messages,
      isStreaming,
      pendingMessageId,
      isEmpty: messages.length === 0,
    }),
    [messages, isStreaming, pendingMessageId],
  );
}
