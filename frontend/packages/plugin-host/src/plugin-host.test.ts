// Spec: A005-feat-plugin-architecture.md, 010-feat-core-runtime.md
// Sections: Plugin Lifecycle, Dependency Resolution, Plugin Context
// Verifies: plugin registration, surface filtering, dependency ordering, activation, deactivation
import { describe, expect, it, vi } from 'vitest';
import type { PluginDefinition, PluginContext, HostSurface } from '@snapfzz/plugin-sdk';
import { PluginHost } from './plugin-host';
import { ContributionStore } from './contribution-store';

const defineTestPlugin = (overrides: Partial<PluginDefinition> & { id: string }): PluginDefinition => ({
  name: overrides.id,
  version: '1.0.0',
  description: '',
  surface: ['launcher' as HostSurface],
  activationEvents: ['onStartupFinished'],
  ...overrides,
});

describe('A005/lifecycle: PluginHost registration, resolution, and lifecycle control', () => {
  it('A005/lifecycle: registers a plugin and retrieves it by id', () => {
    const host = new PluginHost(new ContributionStore());
    const plugin = defineTestPlugin({ id: 'test-plugin' });

    host.register(plugin);

    expect(host.getPlugin('test-plugin')).toBe(plugin);
  });

  it('A005/lifecycle: filters registered plugins by requested host surface', () => {
    const host = new PluginHost(new ContributionStore());
    const launcherPlugin = defineTestPlugin({ id: 'lp', surface: ['launcher'] });
    const projectPlugin = defineTestPlugin({ id: 'pp', surface: ['project'] });

    host.register(launcherPlugin);
    host.register(projectPlugin);

    const launcherPlugins = host.getPlugins('launcher');
    expect(launcherPlugins).toHaveLength(1);
    expect(launcherPlugins[0].id).toBe('lp');
  });

  it('A005/resolve: returns all plugins when no dependencies are declared', () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'a' }));
    host.register(defineTestPlugin({ id: 'b' }));

    const order = host.resolve();

    expect(order).toHaveLength(2);
    expect(order.map((p) => p.id)).toContain('a');
    expect(order.map((p) => p.id)).toContain('b');
  });

  it('A005/resolve: orders plugins so dependencies come before dependents', () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'a', dependencies: { b: '1.0.0' } }));
    host.register(defineTestPlugin({ id: 'b' }));

    const order = host.resolve();

    const ids = order.map((p) => p.id);
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('a'));
  });

  it('A005/resolve: throws when a required dependency is missing', () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'a', dependencies: { missing: '1.0.0' } }));

    expect(() => host.resolve()).toThrow(/missing dependency/i);
  });

  it('A006/context: activates plugin with full PluginContext contract', async () => {
    const host = new PluginHost(new ContributionStore());
    const mockActivate = vi.fn().mockResolvedValue({});
    const plugin = defineTestPlugin({
      id: 'act-test',
      activate: mockActivate,
    });
    host.register(plugin);

    const handle = await host.activate('act-test');

    expect(mockActivate).toHaveBeenCalledTimes(1);
    const ctx = mockActivate.mock.calls[0][0] as PluginContext;
    expect(ctx.surface).toBe('launcher');
    expect(ctx.bus).toBeDefined();
    expect(ctx.commands).toBeDefined();
    expect(ctx.registry).toBeDefined();
    expect(ctx.settings).toBeDefined();
    expect(ctx.storage).toBeDefined();
    expect(ctx.apis).toBeDefined();
    expect(ctx.rust).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(handle).toBeDefined();
  });

  it('A005/lifecycle: calls plugin handle deactivate during host deactivation', async () => {
    const host = new PluginHost(new ContributionStore());
    const mockDeactivate = vi.fn().mockResolvedValue(undefined);
    const plugin = defineTestPlugin({
      id: 'deact-test',
      activate: async () => ({ deactivate: mockDeactivate }),
    });
    host.register(plugin);

    await host.activate('deact-test');
    await host.deactivate('deact-test');

    expect(mockDeactivate).toHaveBeenCalledTimes(1);
  });
});
