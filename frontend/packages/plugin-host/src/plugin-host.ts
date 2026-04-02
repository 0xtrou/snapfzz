import type { PluginDefinition, PluginContext, PluginHandle, HostSurface } from '@snapfzz/plugin-sdk';
import { ContributionStore } from './contribution-store';
import { createPluginContext, disposePluginContext } from './plugin-context-factory';

interface ActivatedPlugin {
  handle: PluginHandle;
  context: PluginContext;
}

export class PluginHost {
  // Per A006/PluginHost: runtime owns manifest registry keyed by plugin id for lookup + lifecycle ops.
  private plugins: Map<string, PluginDefinition> = new Map();
  private activatedPlugins: Map<string, ActivatedPlugin> = new Map();
  private store: ContributionStore;
  private surface: HostSurface;

  // TODO(009/Manifest + 010/PluginHost): this host currently receives pre-imported plugin definitions via register().
  // Spec-required manifest discovery + lazy JS chunk loading by activationEvents is not implemented yet.

  constructor(store: ContributionStore, surface?: HostSurface) {
    this.store = store;
    this.surface = surface ?? 'launcher';
  }

  register(plugin: PluginDefinition) {
    // Per A005/PluginLifecycle: registration stores manifest for later resolution/activation
    this.plugins.set(plugin.id, plugin);
  }

  getPlugin(id: string): PluginDefinition | undefined {
    return this.plugins.get(id);
  }

  getPlugins(surface?: HostSurface): PluginDefinition[] {
    const targetSurface = surface ?? this.surface;
    return Array.from(this.plugins.values()).filter((p) =>
      p.surface.includes(targetSurface)
    );
  }

  resolve(): PluginDefinition[] {
    // Per A005/PluginLifecycle: topological sort ensures dependencies activate before dependents
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
    };

    for (const plugin of plugins) {
      visit(plugin.id);
    }

    return result;
  }

  async activate(pluginId: string): Promise<PluginHandle> {
    // TODO(009/PluginLifecycle): activationEvents are declared in manifest but host does not gate activation by event.
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const existing = this.activatedPlugins.get(pluginId);
    if (existing) {
      return existing.handle;
    }

    // Per A002/StateManagement: host core stays React-free; activation wires plain runtime services only.
    const context = createPluginContext(pluginId, this.surface, this.store);
    const handle = plugin.activate ? await plugin.activate(context) : {};

    // TODO(009/Isolation): spec calls for worker-hosted plugin logic + crash supervision; current host activates on main thread.

    this.activatedPlugins.set(pluginId, { handle, context });
    return handle;
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
  }

  async activateAll(surface: HostSurface): Promise<void> {
    const ordered = this.resolve().filter((p) => p.surface.includes(surface));
    // Per A005/PluginLifecycle: activation runs serially in dependency order for deterministic startup.
    for (const plugin of ordered) {
      await this.activate(plugin.id);
    }
  }
}

