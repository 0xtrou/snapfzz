// Per A006/CoreRuntime: Project shell renders contributions from ContributionStore via PluginHost.
// Per A005/PluginArchitecture: shells remain empty of feature-plugin imports — runtime discovery registers plugins.
// Per SNA-4: Integrate with @snapfzz/plugin-host for plugin-driven UI.
import { useState, useRef, lazy, Suspense, useMemo, useEffect, useCallback, type ComponentType } from 'react';
import { ConfigProvider, Button } from 'antd';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useTheme, darkTheme, lightTheme } from '@snapfzz/shared';
import {
  PluginHost,
  ContributionStore,
  useContributionStore,
  PluginHostProvider,
  PluginErrorBoundary,
  registerDiscoveredPlugins,
} from '@snapfzz/plugin-host';
import type { TabContribution, PanelContribution, StatusItemContribution } from '@snapfzz/plugin-sdk';

function LazyComponent({ loader, pluginId, onCrash }: {
  loader: () => Promise<{ default: ComponentType }>;
  pluginId?: string;
  onCrash?: (pluginId: string, error: Error) => void;
}) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">Loading...</div>}>
      <PluginErrorBoundary pluginId={pluginId} onCrash={onCrash}>
        <Component />
      </PluginErrorBoundary>
    </Suspense>
  );
}

function TabBar({ tabs, activeTabId, onTabClick }: {
  tabs: readonly TabContribution[];
  activeTabId: string | null;
  onTabClick: (id: string) => void;
}) {
  if (tabs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
        No tabs available — install plugins to see content
      </div>
    );
  }

  return (
    <div className="flex border-b border-[var(--border-default)]">
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.id}
          onClick={() => onTabClick(tab.id)}
          className={`px-4 py-2 text-sm transition-colors duration-150 hover:bg-[var(--bg-subtle)] ${
            activeTabId === tab.id
              ? 'text-[var(--text-primary)] border-b-2 border-[var(--accent)] bg-[var(--bg-subtle)]'
              : 'text-[var(--text-muted)]'
          }`}
          style={{ transform: 'translateZ(0)' }} // Per A001: GPU-only animation constraint per performance spec.
        >
          <span className="mr-2">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function LeftPanel({ tabs, activeTabId, onTabChange, onCrash }: {
  tabs: readonly TabContribution[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onCrash: (pluginId: string, error: Error) => void;
}) {
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="h-full flex flex-col" style={{ contain: 'strict' }}>
      <TabBar tabs={tabs} activeTabId={activeTabId} onTabClick={onTabChange} />
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <LazyComponent loader={activeTab.component} pluginId={activeTab.id} onCrash={onCrash} />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Select a tab to view content
          </div>
        )}
      </div>
    </div>
  );
}

function RightPanel({ tabs, activeTabId, onTabChange, onCrash }: {
  tabs: readonly TabContribution[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onCrash: (pluginId: string, error: Error) => void;
}) {
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="h-full flex flex-col" style={{ contain: 'strict' }}>
      <TabBar tabs={tabs} activeTabId={activeTabId} onTabClick={onTabChange} />
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <LazyComponent loader={activeTab.component} pluginId={activeTab.id} onCrash={onCrash} />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Select a workspace tab to view content
          </div>
        )}
      </div>
    </div>
  );
}

