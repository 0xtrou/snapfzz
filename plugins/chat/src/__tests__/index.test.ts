// Spec: chat/SPEC.md
// Sections: Plugin Manifest, Budget Registration (A008), Contributions, activate()
// Verifies: manifest shape, budget declaration, contributions structure, activate/deactivate lifecycle
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';
import type { PluginDefinition } from '@snapfzz/plugin-sdk/define-plugin';

// Per chat/SPEC manifest: definePlugin returns the definition as-is — test the exported object directly
function makePlugin(): PluginDefinition {
  vi.resetModules();
  // Using dynamic import via factory to bypass module cache issues
  return {
    id: 'snapfzz.chat',
    name: 'Chat',
    version: '0.1.0',
    description: 'Text conversation channel for AgentScope agents',
    surface: ['project'],
    activationEvents: ['onStartupFinished'],
    budget: {
      zone: 'zone3',
      reliability: { strikes: 3, windowSecs: 300 },
      network: { maxConcurrentInvokes: 2 },
      capabilities: [
        'rust.invoke',
        'rust.listen',
        'bus.emit',
        'commands.register',
        'settings.read',
        'storage.read',
        'logger',
      ],
    },
    contributes: {
      leftPanelTabs: [
        {
          id: 'chat',
          label: 'Chat',
          icon: 'MessageOutlined',
          component: () => import('../contributions/ChatPanel') as Promise<{ default: React.ComponentType }>,
        },
      ],
      statusItems: [
        { id: 'chat.connection', position: 'left' as const, component: () => import('../contributions/ConnectionStatus') as Promise<{ default: React.ComponentType }> },
        { id: 'chat.tokens', position: 'right' as const, component: () => import('../contributions/TokenCounter') as Promise<{ default: React.ComponentType }> },
      ],
      commands: [
        { id: 'chat.send', title: 'Send Message' },
        { id: 'chat.stop', title: 'Stop Generation' },
        { id: 'chat.clear', title: 'Clear Conversation' },
      ],
      shortcuts: [
        { command: 'chat.send', key: '⌘+Enter' },
        { command: 'chat.stop', key: 'Escape' },
      ],
    },
  };
}

// Per A005/Manifest: mock activate dependencies so we can call activate() cleanly
function makeCtx(overrides: Partial<PluginContext> = {}): PluginContext {
  const registerFn = vi.fn(() => vi.fn());
  return {
    rust: {
      invoke: vi.fn().mockResolvedValue({}),
      listen: vi.fn().mockResolvedValue(vi.fn()),
    } as unknown as PluginContext['rust'],
    bus: { emit: vi.fn(), listen: vi.fn(() => vi.fn()) } as unknown as PluginContext['bus'],
    commands: { register: registerFn, execute: vi.fn() },
    settings: { read: vi.fn() } as unknown as PluginContext['settings'],
    storage: { read: vi.fn() } as unknown as PluginContext['storage'],
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PluginContext['logger'],
    host: { reportCrash: vi.fn() } as unknown as PluginContext['host'],
    ...overrides,
  } as unknown as PluginContext;
}

describe('chat/manifest: plugin identity', () => {
  it('chat/manifest: declares correct plugin id', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.id).toBe('snapfzz.chat');
  });

  it('chat/manifest: declares correct plugin name', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.name).toBe('Chat');
  });

  it('chat/manifest: targets project surface only', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.surface).toEqual(['project']);
  });

  it('chat/manifest: uses onStartupFinished activation event', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.activationEvents).toContain('onStartupFinished');
  });
});

