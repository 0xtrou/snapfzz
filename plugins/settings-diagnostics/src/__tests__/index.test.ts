import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('A012/settings-diagnostics: manifest', () => {
  it('has correct plugin id', () => {
    expect(plugin.id).toBe('snapfzz.settings.diagnostics');
  });

  it('targets preferences surface', () => {
    expect(plugin.surface).toContain('preferences');
  });

  it('contributes diagnostics settings section', () => {
    expect(plugin.contributes?.settingsSections?.[0]?.id).toBe('diagnostics');
    expect(plugin.contributes?.settingsSections?.[0]?.label).toBe('Diagnostics');
    expect(plugin.contributes?.settingsSections?.[0]?.icon).toBe('MedicineBoxOutlined');
  });

  it('activate returns empty handle', async () => {
    const handle = await plugin.activate({} as never);
    expect(handle).toEqual({});
  });

  it('settings section component loader resolves', async () => {
    const loader = plugin.contributes?.settingsSections?.[0]?.component;
    expect(loader).toBeDefined();
    const mod = await loader!();
    expect(mod).toBeDefined();
  });
});
