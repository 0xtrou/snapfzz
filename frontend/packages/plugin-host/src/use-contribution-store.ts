import { useSyncExternalStore } from 'react';
import type { ContributionSnapshot } from './contribution-store';
import type { ContributionStore } from './contribution-store';

export function useContributionStore(getStore: () => ContributionStore): ContributionSnapshot {
  const store = getStore();

  const subscribe = (onStoreChange: () => void) => {
    return store.subscribe(onStoreChange);
  };

  const getSnapshot = () => {
    return store.getSnapshot();
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
