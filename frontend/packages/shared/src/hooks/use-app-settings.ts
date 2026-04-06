// Per A007/MultiLayout: applied across all windows so every surface uses the same font settings.
// Per A004/Workspace: reads persisted appearance settings from settings.json on boot.
import { useEffect, useState } from 'react';

export type RuntimeTheme = 'dark' | 'light';
export type SettingsTheme = RuntimeTheme | 'system';
const THEME_STORAGE_KEY = 'snapfzz-theme';

// A007/TauriIPC: accesses __TAURI_INTERNALS__ directly — no @tauri-apps/api bundle.
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
  installedFonts?: string[];
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
  const parsed = Number.parseInt(fontSize || '14', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

// Per A007/PreferencesLayout: each window rehydrates persisted appearance settings from shared settings.json.
function notifyThemeStorageChange(resolvedTheme: RuntimeTheme): void {
  if (typeof StorageEvent !== 'function') return;
  window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: resolvedTheme }));
}

function applyDomSettings(settings: AppSettings): void {
  const resolvedTheme = resolveTheme(settings.theme);
  const resolvedFontFamily = resolveFontFamily(settings.fontFamily);
  const resolvedFontSize = resolveFontSize(settings.fontSize);

  document.documentElement.setAttribute('data-theme', resolvedTheme);
  localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
  notifyThemeStorageChange(resolvedTheme);

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

  styleEl.textContent = `*, *::before, *::after { font-family: ${resolvedFontFamily} !important; font-size: inherit !important; } html { font-size: ${resolvedFontSize}px !important; }`;
}

async function loadAndRegisterCustomFonts(invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>): Promise<string[]> {
  // Per A004/Workspace: fonts directory lives under the resolved data dir.
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
    return names; // Return names but skip FontFace registration
  }

  const registeredNames: string[] = [];
  for (const name of names) {
    try {
      // Attempt woff2 first, then ttf — both extensions are written by install_font_from_file / install_font_from_url.
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
      // Silently skip fonts that fail to load — app continues with remaining fonts.
    }
  }
  return registeredNames;
}

// Per A007/MultiLayout: call this hook in WindowShell so all windows apply font settings.
// Per A004/Workspace: reads from settings.json on boot; re-applies on settings-changed event.
// Returns loaded custom font names for use in dropdown options.
export function useAppSettings(): string[] {
  const [customFonts, setCustomFonts] = useState<string[]>([]);

  useEffect(() => {
    async function applySettings(): Promise<void> {
      const invoke = getTauriInvoke();
      if (!invoke) return;
      try {
        const settings = (await invoke('get_settings')) as AppSettings;
        applyDomSettings(settings);
        const registered = await loadAndRegisterCustomFonts(invoke);
        setCustomFonts(registered);
      } catch {
        // First launch or Tauri unavailable — silently continue with CSS defaults.
      }
    }

    void applySettings();

    // Per A007/MultiLayout: listen for both Tauri cross-window events and same-window custom events.
    // Tauri event.emit may not deliver to the emitting window, so the emitter also dispatches
    // a DOM CustomEvent to guarantee the local window re-applies immediately.
    const handleLocalSettingsChanged = () => { void applySettings(); };
    window.addEventListener('snapfzz:settings-changed', handleLocalSettingsChanged);

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
      window.removeEventListener('snapfzz:settings-changed', handleLocalSettingsChanged);
      if (unlisten) unlisten();
    };
  }, []);

  return customFonts;
}
