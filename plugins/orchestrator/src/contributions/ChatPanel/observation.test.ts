// Spec: chat/SPEC.md
// Section: ChatPanel observation (read-only view of chat runtime)
// Verifies: projection of useChat snapshot into ChatPanelObservation shape + isEmpty derivation.

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const useChatMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/use-chat', () => ({ useChat: useChatMock }));

import type { ChatMessage } from '../../types';
import { useChatPanelObservation } from './observation';

function snapshot(overrides: Partial<ReturnType<typeof useChatMock>> = {}) {
  return {
    messages: [] as ChatMessage[],
    isStreaming: false,
    pendingMessageId: null,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
    connectionStatus: 'connected' as const,
    tokenCount: 0,
    sessionId: 's',
    ...overrides,
  };
}

describe('chat/ChatPanel/observation: useChatPanelObservation', () => {
  it('chat/observation: reports isEmpty=true when no messages', () => {
    useChatMock.mockReturnValue(snapshot());
    const { result } = renderHook(() => useChatPanelObservation());

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.pendingMessageId).toBeNull();
  });

  it('chat/observation: reports isEmpty=false when messages exist', () => {
    const msg: ChatMessage = {
      id: 'm1',
      name: 'User',
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
      metadata: {},
      timestamp: '2026-04-17T10:00:00Z',
      timestampLabel: '10:00',
      groupedWithPrevious: false,
    };
    useChatMock.mockReturnValue(snapshot({ messages: [msg] }));

    const { result } = renderHook(() => useChatPanelObservation());
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.messages).toHaveLength(1);
  });

  it('chat/observation: surfaces the pending message id + streaming flag', () => {
    useChatMock.mockReturnValue(snapshot({ isStreaming: true, pendingMessageId: 'p1' }));
    const { result } = renderHook(() => useChatPanelObservation());

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.pendingMessageId).toBe('p1');
  });
});
