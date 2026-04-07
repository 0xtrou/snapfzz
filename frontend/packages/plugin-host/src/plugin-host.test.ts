// Spec: A005-feat-plugin-architecture.md, A006-core-runtime.md
// Sections: Plugin Lifecycle, Dependency Resolution, Plugin Context, Activation Events, Enable/Disable, Crash Supervision, Reload, State
// Verifies: plugin registration, surface filtering, dependency ordering, activation, deactivation, activation events, enable/disable, crash supervision, reload, plugin state
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { PluginContext, HostSurface } from '@snapfzz/plugin-sdk';
import type { PluginDefinition } from '@snapfzz/plugin-sdk/define-plugin';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

// Per A005/Lifecycle: simple in-memory storage interface for enable/disable persistence
interface StorageInterface {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

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

describe('A005/lifecycle/activation-timeout: kills plugin that exceeds timeout', () => {
  it('A005/lifecycle/activation-timeout: rejects activation when plugin exceeds 5000ms', async () => {
    vi.useFakeTimers();

    try {
      const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
      const host = new PluginHost(new ContributionStore(), 'launcher', storage);

      const neverResolve = defineTestPlugin({
        id: 'slow-plugin',
        activate: () => new Promise(() => {}),
      });
      host.register(neverResolve);

      const activatePromise = host.activate('slow-plugin');
      const activationAssertion = expect(activatePromise).rejects.toThrow(/timed out/i);

      vi.advanceTimersByTime(5001);
      await vi.runAllTimersAsync();

      await activationAssertion;
      expect(host.getPluginState('slow-plugin')).toBe('error');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A005/lifecycle/activation-events: lazy loading', () => {
  it('A003/instant-loading/background-preload: uses requestIdleCallback for non-startup background preload', async () => {
    const originalRequestIdleCallback = globalThis.requestIdleCallback;
    const requestIdleCallbackSpy = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
      return 1;
    });

    globalThis.requestIdleCallback = requestIdleCallbackSpy;

    try {
      const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
      const host = new PluginHost(new ContributionStore(), 'launcher', storage);

      host.register(defineTestPlugin({ id: 'lazy-plugin', activationEvents: ['onViewVisible:code'] }));

      await host.activateByEvent('onCommand:run.something');

      expect(requestIdleCallbackSpy).toHaveBeenCalled();
    } finally {
      if (originalRequestIdleCallback) {
        globalThis.requestIdleCallback = originalRequestIdleCallback;
      } else {
        delete (globalThis as { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback;
      }
    }
  });

  it('A005/lifecycle/activation-events: only activates plugins matching the fired event', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);
    const activateA = vi.fn().mockResolvedValue({});
    const activateB = vi.fn().mockResolvedValue({});

    host.register(defineTestPlugin({ id: 'a', activationEvents: ['onStartupFinished'], activate: activateA }));
    host.register(defineTestPlugin({ id: 'b', activationEvents: ['onViewVisible:code'], activate: activateB }));

    await host.activateByEvent('onStartupFinished');

    expect(activateA).toHaveBeenCalledTimes(1);
    expect(activateB).not.toHaveBeenCalled();
  });

  it('A005/lifecycle/activation-events: skips plugins with non-matching events', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);
    const activate = vi.fn().mockResolvedValue({});

    host.register(defineTestPlugin({ id: 'x', activationEvents: ['onViewVisible:code'], activate }));

    await host.activateByEvent('onCommand:run.something');

    expect(activate).not.toHaveBeenCalled();
  });

  it('A005/lifecycle/activation-events: activates in dependency order within same event', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);
    const activationOrder: string[] = [];

    host.register(defineTestPlugin({
      id: 'dep',
      activationEvents: ['onStartupFinished'],
      activate: async () => { activationOrder.push('dep'); return {}; },
    }));
    host.register(defineTestPlugin({
      id: 'consumer',
      activationEvents: ['onStartupFinished'],
      dependencies: { dep: '1.0.0' },
      activate: async () => { activationOrder.push('consumer'); return {}; },
    }));

    await host.activateByEvent('onStartupFinished');

    expect(activationOrder).toEqual(['dep', 'consumer']);
  });
});

