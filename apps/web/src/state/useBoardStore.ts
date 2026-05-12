// React hooks for reading from the BoardStore with shallow comparison.

import { useSyncExternalStore } from 'react';
import { boardStore, type BoardSnapshot } from './BoardStore';

export function useBoardSnapshot(): BoardSnapshot {
  return useSyncExternalStore(
    boardStore.subscribe.bind(boardStore),
    boardStore.getSnapshot.bind(boardStore),
    boardStore.getSnapshot.bind(boardStore),
  );
}

/**
 * Select a derived value from the store; the selector should return a value
 * that is referentially stable when its underlying inputs are unchanged
 * (Maps are kept by reference if untouched in BoardStore.patch).
 */
export function useBoardSelector<T>(selector: (s: BoardSnapshot) => T): T {
  return useSyncExternalStore(
    boardStore.subscribe.bind(boardStore),
    () => selector(boardStore.getSnapshot()),
    () => selector(boardStore.getSnapshot()),
  );
}

export { boardStore };
