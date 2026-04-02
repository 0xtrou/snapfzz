// Spec: 009-feat-plugin-architecture.md, 003-feat-state-management-architecture.md
// Sections: Contribution Registry, Reactive Store Snapshots
// Verifies: registration/disposal behavior, subscription notifications, immutable snapshot contract
import { describe, expect, it, vi } from 'vitest';
import type {
  CommandContribution,
  PanelContribution,
  SettingsContribution,
  ShortcutContribution,
  StatusItemContribution,
  TabContribution,
} from '@snapfzz/plugin-sdk';
import { ContributionStore } from './contribution-store';

const createTab = (id: string): TabContribution => ({
  id,
  label: id,
  icon: 'icon',
  component: async () => ({ default: (() => null) as never }),
});

const createPanel = (id: string): PanelContribution => ({
  id,
  label: id,
  component: async () => ({ default: (() => null) as never }),
});

const createStatusItem = (id: string): StatusItemContribution => ({
  id,
  position: 'left',
  component: async () => ({ default: (() => null) as never }),
});

const createCommand = (id: string): CommandContribution => ({
  id,
  title: id,
});

const createShortcut = (command: string): ShortcutContribution => ({
  command,
  key: 'Cmd+K',
});

const createSetting = (id: string): SettingsContribution => ({
  id,
  label: id,
  schema: { type: 'string' },
});

describe('009/store: ContributionStore registration + snapshot behavior', () => {
  it('009/store: registers a left panel tab contribution', () => {
    const store = new ContributionStore();
    const tab = createTab('tab.one');

    store.registerLeftPanelTab(tab);

    expect(store.getLeftPanelTabs()).toEqual([tab]);
  });

  it('009/store: removes a registered tab contribution when disposer is called', () => {
    const store = new ContributionStore();
    const tab = createTab('tab.one');

    const dispose = store.registerLeftPanelTab(tab);
    dispose();

    expect(store.getLeftPanelTabs()).toEqual([]);
  });

  it('003/store-reactivity: notifies subscribers when contributions are registered', () => {
    const store = new ContributionStore();
    const listener = vi.fn();

    store.subscribe(listener);
    store.registerLeftPanelTab(createTab('tab.one'));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('003/store-reactivity: notifies subscribers when contributions are disposed', () => {
    const store = new ContributionStore();
    const listener = vi.fn();

    store.subscribe(listener);
    const dispose = store.registerLeftPanelTab(createTab('tab.one'));
    listener.mockClear();

    dispose();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('003/store-reactivity: returns immutable snapshot objects for concurrent-safe consumers', () => {
    const store = new ContributionStore();
    store.registerLeftPanelTab(createTab('tab.one'));
    store.registerWorkspaceTab(createTab('tab.two'));
    store.registerBottomPanel(createPanel('panel.one'));
    store.registerStatusItem(createStatusItem('status.one'));
    store.registerCommand(createCommand('command.one'));
    store.registerShortcut(createShortcut('command.one'));
    store.registerSetting(createSetting('setting.one'));

    const snapshot = store.getSnapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.leftPanelTabs)).toBe(true);
    expect(Object.isFrozen(snapshot.workspaceTabs)).toBe(true);
    expect(Object.isFrozen(snapshot.bottomPanels)).toBe(true);
    expect(Object.isFrozen(snapshot.statusItems)).toBe(true);
    expect(Object.isFrozen(snapshot.commands)).toBe(true);
    expect(Object.isFrozen(snapshot.shortcuts)).toBe(true);
    expect(Object.isFrozen(snapshot.settings)).toBe(true);
  });

  it('009/store: preserves insertion order for multiple registrations of the same contribution type', () => {
    const store = new ContributionStore();
    const first = createTab('tab.one');
    const second = createTab('tab.two');

    store.registerLeftPanelTab(first);
    store.registerLeftPanelTab(second);

    expect(store.getLeftPanelTabs()).toEqual([first, second]);
  });
});