describe('A005/lifecycle/enable-disable: enable and disable plugin', () => {
  it('A005/lifecycle/enable-disable: disabled plugin skipped during activation', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);
    const activate = vi.fn().mockResolvedValue({});

    host.register(defineTestPlugin({ id: 'x', activationEvents: ['onStartupFinished'], activate }));
    host.disable('x');

    await host.activateByEvent('onStartupFinished');

    expect(activate).not.toHaveBeenCalled();
  });

  it('A005/lifecycle/enable-disable: disable deactivates running plugin', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);
    const deactivate = vi.fn().mockResolvedValue(undefined);

    host.register(defineTestPlugin({
      id: 'x',
      activationEvents: ['onStartupFinished'],
      activate: async () => ({ deactivate }),
    }));

    await host.activate('x');
    await host.disable('x');

    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(host.isEnabled('x')).toBe(false);
  });

  it('A005/lifecycle/enable-disable: enable re-activates with correct event', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);
    const activate = vi.fn().mockResolvedValue({});

    host.register(defineTestPlugin({ id: 'x', activationEvents: ['onViewVisible:code'], activate }));
    host.disable('x');
    host.enable('x');
    await host.activateByEvent('onViewVisible:code');

    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('A005/lifecycle/enable-disable: disabled state persists via storage interface', () => {
    const stored: Record<string, string> = {};
    const storage: StorageInterface = {
      getItem: (key) => stored[key] ?? null,
      setItem: (key, value) => { stored[key] = value; },
      removeItem: (key) => { delete stored[key]; },
    };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);

    host.disable('plugin-a');
    host.disable('plugin-b');

    const parsed = JSON.parse(stored['snapfzz:disabledPlugins']);
    expect(parsed).toContain('plugin-a');
    expect(parsed).toContain('plugin-b');
  });
});

describe('A005/lifecycle/crash-supervision: crash counting and auto-disable', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('A005/lifecycle/crash-supervision: increments crash count on reportCrash', () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);

    host.register(defineTestPlugin({ id: 'crashy' }));

    host.reportCrash('crashy');
    host.reportCrash('crashy');

    expect(host.getCrashCount('crashy')).toBe(2);
  });

  it('A005/lifecycle/crash-supervision: auto-disables after 3 crashes in 5 minutes', () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);

    host.register(defineTestPlugin({ id: 'crashy' }));

    host.reportCrash('crashy');
    host.reportCrash('crashy');
    host.reportCrash('crashy');

    expect(host.isEnabled('crashy')).toBe(false);
  });

  it('A005/lifecycle/crash-supervision: resets crash count on successful activation', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);

    host.register(defineTestPlugin({
      id: 'crashy',
      activationEvents: ['onStartupFinished'],
      activate: async () => ({}),
    }));

    host.reportCrash('crashy');
    host.reportCrash('crashy');
    await host.activate('crashy');

    expect(host.getCrashCount('crashy')).toBe(0);
  });
});

describe('A005/lifecycle/reload: deactivate and re-activate via loader', () => {
  it('A005/lifecycle/reload: deactivates and re-activates plugin via loader', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const store = new ContributionStore();
    const host = new PluginHost(store, 'launcher', storage);

    const deactivate1 = vi.fn().mockResolvedValue(undefined);
    const deactivate2 = vi.fn().mockResolvedValue(undefined);
    let callCount = 0;
    const loader = async () => {
      callCount++;
      const deactivate = callCount === 1 ? deactivate1 : deactivate2;
      return {
        ...defineTestPlugin({ id: 'reloadable', activationEvents: ['onStartupFinished'] }),
        activate: async () => ({ deactivate }),
      };
    };

    await host.registerWithLoader(
      defineTestPlugin({ id: 'reloadable', activationEvents: ['onStartupFinished'] }),
      loader,
    );
    await host.activate('reloadable');

    await host.reload('reloadable');

    expect(deactivate1).toHaveBeenCalledTimes(1);
    expect(deactivate2).not.toHaveBeenCalled();
    expect(callCount).toBe(2);
  });
});

