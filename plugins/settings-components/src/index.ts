import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.settings.components',
  name: 'System Packs',
  version: '0.1.0',
  description: 'Manage system runtime packs',
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
        id: 'components',
        label: 'System Packs',
        icon: 'AppstoreOutlined',
        order: 7,
        component: () => import('./ComponentsSettings'),
      },
    ],
  },

  async activate(_ctx: PluginContext): Promise<PluginHandle> {
    return {};
  },
});
