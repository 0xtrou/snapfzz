// Per A013/OrchestrationPanel + feedback/five-layer: observation layer —
// reads external state via polling. Produces `OrchestrationObservation`.
//
// Infrastructure (no UI here):
//   • Resolve our plugin runtime URL via `get_plugin_runtime_url` once.
//   • 2s poll `GET /api/agents` → sub-agent rows.
//   • 2s poll `GET /api/agents/{id}/chats` for the currently-selected agent.
//   • On chat change: `GET /api/agents/{id}/chats/{chat_id}` once (re-poll
//     at 1s while chat status === 'running').
//
// All fetches are cancelable — unmount clears timers + aborts in-flight.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPluginContext } from '../runtime';
import {
  filterInterAgentChats,
  filterSubAgents,
  messagesToTurns,
  pickLatestChatId,
  sortChatsNewestFirst,
  toSubAgentRow,
} from './data';
import type {
  ApiAgentListResponse,
  ApiChatHistory,
  ApiChatSpec,
  ConversationTurn,
  OrchestrationObservation,
  SubAgentRow,
} from './contracts';

const AGENTS_POLL_MS = 2000;
const CHAT_POLL_MS = 1000;

/** Cached once per mount — avoids a Rust round-trip per fetch. */
function useRuntimeBaseUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ctx = getPluginContext();
    if (!ctx) return;
    ctx.rust
      .invoke<string>('get_plugin_runtime_url', { runtimeId: 'chat.orchestrator' })
      .then((resolved) => { if (!cancelled) setUrl(resolved); })
      .catch(() => { /* panel stays in loading state; error surfaced via observation */ });
    return () => { cancelled = true; };
  }, []);
  return url;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function useOrchestrationObservation(): OrchestrationObservation & {
  readonly setSelectedAgentId: (id: string) => void;
  readonly setSelectedChatId: (chatId: string) => void;
  readonly refresh: () => void;
} {
  const baseUrl = useRuntimeBaseUrl();

  const [agents, setAgents] = useState<readonly SubAgentRow[]>([]);
  const [chatsByAgent, setChatsByAgent] = useState<Readonly<Record<string, readonly ApiChatSpec[]>>>({});
  const [turns, setTurns] = useState<readonly ConversationTurn[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatStatus, setChatStatus] = useState<'idle' | 'running'>('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ─── Agent list + per-agent chat list polling ─────────────────────────────
  const pollAgents = useCallback(async (signal: AbortSignal) => {
    if (!baseUrl) return;
    try {
      const res = await fetchJson<ApiAgentListResponse>(`${baseUrl}/api/agents`, signal);
      const subs = filterSubAgents(res.agents ?? []);

      // Fetch chat lists in parallel — latency dominated by slowest, not sum.
      // Only keep inter-agent chats (session_id contains `:to:`) so the panel
      // doesn't mix in the user's main human↔orchestrator chats.
      const entries = await Promise.all(
        subs.map(async (a) => {
          try {
            const chats = await fetchJson<readonly ApiChatSpec[]>(
              `${baseUrl}/api/agents/${encodeURIComponent(a.id)}/chats`, signal,
            );
            return [a.id, sortChatsNewestFirst(filterInterAgentChats(chats))] as const;
          } catch {
            return [a.id, [] as readonly ApiChatSpec[]] as const;
          }
        }),
      );
      if (!mountedRef.current) return;

      // After filtering to inter-agent chats only, an agent with zero chats
      // has no orchestration to show — drop it so the list stays focused.
      const nextChatsByAgent: Record<string, readonly ApiChatSpec[]> = {};
      const rows = subs
        .map((a) => {
          const chats = entries.find(([id]) => id === a.id)?.[1] ?? [];
          nextChatsByAgent[a.id] = chats;
          return { agent: a, chats };
        })
        .filter(({ chats }) => chats.length > 0)
        .map(({ agent, chats }) => toSubAgentRow(agent, chats));

      setAgents(rows);
      setChatsByAgent(nextChatsByAgent);
      setError(null);
    } catch (e) {
      if (!mountedRef.current || (e as DOMException)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!baseUrl) return;
    const ctrl = new AbortController();
    void pollAgents(ctrl.signal);
    const t = window.setInterval(() => void pollAgents(ctrl.signal), AGENTS_POLL_MS);
    return () => { ctrl.abort(); window.clearInterval(t); };
  }, [baseUrl, pollAgents]);

  // ─── Auto-select newest sub-agent when none picked yet ───────────────────
  useEffect(() => {
    if (selectedAgentId || agents.length === 0) return;
    setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId]);

  // ─── Auto-select newest chat for the selected agent ──────────────────────
  useEffect(() => {
    if (!selectedAgentId) { setSelectedChatId(null); return; }
    const chats = chatsByAgent[selectedAgentId] ?? [];
    const current = chats.find((c) => c.id === selectedChatId);
    if (!current) setSelectedChatId(pickLatestChatId(chats));
  }, [selectedAgentId, chatsByAgent, selectedChatId]);

  // ─── Fetch chat history when selection changes + always re-poll ──────────
  //
  // Poll unconditionally every CHAT_POLL_MS while the panel has a selected
  // chat. Original implementation keyed off `chat_status === 'running'`, but
  // fresh chats start `idle` with 0 messages and only flip to `running` when
  // the task actually picks up — so we'd never catch new reasoning/tool
  // frames. Unconditional polling at 1Hz is cheap (one JSON fetch) and gives
  // a near-live feed of the sub-agent's work without an SSE endpoint.
  useEffect(() => {
    if (!baseUrl || !selectedAgentId || !selectedChatId) { setTurns([]); return; }
    const ctrl = new AbortController();
    let alive = true;

    const fetchOnce = async () => {
      try {
        const res = await fetchJson<ApiChatHistory>(
          `${baseUrl}/api/agents/${encodeURIComponent(selectedAgentId)}/chats/${encodeURIComponent(selectedChatId)}`,
          ctrl.signal,
        );
        if (!alive || !mountedRef.current) return;
        setTurns(messagesToTurns(res.messages ?? [], selectedAgentId));
        setChatStatus(res.status ?? 'idle');
      } catch (e) {
        if (!alive || !mountedRef.current) return;
        if ((e as DOMException)?.name !== 'AbortError') {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    void fetchOnce();
    const t = window.setInterval(() => void fetchOnce(), CHAT_POLL_MS);

    return () => { alive = false; ctrl.abort(); window.clearInterval(t); };
  }, [baseUrl, selectedAgentId, selectedChatId]);

  // ─── Derived view ─────────────────────────────────────────────────────────
  const observation = useMemo<OrchestrationObservation>(() => ({
    subAgents: agents,
    selectedAgentId,
    selectedAgentChats: selectedAgentId ? (chatsByAgent[selectedAgentId] ?? []) : [],
    selectedChatId,
    conversation: turns,
    loading,
    error,
  }), [agents, selectedAgentId, chatsByAgent, selectedChatId, turns, loading, error]);

  const refresh = useCallback(() => {
    const ctrl = new AbortController();
    void pollAgents(ctrl.signal);
  }, [pollAgents]);

  return {
    ...observation,
    setSelectedAgentId,
    setSelectedChatId,
    refresh,
  };
}