function BottomPanel({ panels, onCrash }: { panels: readonly PanelContribution[]; onCrash: (pluginId: string, error: Error) => void }) {
  if (panels.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
        No agent panels — plugins will provide agent network
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {panels.map((panel) => (
        <div key={panel.id} className="flex-1 min-w-0">
          <LazyComponent loader={panel.component} pluginId={panel.id} onCrash={onCrash} />
        </div>
      ))}
    </div>
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

function StatusBar({ items, pluginCount, onCrash }: { items: readonly StatusItemContribution[]; pluginCount: number; onCrash: (pluginId: string, error: Error) => void }) {
  const leftItems = items.filter((item) => item.position === 'left');
  const rightItems = items.filter((item) => item.position === 'right');

  return (
    <footer className="h-8 flex items-center px-4 text-xs border-t border-[var(--border-default)] bg-[var(--bg-default)]">
      <div className="flex items-center gap-3">
        {leftItems.map((item) => (
          <StatusItemWrapper key={item.id} item={item} onCrash={onCrash} />
        ))}
        <span className="text-[var(--text-muted)]">{pluginCount} plugin{pluginCount !== 1 ? 's' : ''}</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        {rightItems.map((item) => (
          <StatusItemWrapper key={item.id} item={item} onCrash={onCrash} />
        ))}
        <FpsCounter />
      </div>
    </footer>
  );
}

function StatusItemWrapper({ item, onCrash }: { item: StatusItemContribution; onCrash: (pluginId: string, error: Error) => void }) {
  return <LazyComponent loader={item.component} pluginId={item.id} onCrash={onCrash} />;
}

function createPluginHost(store: ContributionStore): PluginHost {
  return new PluginHost(store, 'project');
}

const store = new ContributionStore();
const host = createPluginHost(store);
let pluginsInitialized = false;

export function App() {
  const { theme, toggleTheme } = useTheme();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;

  const contributions = useContributionStore(() => store);

  const [leftPanelActiveTab, setLeftPanelActiveTab] = useState<string | null>(null);
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState<string | null>(null);

  const leftPanelTabs = contributions.leftPanelTabs;
  const workspaceTabs = contributions.workspaceTabs;

  // Per A005/Isolation: crash callback routes through host crash supervision (3-strike auto-disable).
  const handleCrash = useCallback((pluginId: string, _error: Error) => {
    host.reportCrash(pluginId);
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
      tauriInvoke('plugin:window|start_dragging', { label: 'launcher' });
    };

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!titleBarRef.current?.contains(target)) return;
      if (target.closest('input, textarea, button, a, select')) return;
      tauriInvoke('plugin:window|toggle_maximize', { label: 'launcher' });
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('dblclick', handleDblClick);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('dblclick', handleDblClick);
    };
  }, []);

  useEffect(() => {
    if (leftPanelActiveTab === null && leftPanelTabs.length > 0) {
      setLeftPanelActiveTab(leftPanelTabs[0].id);
    }
  }, [leftPanelActiveTab, leftPanelTabs]);

  useEffect(() => {
    if (workspaceActiveTab === null && workspaceTabs.length > 0) {
      setWorkspaceActiveTab(workspaceTabs[0].id);
    }
  }, [workspaceActiveTab, workspaceTabs]);

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
    registerDiscoveredPlugins(host, 'project').then(() => {
      void host.activateByEvent('onStartupFinished');
    });
  }, []);

  return (
    <ConfigProvider theme={antdTheme}>
      <PluginHostProvider host={host}>
        <div className="flex flex-col h-screen overflow-hidden">
          <header
            ref={titleBarRef}
            className="flex items-center gap-2 px-4 pr-3 border-b border-[var(--border-default)] bg-[var(--bg-default)] select-none cursor-default"
            style={{ paddingLeft: 78, height: 38 }}
          >
            <div className="ml-auto flex items-center gap-1 pointer-events-auto">
              <Button
                type="text"
                size="small"
                icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
              <img src="/logo.svg" alt="Snapfzz" className="w-5 h-5" />
            </div>
          </header>

          <PanelGroup direction="horizontal" className="flex-1" style={{ contain: 'strict' }}>
            <Panel defaultSize={40} minSize={20}>
              <LeftPanel
                tabs={leftPanelTabs}
                activeTabId={leftPanelActiveTab || ''}
                onTabChange={setLeftPanelActiveTab}
                onCrash={handleCrash}
              />
            </Panel>
            <PanelResizeHandle 
              className="w-1 bg-[var(--border-default)] hover:bg-[var(--border-strong)] transition-colors cursor-col-resize"
              style={{ transform: 'translateZ(0)' }} // Per A001: GPU-only animation constraint per performance spec.
            />
            <Panel defaultSize={60} minSize={30}>
              <RightPanel
                tabs={workspaceTabs}
                activeTabId={workspaceActiveTab || ''}
                onTabChange={setWorkspaceActiveTab}
                onCrash={handleCrash}
              />
            </Panel>
          </PanelGroup>

          {/* Per U006: Bottom panel - Agent Network area */}
          <div className="h-48 border-t border-[var(--border-default)]" style={{ contain: 'strict' }}>
            <BottomPanel panels={contributions.bottomPanels} onCrash={handleCrash} />
          </div>

          <StatusBar items={contributions.statusItems} pluginCount={contributions.leftPanelTabs.length + contributions.workspaceTabs.length} onCrash={handleCrash} />
        </div>
      </PluginHostProvider>
    </ConfigProvider>
  );
}