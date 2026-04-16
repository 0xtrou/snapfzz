// Per A006/CoreRuntime: manifest discovery reads plugin metadata and registers loaders into PluginHost.
// Per A005/PluginArchitecture: shells never import plugins directly — discovery is the runtime bridge.
import type { HostSurface } from '@snapfzz/plugin-sdk';
import type { PluginDefinition } from '@snapfzz/plugin-sdk/define-plugin';
import { createTauriBridge } from '@snapfzz/shared';
import type { PluginHost } from './plugin-host';

export interface DiscoveredManifest {
  manifest: PluginDefinition;
  loader: () => Promise<PluginDefinition>;
}

/** Shape returned by the `list_installed_plugins` Tauri command. */
export interface InstalledPluginInfo {
  pluginId: string;
  manifestPath: string;
  distPath: string;
}

/**
 * Convert a local file path to an asset:// URL loadable by the Tauri webview.
 * Falls back to null when not running inside Tauri (tests, web preview).
 */
async function toAssetUrl(filePath: string): Promise<string | null> {
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    return convertFileSrc(filePath);
  } catch {
    return null;
  }
}

/**
 * Per A006/BootSequence: discovers plugin manifests available for the given surface.
 *
 * Two-tier discovery:
 *   Tier 1 — In-tree settings plugins (hardcoded imports, not yet installed to ~/.snapfzz/plugins/)
 *   Tier 2 — Installed plugins from ~/.snapfzz/plugins/ via Tauri IPC
 */
export async function discoverPlugins(surface: HostSurface): Promise<DiscoveredManifest[]> {
  const registry: DiscoveredManifest[] = [];

  // Tier 1: In-tree settings plugins (still hardcoded — not yet installed to ~/.snapfzz/plugins/)
  if (surface === 'preferences') {
    const settingsLoaders: Array<() => Promise<{ default: PluginDefinition }>> = [
      // Per A007/settingsSections: Runtime section removed — agentscope host/port config
      // moved into Processes DetailPanel (A008/SupervisedDomain). settings-runtime plugin
      // is kept on disk for reference but disconnected from the preferences surface loader.
      () => import('@snapfzz/settings-general'),
      () => import('@snapfzz/settings-performance'),
      () => import('@snapfzz/settings-processes'),
      () => import('@snapfzz/settings-vault'),
      () => import('@snapfzz/settings-plugins'),
      () => import('@snapfzz/settings-components'),
      () => import('@snapfzz/settings-diagnostics'),
      () => import('@snapfzz/settings-advanced'),
      () => import('@snapfzz/settings-llm'),
    ];

    for (const load of settingsLoaders) {
      try {
        const mod = await load();
        const manifest = mod.default;
        console.log(`[PluginDiscovery] Loaded ${manifest.id}`);
        registry.push({ manifest, loader: async () => manifest });
      } catch (e) {
        console.error('[PluginDiscovery] Failed to load settings plugin:', e);
      }
    }
  }

  // Tier 2: Installed plugins from ~/.snapfzz/plugins/ (system + user)
  try {
    const bridge = createTauriBridge();
    if (!bridge.isAvailable) {
      return registry;
    }

    const installed = await bridge.invoke<InstalledPluginInfo[]>('list_installed_plugins');
    if (!installed?.length) {
      return registry;
    }

    for (const info of installed) {
      try {
        // Read manifest.json to check surface match
        const manifestUrl = await toAssetUrl(info.manifestPath);
        if (!manifestUrl) continue;

        const manifestResponse = await fetch(manifestUrl);
        if (!manifestResponse.ok) {
          console.warn(`[PluginDiscovery] Failed to fetch manifest for ${info.pluginId}: ${manifestResponse.status}`);
          continue;
        }

        const manifest = await manifestResponse.json() as PluginDefinition;

        if (!manifest.surface?.includes(surface)) continue;

        // Create lazy loader that imports the compiled plugin via asset:// URL
        const distUrl = await toAssetUrl(info.distPath);
        if (!distUrl) continue;

        registry.push({
          manifest,
          loader: async () => {
            const mod = await import(/* @vite-ignore */ distUrl);
            return mod.default as PluginDefinition;
          },
        });

        console.log(`[PluginDiscovery] Discovered installed plugin: ${info.pluginId}`);
      } catch (e) {
        console.error(`[PluginDiscovery] Failed to load installed plugin ${info.pluginId}:`, e);
      }
    }
  } catch (e) {
    console.error('[PluginDiscovery] Failed to list installed plugins:', e);
  }

  return registry;
}

export async function registerDiscoveredPlugins(host: PluginHost, surface: HostSurface): Promise<void> {
  const discovered = await discoverPlugins(surface);
  console.log(`[PluginDiscovery] Registering ${discovered.length} plugins for surface: ${surface}`);
  for (const { manifest, loader } of discovered) {
    await host.registerWithLoader(manifest, loader);
  }
}
