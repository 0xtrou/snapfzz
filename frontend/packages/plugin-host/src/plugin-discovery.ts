// Per A006/CoreRuntime: manifest discovery reads plugin metadata and registers loaders into PluginHost.
// Per A005/PluginArchitecture: shells never import plugins directly — discovery is the runtime bridge.
import type { HostSurface } from '@snapfzz/plugin-sdk';
import type { PluginDefinition } from '@snapfzz/plugin-sdk/define-plugin';
import type { PluginHost } from './plugin-host';

export interface DiscoveredManifest {
  manifest: PluginDefinition;
  loader: () => Promise<PluginDefinition>;
}

/**
 * Per A006/BootSequence: discovers plugin manifests available for the given surface.
 *
 * Current implementation: returns an empty list (no plugins shipped yet).
 * Future: reads manifests from .snapfzz/plugins/ or Tauri IPC.
 */
export async function discoverPlugins(_surface: HostSurface): Promise<DiscoveredManifest[]> {
  // Per A006/CoreRuntime: plugin discovery is async to support future Tauri IPC manifest reads.
  return [];
}

/**
 * Per A006/BootSequence: registers all discovered plugins into the host before activation.
 */
export async function registerDiscoveredPlugins(host: PluginHost, surface: HostSurface): Promise<void> {
  const discovered = await discoverPlugins(surface);
  for (const { manifest, loader } of discovered) {
    await host.registerWithLoader(manifest, loader);
  }
}
