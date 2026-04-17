// Per feedback/five-layer: events layer — outward emission. Domain-aware, view-agnostic.
// Takes a chat runtime handle (send/stop + streaming flag) and returns memoized handlers.

import { useCallback } from 'react';
import type { ChatPanelEventHandlers } from './contracts';

export interface ChatRuntimeHandle {
  readonly isStreaming: boolean;
  readonly send: (text: string) => Promise<void> | void;
  readonly stop: () => Promise<void> | void;
}

export function useChatPanelEvents(runtime: ChatRuntimeHandle): ChatPanelEventHandlers {
  const { isStreaming, send, stop } = runtime;

  const onSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      void send(trimmed);
    },
    [isStreaming, send],
  );

  const onCancel = useCallback(() => {
    void stop();
  }, [stop]);

  const onPick = useCallback(
    (prompt: string) => {
      if (isStreaming) return;
      void send(prompt);
    },
    [isStreaming, send],
  );

  return { onSubmit, onCancel, onPick };
}
