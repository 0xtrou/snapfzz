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
export async function discoverPlugins(surface: HostSurface): Promise<DiscoveredManifest[]> {
  // Ugly phase: hardcoded plugin list. Production: Rust reads .snapfzz/plugins/ manifests.
  const registry: DiscoveredManifest[] = [];

  if (surface === 'project') {
    try {
      const chatModule = await import('@snapfzz/chat-plugin');
      const manifest = chatModule.default;
      console.log('[PluginDiscovery] Loaded chat plugin:', manifest.id);
      registry.push({ manifest, loader: async () => manifest });
    } catch (e) {
      console.error('[PluginDiscovery] Failed to load @snapfzz/chat-plugin:', e);
    }
  }

  return registry;
}

export async function registerDiscoveredPlugins(host: PluginHost, surface: HostSurface): Promise<void> {
  const discovered = await discoverPlugins(surface);
  console.log(`[PluginDiscovery] Registering ${discovered.length} plugins for surface: ${surface}`);
  for (const { manifest } of discovered) {
    host.register(manifest);
  }
}
