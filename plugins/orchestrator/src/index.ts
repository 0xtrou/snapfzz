import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

// Per A005/PluginArchitecture: contributions use lazy dynamic imports — code loaded only when shell renders them.
export default definePlugin({
  id: 'snapfzz.orchestrator',
  name: 'Orchestrator',
  version: '0.1.0',
  description: 'Text conversation channel for AgentScope agents',
  surface: ['project'],
  activationEvents: ['onStartupFinished'],

  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 2 },
    capabilities: [
      'rust.invoke',
      'rust.listen',
      'bus.emit',
      'commands.register',
      'settings.read',
      'storage.read',
      'logger',
    ],
  },

  runtimes: {
    python: [{
      id: 'chat.orchestrator',
      packageDir: 'intelligence',
      command: 'orchestrator app',
      healthCheck: '/health',
      healthIntervalMs: 2000,
      resources: { maxMemoryMb: 512, maxRestarts: 10 },
      requiresDatabase: true,
      hostFlag: '--host',
      portFlag: '--port',
    }],
  },

  contributes: {
    leftPanelTabs: [
      {
        id: 'chat',
        label: 'Chat',
        icon: 'MessageOutlined',
        component: () => import('./contributions/ChatPanel'),
      },
    ],
    statusItems: [
      {
        id: 'orchestrator.connection',
        position: 'left' as const,
        component: () => import('./contributions/ConnectionStatus'),
      },
      {
        id: 'orchestrator.tokens',
        position: 'right' as const,
        component: () => import('./contributions/TokenCounter'),
      },
    ],
    commands: [
      { id: 'orchestrator.send', title: 'Send Message' },
      { id: 'orchestrator.stop', title: 'Stop Generation' },
      { id: 'orchestrator.clear', title: 'Clear Conversation' },
    ],
    shortcuts: [
      { command: 'orchestrator.send', key: '⌘+Enter' },
      { command: 'orchestrator.stop', key: 'Escape' },
    ],
  },
  async activate(ctx: PluginContext): Promise<PluginHandle> {
    const { configureChatRuntime, disposeChatRuntime, sendMessage, stopGeneration, clearConversationSession } =
      await import('./hooks/use-chat');

    configureChatRuntime(ctx);

    const unregisterSend = ctx.commands.register('orchestrator.send', async (args?: unknown) => {
      const payload = (args ?? {}) as { text?: string };
      await sendMessage(payload.text ?? '');
      return undefined;
    });

    const unregisterStop = ctx.commands.register('orchestrator.stop', async () => {
      await stopGeneration();
      return undefined;
    });

    const unregisterClear = ctx.commands.register('orchestrator.clear', async () => {
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
