// The duplicate rule, what the laptop keeps, and the acknowledgement it writes (NN-07; item 30
// design 1.10; contract section 7; cross-item ruling 16; G18–G20). A small laptop model runs the
// real functions in the order item 33 will: decide, apply, record, acknowledge.
import { type Instant, VALIDATOR_CONSTANTS } from '@diet/core';
import { V1_ROOM_ID, V5_ROOM_ID } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import {
  ackFor,
  applyDecision,
  decideTransfer,
  type HeldList,
  MAX_RECENT_TRANSFERS,
  parseRecentTransfers,
  pruneRecentTransfers,
  type RecentTransfer,
  recordAccepted,
  type TransferDecision,
  type TransferSource,
  transferRefOf,
} from './duplicates';
import { type ListPayload, monotonicSentAt, type TransferItem } from './payload';

const R1 = V1_ROOM_ID;
const R2 = V5_ROOM_ID;
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const LIST_A = id(0xa);
const LIST_B = id(0xb);
/** 2000-01-05 at 06:mm:ss. */
const at = (minute: number, second = 0): Instant =>
  `2000-01-05T06:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000Z`;

const line = (n: number, change: Partial<TransferItem> = {}): TransferItem => ({
  id: id(0x100 + n),
  text: `Example item ${n}`,
  quantity: 100 * n,
  unit: 'g',
  packSuggestion: null,
  aisle: 'Produce',
  substituteHint: null,
  ticked: false,
  ...change,
});
const LINES = [line(1), line(2), line(3)];

function send(
  listId: string,
  version: number,
  transfer: number,
  sentAt: Instant,
  items: readonly TransferItem[] = LINES,
): ListPayload {
  return {
    kind: 'diet-list',
    v: 1,
    listId,
    version,
    transferId: id(0x1000 + transfer),
    sentAt,
    list: { storeName: 'Example store', items },
  };
}

/** The laptop (item 33) as far as this rule goes: one pairing, what it holds, what it accepted. */
class Laptop {
  held: HeldList | null = null;
  recent: RecentTransfer[] = [];
  constructor(public room: string = R1) {}

  receive(p: ListPayload, now: Instant, source: TransferSource = 'relay'): TransferDecision {
    const incoming = transferRefOf(p, this.room);
    const decision = decideTransfer({
      incoming,
      held: this.held?.ref ?? null,
      recent: this.recent,
      source,
      now,
    });
    this.held = applyDecision(this.held, p, this.room, decision, now);
    if (decision.accept) this.recent = recordAccepted(this.recent, incoming, now);
    return decision;
  }

  clearList(): void {
    this.held = null;
  }

  /** Pair again: a new room, and recentTransfers deleted; a held list stays on screen. */
  pairAgain(room: string): void {
    this.room = room;
    this.recent = [];
  }

  tick(lineId: string, note: string | null = null): void {
    if (this.held === null) throw new Error('nothing held');
    this.held = { ...this.held, laptop: [...this.held.laptop, { id: lineId, ticked: true, note }] };
  }

  ack() {
    return ackFor(this.held, this.room);
  }
}

const accepted = (kind: string) => ({ accept: true, kind });
const ignored = (reason: string) => ({ accept: false, reason });
const T1 = send(LIST_A, 3, 1, at(0));
const T2 = send(LIST_A, 3, 2, at(5));

