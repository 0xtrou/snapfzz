import type { ActivationEvent, PluginContext, PluginHandle, HostSurface } from '@snapfzz/plugin-sdk';
import type { PluginDefinition } from '@snapfzz/plugin-sdk/define-plugin';
import { ContributionStore } from './contribution-store';
import { createPluginContext, disposePluginContext } from './plugin-context-factory';

const scheduleDuringIdle = (callback: () => void): void => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => callback());
    return;
  }

  setTimeout(callback, 0);
};

interface ActivatedPlugin {
  handle: PluginHandle;
  context: PluginContext;
}

// Per A005/Lifecycle: 4 actions (install/uninstall/activate/deactivate) produce 5 observable states.
// Internal transitions (loading, resolving) are implementation detail — not exposed.
export type PluginLifecycleState =
  | 'registered'   // manifest known, code may or may not be loaded — can activate
  | 'ready'        // code loaded during background preload — can activate
  | 'running'      // activate() completed — plugin is active
  | 'disabled'     // user-disabled or crash-disabled — activate skipped
  | 'error';       // load or activation failed — needs explicit recovery

export interface PluginHostStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type PluginLoader = () => Promise<PluginDefinition>;

const DISABLED_PLUGINS_KEY = 'snapfzz:disabledPlugins';
const CRASH_WINDOW_MS = 300_000;
const MAX_CRASH_COUNT = 3;
const STARTUP_BUDGET_MS = 200;
const ACTIVATION_TIMEOUT_MS = 5_000;

export class PluginHost {
  // Per A006/PluginHost: runtime owns manifest registry keyed by plugin id for lookup + lifecycle ops.
  private plugins: Map<string, PluginDefinition> = new Map();
  private pluginLoaders: Map<string, PluginLoader> = new Map();
  private loadedPlugins: Map<string, PluginDefinition> = new Map();
  private activatedPlugins: Map<string, ActivatedPlugin> = new Map();
  private pluginStates: Map<string, PluginLifecycleState> = new Map();
  private disabledPlugins: Set<string>;
  private systemPlugins: Set<string> = new Set();
  private crashTimestamps: Map<string, number[]> = new Map();
  private firedEvents: Set<ActivationEvent> = new Set();
  private store: ContributionStore;
  private surface: HostSurface;
  private storage?: PluginHostStorage;

  constructor(store: ContributionStore, surface?: HostSurface, storage?: PluginHostStorage) {
    this.store = store;
    this.surface = surface ?? 'launcher';
    this.storage = storage;
    this.disabledPlugins = this.readDisabledPlugins();
  }

  register(plugin: PluginDefinition) {
    // Per A005/Lifecycle: registration keeps manifest metadata available before lazy code loading.
    this.plugins.set(plugin.id, plugin);
    this.pluginLoaders.set(plugin.id, async () => plugin);
    this.pluginStates.set(plugin.id, this.disabledPlugins.has(plugin.id) ? 'disabled' : 'registered');
  }

  async registerWithLoader(manifest: PluginDefinition, loader: PluginLoader): Promise<void> {
    // Per A005/Lifecycle: plugins register manifest + loader so activation can import lazily.
    this.plugins.set(manifest.id, manifest);
    this.pluginLoaders.set(manifest.id, loader);
    this.pluginStates.set(manifest.id, this.disabledPlugins.has(manifest.id) ? 'disabled' : 'registered');
  }

  // Per A005/Lifecycle: system plugins share the same API but are protected from uninstall.
  registerAsSystem(plugin: PluginDefinition): void {
    this.register(plugin);
    this.systemPlugins.add(plugin.id);
  }

  // Per A005/Lifecycle: host distinguishes system plugins to enforce uninstall protection.
  isSystemPlugin(pluginId: string): boolean {
    return this.systemPlugins.has(pluginId);
  }

  getPlugin(id: string): PluginDefinition | undefined {
    return this.plugins.get(id);
  }

  getPlugins(surface?: HostSurface): PluginDefinition[] {
    const targetSurface = surface ?? this.surface;
    return Array.from(this.plugins.values()).filter((p) => p.surface.includes(targetSurface));
  }

