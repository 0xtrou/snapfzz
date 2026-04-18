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
      // Per-turn token usage is rendered natively by Spark's Bubble Actions row
      // (`Usage` component from @agentscope-ai/chat) — no status-bar duplication needed.
    ],
  },
  async activate(ctx: PluginContext): Promise<PluginHandle> {
    // Per A013/ChatPanel: Spark's `AgentScopeRuntimeWebUI` owns the chat hot path
    // (send/stop/clear via its built-in Sender and session sidebar). Our activate
    // hook only wires the two module-scoped holders that give the adapter + the
    // status-bar items synchronous access to `ctx.storage` / `ctx.rust.invoke`.
    const [{ configurePluginContext, disposePluginContext }, { configureChatAdapter, disposeChatAdapter }] =
      await Promise.all([
        import('./contributions/runtime'),
        import('./contributions/ChatPanel/adapter'),
      ]);
    configurePluginContext(ctx);
    configureChatAdapter(ctx);

    return {
      async deactivate() {
        disposeChatAdapter();
        disposePluginContext();
      },
    };
  },
});
