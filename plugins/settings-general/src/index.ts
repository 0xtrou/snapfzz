import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

// Per A005/PluginArchitecture: contributions use lazy dynamic imports — code loaded only when shell renders them.
// Per A007/MultiLayout: surface 'preferences' targets the preferences window.
export default definePlugin({
  id: 'snapfzz.settings.general',
  name: 'General Settings',
  version: '0.1.0',
  description: 'Theme, startup behaviour, and language preferences',
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
        id: 'general',
        label: 'General',
        icon: '⚙️',
        order: 0,
        component: () => import('./GeneralSettings'),
      },
    ],
  },

  async activate(_ctx: PluginContext): Promise<PluginHandle> {
    return {};
  },
});
