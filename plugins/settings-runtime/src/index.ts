// A007/SettingsSections: System plugin that contributes the "Runtime" settings section.
// Runs in the preferences surface only — never in project or launcher windows.
import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.settings.runtime',
  name: 'Runtime Settings',
  version: '0.1.0',
  description: 'Configure AgentScope runtime connection and model',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],

  // A008/BudgetRegistry: Declare budget before acquiring any resources.
  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 3 },
    capabilities: ['rust.invoke', 'settings.read', 'settings.write', 'logger'],
  },

  contributes: {
    // A007/settingsSections: Lazy component import — loaded only when section is rendered.
    settingsSections: [
      {
        id: 'runtime',
        label: 'Runtime',
        icon: 'CloudServerOutlined',
        order: 1,
        component: () => import('./RuntimeSettings'),
      },
    ],
  },

  async activate(_ctx: PluginContext): Promise<PluginHandle> {
    return {
      async deactivate() {},
    };
  },
});
