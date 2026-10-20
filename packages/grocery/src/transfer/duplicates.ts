/**
 * The duplicate rule (NN-07; item 29 R22, refined by item 30 design 1.10; the item-30/31 transfer
 * contract, section 7; cross-item ruling 16), for the laptop (item 33) to run on every received
 * payload before it touches the list it shows.
 *
 * Scoped to the pairing: a payload is compared only with what the laptop accepted under the same
 * room, so the first list after a new pairing always replaces the held one (after a restore the
 * version can go down). A relay delivery is automatic, so a known send id, a lower version, an
 * earlier send of the same version and, for 20 minutes, a stale copy of another list are ignored.
 * A paste (or C84's file import) is the owner's own act, so it is refused only for a newer version
 * held or recently held, or the same version already shown. The laptop never drops a list silently
 * (design 1.11).
 */
import {
  type Id,
  type Instant,
  instantMs,
  isId,
  isInstant,
  isInt,
  isPlainObject,
  isRelayRoomId,
} from '@diet/core';
import {
  type AckPayload,
  ACK_PAYLOAD_KIND,
  type ListPayload,
  TRANSFER_PAYLOAD_VERSION,
} from './payload';

/** One accepted transfer, with the laptop pairing's room at acceptance. */
export interface TransferRef {
  readonly room: string;
  readonly listId: Id;
  readonly version: number;
  readonly transferId: Id;
  readonly sentAt: Instant;
}

/** Plain JSON, for extension storage. */
export type RecentTransfer = TransferRef & { readonly acceptedAt: Instant };

/** 'paste' also covers C84's file import. */
export type TransferSource = 'relay' | 'paste';

export type TransferDecision =
  | {
      readonly accept: true;
      readonly kind: 'new-list' | 'newer-version' | 'resend' | 'returned' | 'new-pairing';
    }
  | {
      readonly accept: false;
      readonly reason: 'already-received' | 'older-version' | 'earlier-send' | 'earlier-list';
    };

/** What the owner did to a line on the laptop (CX-04). */
export interface LaptopLineState {
  readonly id: Id;
  readonly ticked: boolean;
  readonly note: string | null;
}

/** The list the laptop shows. */
export interface HeldList {
  readonly ref: TransferRef;
  readonly payload: ListPayload;
  readonly acceptedAt: Instant;
  readonly laptop: readonly LaptopLineState[];
}

/** 20 minutes: the relay never serves a copy older than 15, plus 5 for clocks. */
export const RECENT_TRANSFER_KEEP_MS = 1_200_000;
export const MAX_RECENT_TRANSFERS = 50;

export function transferRefOf(p: ListPayload, room: string): TransferRef {
  return { room, listId: p.listId, version: p.version, transferId: p.transferId, sentAt: p.sentAt };
}

const recentOf = (ref: TransferRef, acceptedAt: Instant): RecentTransfer => ({
  room: ref.room,
  listId: ref.listId,
  version: ref.version,
  transferId: ref.transferId,
  sentAt: ref.sentAt,
  acceptedAt,
});

const byAcceptedAt = (a: RecentTransfer, b: RecentTransfer): number =>
  a.acceptedAt < b.acceptedAt ? -1 : a.acceptedAt > b.acceptedAt ? 1 : 0;

/**
 * The entries accepted less than 20 minutes before `now` (an entry dated ahead, after the laptop's
 * clock moved back, is kept: the cautious direction), at most the 50 latest, oldest first.
 */
export function pruneRecentTransfers(
  recent: readonly RecentTransfer[],
  now: Instant,
): RecentTransfer[] {
  const nowMs = instantMs(now);
  return recent
    .filter((e) => nowMs - instantMs(e.acceptedAt) < RECENT_TRANSFER_KEEP_MS)
    .sort(byAcceptedAt)
    .slice(-MAX_RECENT_TRANSFERS);
}

