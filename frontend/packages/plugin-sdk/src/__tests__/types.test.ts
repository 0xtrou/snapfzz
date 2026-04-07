import { describe, expect, it } from 'vitest';
import type {
  HostSurface,
  PluginContext,
  PluginManifest,
  PluginContributions,
  PluginBudget,
  PluginCapability,
  ActivationEvent,
  EventBus,
  CommandRegistry,
  ContributionRegistry,
  SettingsRegistry,
  PluginStorage,
  ApiBroker,
  RustBridge,
  Disposable,
} from '../index';

describe('type exports', () => {
  it('exports plugin-sdk types as importable compile-time contracts', () => {
    const disposable: Disposable = () => undefined;
    const bus: EventBus = {
      emit: () => undefined,
      on: () => disposable,
    };
    const commands: CommandRegistry = {
      execute: async () => undefined,
      register: () => disposable,
    };
    const registry: ContributionRegistry = {
      registerTab: () => disposable,
      registerBottomPanel: () => disposable,
      registerStatusItem: () => disposable,
      registerComponent: () => disposable,
    };
    const settings: SettingsRegistry = {
      get: () => undefined,
      set: () => undefined,
      onChange: () => disposable,
    };
    const storage: PluginStorage = {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    };
    const apis: ApiBroker = {
      get: () => undefined,
      provide: () => undefined,
    };
    const rust: RustBridge = {
      invoke: async () => undefined,
      listen: async () => disposable,
    };

    const surface: HostSurface = 'preferences';
    const activationEvent: ActivationEvent = 'onWorkspaceOpened';
    const capabilities: PluginCapability[] = ['logger', 'rust.invoke'];
    const contributions: PluginContributions = {};
    const budget: PluginBudget = {
      zone: 'zone3',
      capabilities,
    };
    const manifest: PluginManifest = {
      id: 'plugin.types',
      name: 'Plugin Types',
      version: '1.0.0',
      description: 'Type contract check',
      surface: ['launcher', 'project', 'preferences'],
      activationEvents: [activationEvent],
      contributes: contributions,
      budget,
    };
    const context: PluginContext = {
      bus,
      commands,
      registry,
      settings,
      storage,
      apis,
      rust,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      surface,
    };

    expect(manifest.id).toBe('plugin.types');
    expect(context.surface).toBe('preferences');
    expect(manifest.budget?.capabilities).toContain('logger');
  });

  it('HostSurface union includes launcher, project, and preferences', () => {
    const surfaces: HostSurface[] = ['launcher', 'project', 'preferences'];

    expect(surfaces).toEqual(['launcher', 'project', 'preferences']);
  });
});
