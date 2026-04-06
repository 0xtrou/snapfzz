import { useState, lazy, Suspense, useEffect, useCallback, type ComponentType } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { WindowShell, AntIcon } from '@snapfzz/shared';
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
    <Suspense fallback={
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-default)' }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--border-default)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <PluginErrorBoundary pluginId={pluginId} onCrash={onCrash}>
        <Component />
      </PluginErrorBoundary>
    </Suspense>
  );
}

function TabBar({ tabs, activeTabId, onTabClick }: {
  tabs: readonly TabContribution[];
  activeTabId: string;
  onTabClick: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-default)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabClick(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
            activeTabId === tab.id
              ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <AntIcon name={tab.icon} />
          <span>{tab.label}</span>
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
            No tabs available — install plugins to see content
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
            No tabs available — install plugins to see content
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

function StatusItemWrapper({ item, onCrash }: { item: StatusItemContribution; onCrash: (pluginId: string, error: Error) => void }) {
  return <LazyComponent loader={item.component} pluginId={item.id} onCrash={onCrash} />;
}

const store = new ContributionStore();
const host = new PluginHost(store, 'project');
let pluginsInitialized = false;

export function App() {
  const contributions = useContributionStore(() => store);

  const leftPanelTabs = contributions.leftPanelTabs;
  const workspaceTabs = contributions.workspaceTabs;

  const [leftPanelActiveTab, setLeftPanelActiveTab] = useState<string | null>(null);
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState<string | null>(null);

  const handleCrash = useCallback((pluginId: string, _error: Error) => {
    host.reportCrash(pluginId);
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

  const leftItems = contributions.statusItems.filter((item) => item.position === 'left');

  return (
    <PluginHostProvider host={host}>
      <WindowShell
        title="Snapfzz"
        statusBarContent={
          <>
            {leftItems.map((item) => (
              <StatusItemWrapper key={item.id} item={item} onCrash={handleCrash} />
            ))}
            <span className="text-[var(--text-muted)]">
              {contributions.leftPanelTabs.length + contributions.workspaceTabs.length} plugin{contributions.leftPanelTabs.length + contributions.workspaceTabs.length !== 1 ? 's' : ''}
            </span>
          </>
        }
      >
        <div className="flex flex-col h-full">
          <PanelGroup direction="horizontal" className="flex-1" style={{ contain: 'strict' }}>
            <Panel defaultSize={40} minSize={20}>
              <LeftPanel tabs={leftPanelTabs} activeTabId={leftPanelActiveTab || ''} onTabChange={setLeftPanelActiveTab} onCrash={handleCrash} />
            </Panel>
            <PanelResizeHandle className="w-1 bg-[var(--border-default)] hover:bg-[var(--border-strong)] transition-colors cursor-col-resize" style={{ transform: 'translateZ(0)' }} />
            <Panel defaultSize={60} minSize={30}>
              <RightPanel tabs={workspaceTabs} activeTabId={workspaceActiveTab || ''} onTabChange={setWorkspaceActiveTab} onCrash={handleCrash} />
            </Panel>
          </PanelGroup>

          <div className="h-48" style={{ contain: 'strict' }}>
            <BottomPanel panels={contributions.bottomPanels} onCrash={handleCrash} />
          </div>
        </div>
      </WindowShell>
    </PluginHostProvider>
  );
}
