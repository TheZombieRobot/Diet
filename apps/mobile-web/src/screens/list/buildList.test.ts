// Item 24 design 5.3: making the list through the real database (Node, real Dexie over
// fake-indexeddb), from item 20's shipped recipes and item 18's shipped catalogue. Synthetic
// records only; the health-sentinel phone holds marker text and numbers in every other store.
import { foodData, type GroceryListRecord, localDateOf } from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import {
  listCsv,
  listJson,
  listPayload,
  listText,
  lineOffers,
  priceFromInput,
} from '@diet/grocery';
import type { DBCore, Middleware } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppStorage } from '../../db/runtime';
import {
  onboardForTests,
  openSnapshotDb,
  openTestDb,
  PHOTO_BYTES,
  photoRow,
  seedPlanDay,
  type TestDb,
} from '../../db/testKit';
import {
  healthSentinelSkips,
  healthSentinelSnapshot,
  SENTINEL_NOW,
  SENTINEL_NUMBERS,
} from '../../db/testSentinels';
import { foodsState, readFoodInputs } from '../../foods/useFoods';
import { readStockNow } from '../../garden/stock';
import { type BuildRequest, runBuild } from './buildList';
import { addListLine, priceLine, removeListLine, takeOffer, tickLine } from './lineActions';

const opened: TestDb[] = [];
afterEach(() => {
  for (const test of opened.splice(0)) test.db.shutDown();
});

/** The foods as the screen reads them (item 18's useFoods), over this database. */
async function foodsOf(storage: AppStorage) {
  const data = foodData();
  const state = foodsState(data.status === 'ok' ? data : null, await readFoodInputs(storage));
  if (state.status !== 'ready') throw new Error('foods not ready');
  return { resolve: state.resolve, seedById: state.data.seedById, approved: [], data: state.data };
}

async function build(
  storage: AppStorage,
  request: Partial<BuildRequest> = {},
): Promise<GroceryListRecord> {
  const today = localDateOf(storage.env.now(), storage.env.timeZone());
  const current = await storage.repos.groceryBuild.current();
  const outcome = await runBuild(storage, await foodsOf(storage), {
    mode: 'new',
    firstDay: today,
    current,
    ...request,
  });
  if (!outcome.ok) throw new Error(outcome.message.text);
  const list = await storage.repos.groceryBuild.current();
  if (list === null) throw new Error('no list');
  return list;
}

const byText = (list: GroceryListRecord, text: string) => {
  const found = list.items.find((i) => i.text === text);
  if (found === undefined) throw new Error(text);
  return found;
};

/** Records which stores are written to. */
function writeSpy(): { readonly middleware: Middleware<DBCore>; readonly written: Set<string> } {
  const written = new Set<string>();
  return {
    written,
    middleware: {
      stack: 'dbcore',
      name: 'test-write-spy',
      create: (down) => ({
        ...down,
        table: (name) => {
          const table = down.table(name);
          return {
            ...table,
            mutate: (req) => {
              written.add(name);
              return table.mutate(req);
            },
          };
        },
      }),
    },
  };
}

