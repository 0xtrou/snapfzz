// Per A013/OrchestrationPanel + feedback/five-layer: data layer — pure TS.
// Every function is deterministic + side-effect-free for fast vitest runs.

import type {
  ApiAgent,
  ApiChatSpec,
  ApiContentBlock,
  ApiMessage,
  ConversationTurn,
  SubAgentRow,
  SubAgentStatus,
} from './contracts';

/** The orchestrator's own id — never shown in the sub-agent list. */
export const ORCHESTRATOR_AGENT_ID = 'default';

// ─── Sub-agent list ──────────────────────────────────────────────────────────

/**
 * Drop the orchestrator from the list so the panel only shows spawned
 * specialists. Agents with `enabled === false` are also excluded — they
 * can't participate in delegation.
 */
export function filterSubAgents(agents: readonly ApiAgent[]): readonly ApiAgent[] {
  return agents.filter((a) => a.id !== ORCHESTRATOR_AGENT_ID && a.enabled !== false);
}

/**
 * Turn an API agent + its chat list into a UI row. `status` is derived:
 *   • any chat.status === 'running'  → 'working'
 *   • else                           → 'idle'
 * ('error' state will come from a future SSE event channel — for now `idle`
 * is the resting state.)
 */
export function toSubAgentRow(agent: ApiAgent, chats: readonly ApiChatSpec[]): SubAgentRow {
  const status: SubAgentStatus = chats.some((c) => c.status === 'running') ? 'working' : 'idle';
  const lastActivityAt = chats
    .map((c) => c.created_at ?? null)
    .filter((ts): ts is string => ts !== null)
    .sort()
    .reverse()[0] ?? null;
  return {
    id: agent.id,
    name: agent.name || agent.id,
    description: agent.description,
    status,
    turnCount: chats.length,
    lastActivityAt,
  };
}

// ─── Chat → ConversationTurn[] flattening ────────────────────────────────────

/**
 * Flatten a QwenPaw chat history into renderable UI turns. Each content
 * block becomes its own turn so layout doesn't have to branch on content
 * kind. Preserves chronological order.
 *
 * `orchestratorId` labels which turns are the orchestrator-side of the
 * delegation (role === 'user' on sub-agent's side = orchestrator inbound).
 */
export function messagesToTurns(
  messages: readonly ApiMessage[],
  subAgentId: string,
  orchestratorId: string = ORCHESTRATOR_AGENT_ID,
): readonly ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const msg of messages) {
    // role=user on a sub-agent's session is the orchestrator's inbound delegation;
    // role=assistant/tool is the sub-agent's own output.
    const attributedAgent = msg.role === 'user' ? orchestratorId : subAgentId;
    msg.content.forEach((block, idx) => {
      turns.push({
        id: `${msg.id ?? 'anon'}-${idx}`,
        agentId: attributedAgent,
        role: msg.role,
        kind: classifyBlock(msg.type, block),
        text: blockToText(block),
        ts: readTimestamp(msg),
        status: msg.status,
      });
    });
  }
  return turns;
}

function classifyBlock(msgType: string, block: ApiContentBlock): ConversationTurn['kind'] {
  if (msgType === 'reasoning') return 'reasoning';
  if (msgType === 'plugin_call') return 'tool_call';
  if (msgType === 'plugin_call_output') return 'tool_result';
  const bt = (block as { type: string }).type;
  if (bt === 'image' || bt === 'audio' || bt === 'video' || bt === 'file') return 'media';
  return 'text';
}

function blockToText(block: ApiContentBlock): string {
  const typed = block as { type: string; [k: string]: unknown };
  if (typed.type === 'text' && typeof typed.text === 'string') return typed.text;
  if (typed.type === 'image' && typeof typed.image_url === 'string') return `[image] ${typed.image_url}`;
  if (typed.type === 'video' && typeof typed.video_url === 'string') return `[video] ${typed.video_url}`;
  if (typed.type === 'audio' && typeof typed.audio_url === 'string') return `[audio] ${typed.audio_url}`;
  if (typed.type === 'file') return `[file] ${String(typed.file_name ?? typed.file_url ?? '')}`;
  if (typed.type === 'data' && typed.data) {
    try { return '```json\n' + JSON.stringify(typed.data, null, 2) + '\n```'; } catch { return '[data]'; }
  }
  // Unknown shape — fall back to fenced JSON so the user sees something useful.
  try { return '```json\n' + JSON.stringify(block, null, 2) + '\n```'; } catch { return '[unknown]'; }
}

function readTimestamp(msg: ApiMessage): string | null {
  const md = msg.metadata as Record<string, unknown> | undefined;
  if (!md) return null;
  const candidates = [md.timestamp, md.ts, md.created_at];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

// ─── Chat picker ─────────────────────────────────────────────────────────────

/** Sort chats newest-first by `created_at` (falling back to `session_id`). */
export function sortChatsNewestFirst(chats: readonly ApiChatSpec[]): readonly ApiChatSpec[] {
  return [...chats].sort((a, b) => {
    const at = a.created_at ?? '';
    const bt = b.created_at ?? '';
    if (at !== bt) return bt.localeCompare(at);
    return (b.session_id ?? '').localeCompare(a.session_id ?? '');
  });
}

export function pickLatestChatId(chats: readonly ApiChatSpec[]): string | null {
  return sortChatsNewestFirst(chats)[0]?.id ?? null;
}

// ─── Presentation helpers ───────────────────────────────────────────────────

/** HH:MM:SS for timeline rows; returns '—' for missing/invalid. */
export function formatClock(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** CSS custom property lookup by status; caller can swap in a theme override. */
export function statusDotColor(status: SubAgentStatus): string {
  switch (status) {
    case 'working': return 'var(--color-info)';
    case 'error':   return 'var(--color-error)';
    case 'idle':
    default:        return 'var(--text-muted)';
  }
}
