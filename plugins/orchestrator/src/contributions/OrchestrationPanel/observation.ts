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
const CHAT_IDLE_POLL_MS = 30000;

// localStorage keys. Versioned so schema bumps don't surface stale ids.
const LS_AGENT_KEY = 'snapfzz.orch.agent.v1';
const LS_CHAT_KEY = 'snapfzz.orch.chat.v1';

function lsGet(key: string): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; }
}
function lsSet(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* quota / privacy-mode — silent */ }
}

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
  // Hydrate last selection from localStorage so a reload lands the user back
  // on the same sub-agent + chat, and the 1s chat-history poll can rejoin a
  // streaming task already in flight on the backend.
  const [selectedAgentId, setSelectedAgentIdState] = useState<string | null>(() => lsGet(LS_AGENT_KEY));
  const [selectedChatId, setSelectedChatIdState] = useState<string | null>(() => lsGet(LS_CHAT_KEY));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setSelectedAgentId = useCallback((id: string | null) => {
    setSelectedAgentIdState(id);
    lsSet(LS_AGENT_KEY, id);
  }, []);
  const setSelectedChatId = useCallback((id: string | null) => {
    setSelectedChatIdState(id);
    lsSet(LS_CHAT_KEY, id);
  }, []);

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

  // ─── Auto-select newest sub-agent, reconciling with hydrated selection ───
  // Runs only once agents have loaded. If the persisted agent still exists we
  // keep it; otherwise we fall back to the newest agent so the panel is never
  // stuck on a ghost selection.
  useEffect(() => {
    if (agents.length === 0) return;
    const current = agents.find((a) => a.id === selectedAgentId);
    if (!current) setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId, setSelectedAgentId]);

  // ─── Auto-select newest chat — but only once chats for this agent load ──
  // Before the first chat-list fetch completes, `chatsByAgent[id]` is undefined.
  // We must NOT clobber the hydrated selectedChatId during that window, or a
  // reload would discard the persisted chat id between restore and first poll.
  useEffect(() => {
    if (!selectedAgentId) { setSelectedChatId(null); return; }
    const chats = chatsByAgent[selectedAgentId];
    if (chats === undefined) return; // not loaded yet — keep the hydrated id
    const current = chats.find((c) => c.id === selectedChatId);
    if (!current) setSelectedChatId(pickLatestChatId(chats));
  }, [selectedAgentId, chatsByAgent, selectedChatId, setSelectedChatId]);

  // ─── Fetch chat history when selection changes + re-poll while running ──
  //
  // Fast poll (1 Hz) while the backend reports `status: 'running'` or while
  // messages are still arriving. Once status flips to idle AND the last-seen
  // signature (count + last id) has been stable for two consecutive ticks,
  // we slow to CHAT_IDLE_POLL_MS (30 s) so the panel only has to catch the
  // next run starting, not stream every JSON frame forever.
  //
  // The signature diff also short-circuits redundant setTurns calls — re-
  // rendering PretextList on every tick while nothing changed was the cause
  // of the visible flicker on long timelines.
  useEffect(() => {
    if (!baseUrl || !selectedAgentId || !selectedChatId) { setTurns([]); return; }
    const ctrl = new AbortController();
    let alive = true;
    let timer: number | null = null;
    let lastSig = '';
    let stableIdleTicks = 0;
    let currentIntervalMs = CHAT_POLL_MS;

    const signatureOf = (msgs: readonly { id?: string }[] | undefined): string => {
      if (!msgs || msgs.length === 0) return '0:';
      return `${msgs.length}:${msgs[msgs.length - 1]?.id ?? ''}`;
    };

    const scheduleNext = (ms: number) => {
      if (!alive) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void fetchOnce(), ms);
    };

    const fetchOnce = async () => {
      try {
        const res = await fetchJson<ApiChatHistory>(
          `${baseUrl}/api/agents/${encodeURIComponent(selectedAgentId)}/chats/${encodeURIComponent(selectedChatId)}`,
          ctrl.signal,
        );
        if (!alive || !mountedRef.current) return;

        const sig = signatureOf(res.messages);
        const changed = sig !== lastSig;
        lastSig = sig;
        const status = res.status ?? 'idle';

        // Only commit new turns when content actually changed. Spark-like
        // frames arrive 10x/sec during a stream; we coalesce them here.
        if (changed) setTurns(messagesToTurns(res.messages ?? [], selectedAgentId));

        // Adaptive interval: fast while running or content is changing;
        // slow to a heartbeat when the chat has been idle + stable for a
        // couple of ticks so a dormant chat doesn't hammer the backend.
        if (status === 'running' || changed) {
          stableIdleTicks = 0;
          currentIntervalMs = CHAT_POLL_MS;
        } else {
          stableIdleTicks += 1;
          if (stableIdleTicks >= 2) currentIntervalMs = CHAT_IDLE_POLL_MS;
        }
        scheduleNext(currentIntervalMs);
      } catch (e) {
        if (!alive || !mountedRef.current) return;
        if ((e as DOMException)?.name !== 'AbortError') {
          setError(e instanceof Error ? e.message : String(e));
          scheduleNext(currentIntervalMs);
        }
      }
    };

    void fetchOnce();

    return () => {
      alive = false;
      ctrl.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
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
