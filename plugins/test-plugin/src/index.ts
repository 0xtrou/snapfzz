import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginHandle, PluginContext } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '0.0.1',
  description: 'Plugin proving shell integration works',
  surface: ['project'],
  activationEvents: ['onStartupFinished'],

  async activate(ctx: PluginContext): Promise<PluginHandle> {
    const disposable1 = ctx.registry.registerTab('leftPanel', {
      id: 'test-chat',
      label: 'Test Chat',
      icon: '💬',
      component: () => import('./TestChatTab'),
    });

    const disposable2 = ctx.registry.registerTab('workspace', {
      id: 'test-kb',
      label: 'Test KB',
      icon: '📚',
      component: () => import('./TestKbTab'),
    });

    return {
      async deactivate() {
        disposable1();
        disposable2();
      },
    };
  },
});