describe('A005/lifecycle/state: plugin state query (5-state model)', () => {
  it('A005/lifecycle/state: registered → running → ready → disabled', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);

    const plugin = defineTestPlugin({
      id: 'stateful',
      activationEvents: ['onStartupFinished'],
      activate: async () => ({ deactivate: async () => {} }),
    });
    host.register(plugin);

    expect(host.getPluginState('stateful')).toBe('registered');

    await host.activate('stateful');
    expect(host.getPluginState('stateful')).toBe('running');

    // After deactivation, code is still cached → ready (not registered)
    await host.deactivate('stateful');
    expect(host.getPluginState('stateful')).toBe('ready');

    host.disable('stateful');
    expect(host.getPluginState('stateful')).toBe('disabled');
  });

  it('A005/lifecycle/state: deactivate returns to ready when code was preloaded', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const store = new ContributionStore();
    const host = new PluginHost(store, 'launcher', storage);

    let callCount = 0;
    const loader = async () => {
      callCount++;
      return {
        ...defineTestPlugin({ id: 'preloaded' }),
        activate: async () => ({ deactivate: async () => {} }),
      };
    };

    await host.registerWithLoader(defineTestPlugin({ id: 'preloaded' }), loader);
    await host.activate('preloaded');
    expect(host.getPluginState('preloaded')).toBe('running');

    await host.deactivate('preloaded');
    expect(host.getPluginState('preloaded')).toBe('ready');
  });

  it('A005/lifecycle/state: uninstall removes plugin state entirely', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);

    host.register(defineTestPlugin({ id: 'removable', activate: async () => ({}) }));
    await host.activate('removable');
    await host.uninstall('removable');

    expect(host.getPluginState('removable')).toBeUndefined();
    expect(host.getPlugin('removable')).toBeUndefined();
  });

  it('A005/lifecycle/state: error state on failed activation', async () => {
    const storage: StorageInterface = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const host = new PluginHost(new ContributionStore(), 'launcher', storage);

    host.register(defineTestPlugin({
      id: 'broken',
      activate: async () => { throw new Error('boom'); },
    }));

    await expect(host.activate('broken')).rejects.toThrow('boom');
    expect(host.getPluginState('broken')).toBe('error');
  });
});

