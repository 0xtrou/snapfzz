// Thin re-export of Spark's session hooks under an orchestrator-flavoured name.
// Use this from any native sessions UI (sidebar, picker, command palette, …)
// so callers don't have to import from `@agentscope-ai/chat` directly and
// are insulated from Spark's package path if we swap the implementation later.
//
// Both hooks must be called from inside the `<AgentScopeRuntimeWebUI>` tree so
// they can resolve the `ChatAnywhereSessionsContext` provider.

import {
  useChatAnywhereSessions,
  useChatAnywhereSessionsState,
} from '@agentscope-ai/chat';

/**
 * Returns the reactive session state (list + current id). Safe to read from
 * rendering — triggers re-renders when sessions change.
 */
export const useOrchestratorSessionsState = useChatAnywhereSessionsState;

/**
 * Returns imperative session actions:
 *   - `createSession({ name? })`                       → creates + switches to it
 *   - `changeCurrentSessionId(id)`                     → switches active session
 *   - `removeSession({ id })`                          → deletes
 *   - `updateSession({ id, name?, messages? })`        → renames / edits
 *   - `getCurrentSessionId()` / `getSessions()`        → non-reactive getters
 */
export const useOrchestratorSessions = useChatAnywhereSessions;
