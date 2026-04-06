// A007/SettingsSections: validates settings-runtime plugin manifest and activation contract.
import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('A007/settings-runtime manifest', () => {
  it('A007/manifest: has correct plugin id', () => {
    expect(plugin.id).toBe('snapfzz.settings.runtime');
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

  it('A008/budget: allows up to 3 concurrent invokes for health polling', () => {
    expect(plugin.budget?.network?.maxConcurrentInvokes).toBe(3);
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

  it('A007/settingsSections: section id is "runtime"', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.id).toBe('runtime');
  });

  it('A007/settingsSections: section label is "Runtime"', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.label).toBe('Runtime');
  });

  it('A007/settingsSections: icon is Ant Design icon name (not emoji)', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.icon).toBe('CloudServerOutlined');
    expect(section?.icon).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u);
  });

  it('A007/settingsSections: component is a lazy import function', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(typeof section?.component).toBe('function');
  });
});

describe('A005/settings-runtime activation', () => {
  it('A005/activate: activate() returns a PluginHandle', async () => {
    const ctx = {} as never;
    const handle = await plugin.activate!(ctx);
    expect(handle).toBeDefined();
    expect(typeof handle).toBe('object');
  });

  it('A005/activate: handle exposes deactivate function', async () => {
    const ctx = {} as never;
    const handle = await plugin.activate!(ctx);
    expect(typeof handle.deactivate).toBe('function');
  });

  it('A005/activate: deactivate() resolves without error', async () => {
    const ctx = {} as never;
    const handle = await plugin.activate!(ctx);
    await expect(handle.deactivate!()).resolves.toBeUndefined();
  });
});
