import { describe, expect, it, vi } from 'vitest';
import type { PluginDefinition, PluginContext, PluginHandle, HostSurface } from '@snapfzz/plugin-sdk';
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

describe('PluginHost', () => {
  it('register plugin → getPlugin returns it', () => {
    const host = new PluginHost(new ContributionStore());
    const plugin = defineTestPlugin({ id: 'test-plugin' });

    host.register(plugin);

    expect(host.getPlugin('test-plugin')).toBe(plugin);
  });

  it('register plugin for project surface → getPlugins("launcher") excludes it', () => {
    const host = new PluginHost(new ContributionStore());
    const launcherPlugin = defineTestPlugin({ id: 'lp', surface: ['launcher'] });
    const projectPlugin = defineTestPlugin({ id: 'pp', surface: ['project'] });

    host.register(launcherPlugin);
    host.register(projectPlugin);

    const launcherPlugins = host.getPlugins('launcher');
    expect(launcherPlugins).toHaveLength(1);
    expect(launcherPlugins[0].id).toBe('lp');
  });

  it('resolve with no deps → returns all', () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'a' }));
    host.register(defineTestPlugin({ id: 'b' }));

    const order = host.resolve();

    expect(order).toHaveLength(2);
    expect(order.map(p => p.id)).toContain('a');
    expect(order.map(p => p.id)).toContain('b');
  });

  it('resolve with deps → returns in dependency order', () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'a', dependencies: { b: '1.0.0' } }));
    host.register(defineTestPlugin({ id: 'b' }));

    const order = host.resolve();

    const ids = order.map(p => p.id);
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('a'));
  });

  it('resolve with missing dep → throws', () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'a', dependencies: { missing: '1.0.0' } }));

    expect(() => host.resolve()).toThrow(/missing dependency/i);
  });

  it('activate calls plugin.activate with PluginContext', async () => {
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

  it('deactivate calls handle.deactivate', async () => {
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