export function decideTransfer(args: {
  readonly incoming: TransferRef;
  readonly held: TransferRef | null;
  readonly recent: readonly RecentTransfer[];
  readonly source: TransferSource;
  readonly now: Instant;
}): TransferDecision {
  const { incoming: p, held, source } = args;
  const live = pruneRecentTransfers(args.recent, args.now).filter((e) => e.room === p.room);
  const hs = held !== null && held.room === p.room ? held : null;
  const seen: readonly TransferRef[] = hs === null ? live : [...live, hs];
  const relay = source === 'relay';

  if (relay && seen.some((e) => e.transferId === p.transferId)) {
    return { accept: false, reason: 'already-received' };
  }
  if (seen.some((e) => e.listId === p.listId && e.version > p.version)) {
    return { accept: false, reason: 'older-version' };
  }
  if (!relay && hs?.listId === p.listId && hs.version === p.version) {
    return { accept: false, reason: 'already-received' };
  }
  if (
    relay &&
    seen.some((e) => e.listId === p.listId && e.version === p.version && e.sentAt >= p.sentAt)
  ) {
    return { accept: false, reason: 'earlier-send' };
  }
  // Another list is compared only with the last 20 minutes (the held list among them for that
  // long after it was accepted): no stale relay copy is older. Against the held list for good, a
  // phone clock that was ahead when it was sent would refuse every later list once the phone had
  // deleted it, since its send time no longer raises the next one (contract section 7).
  if (relay && live.some((e) => e.listId !== p.listId && e.sentAt >= p.sentAt)) {
    return { accept: false, reason: 'earlier-list' };
  }

  if (held !== null && held.room !== p.room) return { accept: true, kind: 'new-pairing' };
  if (hs !== null && hs.listId === p.listId) {
    return { accept: true, kind: hs.version < p.version ? 'newer-version' : 'resend' };
  }
  if (hs === null && live.some((e) => e.listId === p.listId)) {
    return { accept: true, kind: 'returned' };
  }
  return { accept: true, kind: 'new-list' };
}

/** Prunes, then adds the accepted transfer, keeping at most the 50 latest. */
export function recordAccepted(
  recent: readonly RecentTransfer[],
  incoming: TransferRef,
  now: Instant,
): RecentTransfer[] {
  return [...pruneRecentTransfers(recent, now), recentOf(incoming, now)].slice(
    -MAX_RECENT_TRANSFERS,
  );
}

const sameLine = (
  a: ListPayload['list']['items'][number],
  b: ListPayload['list']['items'][number],
): boolean =>
  a.text === b.text &&
  a.quantity === b.quantity &&
  a.unit === b.unit &&
  a.packSuggestion === b.packSuggestion;

/** The laptop's ticks and notes carried over to `incoming` (item 30 P38). */
function carriedLaptopState(
  held: HeldList | null,
  incoming: ListPayload,
  kind: 'resend' | 'newer-version',
): LaptopLineState[] {
  if (held === null) return [];
  const before = new Map(held.payload.list.items.map((line) => [line.id, line]));
  const after = new Map(incoming.list.items.map((line) => [line.id, line]));
  return held.laptop.flatMap((state) => {
    const now = after.get(state.id);
    if (now === undefined) return [];
    if (kind === 'resend') return [{ id: state.id, ticked: state.ticked, note: state.note }];
    const was = before.get(state.id);
    const ticked = state.ticked && was !== undefined && sameLine(was, now);
    return [{ id: state.id, ticked, note: state.note }];
  });
}

/**
 * What the laptop holds after a decision: an ignored payload leaves `held` itself; a resend keeps
 * the laptop's ticks and notes; a newer version keeps notes, and ticks only on lines whose text,
 * quantity, unit and pack suggestion are unchanged; a returned, new or new-pairing list starts
 * clean. Lines are never merged across payloads.
 */
export function applyDecision(
  held: HeldList | null,
  incoming: ListPayload,
  room: string,
  decision: TransferDecision,
  now: Instant,
): HeldList | null {
  if (!decision.accept) return held;
  const laptop =
    decision.kind === 'resend' || decision.kind === 'newer-version'
      ? carriedLaptopState(held, incoming, decision.kind)
      : [];
  return { ref: transferRefOf(incoming, room), payload: incoming, acceptedAt: now, laptop };
}

/**
 * The acknowledgement the laptop writes after every decision: the list it holds under the current
 * room, the send that brought it and when it was accepted; null when it holds nothing or holds a
 * list from an earlier pairing. So the ack slot never goes back to an ignored older copy, and
 * writing it again after an ignored copy changes nothing on the phone.
 */
export function ackFor(held: HeldList | null, room: string): AckPayload | null {
  if (held === null || held.ref.room !== room) return null;
  return {
    kind: ACK_PAYLOAD_KIND,
    v: TRANSFER_PAYLOAD_VERSION,
    listId: held.ref.listId,
    version: held.ref.version,
    transferId: held.ref.transferId,
    receivedAt: held.acceptedAt,
  };
}

const RECENT_KEYS = ['room', 'listId', 'version', 'transferId', 'sentAt', 'acceptedAt'] as const;

function isRecentTransfer(value: unknown): value is RecentTransfer {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === RECENT_KEYS.length &&
    RECENT_KEYS.every((key) => Object.hasOwn(value, key)) &&
    isRelayRoomId(value['room']) &&
    isId(value['listId']) &&
    isInt(value['version'], 1, 1_000_000) &&
    isId(value['transferId']) &&
    isInstant(value['sentAt']) &&
    isInstant(value['acceptedAt'])
  );
}

/** For extension storage: every well-formed entry, as a new object; [] for anything not an array. */
export function parseRecentTransfers(value: unknown): RecentTransfer[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter(isRecentTransfer).map((e) => recentOf(e, e.acceptedAt));
}
