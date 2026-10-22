// Item 24 design 5.3: the grocery list's repository and the profile repository's hint clearing
// (Node, real Dexie over fake-indexeddb). Synthetic records only.
import { createRescueFile, type GroceryItem } from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import { listPayload } from '@diet/grocery/transfer';
import { snapshotV1 } from '@diet/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageClockError } from '../errors';
import { decodeImport, planImport } from '../importBackup';
import { failingWrite, onboardForTests, openTestDb, type TestDb, testEnv } from '../testKit';

const opened: TestDb[] = [];
afterEach(() => {
  for (const test of opened.splice(0)) test.db.shutDown();
});

async function phone(options: Parameters<typeof openTestDb>[0] = {}): Promise<TestDb> {
  const test = await openTestDb(options);
  opened.push(test);
  await onboardForTests(test);
  return test;
}

const line = (n: number, over: Partial<GroceryItem> = {}): GroceryItem => ({
  id: `0b6f1d2e-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`,
  origin: 'generated',
  ingredientId: 'seed:chicken-thigh',
  text: `Example item ${n}`,
  quantity: 400,
  unit: 'g',
  packSuggestion: '500 g pack',
  aisle: 'Meat and fish',
  substituteHint: null,
  section: 'to-buy',
  fromGardenG: null,
  gardenAmountUnknown: false,
  fromPantryG: null,
  auditNote: null,
  price: null,
  ticked: false,
  ...over,
});
const tick = (id: string) => (list: { items: GroceryItem[] }) => ({
  items: list.items.map((i) => (i.id === id ? { ...i, ticked: true } : i)),
  audits: [],
});

describe('repos.groceryBuild (LD1, LD4; J5, J24, J34)', () => {
  it('LD1: a list and its audit rows are written together; a failing audit row leaves neither', async () => {
    const test = await phone();
    const { groceryBuild } = test.repos;
    const created = await groceryBuild.create(
      { storeName: 'Example store', items: [line(1)] },
      [
        {
          table: 'garden',
          recordId: 'g1',
          reason: '300 g silverbeet from garden, as listed on 9 January',
        },
      ],
      null,
    );
    expect(created).toMatchObject({
      version: 1,
      sentVersion: null,
      sentAt: null,
      transferId: null,
    });
    expect(created).toMatchObject({
      receivedVersion: null,
      receivedAt: null,
      laptopReceivedAt: null,
    });
    expect((await test.repos.audit.list()).map((a) => [a.kind, a.at])).toEqual([
      ['grocery', created.updatedAt],
    ]);
    await expect(
      groceryBuild.updateList(created.id, (l) => ({
        ...tick(line(1).id)(l),
        audits: [{ table: 'garden', recordId: 'g1', reason: '' }],
      })),
    ).rejects.toThrow();
    expect((await groceryBuild.current())?.version).toBe(1);
    test.env.advanceDays(1);
    const ticked = await groceryBuild.updateList(created.id, tick(line(1).id));
    expect(ticked).toMatchObject({ version: 2, updatedAt: test.env.now() });
    await expect(groceryBuild.updateList(created.id, () => null)).rejects.toMatchObject({
      rule: 'list-changed',
    });
    await expect(
      groceryBuild.updateList('0b6f1d2e-0000-4000-8000-000000000000', tick('x')),
    ).rejects.toMatchObject({ rule: 'not-found' });
    await expect(
      groceryBuild.updateList(created.id, tick(line(1).id), { build: { expectedVersion: 1 } }),
    ).rejects.toMatchObject({ rule: 'list-changed' });
  });

  it('LD1 J5, J34: with the clock behind the list, a new list and a build are refused; a tick, the store name and a hint clearing still save without moving its last change back', async () => {
    const test = await phone();
    const { groceryBuild } = test.repos;
    test.env.advanceDays(1);
    const list = await groceryBuild.create(
      { storeName: 'Example store', items: [line(1, { substituteHint: 'Firm tofu' })] },
      [],
      null,
    );
    // Behind the list, though not behind the profile's own creation.
    test.env.set('2000-03-01T12:00:00.000Z');
    await expect(
      groceryBuild.create({ storeName: 'Example store', items: [] }, [], list),
    ).rejects.toBeInstanceOf(StorageClockError);
    await expect(
      groceryBuild.updateList(list.id, tick(line(1).id), { build: { expectedVersion: 1 } }),
    ).rejects.toBeInstanceOf(StorageClockError);
    expect((await test.repos.groceryLists.list()).map((l) => l.version)).toEqual([1]);
    expect(await groceryBuild.updateList(list.id, tick(line(1).id))).toMatchObject({
      version: 2,
      updatedAt: list.updatedAt,
    });
    await groceryBuild.setStoreName('Example market');
    await test.repos.profile.update({ allergens: ['soy'] });
    expect(await groceryBuild.current()).toMatchObject({ version: 4, updatedAt: list.updatedAt });
    expect(await groceryBuild.hintsClearedAt(list.id)).toBe(list.updatedAt);
  });

  it('LD1: the current list is the newest; the store name changes the profile and that list together', async () => {
    const test = await phone();
    const { groceryBuild } = test.repos;
    const older = await groceryBuild.create({ storeName: 'Example store', items: [] }, [], null);
    test.env.advanceDays(1);
    const newer = await groceryBuild.create({ storeName: 'Example store', items: [] }, [], older);
    expect((await groceryBuild.current())?.id).toBe(newer.id);
    await groceryBuild.setStoreName('Example market');
    expect((await test.repos.profile.get()).storeName).toBe('Example market');
    expect(await groceryBuild.current()).toMatchObject({
      id: newer.id,
      storeName: 'Example market',
      version: 2,
    });
  });

  it('LD4 GL-05: two quick ticks sent together both land', async () => {
    const test = await phone();
    const { groceryBuild } = test.repos;
    const list = await groceryBuild.create(
      { storeName: 'Example store', items: [line(1), line(2)] },
      [],
      null,
    );
    await Promise.all([
      groceryBuild.updateList(list.id, tick(line(1).id)),
      groceryBuild.updateList(list.id, tick(line(2).id)),
    ]);
    expect((await groceryBuild.current())?.items.map((i) => i.ticked)).toEqual([true, true]);
  });
});

