// Spec: A005-feat-plugin-architecture.md, A006-core-runtime.md
// Sections: Plugin Context, Plugin Communication, Isolation
// Verifies: PluginContext shape, namespaced bus, command registry, logger prefixing, settings/storage namespacing
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContributionStore } from './contribution-store';
import { createPluginContext, type ContextStorageAdapter } from './plugin-context-factory';

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
});