describe('chat/manifest: budget declaration (A008)', () => {
  it('chat/manifest: budget zone is zone3 (render-only, no compute)', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.budget?.zone).toBe('zone3');
  });

  it('chat/manifest: reliability configured with 3 strikes, 300s window', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.budget?.reliability?.strikes).toBe(3);
    expect(plugin.budget?.reliability?.windowSecs).toBe(300);
  });

  it('chat/manifest: network caps at 2 concurrent invokes', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.budget?.network?.maxConcurrentInvokes).toBe(2);
  });

  it('chat/manifest: declares rust.invoke and rust.listen capabilities', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.budget?.capabilities).toContain('rust.invoke');
    expect(plugin.budget?.capabilities).toContain('rust.listen');
  });

  it('chat/manifest: declares bus.emit, commands.register, settings.read, storage.read, logger', async () => {
    const { default: plugin } = await import('../index');
    const caps = plugin.budget?.capabilities ?? [];
    expect(caps).toContain('bus.emit');
    expect(caps).toContain('commands.register');
    expect(caps).toContain('settings.read');
    expect(caps).toContain('storage.read');
    expect(caps).toContain('logger');
  });
});

describe('chat/manifest: contributions', () => {
  it('chat/manifest: contributes one leftPanelTab with id chat', async () => {
    const { default: plugin } = await import('../index');
    expect(plugin.contributes?.leftPanelTabs).toHaveLength(1);
    expect(plugin.contributes?.leftPanelTabs?.[0].id).toBe('chat');
  });

  it('chat/manifest: leftPanelTab has label Chat and icon MessageOutlined', async () => {
    const { default: plugin } = await import('../index');
    const tab = plugin.contributes?.leftPanelTabs?.[0];
    expect(tab?.label).toBe('Chat');
    expect(tab?.icon).toBe('MessageOutlined');
  });

  it('chat/manifest: leftPanelTab component is a lazy import factory', async () => {
    const { default: plugin } = await import('../index');
    const tab = plugin.contributes?.leftPanelTabs?.[0];
    expect(typeof tab?.component).toBe('function');
  });

  it('chat/manifest: contributes two statusItems — connection on left, tokens on right', async () => {
    const { default: plugin } = await import('../index');
    const items = plugin.contributes?.statusItems ?? [];
    expect(items).toHaveLength(2);
    const connection = items.find((i) => i.id === 'chat.connection');
    const tokens = items.find((i) => i.id === 'chat.tokens');
    expect(connection?.position).toBe('left');
    expect(tokens?.position).toBe('right');
  });

  it('chat/manifest: contributes chat.send, chat.stop, chat.clear commands', async () => {
    const { default: plugin } = await import('../index');
    const commands = plugin.contributes?.commands ?? [];
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('chat.send');
    expect(ids).toContain('chat.stop');
    expect(ids).toContain('chat.clear');
  });

  it('chat/manifest: shortcut ⌘+Enter triggers chat.send', async () => {
    const { default: plugin } = await import('../index');
    const shortcuts = plugin.contributes?.shortcuts ?? [];
    const send = shortcuts.find((s) => s.command === 'chat.send');
    expect(send?.key).toBe('⌘+Enter');
  });

  it('chat/manifest: shortcut Escape triggers chat.stop', async () => {
    const { default: plugin } = await import('../index');
    const shortcuts = plugin.contributes?.shortcuts ?? [];
    const stop = shortcuts.find((s) => s.command === 'chat.stop');
    expect(stop?.key).toBe('Escape');
  });
});

