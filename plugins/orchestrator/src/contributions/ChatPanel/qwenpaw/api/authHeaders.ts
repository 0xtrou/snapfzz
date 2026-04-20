// Ported from qwenpaw/console/src/api/authHeaders.ts — adapted for Snapfzz plugin context.
// SURGICAL EDIT (Phase 2a): No Bearer token in plugin context; X-Agent-Id from sessionStorage with 'default' fallback.

/** Authorization + X-Agent-Id for API requests. Caller sets Content-Type when needed. */
export function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Agent-Id': 'default',
  };
  try {
    const agentStorage = sessionStorage.getItem("qwenpaw-agent-storage");
    if (agentStorage) {
      const parsed = JSON.parse(agentStorage);
      const selectedAgent = parsed?.state?.selectedAgent;
      if (selectedAgent) {
        headers["X-Agent-Id"] = selectedAgent;
      }
    }
  } catch {
    // ignore — default stays
  }
  return headers;
}