  getPluginState(pluginId: string): PluginLifecycleState | undefined {
    return this.pluginStates.get(pluginId);
  }

  isEnabled(pluginId: string): boolean {
    return !this.disabledPlugins.has(pluginId);
  }

  getDisabledPlugins(): string[] {
    return Array.from(this.disabledPlugins.values());
  }

  async enable(pluginId: string): Promise<void> {
    this.disabledPlugins.delete(pluginId);
    this.persistDisabledPlugins();

    if (this.pluginStates.get(pluginId) === 'disabled') {
      this.pluginStates.set(pluginId, 'registered');
    }

    // Per A005/Lifecycle: re-enable should reactivate only if its activation events have already fired.
    for (const event of this.firedEvents) {
      const plugin = this.plugins.get(pluginId);
      if (plugin && plugin.activationEvents.includes(event)) {
        await this.activate(pluginId);
        break;
      }
    }
  }

  async disable(pluginId: string): Promise<void> {
    this.disabledPlugins.add(pluginId);
    this.pluginStates.set(pluginId, 'disabled');
    this.persistDisabledPlugins();

    // Per A005/Lifecycle: disable must deactivate running plugin and remove contributions.
    await this.deactivate(pluginId);
    this.pluginStates.set(pluginId, 'disabled');
  }

  reportCrash(pluginId: string): void {
    const now = Date.now();
    const timestamps = this.pruneCrashWindow(pluginId, now);
    timestamps.push(now);
    this.crashTimestamps.set(pluginId, timestamps);

    // Per A005/Isolation: 3 crashes in 5 minutes triggers automatic disable.
    if (timestamps.length >= MAX_CRASH_COUNT) {
      void this.disable(pluginId);
    }
  }

  getCrashCount(pluginId: string): number {
    return this.pruneCrashWindow(pluginId, Date.now()).length;
  }

