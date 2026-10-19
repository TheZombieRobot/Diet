/**
 * useLiveQuery (storage spec section 1, app part): a Dexie liveQuery read in a component through
 * useSyncExternalStore, like the plain stores in store.ts. It re-renders when the records it read
 * change, and unsubscribes for good when the write gate closes (an import, delete-all, or another
 * tab), so a closed database is never queried again from here.
 */
import { liveQuery } from 'dexie';
import { useMemo, useSyncExternalStore } from 'react';
import type { WriteGate } from './gate';

interface LiveStore<T> {
  get: () => T | undefined;
  subscribe: (listener: () => void) => () => void;
}

/** A store over one live query. It runs the query only while something is subscribed. */
export function liveStore<T>(query: () => Promise<T>, gate: WriteGate): LiveStore<T> {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;
  const start = (): void => {
    if (!gate.isOpen()) return;
    const subscription = liveQuery(query).subscribe({
      next: (next) => {
        value = next;
        for (const listener of [...listeners]) listener();
      },
      // A query on a closed database fails; the last value stays on screen until the reload.
      error: () => undefined,
    });
    const stopGate = gate.onClose(() => {
      subscription.unsubscribe();
    });
    stop = () => {
      subscription.unsubscribe();
      stopGate();
    };
  };
  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop !== null) {
          stop();
          stop = null;
        }
      };
    },
  };
}

/**
 * The live result of `query(source)`, or undefined until it first arrives (or when `source` is
 * null, before the database is open). `query` should be a module-level function, so the
 * subscription is kept across renders.
 */
export function useLiveQuery<S extends { readonly gate: WriteGate }, T>(
  source: S | null,
  query: (source: S) => Promise<T>,
): T | undefined {
  const store = useMemo(
    () => (source === null ? null : liveStore(() => query(source), source.gate)),
    [source, query],
  );
  return useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    store?.get ?? noValue,
    store?.get ?? noValue,
  );
}

const noSubscribe = (): (() => void) => () => undefined;
const noValue = (): undefined => undefined;
