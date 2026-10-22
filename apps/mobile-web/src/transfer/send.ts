/**
 * Send to laptop and Paste code (checklist item 31 design 1.4; the item-30/31 transfer contract,
 * sections 5.4 and 7; HS-14, TR-07, C12, C80, C114). A send belongs to the pairing it started with
 * and watches it, and the write gate, for as long as it runs: when the pairing changes or goes, or
 * the records close, the request in flight is aborted, nothing more is sent or recorded, and the
 * session is reset (L43). It checks again before each POST and before recording. Only the build's
 * relay origin is ever contacted; the pairing's own address is only compared (L9).
 *
 * The sealed body is item 30's: the list's to-buy lines, eight fields each, the store name, the
 * list id and version, a fresh transfer id and a send time later than every recorded send of any
 * list. A paste code reuses this page's sealed body for the same list version, so a relay copy
 * and a code are one transfer to the laptop (L4); a paste code is never recorded as a send.
 */
import { type GroceryListRecord, relayBodyFits, type TransferPairingRecord } from '@diet/core';
import {
  encodeTransferPayload,
  monotonicSentAt,
  pasteCodeFromBody,
  retryDelayMs,
  type SealedRelayBody,
  sendOutcomeOf,
  sendPlan,
  transferPairingState,
} from '@diet/grocery/transfer';
import type { AppStorage } from '../db/runtime';
import type { Store } from '../store';
import type { TransferDevices } from './devices';
import { postList, type RelayAnswer } from './relayClient';
import {
  dispatchSession,
  type SealedSend,
  type SessionEvent,
  type TransferSession,
} from './session';

export interface SendArgs {
  /** The live list and pairing at the moment of the tap; nothing re-reads the list mid-send. */
  readonly list: GroceryListRecord;
  readonly pairing: TransferPairingRecord;
  readonly origin: string | null;
  readonly online: boolean;
}

export interface SendDeps {
  readonly storage: Pick<AppStorage, 'repos' | 'env' | 'gate'>;
  readonly session: Store<TransferSession>;
  readonly devices: TransferDevices;
}

/** The pairing a send or a session belongs to. */
export const pairingIdOf = (pairing: Pick<TransferPairingRecord, 'roomId' | 'pairedAt'>): string =>
  `${pairing.roomId}|${pairing.pairedAt}`;

type Sealing =
  | { readonly ok: true; readonly sealed: SealedSend }
  | { readonly ok: false; readonly outcome: 'too-large' | 'refused' };

/** This page's sealed body for this list version, or a fresh seal (design 1.4 step 5). */
async function sealOrReuse(args: SendArgs, deps: SendDeps, reuse: boolean): Promise<Sealing> {
  const current = deps.session.get();
  if (reuse && current.sealed !== null && current.version === args.list.version) {
    return { ok: true, sealed: current.sealed };
  }
  const { repos, env } = deps.storage;
  let body: SealedRelayBody;
  let sealed: SealedSend;
  try {
    // Later than every recorded send of every list (contract section 7).
    const sentAt = monotonicSentAt(await repos.groceryTransfer.latestSentAt(), env.now());
    const transferId = env.randomId();
    const payload = deps.devices.payload(args.list, { transferId, sentAt });
    body = await deps.devices.seal(args.pairing.key, 'list', encodeTransferPayload(payload));
    sealed = { body, transferId, sentAt };
  } catch {
    // listPayload's self-check, or WebCrypto or CompressionStream missing: a fault in the app.
    return { ok: false, outcome: 'refused' };
  }
  // C114: the size is checked on the sealed body, before any request.
  if (!relayBodyFits(body, 'list')) return { ok: false, outcome: 'too-large' };
  return { ok: true, sealed };
}

const panelOf = (sealed: SealedSend) => ({
  code: pasteCodeFromBody(sealed.body),
  sentAt: sealed.sentAt,
});

/** Dispatches only while the session still belongs to this list and pairing. */
function sessionFor(deps: SendDeps, listId: string, pairingId: string) {
  return (event: SessionEvent): void => {
    const now = deps.session.get();
    if (now.listId === listId && now.pairingId === pairingId) dispatchSession(event, deps.session);
  };
}

