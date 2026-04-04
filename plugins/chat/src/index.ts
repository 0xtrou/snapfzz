import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

// Per A005/PluginArchitecture: contributions use lazy dynamic imports — code loaded only when shell renders them.
export default definePlugin({
  id: 'snapfzz.chat',
  name: 'Chat',
  version: '0.1.0',
  description: 'Text conversation channel for AgentScope agents',
  surface: ['project'],
  activationEvents: ['onStartupFinished'],
  contributes: {
    leftPanelTabs: [
      {
        id: 'chat',
        label: 'Chat',
        icon: '💬',
        component: () => import('./contributions/ChatPanel'),
      },
    ],
    statusItems: [
      {
        id: 'chat.connection',
        position: 'left' as const,
        component: () => import('./contributions/ConnectionStatus'),
      },
      {
        id: 'chat.tokens',
        position: 'right' as const,
        component: () => import('./contributions/TokenCounter'),
      },
    ],
    commands: [
      { id: 'chat.send', title: 'Send Message' },
      { id: 'chat.stop', title: 'Stop Generation' },
      { id: 'chat.clear', title: 'Clear Conversation' },
    ],
    shortcuts: [
      { command: 'chat.send', key: '⌘+Enter' },
      { command: 'chat.stop', key: 'Escape' },
    ],
  },
  async activate(ctx: PluginContext): Promise<PluginHandle> {
    const { configureChatRuntime, disposeChatRuntime, sendMessage, stopGeneration, clearConversationSession } =
      await import('./hooks/use-chat');

    configureChatRuntime(ctx);

    const unregisterSend = ctx.commands.register('chat.send', async (args?: unknown) => {
      const payload = (args ?? {}) as { text?: string };
      await sendMessage(payload.text ?? '');
      return undefined;
    });

    const unregisterStop = ctx.commands.register('chat.stop', async () => {
      await stopGeneration();
      return undefined;
    });

    const unregisterClear = ctx.commands.register('chat.clear', async () => {
      await clearConversationSession();
      return undefined;
    });

    return {
      async deactivate() {
        unregisterSend();
        unregisterStop();
        unregisterClear();
        disposeChatRuntime();
      },
    };
  },
});
