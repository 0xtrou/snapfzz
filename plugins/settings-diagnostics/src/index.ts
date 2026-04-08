import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.settings.diagnostics',
  name: 'Diagnostics',
  version: '0.1.0',
  description: 'System health and startup diagnostics',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],

  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 1 },
    capabilities: [
      'rust.invoke',
      'settings.read',
      'logger',
    ],
  },

  contributes: {
    settingsSections: [
      {
        id: 'diagnostics',
        label: 'Diagnostics',
        icon: 'MedicineBoxOutlined',
        order: 8,
        component: () => import('./DiagnosticsSettings'),
      },
    ],
  },

  async activate(_ctx: PluginContext): Promise<PluginHandle> {
    return {};
  },
});
