import { describe, expect, it } from 'vitest';
import { definePlugin, type PluginDefinition } from '../index';
import type {
  SettingsSectionContribution,
  TabContribution,
  PanelContribution,
  StatusItemContribution,
  CommandContribution,
  ShortcutContribution,
  SettingsContribution,
  ComponentContribution,
  SkillContribution,
  ToolContribution,
  BenchmarkContribution,
  GraderContribution,
  DeployTargetContribution,
  IdentityProviderContribution,
  ComplianceTemplateContribution,
  MiniAppContribution,
} from '../types';

describe('definePlugin', () => {
  it('returns definition unchanged (pass-through)', () => {
    const definition: PluginDefinition = {
      id: 'plugin.pass.through',
      name: 'Pass Through Plugin',
      version: '1.0.0',
      description: 'Test plugin',
      surface: ['launcher'],
      activationEvents: ['onStartupFinished'],
      activate: async () => ({}),
    };

    const result = definePlugin(definition);

    expect(result).toBe(definition);
  });

  it('accepts valid manifest with all fields', async () => {
    const definition = definePlugin({
      id: 'plugin.full.manifest',
      name: 'Full Manifest Plugin',
      version: '1.2.3',
      description: 'Plugin with all manifest fields',
      surface: ['launcher', 'project', 'preferences'],
      activationEvents: ['onStartupFinished', 'onWorkspaceOpened', 'onEvent:test'],
      dependencies: { '@snapfzz/shared': '^1.0.0' },
      optionalDependencies: { '@snapfzz/plugin-host': '^1.0.0' },
      requiredCapabilities: ['logger', 'bus.emit'],
      budget: {
        zone: 'zone3',
        reliability: { strikes: 3, windowSecs: 60 },
        network: { maxConcurrentInvokes: 2 },
        capabilities: ['logger', 'commands.execute'],
      },
      contributes: {
        leftPanelTabs: [
          {
            id: 'left.tab',
            label: 'Left Tab',
            icon: 'InboxOutlined',
            component: async () => ({ default: () => null }),
          },
        ],
        workspaceTabs: [
          {
            id: 'workspace.tab',
            label: 'Workspace Tab',
            icon: 'AppstoreOutlined',
            component: async () => ({ default: () => null }),
          },
        ],
        bottomPanels: [
          {
            id: 'bottom.panel',
            label: 'Bottom Panel',
            component: async () => ({ default: () => null }),
            defaultCollapsed: false,
          },
        ],
        statusItems: [
          {
            id: 'status.item',
            position: 'left',
            component: async () => ({ default: () => null }),
          },
        ],
        commands: [{ id: 'command.run', title: 'Run Command' }],
        shortcuts: [{ command: 'command.run', key: 'Cmd+R' }],
        settings: [{ id: 'setting.id', label: 'Setting', schema: { type: 'string' } }],
        genericComponents: [
          { id: 'component.id', name: 'Generic Component', component: async () => ({ default: () => null }) },
        ],
        agentSkills: [
          {
            id: 'skill.id',
            name: 'Skill',
            description: 'Skill description',
            systemPrompt: 'Do work',
            targetAgents: ['build'],
          },
        ],
        agentTools: [
          {
            id: 'tool.id',
            name: 'Tool',
            description: 'Tool description',
            inputSchema: { type: 'object' },
            handler: async () => ({ default: async () => ({ ok: true }) }),
          },
        ],
        evalBenchmarks: [
          {
            id: 'benchmark.id',
            name: 'Benchmark',
            description: 'Benchmark description',
            type: 'hard',
            targetAgent: 'build',
            dataset: {
              source: 'inline',
              cases: [{ input: 'input', expectedScore: 0.9 }],
            },
          },
        ],
        evalGraders: [
          {
            id: 'grader.id',
            name: 'Grader',
            description: 'Grader description',
            type: 'hard',
          },
        ],
        deployTargets: [
          {
            id: 'deploy.id',
            name: 'Deploy Target',
            icon: 'CloudUploadOutlined',
            description: 'Deploy target description',
            supportedFrameworks: ['react'],
            configSchema: { type: 'object' },
            handlers: {
              deploy: async () => ({ default: async () => ({ ok: true }) }),
            },
          },
        ],
        identityProviders: [
          {
            id: 'identity.id',
            name: 'Identity',
            icon: 'SafetyCertificateOutlined',
            authType: 'oauth',
            configSchema: { type: 'object' },
            testConnection: async () => ({ default: async () => true }),
            provides: ['deploy.id'],
          },
        ],
        complianceTemplates: [
          {
            id: 'compliance.id',
            name: 'Compliance',
            areas: [{ name: 'Area', items: [{ label: 'Item' }] }],
          },
        ],
        miniApps: [
          {
            id: 'mini.id',
            name: 'Mini App',
            targetTab: 'workspace.tab',
            source: async () => ({ default: '<html></html>' }),
          },
        ],
        settingsSections: [
          {
            id: 'settings.section',
            label: 'Section',
            icon: 'SettingOutlined',
            component: async () => ({ default: () => null }),
          },
        ],
      },
      activate: async () => ({
        deactivate: async () => undefined,
      }),
    });

    expect(definition.id).toBe('plugin.full.manifest');
    expect(definition.surface).toEqual(['launcher', 'project', 'preferences']);
    expect(definition.contributes?.settingsSections).toHaveLength(1);

    const handle = await definition.activate?.({} as never);
    await handle?.deactivate?.();
  });

  it('accepts minimal manifest with only required fields', () => {
    const definition = definePlugin({
      id: 'plugin.minimal',
      name: 'Minimal Plugin',
      version: '0.0.1',
      description: 'Minimal plugin',
      surface: ['launcher'],
      activationEvents: ['onStartupFinished'],
    });

    expect(definition.id).toBe('plugin.minimal');
    expect(definition.name).toBe('Minimal Plugin');
    expect(definition.activate).toBeUndefined();
  });
});

