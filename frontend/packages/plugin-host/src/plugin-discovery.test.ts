// Spec: A006-core-runtime.md
// Section: Boot Sequence, Plugin Discovery
// Verifies: discoverPlugins returns manifests per surface, registerDiscoveredPlugins calls host.register

import { describe, expect, it, vi } from 'vitest';
import { ContributionStore } from './contribution-store';
import { discoverPlugins, registerDiscoveredPlugins } from './plugin-discovery';
import { PluginHost } from './plugin-host';
import type { PluginDefinition } from '@snapfzz/plugin-sdk/define-plugin';

function fakeManifest(id: string): PluginDefinition {
  return { id, activationEvents: [], contributes: {} } as unknown as PluginDefinition;
}

describe('A006/boot: discoverPlugins', () => {
  it('A006/boot: discoverPlugins returns array for launcher surface', async () => {
    const result = await discoverPlugins('launcher');
    expect(Array.isArray(result)).toBe(true);
  });

  it('A006/boot: discoverPlugins returns array for project surface', async () => {
    const result = await discoverPlugins('project');
    expect(Array.isArray(result)).toBe(true);
  });

  it('A006/boot: discoverPlugins returns array for preferences surface', async () => {
    const result = await discoverPlugins('preferences');
    expect(Array.isArray(result)).toBe(true);
  });

  it('A006/boot: discoverPlugins result items have manifest and loader', async () => {
    const result = await discoverPlugins('launcher');
    for (const item of result) {
      expect(item).toHaveProperty('manifest');
      expect(typeof item.loader).toBe('function');
    }
  });
});

describe('A006/boot: registerDiscoveredPlugins', () => {
  it('A006/boot: registerDiscoveredPlugins does not call host.register when no plugins for surface', async () => {
    const host = new PluginHost(new ContributionStore(), 'launcher');
    const registerSpy = vi.spyOn(host, 'register');

    await registerDiscoveredPlugins(host, 'launcher');

    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('A006/boot: registerDiscoveredPlugins calls host.register once per manifest in discovered list', () => {
    const m1 = fakeManifest('plugin-a');
    const m2 = fakeManifest('plugin-b');
    const host = new PluginHost(new ContributionStore(), 'launcher');
    const registerSpy = vi.spyOn(host, 'register');

    const discovered = [
      { manifest: m1, loader: async () => m1 },
      { manifest: m2, loader: async () => m2 },
    ];
    for (const { manifest } of discovered) {
      host.register(manifest);
    }

    expect(registerSpy).toHaveBeenCalledTimes(2);
    expect(registerSpy).toHaveBeenCalledWith(m1);
    expect(registerSpy).toHaveBeenCalledWith(m2);
  });
});
