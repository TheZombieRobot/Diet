/**
 * The Send and export section's view of a list (checklist item 31 design 1.2 to 1.8): the line,
 * the buttons, the paste panel, and the listening that follows a stored send while the section is
 * mounted (L11). The session is used only while it belongs to this list and the current pairing.
 */
import { type GroceryListRecord, type Id, instantMs, type TransferPairingRecord } from '@diet/core';
import { transfer } from '@diet/core/copy/health';
import {
  type TransferActions,
  transferActions,
  transferLine,
  transferLineText,
  transferPairingState,
  transferStatusNextChange,
} from '@diet/grocery/transfer';
import { useEffect, useMemo, useRef } from 'react';
import type { AppStorage } from '../db/runtime';
import { formatLocalTime } from '../format';
import { useRedrawAt } from '../screens/backup/redraw';
import { useStore } from '../store';
import { startAckPolling } from './ackPoller';
import { transferDevicesStore } from './devices';
import { BUILD_RELAY_ORIGIN } from './relayOrigin';
import { makePasteCode, pairingIdOf, sendList } from './send';
import {
  dispatchSession,
  EMPTY_SESSION,
  type TransferSession,
  transferSessionStore,
} from './session';

export interface TransferView {
  readonly actions: TransferActions;
  /** The progress text while a send runs, else null. */
  readonly progress: string | null;
  readonly line: string;
  readonly panel: TransferSession['panel'];
}

/** Send and Paste code taps for the list and pairing on screen (design 1.4). */
export function useSendList(storage: AppStorage): {
  readonly send: (list: GroceryListRecord, pairing: TransferPairingRecord) => Promise<void>;
  readonly paste: (list: GroceryListRecord, pairing: TransferPairingRecord) => Promise<void>;
} {
  const devices = useStore(transferDevicesStore);
  return useMemo(() => {
    const deps = { storage, session: transferSessionStore, devices };
    const args = (list: GroceryListRecord, pairing: TransferPairingRecord) => ({
      list,
      pairing,
      origin: BUILD_RELAY_ORIGIN,
      online: devices.online(),
    });
    return {
      send: (list, pairing) => sendList(args(list, pairing), deps),
      paste: (list, pairing) => makePasteCode(args(list, pairing), deps),
    };
  }, [storage, devices]);
}

/**
 * What the section shows for `list` and `pairing` (undefined while it loads), and the listening
 * for this page's stored send while it is mounted.
 */
export function useTransferView(
  storage: AppStorage,
  list: GroceryListRecord,
  pairing: TransferPairingRecord | null | undefined,
  recordsOpen: boolean,
): TransferView {
  const stored = useStore(transferSessionStore);
  const pairingId =
    pairing === undefined ? undefined : pairing === null ? null : pairingIdOf(pairing);
  const mine = stored.listId === list.id && stored.pairingId === pairingId;
  const session = mine ? stored : EMPTY_SESSION;
  const current = session.version === list.version;

  // The session follows the list and pairing on screen: another of either resets it, a new
  // version drops the last tap's outcome, sealed body and paste code (design 1.5).
  useEffect(() => {
    if (pairingId !== undefined) {
      dispatchSession({ type: 'bind', listId: list.id, pairingId, version: list.version });
    }
  }, [list.id, list.version, pairingId]);
  // The session outlives the screen, so the phone may have come back online while it was closed.
  const devices = useStore(transferDevicesStore);
  useEffect(() => {
    const online = () => {
      dispatchSession({ type: 'online' });
    };
    if (devices.online()) online();
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
    };
  }, [devices]);
  // The records closing resets the session (design 1.5), so a paste panel closes with them.
  useEffect(() => {
    if (!recordsOpen) dispatchSession({ type: 'reset' });
  }, [recordsOpen]);
  useListening(storage, list.id, mine && recordsOpen ? session : EMPTY_SESSION, pairing ?? null);

  const now = storage.env.now();
  const state = transferPairingState(pairing ?? null, BUILD_RELAY_ORIGIN);
  const outcome = current ? session.outcome : null;
  const input = {
    recordsOpen,
    pairing: state,
    pairedAt: pairing?.pairedAt ?? null,
    list,
    now,
    outcome,
    recordFailed: session.recordFailed,
    listening: session.listening,
    received: session.received,
  };
  useRedrawAt(transferStatusNextChange(input), instantMs(now));
  const zone = storage.env.timeZone();
  const line = transferLine(input);
  const phase = session.phase;
  return {
    actions: transferActions({ pairing: state, outcome, phase, recordsOpen }),
    progress: phase === 'idle' || !recordsOpen ? null : transfer.send.progress[phase],
    line:
      pairing === undefined && recordsOpen
        ? transfer.send.checking
        : // Until item 33 builds the side panel there is nothing to pair with (noLaptopYet).
          line.id === 'notPaired'
          ? transfer.send.noLaptopYet
          : transferLineText(line, line.time === null ? null : formatLocalTime(line.time, zone)),
    panel: current ? session.panel : null,
  };
}

/** Polls for the acknowledgement of this page's stored send while the section is mounted. */
function useListening(
  storage: AppStorage,
  listId: Id,
  session: TransferSession,
  pairing: TransferPairingRecord | null,
): void {
  const listening = session.received ? null : session.listening;
  const devices = useStore(transferDevicesStore);
  // The key and room of the current pairing, read by the polling effect, which restarts only
  // when the pairing itself changes (its roomId or pairedAt), not when the row is read again.
  const pairingRef = useRef(pairing);
  useEffect(() => {
    pairingRef.current = pairing;
  });
  const pairingId = pairing === null ? null : pairingIdOf(pairing);
  useEffect(() => {
    const paired = pairingRef.current;
    if (listening === null || paired === null || BUILD_RELAY_ORIGIN === null) return;
    const poller = startAckPolling(
      {
        listId,
        sentVersion: listening.sentVersion,
        transferId: listening.transferId,
        sentAt: listening.sentAt,
        storedAtMono: listening.storedAtMono,
        roomId: paired.roomId,
        key: paired.key,
        origin: BUILD_RELAY_ORIGIN,
        pairedAt: paired.pairedAt,
      },
      {
        storage,
        relay: devices.relay,
        open: devices.open,
        monotonic: devices.monotonic,
        dispatch: (event) => {
          dispatchSession(event);
        },
        canRequest: devices.canRequest,
        onWake: devices.onWake,
      },
    );
    return () => {
      poller.stop();
    };
  }, [storage, devices, listId, listening, pairingId]);
}