describe('hints never outlive their profile (LD8; J28, HS-24, C107)', () => {
  const hinted = [
    line(1, { substituteHint: 'Firm tofu' }),
    line(2, { origin: 'manual', substituteHint: 'Kale' }),
  ];

  it('a profile write that changes allergens, the gluten-free toggle or a dislike clears every hint, with one audit row', async () => {
    const test = await phone();
    const { groceryBuild, profile } = test.repos;
    for (const patch of [
      { allergens: ['soy' as const] },
      { glutenFreeHousehold: true },
      { dislikeTerms: ['zz'] },
    ]) {
      const before = await groceryBuild.create(
        { storeName: 'Example store', items: hinted },
        [],
        await groceryBuild.current(),
      );
      test.env.advanceDays(1);
      await profile.update(patch);
      const after = await groceryBuild.current();
      expect(after?.items.map((i) => i.substituteHint)).toEqual([null, null]);
      expect(after?.version).toBe(before.version + 1);
      expect(await groceryBuild.hintsClearedAt(before.id)).toBe(after?.updatedAt);
      const payload = JSON.stringify(
        listPayload(after ?? before, { transferId: before.id, sentAt: test.env.now() }),
      );
      expect(payload).not.toMatch(/tofu|kale/i);
    }
    // A second clearing of one list: the notice follows the newer one.
    const last = await groceryBuild.current();
    if (last === null) throw new Error('no list');
    await groceryBuild.updateList(last.id, (l) => ({
      items: l.items.map((i) => ({ ...i, substituteHint: 'Kale' })),
      audits: [],
    }));
    test.env.advanceDays(1);
    await profile.update({ dislikeTerms: [] });
    expect(await groceryBuild.hintsClearedAt(last.id)).toBe(test.env.now());
    const list = await groceryBuild.create(
      { storeName: 'Example store', items: hinted },
      [],
      await groceryBuild.current(),
    );
    await profile.update({ storeName: 'Example market' });
    expect((await groceryBuild.current())?.items[0]?.substituteHint).toBe('Firm tofu');
    expect(await groceryBuild.hintsClearedAt(list.id)).toBeNull();
    expect(
      (await test.repos.audit.list()).filter((a) => a.reason === grocery.audit.hintsCleared),
    ).toHaveLength(4);
  });

  it('a failing list write leaves the profile unchanged', async () => {
    const failing = failingWrite('grocery_lists', 'put', () => new Error('disk'));
    const test = await phone({ extraMiddleware: [failing.middleware] });
    await test.repos.groceryBuild.create({ storeName: 'Example store', items: hinted }, [], null);
    failing.arm();
    await expect(test.repos.profile.update({ allergens: ['soy'] })).rejects.toThrow();
    expect((await test.repos.profile.get()).allergens).toEqual([]);
  });

  it("a rescue copy merged with the phone's allergens loses its hints (version + 1)", async () => {
    const [list] = snapshotV1.grocery_lists;
    if (list === undefined) throw new Error('no list');
    const tables = {
      ...structuredClone(snapshotV1),
      grocery_lists: [{ ...list, items: [line(1, { substituteHint: 'Firm tofu' })] }],
    };
    const file = await createRescueFile({
      tables,
      exportedAt: '2000-03-01T00:00:00.000Z',
      appVersion: '0.1.0',
      password: null,
      schemaVersion: 1,
    });
    const test = await phone({ env: testEnv('2000-03-02T00:00:00.000Z') });
    await test.repos.profile.update({ allergens: ['soy'] });
    const decoded = await decodeImport(
      { text: file.text, sizeBytes: file.text.length },
      null,
      test.env,
    );
    const planned = await planImport(test.db, decoded);
    expect(planned.snapshot.grocery_lists[0]).toMatchObject({ version: list.version + 1 });
    expect(planned.snapshot.grocery_lists[0]?.items[0]?.substituteHint).toBeNull();
  });
});