describe('the list in the database (LD3, LD6, LD7; GL-01, GL-05, NN-06, NN-05)', () => {
  it('LD3 NN-06 GL-05: 300 g of garden silverbeet, 500 g planned: 200 g to buy and its audit row; changes survive a reopen', async () => {
    const test = await openTestDb();
    opened.push(test);
    await onboardForTests(test);
    const { repos, storage, env } = test;
    // The seeded silverbeet row, updated in place (never a second silverbeet row).
    const [seeded] = await repos.garden.list();
    if (seeded === undefined) throw new Error('no seeded garden row');
    await repos.garden.update(seeded.id, { amount: 300, unit: 'g' });
    const today = localDateOf(env.now(), env.timeZone());
    await seedPlanDay(test, {
      date: today,
      dietMode: 'balanced',
      meals: [
        {
          slot: 'dinner',
          recipeId: 'seed:recipe-chicken-silverbeet-traybake',
          myServes: 1,
          householdServes: 5,
        },
      ],
      eatingWindow: null,
    });
    const list = await build(storage);
    expect(byText(list, 'Silverbeet')).toMatchObject({
      section: 'to-buy',
      quantity: 200,
      packSuggestion: '1 bunch',
      fromGardenG: 300,
    });
    expect(byText(list, 'Silverbeet').auditNote).toMatch(/^300 g from garden, as listed on /);
    const audits = await repos.audit.list();
    expect(audits.map((a) => [a.table, a.recordId, a.kind])).toEqual([
      ['garden', seeded.id, 'grocery'],
    ]);
    expect(audits[0]?.reason).toMatch(/^300 g silverbeet from garden/);

    const silverbeet = byText(list, 'Silverbeet').id;
    const lemon = byText(list, 'Lemon').id;
    expect(await tickLine(storage, list.id, silverbeet, true)).toBeNull();
    expect(await removeListLine(storage, list.id, lemon)).toBeNull();
    const added = '0b6f1d2e-0000-4000-8000-000000000444';
    const manual = {
      text: 'Example batteries',
      ingredientId: null,
      quantity: null,
      unit: null,
      aisle: 'Other',
      substituteHint: null,
    };
    expect(await addListLine(storage, list.id, manual, added)).toBeNull();
    const price = priceFromInput(650, 'line', env.now());
    expect(await priceLine(storage, list.id, added, price)).toBeNull();

    test.db.close();
    const again = await openTestDb({ deps: test.deps, env });
    opened.push(again);
    const stored = await again.repos.groceryBuild.current();
    expect(stored?.items.find((i) => i.id === silverbeet)?.ticked).toBe(true);
    expect(stored?.items.some((i) => i.id === lemon)).toBe(false);
    expect(stored?.items.find((i) => i.id === added)).toMatchObject({
      text: 'Example batteries',
      price,
    });

    // LD6 (item 19 G8): no garden photo reaches either file.
    await again.db.garden_photos.put(photoRow(seeded.id));
    if (stored === null) throw new Error('no list');
    const files = `${listCsv(stored)}${listJson(stored)}`;
    expect(files).not.toContain('"bytes"');
    expect(files).not.toContain(Buffer.from(PHOTO_BYTES).toString('base64').slice(0, 24));
    expect(files).not.toContain(String.fromCharCode(...PHOTO_BYTES.slice(0, 16)));

    // LD7: item 30's payload holds exactly the to-buy lines, in stored order, eight fields each.
    const payload = listPayload(stored, { transferId: added, sentAt: env.now() });
    const toBuy = stored.items.filter((i) => i.section === 'to-buy');
    expect(payload.list.items.map((i) => i.id)).toEqual(toBuy.map((i) => i.id));
    for (const item of payload.list.items) {
      expect(Object.keys(item).sort()).toEqual([
        'aisle',
        'id',
        'packSuggestion',
        'quantity',
        'substituteHint',
        'text',
        'ticked',
        'unit',
      ]);
    }
  });
});

describe('a stale time or a stale panel never takes garden stock twice (LD1, LD9; J30, J34, G18)', () => {
  /** The seeded silverbeet at 300 g (changed at 01:00) and the traybake for 5 on 1 to 3 March. */
  async function silverbeetPhone(): Promise<TestDb> {
    const test = await openTestDb();
    opened.push(test);
    await onboardForTests(test);
    const [seeded] = await test.repos.garden.list();
    if (seeded === undefined) throw new Error('no seeded garden row');
    test.env.set('2000-03-01T01:00:00.000Z');
    await test.repos.garden.update(seeded.id, { amount: 300, unit: 'g' });
    for (const date of ['2000-03-01', '2000-03-02', '2000-03-03']) {
      await seedPlanDay(test, {
        date,
        dietMode: 'balanced',
        meals: [
          {
            slot: 'dinner',
            recipeId: 'seed:recipe-chicken-silverbeet-traybake',
            myServes: 1,
            householdServes: 5,
          },
        ],
        eatingWindow: null,
      });
    }
    test.env.set('2000-03-01T02:00:00.000Z');
    return test;
  }

  it('LD9 J34: a tick made with the clock set back does not let the next list take the same garden amount again', async () => {
    const test = await silverbeetPhone();
    const { storage, env } = test;
    const first = await build(storage);
    expect(byText(first, 'Silverbeet').fromGardenG).toBe(300);
    env.set('2000-03-01T00:30:00.000Z');
    expect(await tickLine(storage, first.id, byText(first, 'Silverbeet').id, true)).toBeNull();
    env.set('2000-03-02T02:00:00.000Z');
    const second = await build(storage);
    const line = byText(second, 'Silverbeet');
    expect(line).toMatchObject({ section: 'to-buy', fromGardenG: null });
    const stock = await readStockNow(storage);
    const offers = lineOffers(
      line,
      stock.lines.filter((s) => s.ingredientId === line.ingredientId),
      {
        now: env.now(),
        today: '2000-03-02',
        timeZone: env.timeZone(),
        previousListAt: second.updatedAt,
      },
      true,
    );
    const use = offers.find((o) => o.kind === 'use' && o.recheck);
    if (use === undefined) throw new Error('no re-check offer');
    // LD9 J10: the owner's "Yes, use it" takes it once; the same tap again is refused (list-changed).
    const foods = await foodsOf(storage);
    expect(await takeOffer(storage, second.id, line.id, use, foods)).toBeNull();
    expect(await takeOffer(storage, second.id, line.id, use, foods)).toEqual({
      text: grocery.offers.changed,
      tone: 'alert',
    });
    expect((await test.repos.audit.list()).filter((a) => a.table === 'garden')).toHaveLength(2);
  });

  it('LD9 J30: a panel still holding an older list can neither start a new list nor update, and writes nothing', async () => {
    const test = await silverbeetPhone();
    const { storage, env } = test;
    const older = await build(storage);
    env.set('2000-03-01T03:00:00.000Z');
    await build(storage, { current: older });
    const lists = await test.repos.groceryLists.list();
    const audits = await test.repos.audit.list();
    env.set('2000-03-01T04:00:00.000Z');
    const foods = await foodsOf(storage);
    for (const mode of ['new', 'update'] as const) {
      expect(
        await runBuild(storage, foods, { mode, firstDay: '2000-03-01', current: older }),
      ).toEqual({ ok: false, message: { text: grocery.build.changed, tone: 'alert' } });
    }
    expect(await test.repos.groceryLists.list()).toEqual(lists);
    expect(await test.repos.audit.list()).toEqual(audits);
  });
});

