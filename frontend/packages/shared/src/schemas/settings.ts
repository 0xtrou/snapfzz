import { z } from 'zod';

export const ThemeSchema = z.enum(['light', 'dark', 'system']);
export type Theme = z.infer<typeof ThemeSchema>;

export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'trace']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const SettingsSchema = z.object({
  apiKey: z.string().default(''),
  model: z.string().default('gpt-4o'),
  apiUrl: z.string().url().default('https://api.openai.com/v1'),

  theme: ThemeSchema.default('system'),
  openLastProject: z.boolean().default(true),
  language: z.string().default('en'),

  fpsCounter: z.boolean().default(true),
  logLevel: LogLevelSchema.default('info'),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsDefaults: Settings = SettingsSchema.parse({});

export function validateSettings(data: unknown): Settings {
  return SettingsSchema.parse(data);
}

export function safeParseSettings(data: unknown): Settings {
  const result = SettingsSchema.safeParse(data);
  return result.success ? result.data : SettingsDefaults;
}
