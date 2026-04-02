import type {
  ApiBroker,
  CommandRegistry,
  ContributionRegistry,
  Disposable,
  EventBus,
  Logger,
  PluginContext,
  PluginStorage,
  RustBridge,
  SettingsRegistry,
} from '@snapfzz/plugin-sdk';
import type { HostSurface } from '@snapfzz/plugin-sdk';
import { createEventBus, createTauriBridge } from '@snapfzz/shared';
import type { ContributionStore } from './contribution-store';

const sharedEventBus = createEventBus();
const sharedCommandHandlers = new Map<string, (args?: unknown) => Promise<unknown>>();
const sharedApis = new Map<string, unknown>();
const sharedApiOwners = new Map<string, string>();
const contextDisposables = new WeakMap<PluginContext, Set<Disposable>>();

const inMemoryStorage = new Map<string, string>();

function getStorageLike() {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }

  return {
    getItem(key: string) {
      return inMemoryStorage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      inMemoryStorage.set(key, value);
    },
    removeItem(key: string) {
      inMemoryStorage.delete(key);
    },
  };
}

function normalizeTopic(pluginId: string, topic: string): string {
  return topic.includes(':') ? topic : `${pluginId}:${topic}`;
}

function attachDisposable(context: PluginContext, dispose: Disposable) {
  const disposables = contextDisposables.get(context);
  if (!disposables) {
    return;
  }
  disposables.add(dispose);
}

export function disposePluginContext(context: PluginContext): void {
  const disposables = contextDisposables.get(context);
  if (!disposables) {
    return;
  }

  for (const dispose of disposables) {
    dispose();
  }

  contextDisposables.delete(context);
}

export function createPluginContext(
  pluginId: string,
  surface: HostSurface,
  store: ContributionStore,
  projectPath?: string,
): PluginContext {
  const storageLike = getStorageLike();
  const settingsListeners = new Map<string, Set<(value: unknown) => void>>();

  const context: PluginContext = {
    bus: {} as EventBus,
    commands: {} as CommandRegistry,
    registry: {} as ContributionRegistry,
    settings: {} as SettingsRegistry,
    storage: {} as PluginStorage,
    apis: {} as ApiBroker,
    rust: {} as RustBridge,
    logger: {} as Logger,
    surface,
    projectPath,
  };

  contextDisposables.set(context, new Set());

  context.bus = {
    emit(topic, payload) {
      sharedEventBus.emit(normalizeTopic(pluginId, topic), payload);
    },
    on(topic, handler) {
      const dispose = sharedEventBus.on(normalizeTopic(pluginId, topic), handler);
      attachDisposable(context, dispose);
      return dispose;
    },
  };

  context.commands = {
    async execute<T = unknown>(commandId: string, args?: unknown): Promise<T> {
      const handler = sharedCommandHandlers.get(commandId);
      if (!handler) {
        throw new Error(`Command '${commandId}' is not registered`);
      }
      return handler(args) as Promise<T>;
    },
    register(commandId: string, handler: (args?: unknown) => Promise<unknown>) {
      sharedCommandHandlers.set(commandId, handler);
      const dispose = () => {
        sharedCommandHandlers.delete(commandId);
      };
      attachDisposable(context, dispose);
      return dispose;
    },
  };

  context.registry = {
    registerTab(registrySurface, tab) {
      const dispose =
        registrySurface === 'leftPanel' ? store.registerLeftPanelTab(tab) : store.registerWorkspaceTab(tab);
      attachDisposable(context, dispose);
      return dispose;
    },
    registerBottomPanel(panel) {
      const dispose = store.registerBottomPanel(panel);
      attachDisposable(context, dispose);
      return dispose;
    },
    registerStatusItem(item) {
      const dispose = store.registerStatusItem(item);
      attachDisposable(context, dispose);
      return dispose;
    },
    registerComponent(_component) {
      const dispose = () => {};
      attachDisposable(context, dispose);
      return dispose;
    },
  };

  context.settings = {
    get<T>(key: string): T | undefined {
      const value = storageLike.getItem(`snapfzz:plugin:${pluginId}:settings:${key}`);
      if (value === null) {
        return undefined;
      }

      return JSON.parse(value) as T;
    },
    set<T>(key: string, value: T): void {
      storageLike.setItem(`snapfzz:plugin:${pluginId}:settings:${key}`, JSON.stringify(value));
      const listeners = settingsListeners.get(key);
      if (!listeners) {
        return;
      }
      for (const listener of listeners) {
        listener(value);
      }
    },
    onChange(key: string, handler: (value: unknown) => void): Disposable {
      const listeners = settingsListeners.get(key) ?? new Set<(value: unknown) => void>();
      listeners.add(handler);
      settingsListeners.set(key, listeners);

      const dispose = () => {
        const current = settingsListeners.get(key);
        if (!current) {
          return;
        }
        current.delete(handler);
        if (current.size === 0) {
          settingsListeners.delete(key);
        }
      };

      attachDisposable(context, dispose);
      return dispose;
    },
  };

  context.storage = {
    async get<T>(key: string): Promise<T | undefined> {
      const value = storageLike.getItem(`snapfzz:plugin:${pluginId}:storage:${key}`);
      if (value === null) {
        return undefined;
      }

      return JSON.parse(value) as T;
    },
    async set<T>(key: string, value: T): Promise<void> {
      storageLike.setItem(`snapfzz:plugin:${pluginId}:storage:${key}`, JSON.stringify(value));
    },
    async delete(key: string): Promise<void> {
      storageLike.removeItem(`snapfzz:plugin:${pluginId}:storage:${key}`);
    },
  };

  context.apis = {
    get<T>(token: string): T {
      if (!sharedApis.has(token)) {
        throw new Error(`API token '${token}' is not provided`);
      }
      return sharedApis.get(token) as T;
    },
    provide<T>(token: string, impl: T): void {
      sharedApis.set(token, impl);
      sharedApiOwners.set(token, pluginId);
      attachDisposable(context, () => {
        if (sharedApiOwners.get(token) === pluginId) {
          sharedApiOwners.delete(token);
          sharedApis.delete(token);
        }
      });
    },
  };

  const tauriBridge = createTauriBridge();
  context.rust = {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
      return tauriBridge.invoke<T>(command, args);
    },
    listen<T>(event: string, handler: (payload: T) => void): Promise<Disposable> {
      return tauriBridge.listen<T>(event, handler);
    },
  };

  const prefix = `[${pluginId}]`;
  context.logger = {
    debug(msg: string, ...args: unknown[]) {
      console.debug(prefix, msg, ...args);
    },
    info(msg: string, ...args: unknown[]) {
      console.info(prefix, msg, ...args);
    },
    warn(msg: string, ...args: unknown[]) {
      console.warn(prefix, msg, ...args);
    },
    error(msg: string, ...args: unknown[]) {
      console.error(prefix, msg, ...args);
    },
  };

  return context;
}