describe('the health-sentinel phone (LD2, LD5; G18, HS-23, J21, GL-10, item 31 rule 4)', () => {
  it('LD2: the build writes only the list and its audit rows; no readiness answer changes it', async () => {
    const spy = writeSpy();
    const test = await openSnapshotDb(healthSentinelSnapshot(), SENTINEL_NOW);
    opened.push(test);
    const reopened = await openTestDb({
      deps: test.deps,
      env: test.env,
      extraMiddleware: [spy.middleware],
    });
    opened.push(reopened);
    const before = await reopened.repos.stock.rows();
    const first = await build(reopened.storage);
    expect([...spy.written].sort()).toEqual(['audit', 'grocery_lists']);
    expect(await reopened.repos.stock.rows()).toEqual(before);
    for (const q of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const) {
      await reopened.repos.readiness.answer(q, 'yes');
    }
    const second = await build(reopened.storage, { current: first });
    const strip = (l: GroceryListRecord) => l.items.map((i) => ({ ...i, id: '' }));
    expect(strip(second)).toEqual(strip(first));
  });

  it('LD5 GL-10: no health record, marker text or marker number reaches any list text, note, audit row or file', async () => {
    // One drink's standard drinks are worked out from its volume, so its marker cannot be stored.
    expect(healthSentinelSkips()).toEqual(['drinks_log.stdDrinksPerServe']);
    const test = await openSnapshotDb(healthSentinelSnapshot(), SENTINEL_NOW);
    opened.push(test);
    const { storage } = test;
    const foods = await foodsOf(storage);
    let list = await build(storage);
    // Every offer the owner could tap, until none is left.
    for (let round = 0; round < 20; round += 1) {
      const stock = await readStockNow(storage);
      const now = storage.env.now();
      const ctx = {
        now,
        today: '2000-03-01',
        timeZone: storage.env.timeZone(),
        previousListAt: list.updatedAt,
      };
      const next = list.items
        .map((line) => ({
          line,
          offers: lineOffers(
            line,
            stock.lines.filter((s) => s.ingredientId === line.ingredientId),
            ctx,
            line.ingredientId !== null && foods.resolve(line.ingredientId) !== null,
          ),
        }))
        .find((x) => x.offers.length > 0);
      if (next === undefined) break;
      const [offer] = next.offers;
      if (offer === undefined) break;
      expect(await takeOffer(storage, list.id, next.line.id, offer, foods)).toBeNull();
      list = (await storage.repos.groceryBuild.current()) ?? list;
    }
    const fixture = new Set(healthSentinelSnapshot().audit.map((a) => a.id));
    const audits = (await storage.repos.audit.list()).filter((a) => !fixture.has(a.id));
    expect(audits.length).toBeGreaterThan(2);
    expect(
      list.items.some((i) => i.text === 'Ingredient no longer in the app, from Example traybake'),
    ).toBe(true);
    const fields = list.items.flatMap((i) => [
      i.text,
      i.packSuggestion,
      i.aisle,
      i.substituteHint,
      i.auditNote,
    ]);
    const texts = [
      ...fields.filter((t): t is string => t !== null),
      ...audits.map((a) => a.reason),
      list.storeName,
      listText(list),
      listCsv(list),
      listJson(list),
    ];
    const whole = (marker: string) =>
      new RegExp(`(?<![\\d\\p{L}.,:])${marker.replace(/[.]/g, '\\.')}(?![\\d\\p{L}.,:])`, 'u');
    for (const text of texts) {
      expect(text).not.toMatch(/zzh/i);
      expect(text).not.toMatch(/kickstart|\b(?:23:1|22:2|20:4|18:6|16:8)\b/i);
      for (const marker of SENTINEL_NUMBERS) expect(text, marker).not.toMatch(whole(marker));
    }
    for (const hint of list.items.map((i) => i.substituteHint))
      expect(hint ?? '').not.toMatch(/sesame/i);
  });
});
