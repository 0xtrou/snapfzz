import { definePlugin } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.settings.vault',
  name: 'Secret Vault Settings',
  version: '1.0.0',
  description: 'Manage encrypted secrets stored in the system vault',
  surface: ['preferences'],
  activationEvents: ['onStartupFinished'],
  contributes: {
    settingsSections: [
      {
        id: 'vault',
        label: 'Secret Vault',
        icon: 'LockOutlined',
        component: () => import('./VaultSettings'),
        order: 5,
      },
    ],
  },
});
