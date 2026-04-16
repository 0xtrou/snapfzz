// Spec: A006-core-runtime.md
// Section: Boot Sequence, Plugin Discovery
// Verifies: discoverPlugins returns manifests per surface, registerDiscoveredPlugins calls host.registerWithLoader

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ContributionStore } from './contribution-store';
import { discoverPlugins, registerDiscoveredPlugins } from './plugin-discovery';
import { PluginHost } from './plugin-host';
import type { PluginDefinition } from '@snapfzz/plugin-sdk/define-plugin';
import type { InstalledPluginInfo } from './plugin-discovery';

// --- Tauri bridge mock ---
const invokeMock = vi.fn();
vi.mock('@snapfzz/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@snapfzz/shared')>();
  return {
    ...actual,
    createTauriBridge: () => ({
      isAvailable: true,
      invoke: invokeMock,
    }),
  };
});

// --- convertFileSrc mock ---
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
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

vi.mock('@snapfzz/settings-diagnostics', () => ({
  default: fakeManifest('settings.diagnostics'),
}));

vi.mock('@snapfzz/settings-llm', () => ({
  default: fakeManifest('snapfzz.settings.llm'),
}));

vi.mock('@snapfzz/settings-advanced', () => {
  throw new Error('settings advanced failed to load');
});

function fakeManifest(id: string): PluginDefinition {
  return { id, activationEvents: [], contributes: {}, surface: ['preferences'] } as unknown as PluginDefinition;
}

function fakeInstalledManifest(id: string, surface: string[]): PluginDefinition {
  return { id, activationEvents: [], contributes: {}, surface } as unknown as PluginDefinition;
}

beforeEach(() => {
  invokeMock.mockReset();
  // Default: no installed plugins
  invokeMock.mockResolvedValue([]);
});

describe('A006/boot: discoverPlugins', () => {
  it('A006/boot: discoverPlugins returns empty array for launcher surface with no installed plugins', async () => {
    const result = await discoverPlugins('launcher');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it('A006/boot: discoverPlugins returns only installed plugins for project surface', async () => {
    const orchestratorManifest = fakeInstalledManifest('snapfzz.orchestrator', ['project']);
    const installedPlugins: InstalledPluginInfo[] = [{
      pluginId: 'snapfzz.orchestrator',
      manifest: orchestratorManifest as unknown as Record<string, unknown>,
      distPath: '/home/test/.snapfzz/plugins/snapfzz.orchestrator/dist/index.js',
    }];

    invokeMock.mockResolvedValue(installedPlugins);

    const result = await discoverPlugins('project');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]?.manifest.id).toBe('snapfzz.orchestrator');
  });

  it('A006/boot: discoverPlugins returns settings plugins for preferences surface', async () => {
    const result = await discoverPlugins('preferences');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(8);
    expect(result.map((item) => item.manifest.id)).toEqual([
      'settings.general',
      'settings.performance',
      'settings.processes',
      'settings.vault',
      'settings.plugins',
      'settings.components',
      'settings.diagnostics',
      'snapfzz.settings.llm',
    ]);
  });

  it('A006/boot: discoverPlugins result items have manifest and loader', async () => {
    const orchestratorManifest = fakeInstalledManifest('snapfzz.orchestrator', ['project']);
    const installedPlugins: InstalledPluginInfo[] = [{
      pluginId: 'snapfzz.orchestrator',
      manifest: orchestratorManifest as unknown as Record<string, unknown>,
      distPath: '/home/test/.snapfzz/plugins/snapfzz.orchestrator/dist/index.js',
    }];

    invokeMock.mockResolvedValue(installedPlugins);

    const result = await discoverPlugins('project');
    for (const item of result) {
      expect(item).toHaveProperty('manifest');
      expect(typeof item.loader).toBe('function');
    }
  });

  it('A006/boot: discoverPlugins logs and skips loader failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await discoverPlugins('preferences');

    expect(result).toHaveLength(8);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('A006/boot: discoverPlugins filters installed plugins by surface', async () => {
    const wrongSurfaceManifest = fakeInstalledManifest('some.plugin', ['launcher']);
    const installedPlugins: InstalledPluginInfo[] = [{
      pluginId: 'some.plugin',
      manifest: wrongSurfaceManifest as unknown as Record<string, unknown>,
      distPath: '/path/dist/index.js',
    }];

    invokeMock.mockResolvedValue(installedPlugins);

    const result = await discoverPlugins('project');
    expect(result).toHaveLength(0);
  });

  it('A006/boot: discoverPlugins gracefully handles list_installed_plugins failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    invokeMock.mockRejectedValue(new Error('tauri command failed'));

    const result = await discoverPlugins('project');
    expect(result).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(
      '[PluginDiscovery] Failed to list installed plugins:',
      expect.any(Error),
    );
  });

  it('A006/boot: discoverPlugins combines settings and installed plugins for preferences', async () => {
    const installedManifest = fakeInstalledManifest('user.custom-settings', ['preferences']);
    const installedPlugins: InstalledPluginInfo[] = [{
      pluginId: 'user.custom-settings',
      manifest: installedManifest as unknown as Record<string, unknown>,
      distPath: '/path/dist/index.js',
    }];

    invokeMock.mockResolvedValue(installedPlugins);

    const result = await discoverPlugins('preferences');
    // 8 settings plugins + 1 installed
    expect(result).toHaveLength(9);
    expect(result[8]?.manifest.id).toBe('user.custom-settings');
  });
});

describe('A006/boot: registerDiscoveredPlugins', () => {
  it('A006/boot: registerDiscoveredPlugins does not call host.registerWithLoader when no plugins for surface', async () => {
    const host = new PluginHost(new ContributionStore(), 'launcher');
    const registerSpy = vi.spyOn(host, 'registerWithLoader');

    await registerDiscoveredPlugins(host, 'launcher');

    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('A006/boot: registerDiscoveredPlugins calls host.registerWithLoader for installed project plugins', async () => {
    const orchestratorManifest = fakeInstalledManifest('snapfzz.orchestrator', ['project']);
    const installedPlugins: InstalledPluginInfo[] = [{
      pluginId: 'snapfzz.orchestrator',
      manifest: orchestratorManifest as unknown as Record<string, unknown>,
      distPath: '/home/test/.snapfzz/plugins/snapfzz.orchestrator/dist/index.js',
    }];

    invokeMock.mockResolvedValue(installedPlugins);

    const host = new PluginHost(new ContributionStore(), 'project');
    const registerSpy = vi.spyOn(host, 'registerWithLoader');

    await registerDiscoveredPlugins(host, 'project');

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'snapfzz.orchestrator' }),
      expect.any(Function),
    );
  });

  it('A006/boot: registerDiscoveredPlugins registers all successfully loaded preferences plugins', async () => {
    const host = new PluginHost(new ContributionStore(), 'launcher');
    const registerSpy = vi.spyOn(host, 'registerWithLoader');

    await registerDiscoveredPlugins(host, 'preferences');

    expect(registerSpy).toHaveBeenCalledTimes(8);
    expect(registerSpy.mock.calls.map(([manifest]) => manifest.id)).toEqual([
      'settings.general',
      'settings.performance',
      'settings.processes',
      'settings.vault',
      'settings.plugins',
      'settings.components',
      'settings.diagnostics',
      'snapfzz.settings.llm',
    ]);
  });
});
