import type { TabContribution, PanelContribution, StatusItemContribution } from '@snapfzz/plugin-sdk';

export class ContributionStore {
  private leftPanelTabs: TabContribution[] = [];
  private workspaceTabs: TabContribution[] = [];
  private bottomPanels: PanelContribution[] = [];
  private statusItems: StatusItemContribution[] = [];
  private listeners: Set<() => void> = new Set();

  registerLeftPanelTab(tab: TabContribution) {
    this.leftPanelTabs.push(tab);
    this.notify();
    return () => {
      this.leftPanelTabs = this.leftPanelTabs.filter(t => t.id !== tab.id);
      this.notify();
    };
  }

  registerWorkspaceTab(tab: TabContribution) {
    this.workspaceTabs.push(tab);
    this.notify();
    return () => {
      this.workspaceTabs = this.workspaceTabs.filter(t => t.id !== tab.id);
      this.notify();
    };
  }

  registerBottomPanel(panel: PanelContribution) {
    this.bottomPanels.push(panel);
    this.notify();
    return () => {
      this.bottomPanels = this.bottomPanels.filter(p => p.id !== panel.id);
      this.notify();
    };
  }

  registerStatusItem(item: StatusItemContribution) {
    this.statusItems.push(item);
    this.notify();
    return () => {
      this.statusItems = this.statusItems.filter(i => i.id !== item.id);
      this.notify();
    };
  }

  getLeftPanelTabs() { return this.leftPanelTabs; }
  getWorkspaceTabs() { return this.workspaceTabs; }
  getBottomPanels() { return this.bottomPanels; }
  getStatusItems() { return this.statusItems; }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }
}
