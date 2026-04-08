import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('A012/settings-diagnostics manifest', () => {
  it('A012/manifest: has correct plugin id', () => {
    expect(plugin.id).toBe('snapfzz.settings.diagnostics');
  });

  it('A012/manifest: surface targets preferences window only', () => {
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
    expect(plugin.budget?.capabilities).toContain('logger');
  });

  it('A012/settingsSections: contributes exactly one settings section', () => {
    const sections = plugin.contributes?.settingsSections ?? [];
    expect(sections).toHaveLength(1);
  });

  it('A012/settingsSections: section metadata is correct', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.id).toBe('diagnostics');
    expect(section?.label).toBe('Diagnostics');
    expect(section?.icon).toBe('MedicineBoxOutlined');
    expect(section?.order).toBe(60);
  });

  it('A012/settingsSections: icon is Ant Design icon name (not emoji)', () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(section?.icon).toBe('MedicineBoxOutlined');
    expect(section?.icon).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u);
  });

  it('A012/settingsSections: component lazy import resolves to module with default export', async () => {
    const section = plugin.contributes?.settingsSections?.[0];
    const mod = await section?.component();
    expect(mod).toBeDefined();
    expect((mod as { default: unknown }).default).toBeDefined();
  });
});

describe('A005/settings-diagnostics activation', () => {
  it('A005/activate: activate() returns a PluginHandle object', async () => {
    const handle = await plugin.activate({} as never);
    expect(handle).toBeDefined();
    expect(typeof handle).toBe('object');
  });

  it('A005/activate: returned handle satisfies PluginHandle contract', async () => {
    const handle = await plugin.activate({} as never);
    expect(handle).not.toBeNull();
  });
});
