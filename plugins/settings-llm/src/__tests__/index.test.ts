import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('A013/PluginManifest: settings-llm registration export', () => {
  it('A013/registration: exports preferences settings section for llm providers', () => {
    expect(plugin.id).toBe('snapfzz.settings.llm');
    expect(plugin.surface).toContain('preferences');

    const section = plugin.contributes?.settingsSections?.[0];
    expect(section).toBeDefined();
    expect(section?.id).toBe('llm');
    expect(section?.label).toBe('LLM Providers');
    expect(section?.icon).toBe('ApiOutlined');
    expect(section?.order).toBe(6);
  });

  it('A013/registration: lazily imports the llm settings component module', async () => {
    const section = plugin.contributes?.settingsSections?.[0];
    expect(typeof section?.component).toBe('function');

    const module = await section?.component();
    expect(module).toBeDefined();
    expect(module).toHaveProperty('default');
  }, 15_000);
});
