/**
 * What the Send and export section shows (item 31 design 1.3, 1.7 and 2.4; UX_SCREENS 6b; C12,
 * C52, C114; item 29 R32 and R33). Pure: the screen passes in the pairing, the list, the clock and
 * what happened in this page.
 *
 * The status depends on the current pairing: a send recorded before it reads "not sent since you
 * last paired", and a receipt recorded before it never counts (C52: only an acknowledgement under
 * the current key). A send time more than the tolerance ahead (a clock corrected backwards) reads
 * as not confirmed, never as a day-long "waiting", unless this page is listening for that send.
 */
import {
  FUTURE_INSTANT_TOLERANCE_MS,
  fillTemplate,
  type GroceryListRecord,
  type GroceryListStatus,
  groceryListStatus,
  type Id,
  type Instant,
  instantMs,
  RELAY_TTL_MS,
  type RelayOutcome,
} from '@diet/core';
import { transfer } from '@diet/core/copy/health';
import { type PairingRelayStatus, pairingRelayStatus } from './pairingCode';

export type TransferPairingState = 'none' | PairingRelayStatus;
export type SendPlan = 'pair-first' | 'paste-code' | 'offline' | 'relay';
export type SendOutcome = 'offline' | 'too-large' | 'refused' | 'unavailable';
export type TransferStatus = GroceryListStatus | 'before-pairing';

export const TRANSFER_LINE_IDS = Object.freeze([
  'recordsClosed',
  'notPaired',
  'offline',
  'tooLarge',
  'refused',
  'unavailable',
  'recordFailed',
  'notConfigured',
  'relayNeedsPairing',
  'statusNotSent',
  'statusBeforePairing',
  'statusWaiting',
  'statusReceived',
  'statusExpired',
  'statusEditedSinceSent',
] as const);
export type TransferLineId = (typeof TRANSFER_LINE_IDS)[number];
export const TRANSFER_EXTRA_IDS = Object.freeze([
  'openPanel',
  'keepOpen',
  'olderCopy',
  'notRecorded',
] as const);
export type TransferExtraId = (typeof TRANSFER_EXTRA_IDS)[number];

export interface TransferLineInput {
  readonly recordsOpen: boolean;
  readonly pairing: TransferPairingState;
  /** Null exactly when pairing is 'none'. */
  readonly pairedAt: Instant | null;
  readonly list: Pick<
    GroceryListRecord,
    'version' | 'sentVersion' | 'sentAt' | 'transferId' | 'receivedVersion' | 'receivedAt'
  >;
  readonly now: Instant;
  /** The current list version's only (the session ensures it). */
  readonly outcome: SendOutcome | null;
  readonly recordFailed: boolean;
  readonly listening: {
    readonly transferId: Id;
    readonly sentVersion: number;
    readonly tappedAt: Instant;
  } | null;
  /** A verified acknowledgement of the listening send (its version and transferId) in this page. */
  readonly received: boolean;
}

export interface TransferLine {
  readonly id: TransferLineId;
  /** Fills {time}: statusWaiting only. */
  readonly time: Instant | null;
  /** In the order shown. */
  readonly extras: readonly TransferExtraId[];
}

export interface TransferActions {
  readonly primary: 'send' | 'pair';
  readonly sendEnabled: boolean;
  readonly pasteCode: 'hidden' | 'enabled' | 'disabled';
}

type StatusInput = Pick<TransferLineInput, 'list' | 'pairedAt' | 'now' | 'listening' | 'received'>;

/** This page is listening for the send the list records (its transferId and version). */
const listeningForStored = ({ listening, received, list }: StatusInput): boolean =>
  listening !== null &&
  !received &&
  listening.transferId === list.transferId &&
  listening.sentVersion === list.sentVersion;

/** The stored send time is more than the tolerance ahead of now. */
const sentInFuture = ({ list, now }: StatusInput): boolean =>
  list.sentAt !== null && instantMs(list.sentAt) - instantMs(now) > FUTURE_INSTANT_TOLERANCE_MS;

/** A version received since the current pairing. */
const receivedSincePairing = ({ list, pairedAt }: StatusInput): boolean =>
  list.receivedVersion !== null &&
  list.receivedAt !== null &&
  pairedAt !== null &&
  instantMs(list.receivedAt) >= instantMs(pairedAt);

/** 'none' without a pairing, otherwise item 30's reading of the stored relay address (exact). */
export function transferPairingState(
  pairing: { readonly relayUrl: string } | null,
  relayOrigin: string | null,
): TransferPairingState {
  return pairing === null ? 'none' : pairingRelayStatus(pairing.relayUrl, relayOrigin);
}

/** What a Send tap does (design 1.3): only a ready pairing, online, contacts the relay. */
export function sendPlan(state: TransferPairingState, online: boolean): SendPlan {
  if (state === 'none') return 'pair-first';
  if (state !== 'ready') return 'paste-code';
  return online ? 'relay' : 'offline';
}