describe('plugin-sdk types', () => {
  it('PluginDefinition shape includes id, name, version, and activate', () => {
    const definition: PluginDefinition = {
      id: 'plugin.shape',
      name: 'Shape Plugin',
      version: '1.0.0',
      description: 'Shape test',
      surface: ['project'],
      activationEvents: ['onWorkspaceOpened'],
      activate: async () => ({
        deactivate: async () => undefined,
      }),
    };

    expect(definition.id).toBe('plugin.shape');
    expect(definition.name).toBe('Shape Plugin');
    expect(definition.version).toBe('1.0.0');
    expect(typeof definition.activate).toBe('function');
  });

  it('contribution type aliases are available', () => {
    const leftPanelTab: TabContribution = {
      id: 'left.tab.type',
      label: 'Left Tab',
      icon: 'InboxOutlined',
      component: async () => ({ default: () => null }),
    };

    const settingsSection: SettingsSectionContribution = {
      id: 'settings.section.type',
      label: 'Settings Section',
      icon: 'SettingOutlined',
      component: async () => ({ default: () => null }),
    };

    const bottomPanel: PanelContribution = {
      id: 'panel.type',
      label: 'Panel',
      component: async () => ({ default: () => null }),
    };

    const statusItem: StatusItemContribution = {
      id: 'status.type',
      position: 'right',
      component: async () => ({ default: () => null }),
    };

    const command: CommandContribution = { id: 'command.type', title: 'Command' };
    const shortcut: ShortcutContribution = { command: 'command.type', key: 'Cmd+K' };
    const setting: SettingsContribution = { id: 'setting.type', label: 'Setting', schema: { type: 'string' } };
    const component: ComponentContribution = {
      id: 'component.type',
      name: 'Component',
      component: async () => ({ default: () => null }),
    };
    const skill: SkillContribution = {
      id: 'skill.type',
      name: 'Skill',
      description: 'desc',
      systemPrompt: 'prompt',
      targetAgents: ['builder'],
    };
    const tool: ToolContribution = {
      id: 'tool.type',
      name: 'Tool',
      description: 'desc',
      inputSchema: { type: 'object' },
      handler: async () => ({ default: async () => ({}) }),
    };
    const benchmark: BenchmarkContribution = {
      id: 'benchmark.type',
      name: 'Benchmark',
      description: 'desc',
      type: 'both',
      targetAgent: 'builder',
      dataset: { source: 'inline', cases: [] },
    };
    const grader: GraderContribution = {
      id: 'grader.type',
      name: 'Grader',
      description: 'desc',
      type: 'judge',
    };
    const deployTarget: DeployTargetContribution = {
      id: 'deploy.type',
      name: 'Deploy',
      icon: 'CloudOutlined',
      description: 'desc',
      supportedFrameworks: ['react'],
      configSchema: { type: 'object' },
      handlers: {
        deploy: async () => ({ default: async () => ({}) }),
      },
    };
    const identityProvider: IdentityProviderContribution = {
      id: 'identity.type',
      name: 'Identity',
      icon: 'KeyOutlined',
      authType: 'token',
      configSchema: { type: 'object' },
      testConnection: async () => ({ default: async () => true }),
      provides: ['deploy.type'],
    };
    const complianceTemplate: ComplianceTemplateContribution = {
      id: 'compliance.type',
      name: 'Compliance',
      areas: [{ name: 'Policy', items: [{ label: 'Requirement' }] }],
    };
    const miniApp: MiniAppContribution = {
      id: 'mini.type',
      name: 'Mini App',
      targetTab: 'workspace',
      source: async () => ({ default: 'https://example.com' }),
    };

    expect(leftPanelTab.id).toBe('left.tab.type');
    expect(settingsSection.id).toBe('settings.section.type');
    expect(bottomPanel.id).toBe('panel.type');
    expect(statusItem.id).toBe('status.type');
    expect(command.id).toBe('command.type');
    expect(shortcut.command).toBe('command.type');
    expect(setting.id).toBe('setting.type');
    expect(component.id).toBe('component.type');
    expect(skill.id).toBe('skill.type');
    expect(tool.id).toBe('tool.type');
    expect(benchmark.id).toBe('benchmark.type');
    expect(grader.id).toBe('grader.type');
    expect(deployTarget.id).toBe('deploy.type');
    expect(identityProvider.id).toBe('identity.type');
    expect(complianceTemplate.id).toBe('compliance.type');
    expect(miniApp.id).toBe('mini.type');
  });
});
