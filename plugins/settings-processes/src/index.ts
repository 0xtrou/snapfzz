// A007/SettingsSections: System plugin that contributes the "Processes" settings section.
// Runs in the preferences surface only — never in project or launcher windows.
import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.settings.processes',
  name: 'Process Manager',
  version: '0.1.0',
  description: 'Monitor and manage supervised processes',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],

  // A008/BudgetRegistry: Declare budget before acquiring any resources.
  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 5 },
    capabilities: ['rust.invoke', 'rust.listen', 'settings.read', 'logger'],
  },

  contributes: {
    // A007/settingsSections: Lazy component import — loaded only when section is rendered.
    settingsSections: [
      {
        id: 'processes',
        label: 'Processes',
        icon: 'MonitorOutlined',
        order: 2,
        component: () => import('./ProcessesSettings'),
      },
    ],
  },

  async activate(_ctx: PluginContext): Promise<PluginHandle> {
    return {
      async deactivate() {},
    };
  },
});
