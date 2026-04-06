import { useState, lazy, Suspense, useEffect, useCallback, type ComponentType } from 'react';
import { WindowShell, AntIcon } from '@snapfzz/shared';
import {
  PluginHost,
  ContributionStore,
  useContributionStore,
  PluginHostProvider,
  PluginErrorBoundary,
  registerDiscoveredPlugins,
} from '@snapfzz/plugin-host';
import type { SettingsSectionContribution } from '@snapfzz/plugin-sdk';

function SettingsSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ height: 54, borderBottom: '1px solid var(--border-default)', marginBottom: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {[180, 120, 160].map((w) => (
          <div key={w}>
            <div style={{ width: 80, height: 14, borderRadius: 4, background: 'var(--bg-subtle)', marginBottom: 12 }} />
            <div style={{ width: w, height: 32, borderRadius: 6, background: 'var(--bg-subtle)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LazySection({ loader, sectionId, onCrash }: {
  loader: () => Promise<{ default: ComponentType }>;
  sectionId?: string;
  onCrash?: (sectionId: string, error: Error) => void;
}) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <PluginErrorBoundary pluginId={sectionId} onCrash={onCrash}>
        <Component />
      </PluginErrorBoundary>
    </Suspense>
  );
}

const store = new ContributionStore();
const host = new PluginHost(store, 'preferences');
let pluginsInitialized = false;

export function App() {
  const contributions = useContributionStore(() => store);

  const sections: readonly SettingsSectionContribution[] = [...contributions.settingsSections].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999),
  );

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const handleCrash = useCallback((sectionId: string, _error: Error) => {
    host.reportCrash(sectionId);
  }, []);

  useEffect(() => {
    if (activeSectionId === null && sections.length > 0) {
      setActiveSectionId(sections[0].id);
    }
  }, [activeSectionId, sections]);

  useEffect(() => {
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
    registerDiscoveredPlugins(host, 'preferences').then(() => {
      void host.activateByEvent('onStartupFinished');
    });
  }, []);

  const activeSection = sections.find((s) => s.id === activeSectionId);

  return (
    <PluginHostProvider host={host}>
      <WindowShell title="Settings" statusBarContent={<span className="text-[var(--color-success)]">● Connected</span>}>
        <div className="flex h-full overflow-hidden">
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
                    <span className="shrink-0"><AntIcon name={section.icon} /></span>
                    <span>{section.label}</span>
                  </button>
                ))}
              </nav>
            )}
          </aside>

          <main className="flex-1 overflow-auto bg-[var(--bg-primary)]" style={{ contain: 'strict' }}>
            {activeSection ? (
              <LazySection loader={activeSection.component} sectionId={activeSection.id} onCrash={handleCrash} />
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
                {sections.length === 0 ? 'No settings available — install plugins to configure' : 'Select a section'}
              </div>
            )}
          </main>
        </div>
      </WindowShell>
    </PluginHostProvider>
  );
}
