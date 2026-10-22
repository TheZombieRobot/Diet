// What a recorded send and a verified acknowledgement change (item 31 design 2.2; contract
// section 6.3; C52, L14, L15, L46; K3, K4, K5).
import { checkRow, type GroceryListRecord } from '@diet/core';
import { groceryListSentinel } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import {
  type AckRefusal,
  acknowledgementDecision,
  afterAcknowledgement,
  afterSend,
} from './acknowledge';
import { type AckPayload, ackPayload } from './payload';

const PAIRED = '2000-01-05T09:30:00.000Z';
const T_A = '00000000-0000-4000-8000-0000000000a1';
const T_B = '00000000-0000-4000-8000-0000000000b1';
const base = groceryListSentinel();
/** Version 3 sent as T_A after the pairing, nothing received. */
const sent: GroceryListRecord = {
  ...base,
  sentVersion: 3,
  sentAt: '2000-01-05T10:00:00.000Z',
  transferId: T_A,
};
const ack = (patch: Partial<AckPayload> = {}): AckPayload =>
  ackPayload({
    listId: base.id,
    version: 3,
    transferId: T_A,
    receivedAt: '2000-01-05T10:01:00.000Z',
    ...patch,
  });
const decision = (list: GroceryListRecord, a: AckPayload) => {
  const d = acknowledgementDecision(list, PAIRED, a);
  return d.accept ? 'accept' : d.reason;
};

describe('K3 C52 L15 L46: acknowledgementDecision', () => {
  it('accepts only an acknowledgement of this list naming the recorded send (first refusal wins)', () => {
    const rows: [string, GroceryListRecord, AckPayload, 'accept' | AckRefusal][] = [
      ['this send', sent, ack(), 'accept'],
      ['other list', sent, ack({ listId: T_B }), 'other-list'],
      ['never sent', base, ack(), 'not-sent'],
      [
        'sent before the pairing',
        { ...sent, sentAt: '2000-01-05T09:00:00.000Z' },
        ack(),
        'before-pairing',
      ],
      ['above the version sent', { ...sent, sentVersion: 2 }, ack(), 'above-sent'],
      ['another send of the version sent', sent, ack({ transferId: T_B }), 'other-send'],
      [
        'already recorded',
        { ...sent, receivedVersion: 3, receivedAt: sent.sentAt, laptopReceivedAt: sent.sentAt },
        ack(),
        'already-recorded',
      ],
      [
        'older than recorded',
        { ...sent, receivedVersion: 2, receivedAt: sent.sentAt, laptopReceivedAt: sent.sentAt },
        ack({ version: 1 }),
        'older-than-recorded',
      ],
      ['an older version, whatever its send', sent, ack({ version: 2, transferId: T_B }), 'accept'],
      ['sent at exactly the pairing', { ...sent, sentAt: PAIRED }, ack(), 'accept'],
    ];
    for (const [name, list, a, expected] of rows) expect(decision(list, a), name).toBe(expected);
  });

  it('a same-version re-send, and the week-3 order, count only the acknowledgement naming the recorded send', () => {
    // Send A received, then send B of the same version recorded: afterSend clears the receipt.
    const received = {
      ...sent,
      receivedVersion: 3,
      receivedAt: sent.sentAt,
      laptopReceivedAt: sent.sentAt,
    };
    const resent = {
      ...received,
      ...afterSend(
        received,
        { sentVersion: 3, sentAt: '2000-01-05T10:05:00.000Z', transferId: T_B },
        PAIRED,
      ),
    };
    expect(decision(resent, ack({ transferId: T_B }))).toBe('accept');
    expect(decision(resent, ack({ transferId: T_A }))).toBe('other-send');
    // Week 3: a paste code's send T_A was never recorded; the relay send T_B was.
    const week3 = { ...sent, transferId: T_B };
    expect(decision(week3, ack({ transferId: T_A }))).toBe('other-send');
    expect(decision(week3, ack({ transferId: T_B }))).toBe('accept');
  });
});

describe('K4 L14 L46: afterSend', () => {
  const send = { sentVersion: 3, sentAt: '2000-01-05T10:10:00.000Z', transferId: T_B };
  const withReceipt = (receivedVersion: number, receivedAt: string) => ({
    ...sent,
    receivedVersion,
    receivedAt,
    laptopReceivedAt: receivedAt,
  });

  it('records the send, clearing a same-version or pre-pairing receipt and keeping an older one', () => {
    expect(afterSend(base, send, PAIRED)).toEqual({
      ...send,
      receivedVersion: null,
      receivedAt: null,
      laptopReceivedAt: null,
    });
    expect(
      afterSend(withReceipt(3, '2000-01-05T10:01:00.000Z'), send, PAIRED)?.receivedVersion,
    ).toBeNull();
    expect(
      afterSend(withReceipt(2, '2000-01-05T10:01:00.000Z'), send, PAIRED)?.receivedVersion,
    ).toBe(2);
    expect(
      afterSend(withReceipt(2, '2000-01-05T09:00:00.000Z'), send, PAIRED)?.receivedVersion,
    ).toBeNull();
    // A stored send time ahead of the new one is still replaced: the caller made it monotonic.
    const ahead: GroceryListRecord = { ...sent, sentAt: '2000-01-06T00:00:00.000Z' };
    expect(afterSend(ahead, send, PAIRED)?.sentAt).toBe(send.sentAt);
  });

  it('never lowers what was sent and never goes above the version', () => {
    expect(afterSend({ ...sent, version: 4, sentVersion: 4 }, send, PAIRED)).toBeNull();
    expect(afterSend({ ...base, version: 2 }, send, PAIRED)).toBeNull();
  });

  it('every merged row is a valid grocery list', () => {
    for (const list of [base, sent, withReceipt(2, '2000-01-05T10:01:00.000Z')]) {
      expect(checkRow('grocery_lists', { ...list, ...afterSend(list, send, PAIRED) }).ok).toBe(
        true,
      );
    }
  });
});

describe('K5 C52: afterAcknowledgement', () => {
  it('writes the phone’s and the laptop’s times when accepted, and nothing when refused', () => {
    const now = '2000-01-05T10:02:00.000Z';
    const fields = afterAcknowledgement(sent, PAIRED, ack(), now);
    expect(fields).toEqual({
      receivedVersion: 3,
      receivedAt: now,
      laptopReceivedAt: '2000-01-05T10:01:00.000Z',
    });
    expect(checkRow('grocery_lists', { ...sent, ...fields }).ok).toBe(true);
    expect(
      afterAcknowledgement({ ...sent, sentAt: '2000-01-05T09:00:00.000Z' }, PAIRED, ack(), now),
    ).toBeNull();
    expect(afterAcknowledgement(sent, PAIRED, ack({ transferId: T_B }), now)).toBeNull();
  });
});
