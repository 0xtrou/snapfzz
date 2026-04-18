// Per A013/ChatPanel: thin shell over Spark's `AgentScopeRuntimeWebUI`.
//
// Spark owns: message list rendering, markdown + code blocks, reasoning/tool-call
// UI, Sender input, streaming cursor, session sidebar (localStorage-backed).
// We own: the custom fetch/cancel adapter → QwenPaw (`/api/agent/process`), the
// ModelPicker in the Sender prefix slot, and a SessionIdBridge that pushes
// Spark's current session id into the adapter so QwenPaw's AgentApp memory is
// keyed consistently with what the UI thinks is active.

import { useEffect, useMemo } from 'react';
import {
  AgentScopeRuntimeWebUI,
  useChatAnywhereSessionsState,
  type IAgentScopeRuntimeWebUIOptions,
} from '@agentscope-ai/chat';
import { ModelPicker } from '../ModelPicker';
import { chatCancel, chatFetch, setActiveSessionId } from './adapter';
import { pluginSessionApi } from './sessionStore';
import { useSparkTheme } from './useSparkTheme';

const WELCOME_PROMPTS = [
  { label: 'What can you do?', value: 'What can you do?' },
  { label: 'Summarise a file', value: 'Read and summarise the README in the workspace.' },
  { label: 'Plan a task', value: 'Help me plan a small coding task from scratch.' },
];

/**
 * Mounted inside the Spark context provider tree (via `theme.rightHeader`) so it
 * can subscribe to `ChatAnywhereSessionsContext` and forward the active session
 * id into the module-scoped adapter. Rendering `null` — this is a pure bridge.
 */
function SessionIdBridge() {
  const state = useChatAnywhereSessionsState();
  const currentSessionId = state?.currentSessionId ?? null;
  useEffect(() => {
    setActiveSessionId(currentSessionId);
  }, [currentSessionId]);
  return null;
}

export default function ChatPanel() {
  const theme = useSparkTheme();

  const options = useMemo<IAgentScopeRuntimeWebUIOptions>(
    () => ({
      api: {
        // `baseURL` is unused — we supply a custom `fetch` that resolves our
        // plugin runtime URL via Rust + injects the `X-Agent-Id` header.
        baseURL: '',
        fetch: chatFetch,
        cancel: chatCancel,
        // History is keyed server-side by session_id in QwenPaw's AgentApp, so
        // the client sends only the newest message per turn.
        enableHistoryMessages: false,
      },
      session: {
        // Multi-session + our own plugin-storage-backed `session.api` (not
        // Spark's shared localStorage default). Sessions live under
        // `ctx.storage` — isolated, plugin-scoped, survive reloads. Spark's
        // built-in sidebar is hidden; a native sessions panel can be built
        // later using `useChatAnywhereSessions()` to drive the same store.
        multiple: true,
        hideBuiltInSessionList: true,
        api: pluginSessionApi,
      },
      welcome: {
        greeting: 'What are we building today?',
        description: 'Ask me to read files, plan work, or call tools.',
        prompts: WELCOME_PROMPTS,
      },
      sender: {
        placeholder: 'Message the orchestrator…',
        maxLength: 10_000,
        // ModelPicker chip lives in the Sender's bottom action bar so the user
        // can switch the underlying LiteLLM combo target without leaving the chat.
        prefix: <ModelPicker />,
      },
      theme: {
        prefix: 'snapfzz-chat',
        // Feed Spark's AntD ConfigProvider from our design tokens so dark/light
        // + the accent blue match the rest of the app. Re-reads on <html>
        // `data-theme` flips via `useSparkTheme`'s MutationObserver.
        darkMode: theme.darkMode,
        colorPrimary: theme.colorPrimary,
        colorBgBase: theme.colorBgBase,
        colorTextBase: theme.colorTextBase,
        background: theme.background,
        // SessionIdBridge still needs to live inside Spark's context tree so
        // `useChatAnywhereSessionsState` resolves — the rightHeader slot is the
        // smallest always-mounted spot. The bridge renders `null`, so no
        // visible chrome is added.
        rightHeader: <SessionIdBridge />,
      },
    }),
    [theme.darkMode, theme.colorPrimary, theme.colorBgBase, theme.colorTextBase, theme.background],
  );

  return (
    <div style={{ height: '100%', background: 'var(--bg-default)' }}>
      <AgentScopeRuntimeWebUI options={options} />
    </div>
  );
}
