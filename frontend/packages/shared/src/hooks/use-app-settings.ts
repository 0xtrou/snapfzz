// Per A007/MultiLayout: single source of truth for all appearance settings across windows.
// Per A004/Workspace: reads persisted settings from settings.json via Rust backend.
// No localStorage — backend is the only source. Frontend is stateless.
import { useCallback, useEffect, useState } from 'react';

export type RuntimeTheme = 'dark' | 'light';
export type SettingsTheme = RuntimeTheme | 'system';

function getTauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  return tauri?.invoke ?? null;
}

interface AppSettings {
  theme?: SettingsTheme;
  fontFamily?: string;
  fontSize?: string;
  [key: string]: unknown;
}

const SYSTEM_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function resolveTheme(theme: SettingsTheme | undefined): RuntimeTheme {
  if (theme === 'dark' || theme === 'light') return theme;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveFontFamily(fontFamily: string | undefined): string {
  if (!fontFamily || fontFamily === 'System') return SYSTEM_FONT_STACK;
  return fontFamily;
}

function resolveFontSize(fontSize: string | undefined): number {
  const parsed = Number.parseInt(fontSize || '12', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

function applyDomSettings(settings: AppSettings): RuntimeTheme {
  const resolvedTheme = resolveTheme(settings.theme);
  const resolvedFontFamily = resolveFontFamily(settings.fontFamily);
  const resolvedFontSize = resolveFontSize(settings.fontSize);

  document.documentElement.setAttribute('data-theme', resolvedTheme);

  document.documentElement.style.setProperty('--font-family', resolvedFontFamily);
  document.body.style.fontFamily = resolvedFontFamily;
  document.documentElement.style.setProperty('--font-size', `${resolvedFontSize}px`);
  document.body.style.fontSize = `${resolvedFontSize}px`;

  let styleEl = document.getElementById('snapfzz-font-override');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'snapfzz-font-override';
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `*, *::before, *::after { font-family: ${resolvedFontFamily} !important; } body { font-size: ${resolvedFontSize}px !important; }`;

  return resolvedTheme;
}

async function loadAndRegisterCustomFonts(invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>): Promise<string[]> {
  let names: string[];
  try {
    names = (await invoke('list_installed_fonts')) as string[];
  } catch {
    return [];
  }
  if (!Array.isArray(names) || names.length === 0) return [];

  let dataDir: string;
  try {
    dataDir = (await invoke('get_data_dir')) as string;
  } catch {
    return names;
  }

  const registeredNames: string[] = [];
  for (const name of names) {
    try {
      const woff2Url = `asset:///${dataDir.replace(/\\/g, '/')}/fonts/${name}.woff2`;
      const ttfUrl = `asset:///${dataDir.replace(/\\/g, '/')}/fonts/${name}.ttf`;
      let fontFace: FontFace;
      try {
        fontFace = new FontFace(name, `url("${woff2Url}")`);
        await fontFace.load();
      } catch {
        fontFace = new FontFace(name, `url("${ttfUrl}")`);
        await fontFace.load();
      }
      document.fonts.add(fontFace);
      registeredNames.push(name);
    } catch {
      // Skip fonts that fail to load — app continues with remaining fonts.
    }
  }
  return registeredNames;
}

export interface AppSettingsState {
  theme: RuntimeTheme;
  toggleTheme: () => void;
  customFonts: string[];
}

// Per A007/MultiLayout: single hook for all appearance state. Mounted at window top level.
// Returns resolved theme + toggleTheme (saves to backend) + loaded custom font names.
export function useAppSettings(): AppSettingsState {
  const [theme, setTheme] = useState<RuntimeTheme>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [customFonts, setCustomFonts] = useState<string[]>([]);

  useEffect(() => {
    async function applySettings(): Promise<void> {
      const invoke = getTauriInvoke();
      if (!invoke) return;
      try {
        const settings = (await invoke('get_settings')) as AppSettings;
        const resolved = applyDomSettings(settings);
        setTheme(resolved);
        const registered = await loadAndRegisterCustomFonts(invoke);
        setCustomFonts(registered);
      } catch {
        // First launch or Tauri unavailable — continue with CSS defaults.
      }
    }

    void applySettings();

    // Per A007/MultiLayout: listen for both Tauri cross-window events and same-window custom events.
    // Tauri event.emit may not deliver to the emitting window, so the emitter also dispatches
    // a DOM CustomEvent to guarantee the local window re-applies immediately.
    const handleSettingsChanged = () => { void applySettings(); };
    window.addEventListener('snapfzz:settings-changed', handleSettingsChanged);

    let unlisten: (() => void) | null = null;
    const w = window as unknown as Record<string, unknown>;
    const tauri = w.__TAURI_INTERNALS__ as
      | { event?: { listen?: (event: string, cb: (payload: unknown) => void) => Promise<() => void> } }
      | undefined;

    if (tauri?.event?.listen) {
      tauri.event.listen('settings-changed', () => {
        void applySettings();
      }).then((fn) => {
        unlisten = fn;
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('snapfzz:settings-changed', handleSettingsChanged);
      if (unlisten) unlisten();
    };
  }, []);

  // Per A007/MultiLayout: toggle saves to backend and triggers the propagation chain.
  // No localStorage — save_settings in Rust emits settings-changed to all webviews.
  const toggleTheme = useCallback(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try {
      const current = (await invoke('get_settings')) as AppSettings;
      const newTheme: SettingsTheme = resolveTheme(current.theme) === 'dark' ? 'light' : 'dark';
      await invoke('save_settings', { settings: { ...current, theme: newTheme } });
      window.dispatchEvent(new CustomEvent('snapfzz:settings-changed'));
    } catch {
      // Fallback: toggle DOM directly if backend unavailable
      const fallback: RuntimeTheme = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', fallback);
      setTheme(fallback);
    }
  }, [theme]);

  return { theme, toggleTheme, customFonts };
}
