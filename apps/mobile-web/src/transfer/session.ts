/**
 * What this page knows about sending the list on screen (checklist item 31 design 1.5; L31): one
 * in-memory session, changed only through sessionReducer. Nothing in it is stored, logged or put
 * in a URL, so a reload forgets it, and a paste code lives only here. The session belongs to one
 * list and one pairing (roomId and pairedAt): a change of either, or the records closing, resets
 * it, which also stops any send and any listening.
 */
import type { Id, Instant } from '@diet/core';
import type { SealedRelayBody, SendOutcome } from '@diet/grocery/transfer';
import { createStore, type Store } from '../store';

export type SendPhase = 'idle' | 'sealing' | 'sending' | 'retrying';

export interface SealedSend {
  readonly body: SealedRelayBody;
  readonly transferId: Id;
  readonly sentAt: Instant;
}

export interface ListeningSend {
  readonly transferId: Id;
  readonly sentVersion: number;
  readonly sentAt: Instant;
  readonly tappedAt: Instant;
  /** performance.now() when the relay stored it: the poller's monotonic bound. */
  readonly storedAtMono: number;
}

export interface TransferSession {
  readonly listId: Id | null;
  /** roomId + '|' + pairedAt of the pairing it belongs to. */
  readonly pairingId: string | null;
  /** The list version that outcome, sealed and panel belong to. */
  readonly version: number | null;
  readonly phase: SendPhase;
  readonly outcome: SendOutcome | null;
  readonly recordFailed: boolean;
  readonly sealed: SealedSend | null;
  readonly panel: { readonly code: string; readonly sentAt: Instant } | null;
  readonly listening: ListeningSend | null;
  /** A verified acknowledgement of the listening send (its version and transferId) arrived. */
  readonly received: boolean;
}

export type SessionEvent =
  /** The list and pairing on screen; another of either resets, a new version drops the tap's state. */
  | {
      readonly type: 'bind';
      readonly listId: Id;
      readonly pairingId: string | null;
      readonly version: number;
    }
  /** The pairing changed or went, the records closed, or the list went. */
  | { readonly type: 'reset' }
  | { readonly type: 'tap-start' }
  | { readonly type: 'phase'; readonly phase: SendPhase }
  | { readonly type: 'sealed'; readonly version: number; readonly sealed: SealedSend }
  /** A tap's (or a Paste code tap's) result for `version`. */
  | {
      readonly type: 'result';
      readonly version: number;
      readonly outcome: SendOutcome | null;
      readonly panel?: TransferSession['panel'];
    }
  /** A Paste code tap's code for `version`; a send in flight keeps its phase and outcome. */
  | { readonly type: 'panel'; readonly version: number; readonly panel: TransferSession['panel'] }
  | { readonly type: 'stored'; readonly listening: ListeningSend }
  | { readonly type: 'done' }
  | { readonly type: 'online' }
  | { readonly type: 'record-ok' }
  | { readonly type: 'record-failed' }
  | { readonly type: 'ack-verified' }
  | { readonly type: 'listening-ended' };

export const EMPTY_SESSION: TransferSession = {
  listId: null,
  pairingId: null,
  version: null,
  phase: 'idle',
  outcome: null,
  recordFailed: false,
  sealed: null,
  panel: null,
  listening: null,
  received: false,
};

export function sessionReducer(state: TransferSession, event: SessionEvent): TransferSession {
  switch (event.type) {
    case 'bind':
      if (state.listId !== event.listId || state.pairingId !== event.pairingId) {
        return {
          ...EMPTY_SESSION,
          listId: event.listId,
          pairingId: event.pairingId,
          version: event.version,
        };
      }
      return state.version === event.version
        ? state
        : { ...state, version: event.version, outcome: null, sealed: null, panel: null };
    case 'reset':
      return EMPTY_SESSION;
    case 'tap-start':
      return { ...state, outcome: null, panel: null, phase: 'sealing' };
    case 'phase':
      return { ...state, phase: event.phase };
    case 'sealed':
      return event.version === state.version ? { ...state, sealed: event.sealed } : state;
    case 'result':
      if (event.version !== state.version) return { ...state, phase: 'idle' };
      return {
        ...state,
        phase: 'idle',
        outcome: event.outcome,
        panel: event.panel === undefined ? state.panel : event.panel,
      };
    case 'panel':
      return event.version === state.version ? { ...state, panel: event.panel } : state;
    case 'stored':
      return { ...state, listening: event.listening, received: false };
    case 'done':
      return { ...state, panel: null };
    case 'online':
      return state.outcome === 'offline' ? { ...state, outcome: null } : state;
    case 'record-ok':
      return { ...state, recordFailed: false };
    case 'record-failed':
      return { ...state, recordFailed: true };
    case 'ack-verified':
      return { ...state, received: true };
    case 'listening-ended':
      return state.received ? state : { ...state, listening: null };
  }
}

/** This page's session (a reload forgets it). */
export const transferSessionStore: Store<TransferSession> = createStore(EMPTY_SESSION);

export function dispatchSession(
  event: SessionEvent,
  store: Store<TransferSession> = transferSessionStore,
): void {
  store.set(sessionReducer(store.get(), event));
}