describe('G18 NN-07 TR-09b C79: the relay duplicate rule', () => {
  it('(a, b) a first send is a new list; the same send again is already received', () => {
    const laptop = new Laptop();
    expect(laptop.receive(T1, at(1))).toEqual(accepted('new-list'));
    expect(laptop.receive(T1, at(2))).toEqual(ignored('already-received'));
  });

  it('(c) stop midway and send again: a resend, then late copies are refused, also after 20 minutes', () => {
    const laptop = new Laptop();
    laptop.receive(T1, at(1));
    expect(laptop.receive(T2, at(6))).toEqual(accepted('resend'));
    expect(laptop.receive(T1, at(7))).toEqual(ignored('already-received'));
    // 21 minutes later the memory is empty; the held list's own send time still refuses it.
    expect(pruneRecentTransfers(laptop.recent, at(27))).toEqual([]);
    expect(laptop.receive(T1, at(27))).toEqual(ignored('earlier-send'));
  });

  it('(d, e) an earlier send after a later one, and an older version, are refused, also after Clear list', () => {
    const laptop = new Laptop();
    laptop.receive(T2, at(6));
    expect(laptop.receive(T1, at(7))).toEqual(ignored('earlier-send'));
    laptop.receive(send(LIST_A, 4, 3, at(8)), at(8));
    expect(laptop.receive(send(LIST_A, 3, 4, at(9)), at(9))).toEqual(ignored('older-version'));
    laptop.clearList();
    expect(laptop.receive(send(LIST_A, 3, 5, at(10)), at(10))).toEqual(ignored('older-version'));
    expect(laptop.held).toBeNull();
  });

  it('(f) after Clear list a copy stays out, and a deliberate send of the same version returns', () => {
    const laptop = new Laptop();
    laptop.receive(T2, at(6));
    laptop.clearList();
    expect(laptop.receive(T2, at(7))).toEqual(ignored('already-received'));
    expect(laptop.held).toBeNull();
    expect(laptop.receive(send(LIST_A, 3, 3, at(8)), at(8))).toEqual(accepted('returned'));
  });

  it('(g) another list sent later is a new list', () => {
    const laptop = new Laptop();
    laptop.receive(T1, at(1));
    expect(laptop.receive(send(LIST_B, 1, 9, at(2)), at(2))).toEqual(accepted('new-list'));
  });

  it('(h) every order of two sends and their copies holds one list, no line twice, and keeps a laptop tick', () => {
    const arrivals = [T1, T1, T2, T2];
    const orders = (rest: ListPayload[]): ListPayload[][] =>
      rest.length === 0
        ? [[]]
        : rest.flatMap((first, i) =>
            orders(rest.filter((_, j) => j !== i)).map((o) => [first, ...o]),
          );
    for (const order of orders(arrivals)) {
      const laptop = new Laptop();
      order.forEach((p, i) => {
        laptop.receive(p, at(10 + i));
        if (i === 0) laptop.tick(id(0x101), 'Example note');
      });
      expect(laptop.held?.payload.list.items).toEqual(LINES);
      expect(laptop.held?.laptop).toEqual([{ id: id(0x101), ticked: true, note: 'Example note' }]);
      expect(laptop.recent.length).toBeLessThanOrEqual(2);
    }
  });

  it('(i) the acknowledgement names the held version and the send that brought it, never an ignored one', () => {
    const laptop = new Laptop();
    expect(laptop.ack()).toBeNull();
    laptop.receive(send(LIST_A, 4, 7, at(1)), at(2));
    const named = {
      kind: 'diet-ack',
      v: 1,
      listId: LIST_A,
      version: 4,
      transferId: id(0x1007),
      receivedAt: at(2),
    };
    expect(laptop.ack()).toEqual(named);
    laptop.receive(send(LIST_A, 3, 8, at(3)), at(4));
    expect(laptop.ack()).toEqual(named);
    laptop.clearList();
    expect(laptop.ack()).toBeNull();
  });

  it('(j) a stale copy of another list sent before the held one is refused; a later send of it is not', () => {
    const laptop = new Laptop();
    laptop.receive(send(LIST_A, 3, 1, at(1)), at(1));
    laptop.receive(send(LIST_B, 1, 5, at(5)), at(5));
    expect(laptop.receive(send(LIST_A, 3, 2, at(3)), at(6))).toEqual(ignored('earlier-list'));
    expect(laptop.held?.ref.listId).toBe(LIST_B);
    expect(laptop.ack()?.listId).toBe(LIST_B);
    expect(laptop.receive(send(LIST_A, 3, 3, at(7)), at(7))).toEqual(accepted('new-list'));
  });

  it('(k) a restore, then pairing again: a lower version under the new room replaces the held list', () => {
    const laptop = new Laptop();
    laptop.receive(send(LIST_A, 7, 1, at(1)), at(1));
    laptop.pairAgain(R2);
    expect(laptop.receive(send(LIST_A, 4, 2, at(2)), at(2))).toEqual(accepted('new-pairing'));
    expect(laptop.held?.ref.version).toBe(4);
    expect(laptop.ack()?.version).toBe(4);
  });

  it('(l) a forged high version ends when the owner pairs again', () => {
    const laptop = new Laptop();
    laptop.receive(send(LIST_A, 1_000_000, 1, at(1)), at(1));
    expect(laptop.receive(send(LIST_A, 5, 2, at(2)), at(2))).toEqual(ignored('older-version'));
    laptop.pairAgain(R2);
    expect(laptop.receive(send(LIST_A, 5, 3, at(3)), at(3))).toEqual(accepted('new-pairing'));
    expect(ackFor(laptop.held, R1)).toBeNull();
  });

  it('(m) applyDecision: ignored keeps the same object; what each acceptance keeps of the laptop’s marks', () => {
    const laptop = new Laptop();
    laptop.receive(send(LIST_A, 1, 1, at(1)), at(1));
    laptop.tick(id(0x101), 'Note 1');
    laptop.tick(id(0x102), null);
    laptop.tick(id(0x103), 'Note 3');
    const held = laptop.held;
    const ignoredDecision: TransferDecision = { accept: false, reason: 'already-received' };
    expect(applyDecision(held, T1, R1, ignoredDecision, at(2))).toBe(held);

    const resend = applyDecision(
      held,
      send(LIST_A, 1, 2, at(2), LINES.slice(0, 2)),
      R1,
      accepted('resend') as TransferDecision,
      at(3),
    );
    expect(resend?.laptop).toEqual([
      { id: id(0x101), ticked: true, note: 'Note 1' },
      { id: id(0x102), ticked: true, note: null },
    ]);
    expect(resend?.acceptedAt).toBe(at(3));

    const changed = [line(1, { quantity: 999 }), line(2), line(3, { text: 'Example item 3b' })];
    const newer = applyDecision(
      held,
      send(LIST_A, 2, 3, at(4), changed),
      R1,
      accepted('newer-version') as TransferDecision,
      at(5),
    );
    expect(newer?.laptop).toEqual([
      { id: id(0x101), ticked: false, note: 'Note 1' },
      { id: id(0x102), ticked: true, note: null },
      { id: id(0x103), ticked: false, note: 'Note 3' },
    ]);
    for (const kind of ['returned', 'new-list', 'new-pairing'] as const) {
      expect(applyDecision(held, T2, R1, { accept: true, kind }, at(6))?.laptop).toEqual([]);
    }
  });
});