describe('A005/lifecycle: additional branch coverage', () => {
  it('A005/lifecycle: activate returns existing handle when already running', async () => {
    const host = new PluginHost(new ContributionStore());
    const deactivate = vi.fn().mockResolvedValue(undefined);
    const plugin = defineTestPlugin({
      id: 'existing-handle',
      activate: async () => ({ deactivate }),
    });

    host.register(plugin);
    const first = await host.activate('existing-handle');
    const second = await host.activate('existing-handle');

    expect(second).toBe(first);
  });

  it('A005/lifecycle: activating disabled plugin returns empty handle', async () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'disabled-now' }));

    await host.disable('disabled-now');
    const handle = await host.activate('disabled-now');

    expect(handle).toEqual({});
  });

  it('A005/lifecycle: deactivate no-op when plugin is not active', async () => {
    const host = new PluginHost(new ContributionStore());

    await expect(host.deactivate('not-active')).resolves.toBeUndefined();
  });

  it('A005/lifecycle: registerAsSystem marks plugin and blocks uninstall', async () => {
    const host = new PluginHost(new ContributionStore());
    const systemPlugin = defineTestPlugin({ id: 'system.plugin' });

    host.registerAsSystem(systemPlugin);

    expect(host.isSystemPlugin('system.plugin')).toBe(true);
    await expect(host.uninstall('system.plugin')).rejects.toThrow(/cannot uninstall system plugin/i);
  });

  it('A005/lifecycle: getPlugins uses host default surface when omitted', () => {
    const host = new PluginHost(new ContributionStore(), 'project');

    host.register(defineTestPlugin({ id: 'project-visible', surface: ['project'] }));
    host.register(defineTestPlugin({ id: 'launcher-only', surface: ['launcher'] }));

    expect(host.getPlugins().map((plugin) => plugin.id)).toEqual(['project-visible']);
  });

  it('A005/lifecycle: loading plugin keeps id from registered manifest', async () => {
    const host = new PluginHost(new ContributionStore());

    await host.registerWithLoader(
      defineTestPlugin({ id: 'manifest-id', activationEvents: ['onStartupFinished'] }),
      async () => ({
        ...defineTestPlugin({
          id: 'loaded-id',
          activationEvents: ['onStartupFinished'],
          activate: async () => ({}),
        }),
      }),
    );

    await host.activate('manifest-id');

    expect(host.getPlugin('manifest-id')?.id).toBe('manifest-id');
  });

  it('A005/lifecycle: resolve throws on circular dependency', () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'a', dependencies: { b: '^1.0.0' } }));
    host.register(defineTestPlugin({ id: 'b', dependencies: { a: '^1.0.0' } }));

    expect(() => host.resolve()).toThrow(/circular dependency/i);
  });

  it('A005/lifecycle: update throws when plugin id does not exist', async () => {
    const host = new PluginHost(new ContributionStore());

    await expect(host.update('missing-plugin', async () => defineTestPlugin({ id: 'missing-plugin' }))).rejects.toThrow(
      /plugin not found/i,
    );
  });

  it('A005/lifecycle: activateByEvent includes dependencies even when only dependent matches event', async () => {
    const host = new PluginHost(new ContributionStore());
    const order: string[] = [];

    host.register(
      defineTestPlugin({
        id: 'dep-core',
        activationEvents: ['onStartupFinished'],
        activate: async () => {
          order.push('dep-core');
          return {};
        },
      }),
    );

    host.register(
      defineTestPlugin({
        id: 'dependent',
        activationEvents: ['onEvent:trigger'],
        dependencies: { 'dep-core': '^1.0.0' },
        activate: async () => {
          order.push('dependent');
          return {};
        },
      }),
    );

    await host.activateByEvent('onEvent:trigger');

    expect(order).toEqual(['dep-core', 'dependent']);
  });

  it('A005/lifecycle: readDisabledPlugins tolerates invalid JSON', () => {
    const badStorage: StorageInterface = {
      getItem: (key) => (key === 'snapfzz:disabledPlugins' ? '{bad-json' : null),
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    const host = new PluginHost(new ContributionStore(), 'launcher', badStorage);

    expect(host.getDisabledPlugins()).toEqual([]);
  });

  it('A005/lifecycle: readDisabledPlugins parses persisted disabled list', () => {
    const storageWithValues: StorageInterface = {
      getItem: (key) => (key === 'snapfzz:disabledPlugins' ? JSON.stringify(['persisted.one', 'persisted.two']) : null),
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    const host = new PluginHost(new ContributionStore(), 'launcher', storageWithValues);

    expect(host.getDisabledPlugins().sort()).toEqual(['persisted.one', 'persisted.two']);
    expect(host.isEnabled('persisted.one')).toBe(false);
  });

  it('A005/lifecycle: persistDisabledPlugins no-ops without storage adapter', async () => {
    const host = new PluginHost(new ContributionStore());
    host.register(defineTestPlugin({ id: 'nostorage' }));

    await expect(host.disable('nostorage')).resolves.toBeUndefined();
    expect(host.getPluginState('nostorage')).toBe('disabled');
  });
});

describe('A002/zones: PluginHost Zone 2 purity', () => {
  it('A002/zones: PluginHost has no direct DOM/window/localStorage dependencies', () => {
    const srcDir = dirname(new URL(import.meta.url).pathname);
    const zone2Files = ['plugin-host.ts', 'contribution-store.ts', 'plugin-context-factory.ts'];

    for (const file of zone2Files) {
      const filePath = join(srcDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const stripped = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      expect(stripped).not.toMatch(/from\s+['"]react['"]/);
      expect(stripped).not.toMatch(/\bwindow\s*[.[]/);
      expect(stripped).not.toMatch(/\bdocument\s*[.[]/);
      expect(stripped).not.toMatch(/\blocalStorage\b/);
    }
  });
});
