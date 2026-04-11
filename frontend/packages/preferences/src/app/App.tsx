import React, { useState, useRef, lazy, Suspense, useEffect, useCallback, useMemo, type ComponentType } from 'react';
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

// Per A003/Skeleton: fills the full content area to avoid layout shift on hydrate.
function SettingsSkeleton() {
  return (
    <div style={{ width: '100%', height: '100%', padding: 24, boxSizing: 'border-box' }}>
      {/* Header bar placeholder */}
      <div style={{ height: 48, borderBottom: '1px solid var(--border-default)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 200, height: 20, borderRadius: 4, background: 'var(--bg-subtle)' }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 80, height: 32, borderRadius: 6, background: 'var(--bg-subtle)' }} />
      </div>
      {/* Form field placeholders — fill available width */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div style={{ width: 120, height: 14, borderRadius: 4, background: 'var(--bg-subtle)', marginBottom: 12 }} />
            <div style={{ width: '100%', maxWidth: 480, height: 36, borderRadius: 6, background: 'var(--bg-subtle)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Per A003/PersistentMount: Cache lazy components so React.lazy() is called once
// per section, not on every render. Without this, each render creates a new
// component type → React unmounts the old one → skeleton flashes.
const lazySectionCache = new Map<string, React.LazyExoticComponent<ComponentType>>();

function getLazyComponent(id: string, loader: () => Promise<{ default: ComponentType }>) {
  let cached = lazySectionCache.get(id);
  if (!cached) {
    cached = lazy(loader);
    lazySectionCache.set(id, cached);
  }
  return cached;
}

function LazySection({ loader, sectionId, onCrash }: {
  loader: () => Promise<{ default: ComponentType }>;
  sectionId?: string;
  onCrash?: (sectionId: string, error: Error) => void;
}) {
  const Component = getLazyComponent(sectionId || 'unknown', loader);
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

  const sections: readonly SettingsSectionContribution[] = useMemo(
    () => [...contributions.settingsSections].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [contributions.settingsSections],
  );

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  // Per A003/PersistentMount: Track which sections have been visited so they stay
  // mounted (hidden via display:none) instead of being unmounted on tab switch.
  // This preserves component state and avoids re-fetching on every tab switch.
  const mountedSectionsRef = useRef(new Set<string>());

  const handleCrash = useCallback((sectionId: string, _error: Error) => {
    host.reportCrash(sectionId);
  }, []);

  useEffect(() => {
    if (activeSectionId === null && sections.length > 0) {
      setActiveSectionId(sections[0].id);
    }
  }, [activeSectionId, sections]);

  // Track visited sections so they stay mounted
  if (activeSectionId) {
    mountedSectionsRef.current.add(activeSectionId);
  }

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

  return (
    <PluginHostProvider host={host}>
      <WindowShell title="Settings" statusBarContent={<span className="text-[var(--color-success)]">● Connected</span>}>
        <div className="flex h-full overflow-hidden">
          <aside
            className="flex flex-col border-r border-[var(--border-default)] bg-[var(--bg-default)] overflow-y-auto"
            style={{ width: 208, contain: 'layout paint' }}
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

          <main className="flex-1 overflow-auto bg-[var(--bg-primary)]" style={{ contain: 'layout paint' }}>
            {sections.length === 0 && (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
                No settings available — install plugins to configure
              </div>
            )}
            {/* Per A003/PersistentMount: Render all visited sections, hide inactive ones
                with display:none. Components stay mounted — no re-fetch on tab switch. */}
            {sections.filter(s => mountedSectionsRef.current.has(s.id)).map(section => (
              <div key={section.id} style={{ display: section.id === activeSectionId ? 'block' : 'none', height: '100%' }}>
                <LazySection loader={section.component} sectionId={section.id} onCrash={handleCrash} />
              </div>
            ))}
          </main>
        </div>
      </WindowShell>
    </PluginHostProvider>
  );
}
