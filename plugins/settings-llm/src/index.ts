import { definePlugin } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.settings.llm',
  name: 'LLM Providers Settings',
  version: '1.0.0',
  description: 'Manage LLM providers, virtual keys, routing, and audit logs',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],
  contributes: {
    settingsSections: [
      {
        id: 'llm',
        label: 'LLM Providers',
        icon: 'ApiOutlined',
        component: () => import('./LlmSettings'),
        order: 6,
      },
    ],
  },
});