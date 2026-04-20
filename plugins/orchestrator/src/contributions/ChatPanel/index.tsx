// ChatPanel — minimal direct mount of AgentScopeRuntimeWebUI.
// Throws out qwenpaw's ChatPage wrapper entirely. We own the layout.
// Session data flows through pluginSessionApi (qwenpaw's HTTP-backed SessionApi).

import { useEffect, useMemo, useState } from 'react';
import { ConfigProvider, App } from 'antd';
import {
  AgentScopeRuntimeWebUI,
  type IAgentScopeRuntimeWebUIOptions,
} from '@agentscope-ai/chat';
import { chatCancel, chatFetch, chatReconnect } from './adapter';
import pluginSessionApi from './qwenpaw/pages/Chat/sessionApi';

// ---------------------------------------------------------------------------
// Shell dark-mode watcher
// ---------------------------------------------------------------------------

function useShellDark(): boolean {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset['theme'] === 'dark',
  );

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.dataset['theme'] === 'dark');
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => obs.disconnect();
  }, []);

  return dark;
}

// ---------------------------------------------------------------------------
// CSS custom-property resolver
// Spark expects resolved hex/rgb, not var(--…) strings.
// ---------------------------------------------------------------------------

function resolveCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export default function ChatPanel() {
  const dark = useShellDark();

  // Eagerly seed preferredChatId from localStorage on every mount — sessionApi
  // reads this on the first getSessionList() to splice the restored session to [0].
  // Covers remounts from shell maximize/restore; sessionApi clears it after first use.
  const stored =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('snapfzz.chat.session.v1')
      : null;
  if (stored) pluginSessionApi.preferredChatId = stored;

  // Re-resolve on each render so theme changes propagate via dark toggle.
  const colorPrimary = resolveCssVar('--color-info') || '#1677ff';
  const colorBgBase = resolveCssVar('--bg-default') || (dark ? '#141414' : '#ffffff');
  const colorTextBase = resolveCssVar('--text-primary') || (dark ? '#ffffff' : '#000000');

  const options = useMemo<IAgentScopeRuntimeWebUIOptions>(
    () => ({
      api: {
        baseURL: '',
        fetch: chatFetch,
        cancel: chatCancel,
        reconnect: chatReconnect,
        enableHistoryMessages: false,
      },
      session: {
        multiple: true,
        hideBuiltInSessionList: true,
        api: pluginSessionApi,
      },
      welcome: {
        greeting: 'What are we building today?',
        description: 'Ask me to read files, plan work, or call tools.',
        prompts: [
          { label: 'What can you do?', value: 'What can you do?' },
          {
            label: 'Summarise a file',
            value: 'Read and summarise the README in the workspace.',
          },
          {
            label: 'Plan a task',
            value: 'Help me plan a small coding task from scratch.',
          },
        ],
      },
      sender: {
        placeholder: 'Message the orchestrator\u2026',
        maxLength: 10_000,
        allowSpeech: false,
      },
      theme: {
        prefix: 'snapfzz-chat',
        darkMode: dark,
        colorPrimary,
        colorBgBase,
        colorTextBase,
        background: colorBgBase,
      },
    }),
    // Re-memoize whenever dark-mode or resolved colors change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dark, colorPrimary, colorBgBase, colorTextBase],
  );

  return (
    <ConfigProvider theme={{ token: { colorPrimary } }}>
      <App style={{ height: '100%' }}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-default)',
            overflow: 'hidden',
          }}
        >
          <AgentScopeRuntimeWebUI options={options} />
        </div>
      </App>
    </ConfigProvider>
  );
}
