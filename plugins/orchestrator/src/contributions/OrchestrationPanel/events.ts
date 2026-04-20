// Per A013/OrchestrationPanel + feedback/five-layer: events layer — thin
// wiring from observation state setters to outward callbacks. No side-effects
// of our own, no external fetches — state transitions only.

import { useCallback } from 'react';
import type { OrchestrationEventHandlers } from './contracts';

export interface OrchestrationEventDeps {
  readonly onSelectAgentState: (id: string) => void;
  readonly onSelectChatState: (chatId: string) => void;
  readonly onRefreshState: () => void;
}

export function useOrchestrationEvents(deps: OrchestrationEventDeps): OrchestrationEventHandlers {
  const onSelectAgent = useCallback((id: string) => deps.onSelectAgentState(id), [deps]);
  const onSelectChat = useCallback((chatId: string) => deps.onSelectChatState(chatId), [deps]);
  const onRefresh = useCallback(() => deps.onRefreshState(), [deps]);
  return { onSelectAgent, onSelectChat, onRefresh };
}