  resolve(): PluginDefinition[] {
    // Per A005/PluginLifecycle: topological sort ensures dependencies activate before dependents.
    const plugins = this.getPlugins();
    const pluginMap = new Map(plugins.map((p) => [p.id, p]));
    const result: PluginDefinition[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (pluginId: string) => {
      if (visited.has(pluginId)) {
        return;
      }
      if (visiting.has(pluginId)) {
        throw new Error(`Circular dependency detected: ${pluginId}`);
      }

      const plugin = pluginMap.get(pluginId);
      if (!plugin) {
        throw new Error(`Missing dependency: ${pluginId}`);
      }

      visiting.add(pluginId);

      const deps = plugin.dependencies ?? {};
      for (const depId of Object.keys(deps)) {
        if (!pluginMap.has(depId)) {
          throw new Error(`Plugin '${pluginId}' has missing dependency: ${depId}`);
        }
        visit(depId);
      }

      visiting.delete(pluginId);
      visited.add(pluginId);
      result.push(plugin);
      if (!this.disabledPlugins.has(plugin.id)) {
        this.pluginStates.set(plugin.id, 'registered');
      }
    };

    for (const plugin of plugins) {
      visit(plugin.id);
    }

    return result;
  }

  async activate(pluginId: string): Promise<PluginHandle> {
    if (this.disabledPlugins.has(pluginId)) {
      return {};
    }

    const existing = this.activatedPlugins.get(pluginId);
    if (existing) {
      return existing.handle;
    }

    const plugin = await this.loadPluginDefinition(pluginId);

    // Per A002/Zone2: lifecycle activation logic stays runtime-only and React/DOM free.
    const context = createPluginContext(
      pluginId,
      this.surface,
      this.store,
      undefined,
      this.storage,
      (event) => {
        void this.activateByEvent(event as ActivationEvent);
      },
    );
    const startedAt = Date.now();

    try {
      const activationPromise = plugin.activate ? plugin.activate(context) : Promise.resolve({});
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Plugin '${pluginId}' activation timed out after ${ACTIVATION_TIMEOUT_MS}ms`)),
          ACTIVATION_TIMEOUT_MS,
        );
      });

      // Per A005/Lifecycle: plugins that exceed activation timeout are killed to protect startup budget.
      const handle = await Promise.race<PluginHandle, Promise<never>>([activationPromise, timeoutPromise]);
      const elapsed = Date.now() - startedAt;

      if (elapsed > ACTIVATION_TIMEOUT_MS) {
        console.warn(`[PluginHost] Plugin '${pluginId}' activation took ${elapsed}ms (over ${ACTIVATION_TIMEOUT_MS}ms budget)`);
      }

      this.activatedPlugins.set(pluginId, { handle, context });
      this.pluginStates.set(pluginId, 'running');
      this.registerManifestContributions(plugin);

      this.crashTimestamps.delete(pluginId);
      return handle;
    } catch (error) {
      this.pluginStates.set(pluginId, 'error');
      disposePluginContext(context);
      throw error;
    }
  }

  async deactivate(pluginId: string): Promise<void> {
    const activated = this.activatedPlugins.get(pluginId);
    if (!activated) {
      return;
    }

    if (activated.handle.deactivate) {
      await activated.handle.deactivate();
    }

    disposePluginContext(activated.context);
    this.activatedPlugins.delete(pluginId);

    // Per A005/Lifecycle: deactivated plugin returns to registered — ready to activate again.
    if (!this.disabledPlugins.has(pluginId)) {
      this.pluginStates.set(pluginId, this.loadedPlugins.has(pluginId) ? 'ready' : 'registered');
    }
  }

  async activateByEvent(event: ActivationEvent): Promise<void> {
    this.firedEvents.add(event);

    const ordered = this.resolve();
    const shouldActivate = new Set<string>();

    for (const plugin of ordered) {
      if (!plugin.activationEvents.includes(event)) {
        continue;
      }
      this.collectDependencies(plugin.id, shouldActivate);
      shouldActivate.add(plugin.id);
    }

    const startupBegin = Date.now();

    for (const plugin of ordered) {
      if (!shouldActivate.has(plugin.id)) {
        continue;
      }

      if (this.disabledPlugins.has(plugin.id)) {
        continue;
      }

      await this.activate(plugin.id);
    }

    // Per A005/Lifecycle: startup plugins must fit a 200ms critical budget.
    if (event === 'onStartupFinished') {
      const startupElapsed = Date.now() - startupBegin;
      if (startupElapsed > STARTUP_BUDGET_MS) {
        console.warn(`[PluginHost] Startup activation budget exceeded: ${startupElapsed}ms`);
      }
    } else {
      // Per A005/Lifecycle: non-critical plugins preload in background using requestIdleCallback for idle-time scheduling.
      this.scheduleBackgroundPreload();
    }
  }

  async activateAll(surface: HostSurface): Promise<void> {
    this.surface = surface;
    await this.activateByEvent('onStartupFinished');
    this.scheduleBackgroundPreload();
  }

  async reload(pluginId: string): Promise<void> {
    // Per A005/Lifecycle: reload sequence is deactivate → re-import via loader → re-activate.
    await this.deactivate(pluginId);
    this.loadedPlugins.delete(pluginId);
    await this.loadPluginDefinition(pluginId);
    await this.activate(pluginId);
  }

  async uninstall(pluginId: string): Promise<void> {
    if (this.isSystemPlugin(pluginId)) {
      throw new Error(`Cannot uninstall system plugin: ${pluginId}`);
    }

    await this.deactivate(pluginId);
    this.plugins.delete(pluginId);
    this.pluginLoaders.delete(pluginId);
    this.loadedPlugins.delete(pluginId);
    this.pluginStates.delete(pluginId);
    this.disabledPlugins.delete(pluginId);
    this.crashTimestamps.delete(pluginId);
    this.persistDisabledPlugins();
  }

  private registerManifestContributions(plugin: PluginDefinition): void {
    const c = plugin.contributes;
    if (!c) return;

    if (c.leftPanelTabs) {
      for (const tab of c.leftPanelTabs) {
        this.store.registerLeftPanelTab(tab as import('@snapfzz/plugin-sdk').TabContribution);
      }
    }
    if (c.workspaceTabs) {
      for (const tab of c.workspaceTabs) {
        this.store.registerWorkspaceTab(tab as import('@snapfzz/plugin-sdk').TabContribution);
      }
    }
    if (c.bottomPanels) {
      for (const panel of c.bottomPanels) {
        this.store.registerBottomPanel(panel as import('@snapfzz/plugin-sdk').PanelContribution);
      }
    }
    if (c.statusItems) {
      for (const item of c.statusItems) {
        this.store.registerStatusItem(item as import('@snapfzz/plugin-sdk').StatusItemContribution);
      }
    }
    if (c.commands) {
      for (const cmd of c.commands) {
        this.store.registerCommand(cmd as import('@snapfzz/plugin-sdk').CommandContribution);
      }
    }
    if (c.shortcuts) {
      for (const shortcut of c.shortcuts) {
        this.store.registerShortcut(shortcut as import('@snapfzz/plugin-sdk').ShortcutContribution);
      }
    }
  }

  async update(pluginId: string, loader: PluginLoader): Promise<void> {
    const manifest = this.plugins.get(pluginId);
    if (!manifest) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    this.pluginLoaders.set(pluginId, loader);
    await this.reload(pluginId);
  }

  private async loadPluginDefinition(pluginId: string): Promise<PluginDefinition> {
    const cached = this.loadedPlugins.get(pluginId);
    if (cached) {
      return cached;
    }

    const manifest = this.plugins.get(pluginId);
    if (!manifest) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const loader = this.pluginLoaders.get(pluginId);
    if (!loader) {
      throw new Error(`Loader not found for plugin: ${pluginId}`);
    }

    try {
      const loaded = await loader();
      const merged = { ...loaded, id: manifest.id };
      this.plugins.set(pluginId, merged);
      this.loadedPlugins.set(pluginId, merged);

      const currentState = this.pluginStates.get(pluginId);
      if (currentState === 'registered') {
        this.pluginStates.set(pluginId, 'ready');
      }

      return merged;
    } catch (error) {
      this.pluginStates.set(pluginId, 'error');
      throw error;
    }
  }

  private collectDependencies(pluginId: string, collector: Set<string>): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return;
    }

    const dependencies = Object.keys(plugin.dependencies ?? {});
    for (const dependencyId of dependencies) {
      if (collector.has(dependencyId)) {
        continue;
      }
      collector.add(dependencyId);
      this.collectDependencies(dependencyId, collector);
    }
  }

  private scheduleBackgroundPreload(): void {
    scheduleDuringIdle(() => {
      void this.preloadNonCriticalPlugins();
    });
  }

  private async preloadNonCriticalPlugins(): Promise<void> {
    const ordered = this.resolve();

    for (const plugin of ordered) {
      if (this.disabledPlugins.has(plugin.id)) {
        continue;
      }

      if (plugin.activationEvents.includes('onStartupFinished')) {
        continue;
      }

      if (this.loadedPlugins.has(plugin.id)) {
        continue;
      }

      await this.loadPluginDefinition(plugin.id);
      await new Promise<void>((resolve) => {
        scheduleDuringIdle(() => resolve());
      });
    }
  }

  private readDisabledPlugins(): Set<string> {
    if (!this.storage) {
      return new Set();
    }

    const value = this.storage.getItem(DISABLED_PLUGINS_KEY);
    if (!value) {
      return new Set();
    }

    try {
      const parsed = JSON.parse(value) as string[];
      return new Set(parsed);
    } catch {
      return new Set();
    }
  }

  private persistDisabledPlugins(): void {
    if (!this.storage) {
      return;
    }

    this.storage.setItem(DISABLED_PLUGINS_KEY, JSON.stringify(Array.from(this.disabledPlugins.values())));
  }

  private pruneCrashWindow(pluginId: string, now: number): number[] {
    const timestamps = this.crashTimestamps.get(pluginId) ?? [];
    const filtered = timestamps.filter((timestamp) => now - timestamp <= CRASH_WINDOW_MS);
    this.crashTimestamps.set(pluginId, filtered);
    return filtered;
  }
}
