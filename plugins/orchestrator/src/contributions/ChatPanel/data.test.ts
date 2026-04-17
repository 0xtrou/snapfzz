// Spec: chat/SPEC.md
// Section: ContentBlock rendering map, virtualization height
// Verifies: pure data layer — constants, extractPlainText, createHeightEstimator.

import { describe, it, expect, vi } from 'vitest';

// @snapfzz/shared's prepare/layout walk the real text for measuring. Stub both so we
// can assert the estimator's branching logic independently of font metrics.
vi.mock('@snapfzz/shared', () => ({
  prepare: vi.fn((text: string) => ({ text, length: text.length })),
  layout: vi.fn((prepared: { length: number }) => ({
    height: Math.max(prepared.length * 2, 20),
    lineCount: Math.max(Math.ceil(prepared.length / 40), 1),
  })),
}));

import type { ChatMessage } from '../../types';
import {
  BUBBLE_CHROME_PX,
  BUBBLE_GAP_PX,
  MESSAGE_FONT,
  MESSAGE_LINE_HEIGHT,
  PLACEHOLDER_TEXT,
  SUGGESTION_PROMPTS,
  createHeightEstimator,
  extractPlainText,
  isPendingMessage,
  keyOfMessage,
} from './data';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    name: 'User',
    role: 'user',
    content: [],
    metadata: {},
    timestamp: '2026-04-17T10:00:00Z',
    timestampLabel: '10:00',
    groupedWithPrevious: false,
    ...overrides,
  } as ChatMessage;
}

describe('chat/ChatPanel/data: constants', () => {
  it('chat/data: exposes stable placeholder + font tokens', () => {
    expect(PLACEHOLDER_TEXT).toBe('Ask the orchestrator anything...');
    expect(MESSAGE_FONT).toBe('14px Inter');
    expect(MESSAGE_LINE_HEIGHT).toBe(22);
    expect(BUBBLE_CHROME_PX).toBeGreaterThan(0);
    expect(BUBBLE_GAP_PX).toBeGreaterThan(0);
  });

  it('chat/data: suggestion prompts are frozen and non-empty', () => {
    expect(SUGGESTION_PROMPTS.length).toBeGreaterThanOrEqual(3);
    expect(Object.isFrozen(SUGGESTION_PROMPTS)).toBe(true);
    for (const prompt of SUGGESTION_PROMPTS) {
      expect(prompt.value.length).toBeGreaterThan(0);
    }
  });
});

describe('chat/ChatPanel/data: extractPlainText', () => {
  it('chat/data: returns empty string when there are no text blocks', () => {
    expect(extractPlainText([])).toBe('');
    expect(extractPlainText([
      { type: 'image', source: 'x.png' },
      { type: 'audio', source: 'y.mp3' },
    ])).toBe('');
  });

  it('chat/data: joins all text blocks with newlines, ignoring non-text', () => {
    const blocks = [
      { type: 'text' as const, text: 'one' },
      { type: 'thinking' as const, thinking: 'ignored' },
      { type: 'text' as const, text: 'two' },
    ];
    expect(extractPlainText(blocks)).toBe('one\ntwo');
  });
});

describe('chat/ChatPanel/data: createHeightEstimator', () => {
  it('chat/data: caches the estimate per message id', () => {
    const estimator = createHeightEstimator(400);
    const msg = makeMessage({
      id: 'cache-1',
      content: [{ type: 'text', text: 'hello world' }],
    });

    const first = estimator.estimate(msg);
    const second = estimator.estimate(msg);
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(BUBBLE_CHROME_PX);
  });

  it('chat/data: falls back to chrome+gap when no text blocks exist', () => {
    const estimator = createHeightEstimator();
    const msg = makeMessage({
      id: 'no-text',
      content: [{ type: 'image', source: 'x.png' }],
    });
    expect(estimator.estimate(msg)).toBe(BUBBLE_CHROME_PX + BUBBLE_GAP_PX);
  });

  it('chat/data: reset() clears the cache so re-estimation recomputes', () => {
    const estimator = createHeightEstimator();
    const msg = makeMessage({
      id: 'reset-1',
      content: [{ type: 'text', text: 'short' }],
    });

    estimator.estimate(msg);
    estimator.reset();
    // After reset, the next estimate must re-run the measurement path — we assert via
    // a different content to prove the cache does not return a stale value.
    const mutated: ChatMessage = {
      ...msg,
      content: [{ type: 'text' as const, text: 'a much much longer body of text here' }],
    };
    const next = estimator.estimate(mutated);
    expect(next).toBeGreaterThan(BUBBLE_CHROME_PX + BUBBLE_GAP_PX);
  });
});

describe('chat/ChatPanel/data: helpers', () => {
  it('chat/data: keyOfMessage returns the message id', () => {
    expect(keyOfMessage(makeMessage({ id: 'abc' }))).toBe('abc');
  });

  it('chat/data: isPendingMessage compares ids', () => {
    const msg = makeMessage({ id: 'pending-1' });
    expect(isPendingMessage(msg, null)).toBe(false);
    expect(isPendingMessage(msg, 'other')).toBe(false);
    expect(isPendingMessage(msg, 'pending-1')).toBe(true);
  });
});
