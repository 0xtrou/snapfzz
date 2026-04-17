// Per feedback/five-layer: pure-TS data layer. No React, no DOM, no effects.
// Unit tests for this file run at native TypeScript speed with zero jsdom.

import { prepare, layout as measureLayout } from '@snapfzz/shared';
import type { ChatMessage, ContentBlock } from '../../types';
import type { SuggestionPrompt } from './contracts';

export const MESSAGE_FONT = '14px Inter';
export const MESSAGE_LINE_HEIGHT = 22;
export const PLACEHOLDER_TEXT = 'Ask the orchestrator anything...';

// Bubble chrome (avatar column + header + footer + padding) ≈ 88px; baked into the estimate so
// PretextList pre-allocates row height accurately and the virtualizer doesn't jitter.
export const BUBBLE_CHROME_PX = 88;
export const BUBBLE_GAP_PX = 12;
export const DEFAULT_CONTENT_WIDTH_PX = 420;

export const SUGGESTION_PROMPTS: readonly SuggestionPrompt[] = Object.freeze([
  { value: 'a lofi habit tracker with streaks' },
  { value: 'a landing page for a dog-sitting app' },
  { value: 'a kanban with drag-and-drop' },
]);

/** Extract concatenated plain text from all text blocks in a message's content. */
export function extractPlainText(content: readonly ContentBlock[]): string {
  return content
    .filter((b): b is ContentBlock & { type: 'text' } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * Estimate pixel height for a message row in the virtualized list.
 * Memoized per message id — callers should invalidate via {@link resetHeightCache}
 * when the session rolls over or messages mutate in place.
 */
export function createHeightEstimator(contentWidth: number = DEFAULT_CONTENT_WIDTH_PX) {
  const cache = new Map<string, number>();

  function estimate(message: ChatMessage): number {
    const cached = cache.get(message.id);
    if (cached !== undefined) return cached;

    const text = extractPlainText(message.content);
    if (!text) {
      const fallback = BUBBLE_CHROME_PX + BUBBLE_GAP_PX;
      cache.set(message.id, fallback);
      return fallback;
    }

    const prepared = prepare(text, MESSAGE_FONT);
    const { height } = measureLayout(prepared, contentWidth, MESSAGE_LINE_HEIGHT);
    const result = height + BUBBLE_CHROME_PX + BUBBLE_GAP_PX;
    cache.set(message.id, result);
    return result;
  }

  function reset(): void {
    cache.clear();
  }

  return { estimate, reset };
}

export function keyOfMessage(message: ChatMessage): string {
  return message.id;
}

/** True when the message is the one currently being streamed into. */
export function isPendingMessage(message: ChatMessage, pendingMessageId: string | null): boolean {
  return pendingMessageId !== null && message.id === pendingMessageId;
}
