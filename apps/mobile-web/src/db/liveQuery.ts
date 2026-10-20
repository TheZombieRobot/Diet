/**
 * useLiveQuery (storage spec section 1, app part): a Dexie liveQuery read in a component through
 * useSyncExternalStore, like the plain stores in store.ts. It re-renders when the records it read
 * change, and unsubscribes for good when the write gate closes (an import, delete-all, or another
 * tab), so a closed database is never queried again from here.
 */
import { liveQuery } from 'dexie';
import { useMemo, useSyncExternalStore } from 'react';
import type { WriteGate } from './gate';

interface LiveStore<V> {
  get: () => V;
  subscribe: (listener: () => void) => () => void;
}

/** A store whose value `start` sets, run only while something is subscribed. */
function startedStore<V>(
  initial: V,
  start: (set: (next: V) => void) => (() => void) | null,
): LiveStore<V> {
  let value = initial;
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;
  const set = (next: V): void => {
    value = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) stop = start(set);
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

/** Runs the live query while the gate is open; a failure is reported only while it is open. */
function observe<T>(
  query: () => Promise<T>,
  gate: WriteGate,
  next: (value: T) => void,
  failed: () => void,
): (() => void) | null {
  if (!gate.isOpen()) return null;
  const subscription = liveQuery(query).subscribe({
    next,
    // A query on a closed database fails; the last value stays on screen until the reload.
    error: () => {
      if (gate.isOpen()) failed();
    },
  });
  const stopGate = gate.onClose(() => {
    subscription.unsubscribe();
  });
  return () => {
    subscription.unsubscribe();
    stopGate();
  };
}

/** A store over one live query. It runs the query only while something is subscribed. */
export function liveStore<T>(query: () => Promise<T>, gate: WriteGate): LiveStore<T | undefined> {
  return startedStore<T | undefined>(undefined, (set) =>
    observe(query, gate, set, () => undefined),
  );
}

/** A live read that can say it failed (item 16 design 1.11, T24). */
export type LiveQueryState<T> =
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error' };

const PENDING: LiveQueryState<never> = { status: 'pending' };
const ERROR: LiveQueryState<never> = { status: 'error' };

/**
 * Like liveStore, but a query that fails while the gate is open is reported as an error (and a
 * later success as ready again). A failure after the gate closed keeps the last value.
 */
export function liveStateStore<T>(
  query: () => Promise<T>,
  gate: WriteGate,
): LiveStore<LiveQueryState<T>> {
  return startedStore<LiveQueryState<T>>(PENDING, (set) =>
    observe(
      query,
      gate,
      (value) => {
        set({ status: 'ready', value });
      },
      () => {
        set(ERROR);
      },
    ),
  );
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

/**
 * useLiveQuery with its pending and failed states told apart (Today's read; T24): pending until
 * the first result, error when the read fails while the records are open.
 */
export function useLiveQueryState<S extends { readonly gate: WriteGate }, T>(
  source: S,
  query: (source: S) => Promise<T>,
): LiveQueryState<T> {
  const store = useMemo(() => liveStateStore(() => query(source), source.gate), [source, query]);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

const noSubscribe = (): (() => void) => () => undefined;
const noValue = (): undefined => undefined;
