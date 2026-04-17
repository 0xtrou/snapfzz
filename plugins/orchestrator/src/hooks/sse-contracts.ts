// Per A020/PhaseD: Contract types for AgentScope SSE envelopes coming from the
// Python runtime's /api/agent/process endpoint.
//
// Sources:
//   agentscope-runtime/src/agentscope_runtime/engine/schemas/agent_schemas.py
//     MessageType (lines 18-44), Message (line 480), Content subtypes.
//   Verified via: npx gitnexus context --repo agentscope-runtime MessageType

// ── MessageType values (as emitted in SSE data fields) ────────────────────────

export type AgentMessageType =
  | 'message'
  | 'function_call'
  | 'function_call_output'
  | 'plugin_call'
  | 'plugin_call_output'
  | 'component_call'
  | 'component_call_output'
  | 'mcp_list_tools'
  | 'mcp_approval_request'
  | 'mcp_call'
  | 'mcp_approval_response'
  | 'mcp_call_output'
  | 'reasoning'
  | 'heartbeat'
  | 'error'
  | 'a2ui_response'
  | 'a2ui_action';

// ── Content sub-types ─────────────────────────────────────────────────────────

export interface AgentTextContent {
  type: 'text';
  text?: string | null;
  delta?: boolean | null;
  index?: number | null;
}

export interface AgentDataContent {
  type: 'data';
  /** For function_call: FunctionCall shape { call_id, name, arguments }
   *  For function_call_output: FunctionCallOutput shape { call_id, name, output }
   */
  data?: Record<string, unknown> | null;
  delta?: boolean | null;
  index?: number | null;
}

export interface AgentGenericContent {
  type: string;
  [key: string]: unknown;
}

export type AgentContent = AgentTextContent | AgentDataContent | AgentGenericContent;

// ── SSE envelope (one `data: {...}\n\n` frame) ────────────────────────────────

export interface AgentSseEnvelope {
  /** Message type discriminator — maps to AgentMessageType. */
  type: string;
  /** Role of the message author ('assistant', 'user', 'system', 'tool'). */
  role?: string | null;
  /** Message unique id — stable across delta frames for the same message. */
  id?: string | null;
  /** Content parts array. */
  content?: AgentContent[] | null;
  /** Status of the message ('in_progress', 'completed', 'failed', etc.). */
  status?: string | null;
  /** Usage dict — present on the final completed message frame. */
  usage?: Record<string, number> | null;
  /** Error details when type === 'error'. */
  error?: { code?: string; message?: string } | string | null;
  /** Catch-all for extra fields we don't parse. */
  [key: string]: unknown;
}

// ── AgentRequest body ─────────────────────────────────────────────────────────
// Per agentscope-runtime/schemas/agent_schemas.py:751 — AgentRequest.
// Only the fields we send; extra fields pass through (model_config extra='allow').

export interface AgentRequestMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  type: 'message';
  content: Array<{ type: 'text'; text: string }>;
}

export interface AgentRequest {
  /** Full conversation history including the new user message. */
  input: AgentRequestMessage[];
  /** Client-generated session id — scoped per conversation. */
  session_id: string;
  /** Always true — we stream. */
  stream: true;
  /** Omit model — combo routing is Rust's job (llm_update_orchestrator_combo). */
}