/** A Send tap (design 1.4). Resolves when the send has finished or been abandoned. */
export async function sendList(args: SendArgs, deps: SendDeps): Promise<void> {
  const { list, pairing } = args;
  const { repos, env, gate } = deps.storage;
  const pairingId = pairingIdOf(pairing);
  const before = deps.session.get();
  if (before.phase !== 'idle' && before.listId === list.id && before.pairingId === pairingId)
    return;
  if (!gate.isOpen()) return;
  dispatchSession(
    { type: 'bind', listId: list.id, pairingId, version: list.version },
    deps.session,
  );
  const dispatch = sessionFor(deps, list.id, pairingId);
  dispatch({ type: 'tap-start' });
  const tappedAt = env.now();

  // Step 2: for as long as this send runs, a pairing change or the records closing abandon it.
  const controller = new AbortController();
  let abandoned = false;
  /** Read through a function: an await or a callback can abandon the send at any point. */
  const isAbandoned = (): boolean => abandoned;
  const abandon = (): void => {
    if (abandoned) return;
    abandoned = true;
    controller.abort();
    dispatch({ type: 'reset' });
  };
  const stopGate = gate.onClose(abandon);
  const stopPairing = deps.devices.watchPairing(deps.storage, (row) => {
    if (row === null || pairingIdOf(row) !== pairingId) abandon();
  });
  /** Step 8's check: the records are open, the pairing is the tap's and the list is still there. */
  const stillOurs = async (): Promise<boolean> => {
    if (isAbandoned()) return false;
    const [row, stored] = gate.isOpen()
      ? await Promise.all([repos.pairing.get(), repos.groceryLists.get(list.id)])
      : [undefined, undefined];
    if (
      !isAbandoned() &&
      row !== undefined &&
      stored !== undefined &&
      pairingIdOf(row) === pairingId
    ) {
      return true;
    }
    abandon();
    return false;
  };
  const result = (outcome: TransferSession['outcome'], sealed?: SealedSend): void => {
    dispatch({
      type: 'result',
      version: list.version,
      outcome,
      ...(sealed === undefined ? {} : { panel: panelOf(sealed) }),
    });
  };

  try {
    const plan = sendPlan(transferPairingState(pairing, args.origin), args.online);
    const sealing = await sealOrReuse(args, deps, plan !== 'relay');
    if (isAbandoned()) return;
    if (!sealing.ok) {
      result(sealing.outcome);
      return;
    }
    const { sealed } = sealing;
    dispatch({ type: 'sealed', version: list.version, sealed });
    // Step 6: no relay (not set up, or a pairing for another address): the paste code, no request.
    if (plan !== 'relay' && plan !== 'offline') {
      result(null, sealed);
      return;
    }
    // Step 7: offline (a 'relay' plan always has an origin).
    if (plan === 'offline' || args.origin === null) {
      result('offline', sealed);
      return;
    }
    const origin = args.origin;
    const post = async (): Promise<RelayAnswer | null> =>
      (await stillOurs())
        ? postList(origin, pairing.roomId, sealed.body, controller.signal, deps.devices.relay)
        : null;
    dispatch({ type: 'phase', phase: 'sending' });
    let answer = await post();
    if (answer === null || isAbandoned()) return;
    // Step 9: one retry, for a busy relay asking for at most 5 s (L12).
    const wait = retryDelayMs(answer.status, answer.retryAfter);
    if (wait !== null) {
      dispatch({ type: 'phase', phase: 'retrying' });
      await new Promise<void>((resolve) => {
        const timer = deps.devices.relay.setTimeout(resolve, wait);
        controller.signal.addEventListener('abort', () => {
          deps.devices.relay.clearTimeout(timer);
          resolve();
        });
      });
      answer = isAbandoned() ? null : await post();
      if (answer === null || isAbandoned()) return;
    }
    const outcome = sendOutcomeOf(answer.outcome);
    if (outcome !== null) {
      // Unavailable: the paste code of this same body, so the laptop sees one send, not two.
      result(outcome, outcome === 'unavailable' ? sealed : undefined);
      return;
    }
    // Stored: recorded only if the pairing is still the tap's (step 10).
    if (!(await stillOurs())) return;
    const listening = {
      transferId: sealed.transferId,
      sentVersion: list.version,
      sentAt: sealed.sentAt,
      tappedAt,
      storedAtMono: deps.devices.monotonic(),
    };
    try {
      const recorded = await repos.groceryTransfer.recordSend(
        list.id,
        { sentVersion: list.version, sentAt: sealed.sentAt, transferId: sealed.transferId },
        pairing.pairedAt,
      );
      dispatch({ type: 'record-ok' });
      // A higher version recorded by another tab is that tab's to listen for.
      if (recorded.recorded) dispatch({ type: 'stored', listening });
    } catch {
      // L16: still listen, and say this phone could not record it.
      dispatch({ type: 'record-failed' });
      dispatch({ type: 'stored', listening });
    }
    result(null);
  } finally {
    stopGate();
    stopPairing();
    if (!isAbandoned()) dispatch({ type: 'phase', phase: 'idle' });
  }
}

/** A Paste code tap (design 1.4): never contacts the relay and never records a send. */
export async function makePasteCode(args: SendArgs, deps: SendDeps): Promise<void> {
  const { list } = args;
  const pairingId = pairingIdOf(args.pairing);
  if (!deps.storage.gate.isOpen() || deps.session.get().phase === 'sealing') return;
  dispatchSession(
    { type: 'bind', listId: list.id, pairingId, version: list.version },
    deps.session,
  );
  const dispatch = sessionFor(deps, list.id, pairingId);
  // While a send is in flight its sealed body is reused and the send keeps its phase (L44).
  const idle = deps.session.get().phase === 'idle';
  if (idle) dispatch({ type: 'phase', phase: 'sealing' });
  const sealing = await sealOrReuse(args, deps, true);
  if (!sealing.ok) {
    dispatch({ type: 'result', version: list.version, outcome: sealing.outcome });
    return;
  }
  if (idle) dispatch({ type: 'phase', phase: 'idle' });
  dispatch({ type: 'sealed', version: list.version, sealed: sealing.sealed });
  dispatch({ type: 'panel', version: list.version, panel: panelOf(sealing.sealed) });
}
