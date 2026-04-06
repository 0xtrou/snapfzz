import { z } from 'zod';

export const ThemeSchema = z.enum(['light', 'dark', 'system']);
export type Theme = z.infer<typeof ThemeSchema>;

export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'trace']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const FontFamilySchema = z.string().default('Inter');
export type FontFamily = z.infer<typeof FontFamilySchema>;

export const FontSizeSchema = z.string().default('12');
export type FontSize = z.infer<typeof FontSizeSchema>;

export const AgentscopeHostSchema = z.string()
  .min(1, 'Host is required')
  .regex(/^[\w.\-]+$/, 'Invalid host format')
  .default('127.0.0.1');

export const AgentscopePortSchema = z.string()
  .regex(/^\d+$/, 'Port must be a number')
  .refine((v) => { const n = Number(v); return n >= 1 && n <= 65535; }, 'Port must be between 1 and 65535')
  .default('8090');

export const SettingsSchema = z.object({
  apiKey: z.string().default(''),
  model: z.string().default('gpt-4o'),
  apiUrl: z.string().url().default('https://api.openai.com/v1'),

  theme: ThemeSchema.default('system'),
  openLastProject: z.boolean().default(true),
  language: z.string().default('en'),
  fontFamily: FontFamilySchema.default('Inter'),
  fontSize: FontSizeSchema.default('12'),

  fpsCounter: z.boolean().default(true),
  logLevel: LogLevelSchema.default('info'),

  agentscopeHost: AgentscopeHostSchema.default('127.0.0.1'),
  agentscopePort: AgentscopePortSchema.default('8090'),
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
