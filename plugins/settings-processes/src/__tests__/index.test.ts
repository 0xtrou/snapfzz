import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('A007/settings-processes manifest', () => {
  it('A008/settings-processes: has correct plugin id', () => {
    expect(plugin.id).toBe('snapfzz.settings.processes');
  });

  it('A008/settings-processes: surface targets preferences window only', () => {
    expect(plugin.surface).toContain('preferences');
    expect(plugin.surface).not.toContain('launcher');
    expect(plugin.surface).not.toContain('project');
  });

  it('A008/settings-processes: budget is declared', () => {
    expect(plugin.budget).toBeDefined();
    expect(plugin.budget?.zone).toBe('zone3');
  });

  it('A008/settings-processes: reliability strikes configured', () => {
    expect(plugin.budget?.reliability?.strikes).toBe(3);
  });

  it('A008/settings-processes: allows 5 concurrent invokes for process operations', () => {
    expect(plugin.budget?.network?.maxConcurrentInvokes).toBe(5);
  });

  it('A008/settings-processes: required capabilities declared', () => {
    expect(plugin.budget?.capabilities).toContain('rust.invoke');
    expect(plugin.budget?.capabilities).toContain('rust.listen');
    expect(plugin.budget?.capabilities).toContain('settings.read');
    expect(plugin.budget?.capabilities).toContain('logger');
  });

  it('A007/settings-processes: contributes exactly one settings section', () => {
    const sections = plugin.contributes?.settingsSections ?? [];
    expect(sections).toHaveLength(1);
  });

  it('A008/settings-processes: section id is "processes"', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.id).toBe('processes');
  });

  it('A008/settings-processes: section label is "Processes"', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.label).toBe('Processes');
  });

  it('A008/settings-processes: icon is MonitorOutlined (Ant Design, not emoji)', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.icon).toBe('MonitorOutlined');
    expect(section?.icon).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u);
  });

  it('A008/settings-processes: order is 2', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.order).toBe(2);
  });

  it('A007/settings-processes: component is a lazy import function', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(typeof section?.component).toBe('function');
  });

  it('A007/settings-processes: component lazy import resolves to a module', async () => {
    const section = plugin.contributes?.settingsSections?.[0];
    const mod = await section?.component?.();
    expect(mod).toBeDefined();
    expect(typeof (mod as Record<string, unknown>)?.default).toBe('function');
  });
});

describe('A005/settings-processes activation', () => {
  it('A008/settings-processes: activate() returns a PluginHandle', async () => {
    const ctx = {} as never;
    const handle = await plugin.activate!(ctx);
    expect(handle).toBeDefined();
    expect(typeof handle).toBe('object');
  });

  it('A008/settings-processes: handle exposes deactivate function', async () => {
    const ctx = {} as never;
    const handle = await plugin.activate!(ctx);
    expect(typeof handle.deactivate).toBe('function');
  });

  it('A008/settings-processes: deactivate() resolves without error', async () => {
    const ctx = {} as never;
    const handle = await plugin.activate!(ctx);
    await expect(handle.deactivate!()).resolves.toBeUndefined();
  });
});
