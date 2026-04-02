import type { PluginDefinition } from '@snapfzz/plugin-sdk';
import type { HostSurface } from '@snapfzz/plugin-sdk';

export class PluginHost {
  private plugins: Map<string, PluginDefinition> = new Map();
  private surface: HostSurface;

  constructor(surface: HostSurface) {
    this.surface = surface;
  }

  register(plugin: PluginDefinition) {
    this.plugins.set(plugin.id, plugin);
  }

  getPlugins(): PluginDefinition[] {
    return Array.from(this.plugins.values())
      .filter(p => p.surface.includes(this.surface));
  }
}
