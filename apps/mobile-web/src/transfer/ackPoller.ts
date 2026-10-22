/**
 * Listening for the laptop's acknowledgement (checklist item 31 design 1.8; contract section 6.3;
 * HS-14, TR-11, C52, C79, L11). Started only for a send this page stored, and only while the List
 * screen is open (SendAndExport): every 5 s for 2 minutes, then every 15 s, no request while the
 * page is hidden or offline, and none at or after 15 minutes by either the monotonic or the wall
 * clock. It stops at a verified acknowledgement of this very send (its version and transferId,
 * opened with the current pairing key), even when recording it fails; on a refused GET; on stop();
 * and when the records close. A stop aborts the request in flight, so none leaves after it.
 */
import type { Id, Instant } from '@diet/core';
import {
  ackPollDelayMs,
  ackWindowOpen,
  decodeAckPayload,
  type openFromRelay,
  type PairingKey,
  parseRetryAfterMs,
} from '@diet/grocery/transfer';
import type { AppStorage } from '../db/runtime';
import { getAck, type RelayClientDeps } from './relayClient';
import type { SessionEvent } from './session';

export interface AckPollArgs {
  readonly listId: Id;
  readonly sentVersion: number;
  readonly transferId: Id;
  readonly sentAt: Instant;
  readonly storedAtMono: number;
  readonly roomId: string;
  readonly key: PairingKey;
  readonly origin: string;
  readonly pairedAt: Instant;
}

export interface AckPollDeps {
  readonly storage: Pick<AppStorage, 'repos' | 'env' | 'gate'>;
  readonly relay: RelayClientDeps;
  readonly open: typeof openFromRelay;
  readonly monotonic: () => number;
  readonly dispatch: (event: SessionEvent) => void;
  /** The page is visible and the phone online: a request may be made. */
  readonly canRequest: () => boolean;
  /** Calls back once the page may be visible and online again. Returns an unsubscribe. */
  readonly onWake: (listener: () => void) => () => void;
}

export function startAckPolling(
  args: AckPollArgs,
  deps: AckPollDeps,
): { readonly stop: () => void } {
  const { repos, env, gate } = deps.storage;
  const controller = new AbortController();
  let stopped = false;
  let timer: unknown = null;
  let unwake: (() => void) | null = null;
  let retryAfterMs: number | null = null;
  let stopGate: () => void = () => undefined;
  /** Read through a function: an await or a callback can stop the poller at any point. */
  const isStopped = (): boolean => stopped;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    if (timer !== null) deps.relay.clearTimeout(timer);
    unwake?.();
    stopGate();
  };
  const end = (): void => {
    deps.dispatch({ type: 'listening-ended' });
    stop();
  };
  stopGate = gate.onClose(stop);

  /** Records an acknowledgement; false when the write failed. */
  const record = async (ack: Parameters<typeof repos.groceryTransfer.recordAcknowledgement>[1]) => {
    try {
      const { decision } = await repos.groceryTransfer.recordAcknowledgement(
        args.listId,
        ack,
        args.pairedAt,
      );
      if (decision.accept) deps.dispatch({ type: 'record-ok' });
      return true;
    } catch {
      return false;
    }
  };

  /** What follows an answer: another round, the end of listening, or a stop. */
  const afterAnswer = async (): Promise<'round' | 'end' | 'stop'> => {
    const answer = await getAck(args.origin, args.roomId, controller.signal, deps.relay);
    if (isStopped()) return 'stop';
    if (answer.outcome === 'refused') return 'end';
    if (answer.outcome === 'unavailable') retryAfterMs = parseRetryAfterMs(answer.retryAfter);
    if (answer.outcome !== 'delivered' || answer.body === null) return 'round';
    const bytes = await deps.open(args.key, 'ack', answer.body);
    const ack = bytes === null ? null : decodeAckPayload(bytes);
    if (isStopped()) return 'stop';
    if (ack === null || ack.listId !== args.listId || ack.version > args.sentVersion) {
      return 'round';
    }
    if (ack.version === args.sentVersion) {
      // Another send of this version (a paste code's, or one left from an earlier send): ignored.
      if (ack.transferId !== args.transferId) return 'round';
      const written = await record(ack);
      if (isStopped()) return 'stop';
      deps.dispatch({ type: 'ack-verified' });
      if (!written) deps.dispatch({ type: 'record-failed' });
      return 'stop';
    }
    // An older version: the laptop has an older copy.
    if (await record(ack)) return 'round';
    if (isStopped()) return 'stop';
    deps.dispatch({ type: 'record-failed' });
    return 'end';
  };

  const poll = async (): Promise<void> => {
    timer = null;
    if (isStopped()) return;
    if (!deps.canRequest()) {
      unwake = deps.onWake(() => {
        unwake?.();
        unwake = null;
        round();
      });
      return;
    }
    const next = await afterAnswer();
    if (next === 'round') round();
    else if (next === 'end') end();
    else stop();
  };

  const round = (): void => {
    if (isStopped()) return;
    const wait = ackPollDelayMs(deps.monotonic() - args.storedAtMono, retryAfterMs);
    if (wait === null || !ackWindowOpen(args.sentAt, env.now())) {
      end();
      return;
    }
    timer = deps.relay.setTimeout(() => {
      void poll();
    }, wait);
  };

  round();
  return { stop };
}
