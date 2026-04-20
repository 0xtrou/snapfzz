// Pure-TS tests for OrchestrationPanel data transforms. These run at native
// TypeScript speed — no React, no DOM.
import { describe, it, expect } from 'vitest';
import {
  filterInterAgentChats,
  filterSubAgents,
  formatClock,
  messagesToTurns,
  ORCHESTRATOR_AGENT_ID,
  ORCHESTRATOR_JUNIOR_LABEL,
  pickLatestChatId,
  sortChatsNewestFirst,
  statusDotColor,
  toSubAgentRow,
} from './data';
import type { ApiAgent, ApiChatSpec, ApiMessage } from './contracts';

// ─── filterSubAgents ─────────────────────────────────────────────────────────

describe('A013/OrchestrationPanel/data: filterSubAgents', () => {
  const base: ApiAgent = {
    id: 'x', name: '', workspace_dir: '', enabled: true,
  };

  it('keeps the orchestrator (it becomes Orchestrator-Junior in the row)', () => {
    const input: ApiAgent[] = [
      { ...base, id: ORCHESTRATOR_AGENT_ID, name: 'Orchestrator' },
      { ...base, id: 'glm_research', name: 'GLM Research' },
    ];
    const out = filterSubAgents(input);
    expect(out.map((a) => a.id)).toEqual([ORCHESTRATOR_AGENT_ID, 'glm_research']);
  });

  it('drops disabled agents', () => {
    const input: ApiAgent[] = [
      { ...base, id: 'glm_research', enabled: true },
      { ...base, id: 'docs', enabled: false },
    ];
    expect(filterSubAgents(input).map((a) => a.id)).toEqual(['glm_research']);
  });

  it('returns an empty array for an empty input', () => {
    expect(filterSubAgents([])).toEqual([]);
  });
});

// ─── toSubAgentRow ──────────────────────────────────────────────────────────

describe('A013/OrchestrationPanel/data: toSubAgentRow', () => {
  const agent: ApiAgent = {
    id: 'glm_research',
    name: 'GLM Research',
    description: 'desc',
    workspace_dir: '/x',
    enabled: true,
  };

  it('idle when all chats idle', () => {
    const row = toSubAgentRow(agent, [
      { id: 'c1', session_id: 's1', status: 'idle' },
    ]);
    expect(row.status).toBe('idle');
    expect(row.turnCount).toBe(1);
  });

  it('working when any chat is running', () => {
    const row = toSubAgentRow(agent, [
      { id: 'c1', session_id: 's1', status: 'idle' },
      { id: 'c2', session_id: 's2', status: 'running' },
    ]);
    expect(row.status).toBe('working');
    expect(row.turnCount).toBe(2);
  });

  it('lastActivityAt picks the most recent created_at', () => {
    const row = toSubAgentRow(agent, [
      { id: 'c1', session_id: 's1', created_at: '2026-04-18T20:00:00Z' },
      { id: 'c2', session_id: 's2', created_at: '2026-04-18T20:05:00Z' },
    ]);
    expect(row.lastActivityAt).toBe('2026-04-18T20:05:00Z');
  });

  it('falls back to null when no chat has a timestamp', () => {
    const row = toSubAgentRow(agent, [{ id: 'c1', session_id: 's1' }]);
    expect(row.lastActivityAt).toBeNull();
  });

  it('name falls back to id when agent.name is empty', () => {
    const row = toSubAgentRow({ ...agent, name: '' }, []);
    expect(row.name).toBe('glm_research');
  });

  it('relabels the orchestrator as "Orchestrator-Junior"', () => {
    const row = toSubAgentRow({
      id: ORCHESTRATOR_AGENT_ID,
      name: 'Orchestrator',
      description: 'outer chat',
      workspace_dir: '/x',
      enabled: true,
    }, []);
    expect(row.name).toBe(ORCHESTRATOR_JUNIOR_LABEL);
    expect(row.description).toBe('Background tasks the orchestrator delegated to itself');
  });
});

// ─── messagesToTurns ────────────────────────────────────────────────────────

