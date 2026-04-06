// Per A007/MultiLayout: Preferences shell — own React tree, own ContributionStore, own PluginHost.
// Per A006/CoreRuntime: shell remains empty of feature imports — runtime discovery registers plugins.
// Per A005/PluginArchitecture: shells render contributions from ContributionStore via PluginHost.
import { useState, useRef, lazy, Suspense, useEffect, useCallback, type ComponentType } from 'react';
import { ConfigProvider, Button } from 'antd';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useTheme, darkTheme, lightTheme } from '@snapfzz/shared';
import {
  PluginHost,
  ContributionStore,
  useContributionStore,
  PluginHostProvider,
  PluginErrorBoundary,
  registerDiscoveredPlugins,
} from '@snapfzz/plugin-host';
import type { SettingsSectionContribution } from '@snapfzz/plugin-sdk';

function LazySection({ loader, sectionId, onCrash }: {
  loader: () => Promise<{ default: ComponentType }>;
  sectionId?: string;
  onCrash?: (sectionId: string, error: Error) => void;
}) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">Loading...</div>}>
      <PluginErrorBoundary pluginId={sectionId} onCrash={onCrash}>
        <Component />
      </PluginErrorBoundary>
    </Suspense>
  );
}

function FpsCounter() {
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      framesRef.current++;
      const now = performance.now();
      if (now - lastTimeRef.current >= 1000) {
        setFps(framesRef.current);
        framesRef.current = 0;
        lastTimeRef.current = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const color = fps >= 55 ? '#22c55e' : fps >= 30 ? '#eab308' : '#ef4444';
  return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{fps} fps</span>;
}

// Per A007/MultiLayout: module-level store + host prevents re-registration on theme toggle (same as project shell).
// Per A005/PluginArchitecture: one ContributionStore per window — plugins declare which surface they target.
const store = new ContributionStore();
const host = new PluginHost(store, 'preferences');
let pluginsInitialized = false;

export function App() {
  const { theme, toggleTheme } = useTheme();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;

  const contributions = useContributionStore(() => store);

  // Per A007/Preferences: sidebar sections sourced from settingsSections sorted by order.
  const sections: readonly SettingsSectionContribution[] = [...contributions.settingsSections].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999),
  );

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Per A005/Isolation: crash callback routes through host crash supervision (3-strike auto-disable).
  const handleCrash = useCallback((sectionId: string, _error: Error) => {
    host.reportCrash(sectionId);
  }, []);

  const titleBarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const tauriInvoke = (cmd: string, args?: Record<string, unknown>) => {
      const tauri = (window as Record<string, unknown>).__TAURI_INTERNALS__ as
        | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
        | undefined;
      if (tauri) tauri.invoke(cmd, args).catch(() => {});
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!titleBarRef.current?.contains(target)) return;
      if (target.closest('input, textarea, button, a, select')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      tauriInvoke('plugin:window|start_dragging', { label: 'preferences' });
    };

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!titleBarRef.current?.contains(target)) return;
      if (target.closest('input, textarea, button, a, select')) return;
      tauriInvoke('plugin:window|toggle_maximize', { label: 'preferences' });
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('dblclick', handleDblClick);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('dblclick', handleDblClick);
    };
  }, []);

  useEffect(() => {
    if (activeSectionId === null && sections.length > 0) {
      setActiveSectionId(sections[0].id);
    }
  }, [activeSectionId, sections]);

  useEffect(() => {
    // Per A003/InstantLoading: hide skeleton once React hydrates.
    document.documentElement.setAttribute('data-app-ready', 'true');
    const skeleton = document.getElementById('skeleton');
    if (skeleton) {
      skeleton.classList.add('fade-out');
      skeleton.addEventListener('transitionend', () => skeleton.remove(), { once: true });
    }
  }, []);

  useEffect(() => {
    if (pluginsInitialized) return;
    pluginsInitialized = true;
    // Per A003/InstantLoading: lazy plugin activation — only onStartupFinished at boot.
    registerDiscoveredPlugins(host, 'preferences').then(() => {
      void host.activateByEvent('onStartupFinished');
    });
  }, []);

  const activeSection = sections.find((s) => s.id === activeSectionId);

  return (
    <ConfigProvider theme={antdTheme}>
      <PluginHostProvider host={host}>
        <div className="flex flex-col h-screen overflow-hidden">
          <header
            ref={titleBarRef}
            className="flex items-center gap-2 px-4 pr-3 border-b border-[var(--border-default)] bg-[var(--bg-default)] select-none cursor-default"
            style={{ paddingLeft: 78, height: 38 }}
          >
            <span className="text-sm font-semibold text-[var(--text-primary)]">Preferences</span>
            <div className="ml-auto flex items-center gap-1 pointer-events-auto">
              <Button
                type="text"
                size="small"
                icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            {/* Per A007/Preferences: sidebar reads settingsSections from ContributionStore sorted by order. */}
            {/* Per A001/Performance: contain:strict isolates sidebar repaints from content area. */}
            <aside
              className="flex flex-col border-r border-[var(--border-default)] bg-[var(--bg-default)] overflow-y-auto"
              style={{ width: 208, contain: 'strict' }}
            >
              {sections.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-4 text-center">
                  <span className="text-[var(--text-muted)] text-sm">
                    No settings available — install plugins to configure
                  </span>
                </div>
              ) : (
                <nav className="flex flex-col gap-1 p-2">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSectionId(section.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors duration-150 w-full ${
                        activeSectionId === section.id
                          ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                      }`}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      <span className="shrink-0">{section.icon}</span>
                      <span>{section.label}</span>
                    </button>
                  ))}
                </nav>
              )}
            </aside>

            {/* Per A007/Preferences: content renders active section's component with Suspense + ErrorBoundary. */}
            {/* Per A001/Performance: contain:strict isolates content repaints from sidebar. */}
            <main
              className="flex-1 overflow-auto bg-[var(--bg-primary)]"
              style={{ contain: 'strict' }}
            >
              {activeSection ? (
                <LazySection
                  loader={activeSection.component}
                  sectionId={activeSection.id}
                  onCrash={handleCrash}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
                  {sections.length === 0
                    ? 'No settings available — install plugins to configure'
                    : 'Select a section to view settings'}
                </div>
              )}
            </main>
          </div>

          <footer className="h-8 flex items-center px-4 text-xs border-t border-[var(--border-default)] bg-[var(--bg-default)]">
            <div className="flex items-center gap-3">
              <span className="text-[var(--color-success)]">● Connected</span>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <FpsCounter />
            </div>
          </footer>
        </div>
      </PluginHostProvider>
    </ConfigProvider>
  );
}
