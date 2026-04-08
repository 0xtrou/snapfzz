// Spec: A006-core-runtime.md
// Section: Boot Sequence, Plugin Discovery
// Verifies: discoverPlugins returns manifests per surface, registerDiscoveredPlugins calls host.register

import { describe, expect, it, vi } from 'vitest';
import { ContributionStore } from './contribution-store';
import { discoverPlugins, registerDiscoveredPlugins } from './plugin-discovery';
import { PluginHost } from './plugin-host';
import type { PluginDefinition } from '@snapfzz/plugin-sdk/define-plugin';

vi.mock('@snapfzz/chat-plugin', () => ({
  default: fakeManifest('chat.plugin'),
}));

vi.mock('@snapfzz/settings-general', () => ({
  default: fakeManifest('settings.general'),
}));

vi.mock('@snapfzz/settings-performance', () => ({
  default: fakeManifest('settings.performance'),
}));

vi.mock('@snapfzz/settings-processes', () => ({
  default: fakeManifest('settings.processes'),
}));

vi.mock('@snapfzz/settings-vault', () => ({
  default: fakeManifest('settings.vault'),
}));

vi.mock('@snapfzz/settings-plugins', () => ({
  default: fakeManifest('settings.plugins'),
}));

vi.mock('@snapfzz/settings-components', () => ({
  default: fakeManifest('settings.components'),
}));

vi.mock('@snapfzz/settings-advanced', () => {
  throw new Error('settings advanced failed to load');
});

function fakeManifest(id: string): PluginDefinition {
  return { id, activationEvents: [], contributes: {} } as unknown as PluginDefinition;
}

describe('A006/boot: discoverPlugins', () => {
  it('A006/boot: discoverPlugins returns array for launcher surface', async () => {
    const result = await discoverPlugins('launcher');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it('A006/boot: discoverPlugins returns array for project surface', async () => {
    const result = await discoverPlugins('project');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]?.manifest.id).toBe('chat.plugin');
  });

  it('A006/boot: discoverPlugins returns array for preferences surface', async () => {
    const result = await discoverPlugins('preferences');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(6);
    expect(result.map((item) => item.manifest.id)).toEqual([
      'settings.general',
      'settings.performance',
      'settings.processes',
      'settings.vault',
      'settings.plugins',
      'settings.components',
    ]);
  });

  it('A006/boot: discoverPlugins result items have manifest and loader', async () => {
    const result = await discoverPlugins('project');
    for (const item of result) {
      expect(item).toHaveProperty('manifest');
      expect(typeof item.loader).toBe('function');
      await expect(item.loader()).resolves.toEqual(item.manifest);
    }
  });

  it('A006/boot: discoverPlugins logs and skips loader failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await discoverPlugins('preferences');

    expect(result).toHaveLength(6);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('A006/boot: registerDiscoveredPlugins', () => {
  it('A006/boot: registerDiscoveredPlugins does not call host.register when no plugins for surface', async () => {
    const host = new PluginHost(new ContributionStore(), 'launcher');
    const registerSpy = vi.spyOn(host, 'register');

    await registerDiscoveredPlugins(host, 'launcher');

    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('A006/boot: registerDiscoveredPlugins calls host.register for project-discovered manifests', async () => {
    const host = new PluginHost(new ContributionStore(), 'launcher');
    const registerSpy = vi.spyOn(host, 'register');

    await registerDiscoveredPlugins(host, 'project');

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat.plugin' }));
  });

  it('A006/boot: registerDiscoveredPlugins registers all successfully loaded preferences plugins', async () => {
    const host = new PluginHost(new ContributionStore(), 'launcher');
    const registerSpy = vi.spyOn(host, 'register');

    await registerDiscoveredPlugins(host, 'preferences');

    expect(registerSpy).toHaveBeenCalledTimes(6);
    expect(registerSpy.mock.calls.map(([manifest]) => manifest.id)).toEqual([
      'settings.general',
      'settings.performance',
      'settings.processes',
      'settings.vault',
      'settings.plugins',
      'settings.components',
    ]);
  });
});
