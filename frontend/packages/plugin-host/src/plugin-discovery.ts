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
  /** Parsed manifest.json content (returned inline by Rust, no fetch needed). */
  manifest: Record<string, unknown>;
  /** Absolute path to dist/index.js for dynamic import. */
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
 * Load a UMD plugin by injecting a script tag.
 * The UMD module exposes itself on `window[umdName]`.
 * React is provided via `window.__snapfzz_shared` globals.
 */
function loadUmdPlugin(url: string, umdName: string): Promise<PluginDefinition> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      const mod = (window as any)[umdName];
      if (!mod) {
        reject(new Error(`UMD plugin '${umdName}' not found on window after loading ${url}`));
        return;
      }
      // UMD default export is either mod.default or mod itself
      resolve((mod.default ?? mod) as PluginDefinition);
    };
    script.onerror = () => reject(new Error(`Failed to load plugin script: ${url}`));
    document.head.appendChild(script);
  });
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
        // Manifest is returned inline by Rust — no fetch needed
        const manifest = info.manifest as unknown as PluginDefinition;

        if (!manifest.surface?.includes(surface)) continue;

        // Create lazy loader that loads UMD plugin via script tag + asset:// URL.
        // UMD exposes the plugin on a global variable (e.g. window.SnapfzzOrchestratorPlugin).
        // React is mapped to window.__snapfzz_shared via UMD globals config.
        const distUrl = await toAssetUrl(info.distPath);
        if (!distUrl) continue;

        const umdName = manifest.umdName ?? `Snapfzz${info.pluginId.replace(/\W/g, '_')}Plugin`;
        registry.push({
          manifest,
          loader: async () => {
            return loadUmdPlugin(distUrl, umdName);
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
