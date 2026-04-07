// Spec: A005-feat-plugin-architecture.md, A006-core-runtime.md
// Sections: Plugin Context, Plugin Communication, Isolation
// Verifies: PluginContext shape, namespaced bus, command registry, logger prefixing, settings/storage namespacing
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriInvokeMock = vi.fn(async () => undefined);
const tauriListenMock = vi.fn(async () => () => undefined);

vi.mock('@snapfzz/shared', async () => {
  const actual = await vi.importActual<typeof import('@snapfzz/shared')>('@snapfzz/shared');
  return {
    ...actual,
    createTauriBridge: () => ({
      invoke: tauriInvokeMock,
      listen: tauriListenMock,
      isAvailable: false,
    }),
  };
});

import { ContributionStore } from './contribution-store';
import { createPluginContext, disposePluginContext, type ContextStorageAdapter } from './plugin-context-factory';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('A005/context: PluginContext factory and isolation boundaries', () => {
  let storage: ContextStorageAdapter & MemoryStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
    tauriInvokeMock.mockReset();
    tauriListenMock.mockReset();
    tauriInvokeMock.mockResolvedValue(undefined);
    tauriListenMock.mockResolvedValue(() => undefined);
    storage = new MemoryStorage();
  });

  it('A006/context: creates PluginContext with all required fields from plugin-sdk contract', () => {
    const context = createPluginContext('plugin.alpha', 'project', new ContributionStore(), '/tmp/project', storage);

    expect(context.surface).toBe('project');
    expect(context.projectPath).toBe('/tmp/project');
    expect(context.bus).toBeDefined();
    expect(context.commands).toBeDefined();
    expect(context.registry).toBeDefined();
    expect(context.settings).toBeDefined();
    expect(context.storage).toBeDefined();
    expect(context.apis).toBeDefined();
    expect(context.rust).toBeDefined();
    expect(context.logger).toBeDefined();
  });

  it('A005/communication: provides namespaced EventBus that isolates plugin topics', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);
    const handler = vi.fn();

    const dispose = context.bus.on('topic.ready', handler);
    context.bus.emit('topic.ready', { ok: true });

    expect(handler).toHaveBeenCalledWith({ ok: true });

    dispose();
    context.bus.emit('topic.ready', { ok: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('A005/communication: CommandBus allows register/execute within same host boundary', async () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);
    const dispose = context.commands.register('demo.command', async (args: unknown) => ({ args }));

    const result = await context.commands.execute<{ args?: unknown }>('demo.command', { value: 42 });

    expect(result).toEqual({ args: { value: 42 } });

    dispose();
    await expect(context.commands.execute('demo.command')).rejects.toThrow(/not registered/i);
  });

  it('A005/isolation: Logger output is prefixed with plugin id to prevent cross-plugin log confusion', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);

    context.logger.debug('d');
    context.logger.info('i');
    context.logger.warn('w');
    context.logger.error('e');

    expect(debugSpy).toHaveBeenCalledWith('[plugin.alpha]', 'd');
    expect(infoSpy).toHaveBeenCalledWith('[plugin.alpha]', 'i');
    expect(warnSpy).toHaveBeenCalledWith('[plugin.alpha]', 'w');
    expect(errorSpy).toHaveBeenCalledWith('[plugin.alpha]', 'e');
  });

  it('A005/isolation: SettingsRegistry stores under plugin-namespaced key', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);

    context.settings.set('theme', { mode: 'dark' });

    expect(context.settings.get<{ mode: string }>('theme')).toEqual({ mode: 'dark' });
    expect(storage.getItem('snapfzz:plugin:plugin.alpha:settings:theme')).toBe(JSON.stringify({ mode: 'dark' }));
  });

  it('A005/activation-events: fires onActivationEvent callback when command is executed', async () => {
    const onEvent = vi.fn();
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage, onEvent);

    context.commands.register('test.cmd', async () => 'ok');
    await context.commands.execute('test.cmd');

    expect(onEvent).toHaveBeenCalledWith('onCommand:test.cmd');
  });

  it('A005/activation-events: fires onActivationEvent callback when bus event is emitted', () => {
    const onEvent = vi.fn();
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage, onEvent);

    context.bus.emit('something', {});

    expect(onEvent).toHaveBeenCalledWith(expect.stringContaining('onEvent:'));
  });

  it('A005/isolation: settings onChange listeners receive updated values', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);
    const listener = vi.fn();

    context.settings.onChange('theme', listener);
    context.settings.set('theme', { mode: 'light' });

    expect(listener).toHaveBeenCalledWith({ mode: 'light' });
  });

  it('A005/context: registerTab routes leftPanel and workspace tabs into the contribution store', () => {
    const store = new ContributionStore();
    const context = createPluginContext('plugin.alpha', 'launcher', store, undefined, storage);

    context.registry.registerTab('leftPanel', {
      id: 'left.tab',
      label: 'Left',
      icon: 'icon',
      component: async () => ({ default: (() => null) as never }),
    });
    context.registry.registerTab('workspace', {
      id: 'workspace.tab',
      label: 'Workspace',
      icon: 'icon',
      component: async () => ({ default: (() => null) as never }),
    });

    expect(store.getLeftPanelTabs().map((tab) => tab.id)).toEqual(['left.tab']);
    expect(store.getWorkspaceTabs().map((tab) => tab.id)).toEqual(['workspace.tab']);
  });

  it('A005/context: registry tab disposables remove contributed tabs', () => {
    const store = new ContributionStore();
    const context = createPluginContext('plugin.alpha', 'launcher', store, undefined, storage);

    const disposeLeft = context.registry.registerTab('leftPanel', {
      id: 'left.disposable',
      label: 'Left Disposable',
      icon: 'icon',
      component: async () => ({ default: (() => null) as never }),
    });

    const disposeWorkspace = context.registry.registerTab('workspace', {
      id: 'workspace.disposable',
      label: 'Workspace Disposable',
      icon: 'icon',
      component: async () => ({ default: (() => null) as never }),
    });

    disposeLeft();
    disposeWorkspace();

    expect(store.getLeftPanelTabs()).toEqual([]);
    expect(store.getWorkspaceTabs()).toEqual([]);
  });

  it('A005/context: registry disposables remove bottom panels, status items, and generic components', () => {
    const store = new ContributionStore();
    const context = createPluginContext('plugin.alpha', 'launcher', store, undefined, storage);

    const disposePanel = context.registry.registerBottomPanel({
      id: 'panel.one',
      label: 'Panel',
      component: async () => ({ default: (() => null) as never }),
    });
    const disposeStatus = context.registry.registerStatusItem({
      id: 'status.one',
      position: 'left',
      component: async () => ({ default: (() => null) as never }),
    });
    const disposeComponent = context.registry.registerComponent({
      id: 'component.one',
      name: 'Component',
      component: async () => ({ default: (() => null) as never }),
    });

    expect(store.getBottomPanels()).toHaveLength(1);
    expect(store.getStatusItems()).toHaveLength(1);
    expect(store.getGenericComponents()).toHaveLength(1);

    disposePanel();
    disposeStatus();
    disposeComponent();

    expect(store.getBottomPanels()).toEqual([]);
    expect(store.getStatusItems()).toEqual([]);
    expect(store.getGenericComponents()).toEqual([]);
  });

  it('A005/isolation: settings listeners stop firing after onChange disposer is called', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);
    const listener = vi.fn();

    const dispose = context.settings.onChange('theme', listener);
    dispose();
    context.settings.set('theme', { mode: 'light' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('A005/isolation: settings get returns undefined for missing values and tolerates double-dispose', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);
    const listener = vi.fn();

    const dispose = context.settings.onChange('theme', listener);

    expect(context.settings.get('missing')).toBeUndefined();

    dispose();
    dispose();
    context.settings.set('theme', { mode: 'dark' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('A005/isolation: disposePluginContext is safe to call repeatedly', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);

    disposePluginContext(context);

    expect(() => disposePluginContext(context)).not.toThrow();
  });

  it('A005/isolation: storage get returns undefined for missing entries', async () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);

    await expect(context.storage.get('missing')).resolves.toBeUndefined();
  });

  it('A005/communication: api broker get throws when token is missing', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);

    expect(() => context.apis.get('missing.token')).toThrow(/not provided/i);
  });

  it('A006/rust-bridge: rust.invoke delegates to tauri bridge', async () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);

    tauriInvokeMock.mockResolvedValueOnce({ ok: true });

    await expect(context.rust.invoke('demo.command', { value: 1 })).resolves.toEqual({ ok: true });
    expect(tauriInvokeMock).toHaveBeenCalledWith('demo.command', { value: 1 });
  });

  it('A006/rust-bridge: rust.listen delegates to tauri bridge', async () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);
    const handler = vi.fn();

    const unlisten = await context.rust.listen('demo.event', handler);

    expect(tauriListenMock).toHaveBeenCalledWith('demo.event', handler);
    expect(typeof unlisten).toBe('function');
  });

  it('A005/isolation: plugin storage stores and deletes namespaced values', async () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);

    await context.storage.set('session', { id: 42 });
    expect(await context.storage.get<{ id: number }>('session')).toEqual({ id: 42 });
    expect(storage.getItem('snapfzz:plugin:plugin.alpha:storage:session')).toBe(JSON.stringify({ id: 42 }));

    await context.storage.delete('session');
    expect(await context.storage.get('session')).toBeUndefined();
  });

  it('A005/communication: api broker provides and tears down plugin-owned tokens on context disposal', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore(), undefined, storage);

    context.apis.provide('service.token', { ok: true });
    expect(context.apis.get<{ ok: boolean }>('service.token')).toEqual({ ok: true });

    disposePluginContext(context);

    expect(() => context.apis.get('service.token')).toThrow(/not provided/i);
  });
});
