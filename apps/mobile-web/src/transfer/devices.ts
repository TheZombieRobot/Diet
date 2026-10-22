/**
 * What sending and listening use from the browser (checklist item 31), injectable for tests as
 * pairingDevicesStore is: the relay client's fetch and timers, item 30's sealing and opening, the
 * monotonic clock, whether the phone is online and visible, and the pairing's live value.
 */
import type { TransferPairingRecord } from '@diet/core';
import { listPayload, openFromRelay, sealForRelay } from '@diet/grocery/transfer';
import { liveQuery } from 'dexie';
import type { AppStorage } from '../db/runtime';
import { createStore, type Store } from '../store';
import { browserRelayDeps, type RelayClientDeps } from './relayClient';

export interface TransferDevices {
  readonly relay: RelayClientDeps;
  readonly seal: typeof sealForRelay;
  readonly payload: typeof listPayload;
  readonly open: typeof openFromRelay;
  /** performance.now(): the poller's monotonic bound. */
  readonly monotonic: () => number;
  /** navigator.onLine at the tap. */
  readonly online: () => boolean;
  /** The page is visible and the phone online: a poll may be made. */
  readonly canRequest: () => boolean;
  /** Calls back when the page may be visible and online again. Returns an unsubscribe. */
  readonly onWake: (listener: () => void) => () => void;
  /** Calls back with the stored pairing whenever it changes (null when there is none). */
  readonly watchPairing: (
    storage: Pick<AppStorage, 'repos'>,
    listener: (pairing: TransferPairingRecord | null) => void,
  ) => () => void;
}

export const browserTransferDevices: TransferDevices = {
  relay: browserRelayDeps,
  seal: sealForRelay,
  payload: listPayload,
  open: openFromRelay,
  monotonic: () => performance.now(),
  online: () => navigator.onLine,
  canRequest: () => document.visibilityState === 'visible' && navigator.onLine,
  onWake: (listener) => {
    document.addEventListener('visibilitychange', listener);
    window.addEventListener('online', listener);
    return () => {
      document.removeEventListener('visibilitychange', listener);
      window.removeEventListener('online', listener);
    };
  },
  // Dexie's liveQuery, so a send's watch does not depend on any screen being mounted.
  watchPairing: (storage, listener) => {
    const subscription = liveQuery(() => storage.repos.pairing.get()).subscribe({
      next: (row) => {
        listener(row ?? null);
      },
      error: () => undefined,
    });
    return () => {
      subscription.unsubscribe();
    };
  },
};

export const transferDevicesStore: Store<TransferDevices> = createStore(browserTransferDevices);
