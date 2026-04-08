import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('A007/settings-components manifest', () => {
  it('A007/manifest: has correct plugin id', () => {
    expect(plugin.id).toBe('snapfzz.settings.components');
  });

  it('A007/manifest: surface targets preferences window only', () => {
    expect(plugin.surface).toContain('preferences');
    expect(plugin.surface).not.toContain('launcher');
    expect(plugin.surface).not.toContain('project');
  });

  it('A008/budget: budget is declared', () => {
    expect(plugin.budget).toBeDefined();
    expect(plugin.budget?.zone).toBe('zone3');
  });

  it('A008/budget: reliability strikes configured', () => {
    expect(plugin.budget?.reliability?.strikes).toBe(3);
  });

  it('A008/budget: required capabilities declared', () => {
    expect(plugin.budget?.capabilities).toContain('rust.invoke');
    expect(plugin.budget?.capabilities).toContain('settings.read');
    expect(plugin.budget?.capabilities).toContain('settings.write');
  });

  it('A007/settingsSections: contributes exactly one settings section', () => {
    const sections = plugin.contributes?.settingsSections ?? [];
    expect(sections).toHaveLength(1);
  });

  it('A007/settingsSections: section metadata is correct', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.id).toBe('components');
    expect(section?.label).toBe('System Packs');
    expect(section?.icon).toBe('AppstoreOutlined');
    expect(section?.order).toBe(7);
  });

  it('A007/settingsSections: component lazy import resolves to a module with default export', async () => {
    const section = plugin.contributes?.settingsSections?.[0];
    const mod = await section?.component();
    expect(mod).toBeDefined();
    expect((mod as { default: unknown }).default).toBeDefined();
  });
});

describe('A005/settings-components activation', () => {
  it('A005/activate: activate() returns a PluginHandle object', async () => {
    const ctx = {} as never;
    const handle = await plugin.activate!(ctx);
    expect(handle).toBeDefined();
    expect(typeof handle).toBe('object');
  });

  it('A005/activate: returned handle satisfies PluginHandle contract', async () => {
    const ctx = {} as never;
    const handle = await plugin.activate!(ctx);
    expect(handle).not.toBeNull();
  });
});