describe('chat/activate: lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('chat/activate: activate returns a PluginHandle with deactivate()', async () => {
    vi.doMock('../hooks/use-chat', () => ({
      configureChatRuntime: vi.fn(),
      disposeChatRuntime: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      stopGeneration: vi.fn().mockResolvedValue(undefined),
      clearConversationSession: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: plugin } = await import('../index');
    const ctx = makeCtx();
    const handle: PluginHandle = await plugin.activate!(ctx);

    expect(handle).toBeDefined();
    expect(typeof handle.deactivate).toBe('function');
  });

  it('chat/activate: registers chat.send, chat.stop, chat.clear commands', async () => {
    vi.doMock('../hooks/use-chat', () => ({
      configureChatRuntime: vi.fn(),
      disposeChatRuntime: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      stopGeneration: vi.fn().mockResolvedValue(undefined),
      clearConversationSession: vi.fn().mockResolvedValue(undefined),
    }));

    const registerFn = vi.fn(() => vi.fn());
    const ctx = makeCtx({ commands: { register: registerFn, execute: vi.fn() } });

    const { default: plugin } = await import('../index');
    await plugin.activate!(ctx);

    const registeredIds = registerFn.mock.calls.map(([id]) => id);
    expect(registeredIds).toContain('chat.send');
    expect(registeredIds).toContain('chat.stop');
    expect(registeredIds).toContain('chat.clear');
  });

  it('chat/activate: command handlers pass payload/default text to sendMessage', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../hooks/use-chat', () => ({
      configureChatRuntime: vi.fn(),
      disposeChatRuntime: vi.fn(),
      sendMessage,
      stopGeneration: vi.fn().mockResolvedValue(undefined),
      clearConversationSession: vi.fn().mockResolvedValue(undefined),
    }));

    const registerFn = vi.fn(() => vi.fn());
    const ctx = makeCtx({ commands: { register: registerFn, execute: vi.fn() } });

    const { default: plugin } = await import('../index');
    await plugin.activate!(ctx);

    const sendRegistration = registerFn.mock.calls.find(([id]) => id === 'chat.send');
    expect(sendRegistration).toBeDefined();
    const sendHandler = sendRegistration?.[1] as (args?: unknown) => Promise<unknown>;

    await sendHandler({ text: 'hello from command' });
    await sendHandler(undefined);

    expect(sendMessage).toHaveBeenNthCalledWith(1, 'hello from command');
    expect(sendMessage).toHaveBeenNthCalledWith(2, '');
  });

  it('chat/activate: stop and clear handlers invoke runtime functions', async () => {
    const stopGeneration = vi.fn().mockResolvedValue(undefined);
    const clearConversationSession = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../hooks/use-chat', () => ({
      configureChatRuntime: vi.fn(),
      disposeChatRuntime: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      stopGeneration,
      clearConversationSession,
    }));

    const registerFn = vi.fn(() => vi.fn());
    const ctx = makeCtx({ commands: { register: registerFn, execute: vi.fn() } });

    const { default: plugin } = await import('../index');
    await plugin.activate!(ctx);

    const stopHandler = registerFn.mock.calls.find(([id]) => id === 'chat.stop')?.[1] as () => Promise<unknown>;
    const clearHandler = registerFn.mock.calls.find(([id]) => id === 'chat.clear')?.[1] as () => Promise<unknown>;

    await stopHandler();
    await clearHandler();

    expect(stopGeneration).toHaveBeenCalledTimes(1);
    expect(clearConversationSession).toHaveBeenCalledTimes(1);
  });

  it('chat/activate: deactivate disposes bridge listeners and unregisters commands', async () => {
    const disposeChatRuntime = vi.fn();
    vi.doMock('../hooks/use-chat', () => ({
      configureChatRuntime: vi.fn(),
      disposeChatRuntime,
      sendMessage: vi.fn().mockResolvedValue(undefined),
      stopGeneration: vi.fn().mockResolvedValue(undefined),
      clearConversationSession: vi.fn().mockResolvedValue(undefined),
    }));

    const unregSend = vi.fn();
    const unregStop = vi.fn();
    const unregClear = vi.fn();
    const registerFn = vi.fn()
      .mockReturnValueOnce(unregSend)
      .mockReturnValueOnce(unregStop)
      .mockReturnValueOnce(unregClear);

    const ctx = makeCtx({ commands: { register: registerFn, execute: vi.fn() } });

    const { default: plugin } = await import('../index');
    const handle = await plugin.activate!(ctx);
    await handle.deactivate();

    expect(unregSend).toHaveBeenCalled();
    expect(unregStop).toHaveBeenCalled();
    expect(unregClear).toHaveBeenCalled();
    expect(disposeChatRuntime).toHaveBeenCalled();
  });
});
