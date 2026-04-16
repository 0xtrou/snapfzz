import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.oculus',
  name: 'Oculus',
  version: '0.1.0',
  description: 'Oculus plugin for Snapfzz',
  surface: ['project'],
  activationEvents: ['onStartupFinished'],

  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 2 },
    capabilities: ['rust.invoke', 'bus.emit', 'commands.register', 'logger'],
  },

  runtimes: {
    python: [{
      id: 'oculus.runtime',
      packageDir: 'intelligence',
      command: 'oculus app',
      healthCheck: '/health',
      healthIntervalMs: 2000,
      resources: { maxMemoryMb: 512, maxRestarts: 10 },
      hostFlag: '--host',
      portFlag: '--port',
    }],
  },

  contributes: {
    commands: [],
    shortcuts: [],
  },

  async activate(ctx: PluginContext): Promise<PluginHandle> {
    return {
      async deactivate() {
        // cleanup
      },
    };
  },
});