describe('G19 TR-08 P12 P39: a pasted code is the owner’s own act', () => {
  it('is refused only for the version shown, or a newer one held or recently held', () => {
    const laptop = new Laptop();
    laptop.receive(T2, at(6));
    expect(laptop.receive(T2, at(7), 'paste')).toEqual(ignored('already-received'));
    expect(laptop.receive(T1, at(7), 'paste')).toEqual(ignored('already-received'));
    laptop.clearList();
    expect(laptop.receive(T2, at(8), 'paste')).toEqual(accepted('returned'));
    expect(laptop.receive(send(LIST_A, 4, 4, at(9)), at(9), 'paste')).toEqual(
      accepted('newer-version'),
    );
    expect(laptop.receive(T2, at(10), 'paste')).toEqual(ignored('older-version'));
    laptop.clearList();
    expect(laptop.receive(T2, at(11), 'paste')).toEqual(ignored('older-version'));
    expect(laptop.receive(send(LIST_B, 1, 5, at(0)), at(12), 'paste')).toEqual(
      accepted('new-list'),
    );
  });

  it('"Replace anyway" holds the older list; a paste under a new pairing is a new pairing', () => {
    const laptop = new Laptop();
    laptop.receive(send(LIST_A, 4, 4, at(9)), at(9));
    const older = send(LIST_A, 3, 2, at(5));
    expect(laptop.receive(older, at(10), 'paste')).toEqual(ignored('older-version'));
    const replaced = applyDecision(
      laptop.held,
      older,
      R1,
      { accept: true, kind: 'new-list' },
      at(11),
    );
    expect(replaced?.ref.version).toBe(3);
    laptop.pairAgain(R2);
    expect(laptop.receive(older, at(12), 'paste')).toEqual(accepted('new-pairing'));
  });
});

