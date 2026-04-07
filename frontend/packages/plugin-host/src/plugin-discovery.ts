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

  const loaders: Array<() => Promise<{ default: PluginDefinition }>> =
    surface === 'project'
      ? [() => import('@snapfzz/chat-plugin')]
        : surface === 'preferences'
        ? [
            // Per A007/settingsSections: Runtime section removed — agentscope host/port config
            // moved into Processes DetailPanel (A008/SupervisedDomain). settings-runtime plugin
            // is kept on disk for reference but disconnected from the preferences surface loader.
            () => import('@snapfzz/settings-general'),
            () => import('@snapfzz/settings-performance'),
            () => import('@snapfzz/settings-processes'),
            () => import('@snapfzz/settings-vault'),
            () => import('@snapfzz/settings-plugins'),
            () => import('@snapfzz/settings-advanced'),
          ]
        : [];

  for (const load of loaders) {
    try {
      const mod = await load();
      const manifest = mod.default;
      console.log(`[PluginDiscovery] Loaded ${manifest.id}`);
      registry.push({ manifest, loader: async () => manifest });
    } catch (e) {
      console.error('[PluginDiscovery] Failed to load plugin:', e);
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