describe('A013/OrchestrationPanel/data: messagesToTurns', () => {
  it('attributes user-role messages to the orchestrator', () => {
    const messages: ApiMessage[] = [{
      id: 'm1',
      type: 'message',
      role: 'user',
      content: [{ type: 'text', text: 'Find the latest GLM flagship' }],
    }];
    const turns = messagesToTurns(messages, 'glm_research');
    expect(turns).toHaveLength(1);
    expect(turns[0].agentId).toBe(ORCHESTRATOR_AGENT_ID);
    expect(turns[0].kind).toBe('text');
    expect(turns[0].text).toBe('Find the latest GLM flagship');
  });

  it('attributes assistant-role messages to the sub-agent', () => {
    const messages: ApiMessage[] = [{
      id: 'm2',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'GLM-5.1' }],
    }];
    const turns = messagesToTurns(messages, 'glm_research');
    expect(turns[0].agentId).toBe('glm_research');
  });

  it('classifies reasoning messages as reasoning kind', () => {
    const messages: ApiMessage[] = [{
      id: 'm3',
      type: 'reasoning',
      role: 'assistant',
      content: [{ type: 'text', text: 'the user asks for…' }],
    }];
    expect(messagesToTurns(messages, 'glm_research')[0].kind).toBe('reasoning');
  });

  it('classifies plugin_call as tool_call and plugin_call_output as tool_result', () => {
    const messages: ApiMessage[] = [
      { id: 'c1', type: 'plugin_call', role: 'assistant', content: [{ type: 'data', data: { name: 'grep' } }] },
      { id: 'c2', type: 'plugin_call_output', role: 'tool', content: [{ type: 'data', data: { result: 'ok' } }] },
    ];
    const turns = messagesToTurns(messages, 'glm_research');
    expect(turns.map((t) => t.kind)).toEqual(['tool_call', 'tool_result']);
  });

  it('explodes multi-block content into multiple turns', () => {
    const messages: ApiMessage[] = [{
      id: 'm4',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'text', text: 'Here is the file' },
        { type: 'file', file_url: 'x.pdf', file_name: 'x.pdf' },
      ],
    }];
    const turns = messagesToTurns(messages, 'glm_research');
    expect(turns).toHaveLength(2);
    expect(turns[1].kind).toBe('media');
  });
});

// ─── filterInterAgentChats ──────────────────────────────────────────────────

describe('A013/OrchestrationPanel/data: filterInterAgentChats', () => {
  it('keeps chats whose session_id contains `:to:` (inter-agent marker)', () => {
    const out = filterInterAgentChats([
      { id: 'c1', session_id: 'default:to:glm_research:1776:abc' },
      { id: 'c2', session_id: 'bdad1168-6516-497d-afa5-d1571b1c2376' }, // human
      { id: 'c3', session_id: 'default:to:default:1776:xyz' },            // self-delegation
    ]);
    expect(out.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('drops chats with a missing session_id', () => {
    const out = filterInterAgentChats([
      { id: 'c1', session_id: undefined as unknown as string },
      { id: 'c2', session_id: 'a:to:b:0:x' },
    ]);
    expect(out.map((c) => c.id)).toEqual(['c2']);
  });
});

// ─── sortChatsNewestFirst + pickLatestChatId ────────────────────────────────

describe('A013/OrchestrationPanel/data: chat ordering', () => {
  const chats: ApiChatSpec[] = [
    { id: 'a', session_id: 'sa', created_at: '2026-04-18T20:00:00Z' },
    { id: 'b', session_id: 'sb', created_at: '2026-04-18T20:05:00Z' },
    { id: 'c', session_id: 'sc' },
  ];

  it('sortChatsNewestFirst puts the newest created_at first', () => {
    const out = sortChatsNewestFirst(chats).map((c) => c.id);
    expect(out[0]).toBe('b');
  });

  it('pickLatestChatId returns null for an empty list', () => {
    expect(pickLatestChatId([])).toBeNull();
  });

  it('pickLatestChatId returns the first of sortChatsNewestFirst', () => {
    expect(pickLatestChatId(chats)).toBe('b');
  });
});

// ─── formatClock ────────────────────────────────────────────────────────────

describe('A013/OrchestrationPanel/data: formatClock', () => {
  it('returns — for null', () => expect(formatClock(null)).toBe('—'));
  it('returns — for invalid iso', () => expect(formatClock('not-a-date')).toBe('—'));
  it('returns HH:MM:SS for a valid iso', () => {
    // Just check it's non-empty and not the fallback — locale-dependent format.
    const out = formatClock('2026-04-18T20:41:02Z');
    expect(out).not.toBe('—');
    expect(out.length).toBeGreaterThan(3);
  });
});

// ─── statusDotColor ─────────────────────────────────────────────────────────

describe('A013/OrchestrationPanel/data: statusDotColor', () => {
  it('working → color-info', () => expect(statusDotColor('working')).toContain('color-info'));
  it('error   → color-error', () => expect(statusDotColor('error')).toContain('color-error'));
  it('idle    → text-muted',  () => expect(statusDotColor('idle')).toContain('text-muted'));
});
