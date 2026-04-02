import type {
  CommandContribution,
  PanelContribution,
  SettingsContribution,
  ShortcutContribution,
  StatusItemContribution,
  TabContribution,
} from '@snapfzz/plugin-sdk';

export interface ContributionSnapshot {
  leftPanelTabs: readonly TabContribution[];
  workspaceTabs: readonly TabContribution[];
  bottomPanels: readonly PanelContribution[];
  statusItems: readonly StatusItemContribution[];
  commands: readonly CommandContribution[];
  shortcuts: readonly ShortcutContribution[];
  settings: readonly SettingsContribution[];
}

export class ContributionStore {
  // Per A006/ShellLayout: store is the runtime-owned source for shell slots that plugins populate dynamically.
  private leftPanelTabs: TabContribution[] = [];
  private workspaceTabs: TabContribution[] = [];
  private bottomPanels: PanelContribution[] = [];
  private statusItems: StatusItemContribution[] = [];
  private commands: CommandContribution[] = [];
  private shortcuts: ShortcutContribution[] = [];
  private settings: SettingsContribution[] = [];
  private listeners: Set<() => void> = new Set();
  // Per A002/StateManagement: snapshot pattern enables useSyncExternalStore reactive reads without re-render overhead.
  private snapshot: ContributionSnapshot = this.createSnapshot();

  registerLeftPanelTab(tab: TabContribution) {
    return this.registerArrayContribution('leftPanelTabs', tab, (item) => item.id === tab.id);
  }

  registerWorkspaceTab(tab: TabContribution) {
    return this.registerArrayContribution('workspaceTabs', tab, (item) => item.id === tab.id);
  }

  registerBottomPanel(panel: PanelContribution) {
    return this.registerArrayContribution('bottomPanels', panel, (item) => item.id === panel.id);
  }

  registerStatusItem(item: StatusItemContribution) {
    return this.registerArrayContribution('statusItems', item, (entry) => entry.id === item.id);
  }

  registerCommand(command: CommandContribution) {
    return this.registerArrayContribution('commands', command, (entry) => entry.id === command.id);
  }

  registerShortcut(shortcut: ShortcutContribution) {
    return this.registerArrayContribution('shortcuts', shortcut, (entry) => entry.command === shortcut.command && entry.key === shortcut.key);
  }

  registerSetting(setting: SettingsContribution) {
    return this.registerArrayContribution('settings', setting, (entry) => entry.id === setting.id);
  }

  getLeftPanelTabs() {
    return [...this.leftPanelTabs];
  }

  getWorkspaceTabs() {
    return [...this.workspaceTabs];
  }

  getBottomPanels() {
    return [...this.bottomPanels];
  }

  getStatusItems() {
    return [...this.statusItems];
  }

  getCommands() {
    return [...this.commands];
  }

  getShortcuts() {
    return [...this.shortcuts];
  }

  getSettings() {
    return [...this.settings];
  }

  getSnapshot(): ContributionSnapshot {
    return this.snapshot;
  }

  private createSnapshot(): ContributionSnapshot {
    // Per A002/StateManagement: frozen snapshot prevents consumers from mutating store internals
    return Object.freeze({
      leftPanelTabs: Object.freeze([...this.leftPanelTabs]),
      workspaceTabs: Object.freeze([...this.workspaceTabs]),
      bottomPanels: Object.freeze([...this.bottomPanels]),
      statusItems: Object.freeze([...this.statusItems]),
      commands: Object.freeze([...this.commands]),
      shortcuts: Object.freeze([...this.shortcuts]),
      settings: Object.freeze([...this.settings]),
    });
  }

  private notify() {
    this.snapshot = this.createSnapshot();
    for (const fn of this.listeners) {
      fn();
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private registerArrayContribution<K extends ArrayPropertyKey>(
    key: K,
    contribution: ArrayElement<ContributionStore[K]>,
    predicate: (item: ArrayElement<ContributionStore[K]>) => boolean,
  ) {
    this[key].push(contribution as never);
    this.notify();

    return () => {
      this[key] = this[key].filter((item) => !predicate(item as ArrayElement<ContributionStore[K]>)) as ContributionStore[K];
      this.notify();
    };
  }

}

type ArrayPropertyKey =
  | 'leftPanelTabs'
  | 'workspaceTabs'
  | 'bottomPanels'
  | 'statusItems'
  | 'commands'
  | 'shortcuts'
  | 'settings';

type ArrayElement<T> = T extends Array<infer Item> ? Item : never;
