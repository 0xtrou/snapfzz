// A007/SettingsSections: System plugin that contributes the "Performance" settings section.
// Runs in the preferences surface only — never in project or launcher windows.
import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.settings.performance',
  name: 'Performance Settings',
  version: '0.1.0',
  description: 'Live budget metrics and preset selection for performance tuning',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],

  // A008/BudgetRegistry: Declare budget before acquiring any resources.
  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 2 },
    capabilities: ['rust.invoke', 'settings.read', 'logger'],
  },

  contributes: {
    // A007/settingsSections: Lazy component import — loaded only when section is rendered.
    settingsSections: [
      {
        id: 'performance',
        label: 'Performance',
        icon: 'DashboardOutlined',
        order: 3,
        component: () => import('./PerformanceSettings'),
      },
    ],
  },

  async activate(_ctx: PluginContext): Promise<PluginHandle> {
    return {
      async deactivate() {},
    };
  },
});
