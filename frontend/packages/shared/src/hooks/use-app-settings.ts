// Per A007/MultiLayout: applied across all windows so every surface uses the same font settings.
// Per A004/Workspace: reads fontFamily and fontsize from settings.json on boot.
import { useEffect, useState } from 'react';

// A007/TauriIPC: accesses __TAURI_INTERNALS__ directly — no @tauri-apps/api bundle.
function getTauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  return tauri?.invoke ?? null;
}

interface AppSettings {
  fontFamily?: string;
  fontSize?: string;
  installedFonts?: string[];
}

const SYSTEM_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function applyFontSettings(settings: AppSettings): void {
  if (settings.fontFamily) {
    const resolved = settings.fontFamily === 'System' ? SYSTEM_FONT_STACK : settings.fontFamily;
    document.documentElement.style.setProperty('--font-family', resolved);
    document.body.style.fontFamily = resolved;

    // Ant Design's ConfigProvider sets fontFamily via CSS class selectors that override
    // body-level styles. Inject a global style to force the selected font everywhere.
    let styleEl = document.getElementById('snapfzz-font-override');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'snapfzz-font-override';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `*, *::before, *::after { font-family: ${resolved} !important; }`;
  }
  if (settings.fontSize) {
    document.documentElement.style.setProperty('--font-size', settings.fontSize + 'px');
    document.body.style.fontSize = settings.fontSize + 'px';
  }
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
        applyFontSettings(settings);
        const registered = await loadAndRegisterCustomFonts(invoke);
        setCustomFonts(registered);
      } catch {
        // First launch or Tauri unavailable — silently continue with CSS defaults.
      }
    }

    void applySettings();

    // Re-apply whenever another window saves settings (e.g. preferences → launcher).
    const invoke = getTauriInvoke();
    if (!invoke) return;

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
      if (unlisten) unlisten();
    };
  }, []);

  return customFonts;
}
