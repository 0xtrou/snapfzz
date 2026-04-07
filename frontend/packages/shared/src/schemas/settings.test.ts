import { describe, expect, it } from 'vitest';
import {
  AgentscopeHostSchema,
  AgentscopePortSchema,
  FontFamilySchema,
  safeParseSettings,
  SettingsDefaults,
  SettingsSchema,
  ThemeSchema,
  validateSettings,
} from './settings';

describe('settings schemas', () => {
  it('parses valid settings', () => {
    const parsed = SettingsSchema.parse({
      apiKey: 'k',
      model: 'gpt-4o-mini',
      apiUrl: 'https://example.com/v1',
      theme: 'dark',
      openLastProject: false,
      language: 'en',
      fontFamily: 'Inter',
      fontSize: '14',
      fpsCounter: false,
      logLevel: 'debug',
      agentscopeHost: 'localhost',
      agentscopePort: '8091',
    });

    expect(parsed.theme).toBe('dark');
    expect(parsed.agentscopeHost).toBe('localhost');
    expect(parsed.agentscopePort).toBe('8091');
  });

  it('applies defaults for missing fields', () => {
    const parsed = SettingsSchema.parse({});

    expect(parsed).toEqual(SettingsDefaults);
    expect(parsed.theme).toBe('system');
    expect(parsed.fontFamily).toBe('Inter');
    expect(parsed.fontSize).toBe('12');
    expect(parsed.agentscopeHost).toBe('127.0.0.1');
    expect(parsed.agentscopePort).toBe('8090');
  });

  it('validates agentscope host format and rejects empty string', () => {
    expect(AgentscopeHostSchema.parse('localhost-1.example')).toBe('localhost-1.example');
    expect(() => AgentscopeHostSchema.parse('')).toThrow('Host is required');
    expect(() => AgentscopeHostSchema.parse('invalid host')).toThrow('Invalid host format');
  });

  it('validates agentscope port range and rejects non-numeric', () => {
    expect(AgentscopePortSchema.parse('1')).toBe('1');
    expect(AgentscopePortSchema.parse('65535')).toBe('65535');
    expect(() => AgentscopePortSchema.parse('0')).toThrow('Port must be between 1 and 65535');
    expect(() => AgentscopePortSchema.parse('65536')).toThrow('Port must be between 1 and 65535');
    expect(() => AgentscopePortSchema.parse('abc')).toThrow('Port must be a number');
  });

  it('accepts supported theme values only', () => {
    expect(ThemeSchema.parse('light')).toBe('light');
    expect(ThemeSchema.parse('dark')).toBe('dark');
    expect(ThemeSchema.parse('system')).toBe('system');
    expect(() => ThemeSchema.parse('sepia')).toThrow();
  });

  it('accepts arbitrary non-empty font family names', () => {
    expect(FontFamilySchema.parse('Inter')).toBe('Inter');
    expect(FontFamilySchema.parse('JetBrains Mono')).toBe('JetBrains Mono');
  });

  it('safeParseSettings returns defaults for invalid payloads and parsed data for valid payloads', () => {
    const invalid = safeParseSettings({ apiUrl: 'not-a-url', theme: 'bad' });
    const valid = safeParseSettings({ apiUrl: 'https://api.openai.com/v1', theme: 'light' });

    expect(invalid).toEqual(SettingsDefaults);
    expect(valid.apiUrl).toBe('https://api.openai.com/v1');
    expect(valid.theme).toBe('light');
  });

  it('validateSettings returns parsed settings for valid payloads', () => {
    const validated = validateSettings({ apiUrl: 'https://api.openai.com/v1' });
    expect(validated.apiUrl).toBe('https://api.openai.com/v1');
  });
});
