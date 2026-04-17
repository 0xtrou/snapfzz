// Per A005/PluginArchitecture + feedback/five-layer: shared types so each layer (data/
// observation/events/layout) talks to a stable contract instead of siblings.

import type { ChatMessage } from '../../types';

export interface SuggestionPrompt {
  readonly value: string;
  readonly label?: string;
}

/** Read-only view of the chat runtime, produced by observation.ts for the layout. */
export interface ChatPanelObservation {
  readonly messages: ChatMessage[];
  readonly isStreaming: boolean;
  readonly pendingMessageId: string | null;
  readonly isEmpty: boolean;
}

/** Outward event handlers wired by events.ts. */
export interface ChatPanelEventHandlers {
  readonly onSubmit: (text: string) => void;
  readonly onCancel: () => void;
  readonly onPick: (prompt: string) => void;
}
