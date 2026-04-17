import { describe, it, expect, vi } from 'vitest';

// Per project/SparkDesignFirst: Spark packages lack a `main` entry and have a side-effect CSS
// import; lazily-resolved via shared's barrel when the section.component() factory runs.
// Stub them so this test can exercise the dynamic import without Vite trying to resolve the
// Spark package tree.
vi.mock('@agentscope-ai/design', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@agentscope-ai/chat', () => ({}));

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
