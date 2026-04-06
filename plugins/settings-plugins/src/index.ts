import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

// Per A005/PluginArchitecture: contributions use lazy dynamic imports — code loaded only when shell renders them.
// Per A007/MultiLayout: surface 'preferences' targets the preferences window.
export default definePlugin({
  id: 'snapfzz.settings.plugins',
  name: 'Plugins Settings',
  version: '0.1.0',
  description: 'Manage installed plugins: enable, disable, inspect budget strikes',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],

  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 1 },
    capabilities: [
      'rust.invoke',
      'settings.read',
      'settings.write',
      'logger',
    ],
  },

  contributes: {
    settingsSections: [
      {
        id: 'plugins',
        label: 'Plugins',
        icon: '🧩',
        order: 3,
        component: () => import('./PluginsSettings'),
      },
    ],
  },

  async activate(_ctx: PluginContext): Promise<PluginHandle> {
    return {};
  },
});