const entry = (acceptedAt: Instant, n = 1): RecentTransfer => ({
  room: R1,
  listId: LIST_A,
  version: n,
  transferId: id(0x2000 + n),
  sentAt: at(0),
  acceptedAt,
});

describe('G20 R22 NN-07: bookkeeping', () => {
  it('keeps entries for 20 minutes (one dated ahead too), and at most the 50 latest, oldest first', () => {
    const now = '2000-01-05T06:20:00.000Z';
    expect(pruneRecentTransfers([entry('2000-01-05T06:00:00.001Z')], now)).toHaveLength(1);
    expect(pruneRecentTransfers([entry('2000-01-05T06:00:00.000Z')], now)).toHaveLength(0);
    expect(pruneRecentTransfers([entry('2000-01-05T07:00:00.000Z')], now)).toHaveLength(1);
    const many = Array.from({ length: 60 }, (_, i) => entry(at(19, 59 - i), i + 1));
    const kept = pruneRecentTransfers(many, now);
    expect(kept).toHaveLength(MAX_RECENT_TRANSFERS);
    expect(kept[0]?.acceptedAt).toBe(at(19, 10));
    expect(kept.at(-1)?.acceptedAt).toBe(at(19, 59));
  });

  it('recordAccepted appends and caps; parseRecentTransfers keeps only well-formed entries', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => entry(at(10, i), i + 1));
    const next = recordAccepted(fifty, transferRefOf(T2, R1), at(11));
    expect(next).toHaveLength(50);
    expect(next.at(-1)).toEqual({ ...transferRefOf(T2, R1), acceptedAt: at(11) });
    const good = entry(at(1));
    expect(
      parseRecentTransfers([
        good,
        { ...good, room: 'not a room' },
        { ...good, extra: 1 },
        { ...good, version: 0 },
        null,
        'x',
      ]),
    ).toEqual([good]);
    expect(parseRecentTransfers({ entries: [good] })).toEqual([]);
  });

  it('monotonicSentAt: now, unless the previous send is at or after it, then 1 ms later', () => {
    expect(monotonicSentAt(null, at(5))).toBe(at(5));
    expect(monotonicSentAt(at(4), at(5))).toBe(at(5));
    expect(monotonicSentAt(at(5), at(5))).toBe('2000-01-05T06:05:00.001Z');
    expect(monotonicSentAt(at(9), at(5))).toBe('2000-01-05T06:09:00.001Z');
  });

  it('the exact runtime export list of @diet/grocery/transfer (contract 3.3), none a validator constant', async () => {
    const names = Object.keys(await import('@diet/grocery/transfer')).sort();
    expect(names).toEqual(
      [
        'bytesToBase64Url',
        'base64UrlToBytes',
        'PAIRING_CODE_PREFIX',
        'PAIRING_CODE_VERSION',
        'NO_RELAY_URL',
        'PAIRING_CHECK_LETTERS',
        'createPairingMaterial',
        'formatPairingCode',
        'parsePairingCode',
        'storedRelayUrl',
        'pairingRelayStatus',
        'pairingCheckOfBits',
        'pairingCheck',
        'importPairingKey',
        'TRANSFER_FORMAT_VERSION',
        'TRANSFER_AAD_LABEL',
        'TRANSFER_IV_BYTES',
        'MAX_TRANSFER_PLAINTEXT_BYTES',
        'transferAdditionalData',
        'sealForRelay',
        'openRelayBody',
        'openFromRelay',
        'LIST_PAYLOAD_KIND',
        'ACK_PAYLOAD_KIND',
        'TRANSFER_PAYLOAD_VERSION',
        'TRANSFER_ITEM_FIELDS',
        'transferListOf',
        'listPayload',
        'ackPayload',
        'encodeTransferPayload',
        'decodeListPayload',
        'decodeAckPayload',
        'monotonicSentAt',
        'RECENT_TRANSFER_KEEP_MS',
        'MAX_RECENT_TRANSFERS',
        'transferRefOf',
        'pruneRecentTransfers',
        'decideTransfer',
        'recordAccepted',
        'applyDecision',
        'ackFor',
        'parseRecentTransfers',
      ].sort(),
    );
    expect(names.filter((name) => Object.hasOwn(VALIDATOR_CONSTANTS, name))).toEqual([]);
  });
});
