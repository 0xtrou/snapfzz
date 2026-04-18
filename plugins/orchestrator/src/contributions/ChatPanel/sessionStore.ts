// Plugin-storage backed implementation of `IAgentScopeRuntimeWebUISessionAPI`.
//
// Spark calls our 5 ops to manage the conversation list; we persist them under
// `ctx.storage` — which is plugin-scoped, isolated from other plugins, and
// survives plugin reloads. Replaces Spark's `defaultSessionApi` which uses a
// shared `localStorage` bucket we don't control.
//
// Messages are stored inline with each session record, same shape Spark hands
// us. That keeps the whole conversation round-trip local — no backend sync
// needed until we add a session-history HTTP endpoint.

import type {
  IAgentScopeRuntimeWebUISession,
  IAgentScopeRuntimeWebUISessionAPI,
} from '@agentscope-ai/chat';
import { getPluginContext } from '../runtime';

const STORAGE_KEY = 'chat.sessions';

function newSessionId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(
  session: Partial<IAgentScopeRuntimeWebUISession>,
  fallbackId?: string,
): IAgentScopeRuntimeWebUISession {
  return {
    id: session.id || fallbackId || newSessionId(),
    name: session.name || '',
    messages: session.messages || [],
    generating: session.generating,
  };
}

async function readList(): Promise<IAgentScopeRuntimeWebUISession[]> {
  const ctx = getPluginContext();
  if (!ctx) return [];
  const raw = await ctx.storage.get<IAgentScopeRuntimeWebUISession[]>(STORAGE_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function writeList(list: IAgentScopeRuntimeWebUISession[]): Promise<void> {
  const ctx = getPluginContext();
  if (!ctx) return;
  await ctx.storage.set(STORAGE_KEY, list);
}

export const pluginSessionApi: Required<IAgentScopeRuntimeWebUISessionAPI> = {
  async getSessionList() {
    const list = await readList();
    if (list.length === 0) {
      // Spark expects at least one session when multi-session is on — mirror
      // defaultSessionApi's behaviour of auto-seeding a fresh one.
      const seed = [normalize({ name: 'New chat' })];
      await writeList(seed);
      return [...seed];
    }
    return [...list];
  },

  async getSession(sessionId: string) {
    const list = await readList();
    const match = list.find((s) => s.id === sessionId);
    if (!match) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return match;
  },

  async createSession(session) {
    const list = await readList();
    const next = normalize(session);
    list.unshift(next);
    await writeList(list);
    return [...list];
  },

  async updateSession(session) {
    const list = await readList();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx === -1) {
      // Spark sometimes calls updateSession for a new one — match defaultSessionApi.
      const next = normalize(session);
      list.unshift(next);
      await writeList(list);
      return [...list];
    }
    list[idx] = normalize({ ...list[idx], ...session }, list[idx].id);
    await writeList(list);
    return [...list];
  },

  async removeSession(session) {
    const list = await readList();
    const next = list.filter((s) => s.id !== session.id);
    await writeList(next);
    return next;
  },
};
