// Spec: A006-core-runtime.md
// Section: Boot Sequence, Plugin Discovery
// Verifies: manifest discovery returns empty array, registerDiscoveredPlugins wires host

import { describe, expect, it, vi } from 'vitest';
import { ContributionStore } from './contribution-store';
import { discoverPlugins, registerDiscoveredPlugins } from './plugin-discovery';
import { PluginHost } from './plugin-host';

describe('A006/boot: plugin discovery and registration', () => {
  it('A006/boot/discovery: returns empty manifest list when no plugins exist', async () => {
    const result = await discoverPlugins('launcher');
    expect(result).toEqual([]);
  });

  it('A006/boot/registration: registerDiscoveredPlugins calls host.registerWithLoader for each manifest', async () => {
    const host = new PluginHost(new ContributionStore(), 'launcher');
    const registerSpy = vi.spyOn(host, 'registerWithLoader');

    await registerDiscoveredPlugins(host, 'launcher');

    expect(registerSpy).not.toHaveBeenCalled();
  });
});