/** A POST's outcome on the screen (C80, R32). */
export function sendOutcomeOf(outcome: RelayOutcome): SendOutcome | null {
  if (outcome === 'stored') return null;
  if (outcome === 'too-large' || outcome === 'refused') return outcome;
  return 'unavailable';
}

export function transferStatusOf(input: StatusInput): TransferStatus {
  const { list, pairedAt, now } = input;
  if (list.sentVersion === null || list.sentAt === null) return 'draft';
  if (pairedAt !== null && instantMs(list.sentAt) < instantMs(pairedAt)) return 'before-pairing';
  const status = groceryListStatus(list, now);
  if ((status === 'waiting' || status === 'expired') && sentInFuture(input)) {
    return listeningForStored(input) ? 'waiting' : 'expired';
  }
  return status;
}

const STATUS_LINES: Readonly<Record<TransferStatus, TransferLineId>> = {
  draft: 'statusNotSent',
  'before-pairing': 'statusBeforePairing',
  waiting: 'statusWaiting',
  received: 'statusReceived',
  expired: 'statusExpired',
  'edited-since-sent': 'statusEditedSinceSent',
};

const OUTCOME_LINES: Readonly<Record<SendOutcome, TransferLineId>> = {
  offline: 'offline',
  'too-large': 'tooLarge',
  refused: 'refused',
  unavailable: 'unavailable',
};

/** The line, first match wins (design 1.7, rows 1–16; row 0, progress, is the app's). */
export function transferLine(input: TransferLineInput): TransferLine {
  const plain = (id: TransferLineId): TransferLine => ({ id, time: null, extras: [] });
  if (!input.recordsOpen) return plain('recordsClosed');
  if (input.pairing === 'none') return plain('notPaired');
  if (input.outcome !== null) return plain(OUTCOME_LINES[input.outcome]);
  if (input.received && input.listening?.sentVersion === input.list.version) {
    return { id: 'statusReceived', time: null, extras: input.recordFailed ? ['notRecorded'] : [] };
  }
  if (input.recordFailed) return plain('recordFailed');
  if (input.pairing === 'not-configured') return plain('notConfigured');
  if (input.pairing === 'pair-again') return plain('relayNeedsPairing');
  const status = transferStatusOf(input);
  const received = receivedSincePairing(input);
  const { receivedVersion, sentVersion } = input.list;
  const olderCopy: TransferExtraId[] =
    received && receivedVersion !== null && sentVersion !== null && receivedVersion < sentVersion
      ? ['olderCopy']
      : [];
  switch (status) {
    case 'waiting': {
      const listening = listeningForStored(input);
      const time =
        listening && sentInFuture(input) && input.listening !== null
          ? input.listening.tappedAt
          : input.list.sentAt;
      return {
        id: 'statusWaiting',
        time,
        extras: ['openPanel', ...(listening ? (['keepOpen'] as const) : []), ...olderCopy],
      };
    }
    case 'expired':
      return { id: 'statusExpired', time: null, extras: olderCopy };
    case 'edited-since-sent':
      return { id: 'statusEditedSinceSent', time: null, extras: received ? ['olderCopy'] : [] };
    default:
      return plain(STATUS_LINES[status]);
  }
}

/**
 * The line with its {time} filled and its extra sentences after it. A full stop is added before
 * extras when the line has none; with no extras the line is returned as written, so "Received on
 * laptop" stays as UX 6b quotes it.
 */
export function transferLineText(line: TransferLine, timeText: string | null): string {
  if (line.id === 'statusWaiting' && timeText === null) throw new RangeError('transfer line time');
  const text = fillTemplate(
    transfer.send.lines[line.id],
    line.id === 'statusWaiting' && timeText !== null ? { time: timeText } : {},
  );
  if (line.extras.length === 0) return text;
  const extras = line.extras.map((extra) => transfer.send.extras[extra]);
  return [text.endsWith('.') ? text : `${text}.`, ...extras].join(' ');
}

export function transferActions(a: {
  readonly pairing: TransferPairingState;
  readonly outcome: SendOutcome | null;
  readonly phase: 'idle' | 'sealing' | 'sending' | 'retrying';
  readonly recordsOpen: boolean;
}): TransferActions {
  const hidden = a.pairing === 'none' || a.outcome === 'too-large' || a.outcome === 'refused';
  return {
    primary: a.pairing === 'none' ? 'pair' : 'send',
    sendEnabled: a.recordsOpen && a.phase === 'idle',
    pasteCode: hidden ? 'hidden' : !a.recordsOpen || a.phase === 'sealing' ? 'disabled' : 'enabled',
  };
}

/**
 * When a waiting status turns into not confirmed (for useRedrawAt), or null: never for a send
 * time in the future (the end of listening redraws that).
 */
export function transferStatusNextChange(input: StatusInput): number | null {
  if (transferStatusOf(input) !== 'waiting' || sentInFuture(input) || input.list.sentAt === null) {
    return null;
  }
  return instantMs(input.list.sentAt) + RELAY_TTL_MS;
}
