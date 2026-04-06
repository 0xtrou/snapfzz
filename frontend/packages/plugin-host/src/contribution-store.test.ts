// Spec: A005-feat-plugin-architecture.md, A002-state-management.md, A007-multi-layout-architecture.md
// Sections: Contribution Registry, Reactive Store Snapshots, Settings Sections
// Verifies: registration/disposal behavior, subscription notifications, immutable snapshot contract
import { describe, expect, it, vi } from 'vitest';
import type {
  CommandContribution,
  PanelContribution,
  SettingsContribution,
  SettingsSectionContribution,
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

const createSettingsSection = (id: string, order?: number): SettingsSectionContribution => ({
  id,
  label: id,
  icon: '⚙',
  order,
  component: async () => ({ default: (() => null) as never }),
});

describe('A005/store: ContributionStore registration + snapshot behavior', () => {
  it('A005/store: registers a left panel tab contribution', () => {
    const store = new ContributionStore();
    const tab = createTab('tab.one');

    store.registerLeftPanelTab(tab);

    expect(store.getLeftPanelTabs()).toEqual([tab]);
  });

  it('A005/store: removes a registered tab contribution when disposer is called', () => {
    const store = new ContributionStore();
    const tab = createTab('tab.one');

    const dispose = store.registerLeftPanelTab(tab);
    dispose();

    expect(store.getLeftPanelTabs()).toEqual([]);
  });

  it('A002/store-reactivity: notifies subscribers when contributions are registered', () => {
    const store = new ContributionStore();
    const listener = vi.fn();

    store.subscribe(listener);
    store.registerLeftPanelTab(createTab('tab.one'));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('A002/store-reactivity: notifies subscribers when contributions are disposed', () => {
    const store = new ContributionStore();
    const listener = vi.fn();

    store.subscribe(listener);
    const dispose = store.registerLeftPanelTab(createTab('tab.one'));
    listener.mockClear();

    dispose();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('A002/store-reactivity: returns immutable snapshot objects for concurrent-safe consumers', () => {
    const store = new ContributionStore();
    store.registerLeftPanelTab(createTab('tab.one'));
    store.registerWorkspaceTab(createTab('tab.two'));
    store.registerBottomPanel(createPanel('panel.one'));
    store.registerStatusItem(createStatusItem('status.one'));
    store.registerCommand(createCommand('command.one'));
    store.registerShortcut(createShortcut('command.one'));
    store.registerSetting(createSetting('setting.one'));
    store.registerSettingsSection(createSettingsSection('general'));

    const snapshot = store.getSnapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.leftPanelTabs)).toBe(true);
    expect(Object.isFrozen(snapshot.workspaceTabs)).toBe(true);
    expect(Object.isFrozen(snapshot.bottomPanels)).toBe(true);
    expect(Object.isFrozen(snapshot.statusItems)).toBe(true);
    expect(Object.isFrozen(snapshot.commands)).toBe(true);
    expect(Object.isFrozen(snapshot.shortcuts)).toBe(true);
    expect(Object.isFrozen(snapshot.settings)).toBe(true);
    expect(Object.isFrozen(snapshot.settingsSections)).toBe(true);
  });

  it('A005/store: preserves insertion order for multiple registrations of the same contribution type', () => {
    const store = new ContributionStore();
    const first = createTab('tab.one');
    const second = createTab('tab.two');

    store.registerLeftPanelTab(first);
    store.registerLeftPanelTab(second);

    expect(store.getLeftPanelTabs()).toEqual([first, second]);
  });

  it('A007/store-settingsSections: registers a settings section contribution', () => {
    const store = new ContributionStore();
    const section = createSettingsSection('general', 1);

    store.registerSettingsSection(section);

    expect(store.getSettingsSections()).toEqual([section]);
  });

  it('A007/store-settingsSections: removes a settings section when disposer is called', () => {
    const store = new ContributionStore();
    const section = createSettingsSection('general', 1);

    const dispose = store.registerSettingsSection(section);
    dispose();

    expect(store.getSettingsSections()).toEqual([]);
  });

  it('A007/store-settingsSections: deduplicates by id — second registration with same id is no-op', () => {
    const store = new ContributionStore();
    const section = createSettingsSection('general', 1);
    const duplicate = createSettingsSection('general', 2);

    store.registerSettingsSection(section);
    store.registerSettingsSection(duplicate);

    expect(store.getSettingsSections()).toHaveLength(1);
    expect(store.getSettingsSections()[0]).toEqual(section);
  });

  it('A007/store-settingsSections: snapshot includes settingsSections and is frozen', () => {
    const store = new ContributionStore();
    store.registerSettingsSection(createSettingsSection('general', 1));
    store.registerSettingsSection(createSettingsSection('plugins', 2));

    const snapshot = store.getSnapshot();

    expect(snapshot.settingsSections).toHaveLength(2);
    expect(Object.isFrozen(snapshot.settingsSections)).toBe(true);
  });

  it('A007/store-settingsSections: notifies subscribers when a settings section is registered', () => {
    const store = new ContributionStore();
    const listener = vi.fn();

    store.subscribe(listener);
    store.registerSettingsSection(createSettingsSection('general'));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
