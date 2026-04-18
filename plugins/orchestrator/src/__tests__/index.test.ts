// Spec: chat/SPEC.md — Plugin Manifest, Budget Registration (A008),
// Contributions, activate() lifecycle.
//
// The hand-rolled chat stack (orchestrator.send / stop / clear commands, the
// use-chat hook, the custom MessageList) was replaced by Spark's
// `AgentScopeRuntimeWebUI` — Spark's own Sender now owns the send/stop hot
// path, so this suite only asserts the manifest shape + activate lifecycle
// that still belongs to us.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginContext } from '@snapfzz/plugin-sdk';

function makeCtx(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    rust: {
      invoke: vi.fn().mockResolvedValue({}),
      listen: vi.fn().mockResolvedValue(vi.fn()),
    } as unknown as PluginContext['rust'],
    bus: { emit: vi.fn(), listen: vi.fn(() => vi.fn()) } as unknown as PluginContext['bus'],
    commands: { register: vi.fn(() => vi.fn()), execute: vi.fn() } as unknown as PluginContext['commands'],
    settings: { read: vi.fn() } as unknown as PluginContext['settings'],
    storage: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      delete: vi.fn(),
    } as unknown as PluginContext['storage'],
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PluginContext['logger'],
    ...overrides,
  } as unknown as PluginContext;
}

describe('chat/manifest: plugin identity', () => {
  it('declares correct plugin id', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.id).toBe('snapfzz.orchestrator');
  });

  it('declares correct plugin name', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.name).toBe('Orchestrator');
  });

  it('targets project surface only', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.surface).toEqual(['project']);
  });

  it('uses onStartupFinished activation event', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.activationEvents).toEqual(['onStartupFinished']);
  });
});

describe('chat/manifest: budget declaration (A008)', () => {
  it('budget zone is zone3 (render-only, no compute)', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.budget.zone).toBe('zone3');
  });

  it('declares expected capabilities', async () => {
    const { default: plugin } = await import('../index');
    const caps = plugin.budget.capabilities ?? [];
    expect(caps).toContain('rust.invoke');
    expect(caps).toContain('rust.listen');
    expect(caps).toContain('commands.register');
    expect(caps).toContain('storage.read');
  });
});

describe('chat/manifest: contributions', () => {
  it('contributes one leftPanelTab with id chat', async () => {
    const { default: plugin } = await import('../index');
    const tabs = plugin.contributes?.leftPanelTabs ?? [];
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('chat');
  });

  it('leftPanelTab has label Chat and icon MessageOutlined', async () => {
    const { default: plugin } = await import('../index');
    const tab = plugin.contributes?.leftPanelTabs?.[0];
    expect(tab?.label).toBe('Chat');
    expect(tab?.icon).toBe('MessageOutlined');
  });

  it('contributes two statusItems — connection on left, tokens on right', async () => {
    const { default: plugin } = await import('../index');
    const items = plugin.contributes?.statusItems ?? [];
    expect(items).toHaveLength(2);
    const conn = items.find((i) => i.id === 'orchestrator.connection');
    const tok = items.find((i) => i.id === 'orchestrator.tokens');
    expect(conn?.position).toBe('left');
    expect(tok?.position).toBe('right');
  });
});

describe('chat/manifest: python runtime declaration', () => {
  it('declares the chat.orchestrator python runtime', async () => {
    const { default: plugin } = await import('../index');
    const runtimes = plugin.runtimes?.python ?? [];
    expect(runtimes).toHaveLength(1);
    expect(runtimes[0].id).toBe('chat.orchestrator');
    expect(runtimes[0].healthCheck).toBe('/health');
  });
});

describe('chat/activate: lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('activate returns a PluginHandle with deactivate()', async () => {
    const { default: plugin } = await import('../index');
    const ctx = makeCtx();
    const handle = await plugin.activate(ctx);
    expect(handle).toBeDefined();
    expect(typeof handle.deactivate).toBe('function');
  });

  it('deactivate clears the module-level plugin ctx', async () => {
    const { default: plugin } = await import('../index');
    const { getPluginContext } = await import('../contributions/runtime');
    const ctx = makeCtx();
    const handle = await plugin.activate(ctx);
    expect(getPluginContext()).toBe(ctx);
    await handle.deactivate?.();
    expect(getPluginContext()).toBeNull();
  });
});
