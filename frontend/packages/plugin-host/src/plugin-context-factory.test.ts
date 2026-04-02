import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContributionStore } from './contribution-store';
import { createPluginContext } from './plugin-context-factory';

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

describe('createPluginContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      writable: true,
      configurable: true,
    });
  });

  it('creates PluginContext with all required fields', () => {
    const context = createPluginContext('plugin.alpha', 'project', new ContributionStore(), '/tmp/project');

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

  it('supports namespaced EventBus emit/on', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore());
    const handler = vi.fn();

    const dispose = context.bus.on('topic.ready', handler);
    context.bus.emit('topic.ready', { ok: true });

    expect(handler).toHaveBeenCalledWith({ ok: true });

    dispose();
    context.bus.emit('topic.ready', { ok: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports CommandBus register/execute', async () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore());
    const dispose = context.commands.register('demo.command', async (args) => ({ args }));

    const result = await context.commands.execute<{ args?: unknown }>('demo.command', { value: 42 });

    expect(result).toEqual({ args: { value: 42 } });

    dispose();
    await expect(context.commands.execute('demo.command')).rejects.toThrow(/not registered/i);
  });

  it('prefixes logger output with plugin id', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore());

    context.logger.debug('d');
    context.logger.info('i');
    context.logger.warn('w');
    context.logger.error('e');

    expect(debugSpy).toHaveBeenCalledWith('[plugin.alpha]', 'd');
    expect(infoSpy).toHaveBeenCalledWith('[plugin.alpha]', 'i');
    expect(warnSpy).toHaveBeenCalledWith('[plugin.alpha]', 'w');
    expect(errorSpy).toHaveBeenCalledWith('[plugin.alpha]', 'e');
  });

  it('stores settings under a plugin namespace', () => {
    const context = createPluginContext('plugin.alpha', 'launcher', new ContributionStore());

    context.settings.set('theme', { mode: 'dark' });

    expect(context.settings.get<{ mode: string }>('theme')).toEqual({ mode: 'dark' });
    expect(globalThis.localStorage.getItem('snapfzz:plugin:plugin.alpha:settings:theme')).toBe(
      JSON.stringify({ mode: 'dark' }),
    );
  });
});
