// @vitest-environment node
// The grocery list's send and acknowledgement fields (checklist item 31 design 4.2; D1 to D3;
// C52, NN-07, L14, L46, L60). Real Dexie over fake-indexeddb; synthetic lists.
import type { GroceryListRecord } from '@diet/core';
import { ackPayload } from '@diet/grocery/transfer';
import { groceryList25, groceryListSentinel } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { StorageClosedError, StorageRuleError } from '../errors';
import { openTestDb, type TestDb } from '../testKit';

/** The clock of the test database, 1 March 2000; the pairing is a day earlier. */
const PAIRED = '2000-02-29T00:00:00.000Z';
const T_A = '00000000-0000-4000-8000-0000000000a1';
const T_B = '00000000-0000-4000-8000-0000000000b1';

async function withList(list: GroceryListRecord = groceryListSentinel()): Promise<TestDb> {
  const test = await openTestDb();
  await test.db.grocery_lists.put(list);
  return test;
}
const send = (sentAt: string, transferId = T_A, sentVersion = 3) => ({
  sentVersion,
  sentAt,
  transferId,
});
const stored = (test: TestDb, id = groceryListSentinel().id) => test.repos.groceryLists.get(id);

describe('D1 C52 L14 L46: recordSend', () => {
  it('records the send without changing version or updatedAt, as the generic update would', async () => {
    const test = await withList();
    const list = groceryListSentinel();
    const result = await test.repos.groceryTransfer.recordSend(
      list.id,
      send('2000-02-29T12:00:00.000Z'),
      PAIRED,
    );
    expect(result.recorded).toBe(true);
    expect(await stored(test)).toMatchObject({
      version: 3,
      updatedAt: list.updatedAt,
      sentVersion: 3,
      sentAt: '2000-02-29T12:00:00.000Z',
      transferId: T_A,
    });
    const updated = await test.repos.groceryLists.update(list.id, { storeName: 'Example store 2' });
    expect([updated.version, updated.updatedAt]).not.toEqual([3, list.updatedAt]);
  });

  it('clears a same-version or pre-pairing receipt, never lowers what was sent, and accepts times ahead', async () => {
    // updatedAt 10 minutes ahead of the clock (it moved back since the last edit) still records.
    const ahead = '2000-03-01T00:10:00.000Z';
    const test = await withList({
      ...groceryListSentinel(),
      createdAt: ahead,
      updatedAt: ahead,
      sentVersion: 3,
      sentAt: '2000-02-28T12:00:00.000Z',
      transferId: T_A,
      receivedVersion: 3,
      receivedAt: '2000-02-28T12:01:00.000Z',
      laptopReceivedAt: '2000-02-28T12:01:00.000Z',
    });
    await test.repos.groceryTransfer.recordSend(groceryListSentinel().id, send(ahead, T_B), PAIRED);
    expect(await stored(test)).toMatchObject({
      sentAt: ahead,
      transferId: T_B,
      receivedVersion: null,
      receivedAt: null,
    });
    const lower = await test.repos.groceryTransfer.recordSend(
      groceryListSentinel().id,
      send(ahead, T_A, 2),
      PAIRED,
    );
    expect(lower.recorded).toBe(false);
    expect((await stored(test))?.transferId).toBe(T_B);
  });

  it('a missing list and closed records write nothing', async () => {
    const test = await withList();
    await expect(
      test.repos.groceryTransfer.recordSend(groceryList25().id, send(PAIRED), PAIRED),
    ).rejects.toMatchObject({ rule: 'not-found' });
    await expect(
      test.repos.groceryTransfer.recordSend(groceryList25().id, send(PAIRED), PAIRED),
    ).rejects.toBeInstanceOf(StorageRuleError);
    test.db.gate.close();
    await expect(
      test.repos.groceryTransfer.recordSend(groceryListSentinel().id, send(PAIRED), PAIRED),
    ).rejects.toBeInstanceOf(StorageClosedError);
    expect((await test.db.grocery_lists.get(groceryListSentinel().id))?.sentVersion).toBeNull();
  });
});

describe('D2 C52: recordAcknowledgement', () => {
  const ack = (patch: { version?: number; transferId?: string; listId?: string } = {}) =>
    ackPayload({
      listId: patch.listId ?? groceryListSentinel().id,
      version: patch.version ?? 3,
      transferId: patch.transferId ?? T_A,
      receivedAt: '2000-02-29T12:01:00.000Z',
    });

  it('writes only an acknowledgement naming the recorded send, with both clocks, version untouched', async () => {
    const test = await withList();
    const id = groceryListSentinel().id;
    await test.repos.groceryTransfer.recordSend(id, send('2000-02-29T12:00:00.000Z'), PAIRED);
    for (const [refused, reason] of [
      [ack({ listId: groceryList25().id }), 'other-list'],
      [ack({ version: 4 }), 'above-sent'],
      [ack({ transferId: T_B }), 'other-send'],
    ] as const) {
      const result = await test.repos.groceryTransfer.recordAcknowledgement(id, refused, PAIRED);
      expect(result.decision).toEqual({ accept: false, reason });
    }
    expect((await stored(test))?.receivedVersion).toBeNull();
    const accepted = await test.repos.groceryTransfer.recordAcknowledgement(id, ack(), PAIRED);
    expect(accepted.decision).toEqual({ accept: true });
    expect(await stored(test)).toMatchObject({
      version: 3,
      updatedAt: groceryListSentinel().updatedAt,
      receivedVersion: 3,
      receivedAt: test.env.now(),
      laptopReceivedAt: '2000-02-29T12:01:00.000Z',
    });
    const before = await test.repos.groceryTransfer.recordAcknowledgement(
      id,
      ack(),
      '2000-03-01T00:00:00.000Z',
    );
    expect(before.decision).toEqual({ accept: false, reason: 'before-pairing' });
  });
});

describe('D3 NN-07 L60: latestSentAt', () => {
  it('is the latest send time over every stored list, null when none was sent, with the records closed too', async () => {
    const test = await openTestDb();
    expect(await test.repos.groceryTransfer.latestSentAt()).toBeNull();
    await test.db.grocery_lists.put(groceryList25());
    expect(await test.repos.groceryTransfer.latestSentAt()).toBeNull();
    await test.db.grocery_lists.bulkPut([
      { ...groceryListSentinel(), ...send('2000-02-29T12:00:00.000Z') },
      {
        ...groceryList25(),
        id: T_B,
        sentVersion: 1,
        sentAt: '2000-03-02T00:00:00.000Z',
        transferId: T_A,
      },
    ]);
    test.db.gate.close();
    expect(await test.repos.groceryTransfer.latestSentAt()).toBe('2000-03-02T00:00:00.000Z');
  });
});
