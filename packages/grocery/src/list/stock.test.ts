import {
  type GardenRecord,
  type GroceryItem,
  type GroceryListRecord,
  type PantryRecord,
  readStock,
  stockByIngredient,
  type StockLine,
} from '@diet/core';
import {
  GL02_GARDEN,
  GL02_NULL_AMOUNT_GARDEN,
  GL02_PANTRY,
  LIST_GARDEN_EGGS_UNKNOWN,
  listFoodsFixture,
  NN06_GARDEN,
  NN06_PANTRY_UNMEASURED,
  STOCK_NOW,
  STOCK_TODAY,
  stockId,
} from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { packInfoOf } from './packs';
import {
  applyOffer,
  buyAnyway,
  lineNote,
  lineOffers,
  type Offer,
  stockAtBuild,
  type StockOutcome,
} from './stock';
import type { StockContext, StockFood } from './types';

const ctx: StockContext = {
  now: STOCK_NOW,
  today: STOCK_TODAY,
  timeZone: 'UTC',
  previousListAt: null,
};
const silverbeet: StockFood = { name: 'silverbeet', countWord: null, gardenProduce: true };
const eggs: StockFood = {
  name: 'eggs',
  countWord: { one: 'egg', many: 'eggs' },
  gardenProduce: false,
};
const plain: StockFood = { name: 'example food', countWord: null, gardenProduce: false };

const stockOf = (
  garden: readonly GardenRecord[],
  pantry: readonly PantryRecord[] = [],
  today = STOCK_TODAY,
): readonly StockLine[] => readStock({ garden, pantry, today }).lines;
const forFood = (lines: readonly StockLine[], id: string) =>
  stockByIngredient({ lines, notCounted: [] }).get(id) ?? [];

/** Every string the tests below produced, for the C57 scan (LS3). */
const produced: { readonly text: string; readonly counted: boolean }[] = [];
const keep = (outcome: StockOutcome, counted = false): StockOutcome => {
  for (const n of outcome.notes) produced.push({ text: n.full, counted });
  for (const a of outcome.audits) produced.push({ text: a.reason, counted });
  return outcome;
};

const LIST_ID = '0b6f1d2e-0000-4000-8000-000000000900';
const LINE_ID = '0b6f1d2e-0000-4000-8000-000000000901';
function lineFrom(outcome: StockOutcome, unit: 'g' | 'each', id = 'seed:silverbeet'): GroceryItem {
  return {
    id: LINE_ID,
    origin: 'generated',
    ingredientId: id,
    text: 'Silverbeet',
    quantity: outcome.quantity,
    unit,
    packSuggestion: null,
    aisle: 'Produce',
    substituteHint: null,
    section: outcome.section,
    fromGardenG: outcome.fromGardenG,
    gardenAmountUnknown: outcome.gardenAmountUnknown,
    fromPantryG: outcome.fromPantryG,
    auditNote: outcome.notes.map((n) => n.full).join('; ') || null,
    price: null,
    ticked: false,
  };
}
const listOf = (line: GroceryItem): GroceryListRecord => ({
  id: LIST_ID,
  version: 1,
  createdAt: STOCK_NOW,
  updatedAt: STOCK_NOW,
  storeName: 'Example store',
  sentVersion: null,
  sentAt: null,
  transferId: null,
  receivedVersion: null,
  receivedAt: null,
  laptopReceivedAt: null,
  items: [line],
});
const foods = listFoodsFixture();
const info = packInfoOf('seed:silverbeet', foods);
/** Applies the line's only offer of `kind` and returns the changed line and audit reason. */
function tap(
  line: GroceryItem,
  stock: readonly StockLine[],
  kind: Offer['kind'],
  food: StockFood = silverbeet,
  at: StockContext = ctx,
) {
  const offer = lineOffers(line, stock, at, true).find((o) => o.kind === kind);
  if (offer === undefined) throw new Error(`no ${kind} offer`);
  const result = applyOffer(listOf(line), line.id, offer, stock, info, food, at);
  if (result === null) throw new Error('offer did not apply');
  const changed = result.items[0];
  if (changed === undefined) throw new Error('line gone');
  produced.push({ text: changed.auditNote ?? '', counted: false });
  produced.push({ text: result.audit.reason, counted: false });
  return { line: changed, audit: result.audit, offer };
}

describe('garden and pantry at build time (LU3; NN-06, GL-02, J44)', () => {
  it('NN-06: 300 g silverbeet in the garden, 500 g needed: 200 g to buy and the audit line', () => {
    const out = keep(
      stockAtBuild({ quantity: 500, unit: 'g' }, stockOf(NN06_GARDEN), silverbeet, ctx),
    );
    expect(out).toMatchObject({ section: 'to-buy', quantity: 200, fromGardenG: 300 });
    expect(out.notes.map((n) => n.full)).toEqual(['300 g from garden, as listed on 9 January']);
    expect(out.audits).toEqual([
      {
        table: 'garden',
        recordId: stockId(31),
        reason: '300 g silverbeet from garden, as listed on 9 January',
      },
    ]);
  });

  it('GL-02: a covering weighed row goes under Already have with the whole need; a count-derived amount says "about" with the count', () => {
    const lines = stockOf(GL02_GARDEN, GL02_PANTRY);
    const covered = stockAtBuild(
      { quantity: 200, unit: 'g' },
      forFood(lines, 'seed:silverbeet'),
      silverbeet,
      ctx,
    );
    expect(covered).toMatchObject({ section: 'already-have', quantity: 200, fromGardenG: 200 });
    const counted = keep(
      stockAtBuild(
        { quantity: 600, unit: 'g' },
        forFood(lines, 'seed:example-courgette'),
        plain,
        ctx,
      ),
      true,
    );
    expect(counted.notes[0]?.full).toBe(
      'about 500 g from garden (2 each, about 250.4 g per item), as listed on 9 January',
    );
    // Not ready, past its keeps and unlinked rows are not stock; counts, unmeasured, none left and
    // an 8-day-old weight take nothing.
    for (const id of ['seed:example-beans', 'seed:example-kale', 'seed:example-rice']) {
      expect(forFood(lines, id)).toEqual([]);
    }
    for (const id of [
      'seed:example-lettuce',
      'seed:example-olive-oil',
      'seed:example-flour',
      'seed:example-tinned-fish',
    ]) {
      const out = stockAtBuild({ quantity: 1000, unit: 'g' }, forFood(lines, id), plain, ctx);
      expect(out, id).toMatchObject({
        section: 'to-buy',
        quantity: 1000,
        fromGardenG: null,
        fromPantryG: null,
      });
      expect(lineOffers(lineFrom(out, 'g', id), forFood(lines, id), ctx, true), id).toHaveLength(1);
    }
  });

  it('J44: a weighed row and an amount-not-entered row of one food give the same result in either order', () => {
    const rows = [
      { ...NN06_GARDEN[0], id: stockId(71) } as GardenRecord,
      { ...GL02_NULL_AMOUNT_GARDEN[0], id: stockId(72) } as GardenRecord,
    ];
    for (const order of [rows, [...rows].reverse()]) {
      const out = keep(stockAtBuild({ quantity: 500, unit: 'g' }, stockOf(order), silverbeet, ctx));
      expect(out).toMatchObject({
        section: 'already-have',
        quantity: 500,
        fromGardenG: 300,
        gardenAmountUnknown: true,
      });
      expect(out.notes.map((n) => n.full).join('; ')).toBe(
        '300 g from garden, as listed on 9 January; recipes need 200 g more; garden amount not entered',
      );
      expect(out.audits.map((a) => a.reason)).toEqual([
        '300 g silverbeet from garden, as listed on 9 January',
        'silverbeet marked available, amount not entered; not purchased',
      ]);
    }
  });

  it('overflow: a note over 200 characters falls back to a total that still says "about"', () => {
    const at: StockContext = { ...ctx, now: '2000-01-02T00:00:00.000Z', today: '2000-01-02' };
    const garden = [
      {
        ...GL02_GARDEN[2],
        id: stockId(81),
        ingredientId: 'seed:silverbeet',
        updatedAt: '1999-12-30T00:00:00.000Z',
      },
      {
        ...GL02_GARDEN[2],
        id: stockId(82),
        name: 'Example second bed',
        ingredientId: 'seed:silverbeet',
        amount: 3,
        unit: 'bunch',
        gramsPerUnit: 250,
        updatedAt: '1999-12-31T00:00:00.000Z',
      },
    ] as GardenRecord[];
    const pantry = [
      {
        ...GL02_PANTRY[2],
        id: stockId(83),
        ingredientId: 'seed:silverbeet',
        updatedAt: '1999-12-01T00:00:00.000Z',
      },
    ] as PantryRecord[];
    const stock = stockOf(garden, pantry, '2000-01-02');
    const built = keep(stockAtBuild({ quantity: 5000, unit: 'g' }, stock, silverbeet, at), true);
    expect(built.fromGardenG).toBe(1250);
    const { line } = tap(lineFrom(built, 'g'), stock, 'use', silverbeet, at);
    produced.push({ text: line.auditNote ?? '', counted: true });
    expect(line.auditNote?.length).toBeLessThanOrEqual(200);
    const long = 'x'.repeat(120);
    const total = lineNote([
      { full: long, short: long, estimated: true, source: 'garden', takenG: 500 },
      { full: long, short: long, estimated: false, source: 'pantry', takenG: 300 },
      {
        full: 'recipes need 200 g more; garden amount not entered',
        short: '',
        estimated: false,
        source: 'garden',
        takenG: 0,
      },
    ]);
    expect(total).toBe(
      'about 800 g from garden and pantry; recipes need 200 g more; garden amount not entered',
    );
  });
});

describe('C57 and the whole need (LU4; C57, C110, H24a, J29, J31)', () => {
  it('C57: garden produce available, amount not entered goes under Already have; Buy anyway brings back the whole need', () => {
    const out = keep(
      stockAtBuild({ quantity: 500, unit: 'g' }, stockOf(GL02_NULL_AMOUNT_GARDEN), silverbeet, ctx),
    );
    expect(out).toMatchObject({
      section: 'already-have',
      quantity: 500,
      fromGardenG: null,
      gardenAmountUnknown: true,
    });
    expect(out.notes[0]?.full).toBe('recipes need 500 g; garden amount not entered');
    expect(out.audits[0]?.reason).toBe(
      'silverbeet marked available, amount not entered; not purchased',
    );
    const line = lineFrom(out, 'g');
    const back = buyAnyway(listOf(line), line.id, info, silverbeet);
    expect(back?.items[0]).toMatchObject({
      section: 'to-buy',
      quantity: 500,
      packSuggestion: '1 bunch',
      fromGardenG: null,
      gardenAmountUnknown: false,
      auditNote: 'You chose to buy this anyway.',
    });
    expect(back?.audit).toEqual({
      table: 'grocery_lists',
      recordId: `${LIST_ID}#${LINE_ID}`,
      reason: 'silverbeet: you chose to buy it anyway',
    });
  });

  it('J29: hens marked available never cover the eggs silently; "I have enough" writes the C57 audit', () => {
    // An own food (not garden produce) needed in grams stays to buy as well.
    const own = stockAtBuild(
      { quantity: 500, unit: 'g' },
      stockOf(GL02_NULL_AMOUNT_GARDEN),
      plain,
      ctx,
    );
    expect(own).toMatchObject({ section: 'to-buy', quantity: 500, gardenAmountUnknown: false });
    const stock = stockOf(LIST_GARDEN_EGGS_UNKNOWN);
    const out = stockAtBuild({ quantity: 8, unit: 'each' }, stock, eggs, ctx);
    expect(out).toMatchObject({ section: 'to-buy', quantity: 8, gardenAmountUnknown: false });
    const offers = lineOffers(lineFrom(out, 'each', 'seed:eggs'), stock, ctx, true);
    expect(offers.map((o) => [o.kind, o.prompt, o.action])).toEqual([
      [
        'use-unknown',
        'Garden: available, amount not entered, as listed on 9 January.',
        'I have enough',
      ],
    ]);
    const tapped = tap(lineFrom(out, 'each', 'seed:eggs'), stock, 'use-unknown', eggs);
    expect(tapped.audit.reason).toBe('eggs marked available, amount not entered; not purchased');
    expect(tapped.line).toMatchObject({
      section: 'already-have',
      quantity: 8,
      gardenAmountUnknown: true,
    });
  });

  it('J31: Already have stores the whole need after garden and pantry; Buy anyway clears both', () => {
    const pantry = [
      { ...GL02_PANTRY[2], id: stockId(91), ingredientId: 'seed:silverbeet', updatedAt: STOCK_NOW },
    ] as PantryRecord[];
    const counts = [
      { ...GL02_PANTRY[1], id: stockId(92), ingredientId: 'seed:silverbeet' },
    ] as PantryRecord[];
    const garden = stockOf(NN06_GARDEN);
    for (const [rows, kind, fromPantryG] of [
      [pantry, 'use', 200],
      [counts, 'enough', null],
    ] as const) {
      const stock = [...garden, ...stockOf([], rows)];
      const built = stockAtBuild({ quantity: 500, unit: 'g' }, garden, silverbeet, ctx);
      const { line } = tap(lineFrom(built, 'g'), stock, kind);
      expect(line).toMatchObject({
        section: 'already-have',
        quantity: 500,
        fromGardenG: 300,
        fromPantryG,
      });
      const back = buyAnyway(listOf(line), line.id, info, silverbeet)?.items[0];
      expect(back).toMatchObject({
        section: 'to-buy',
        quantity: 500,
        fromGardenG: null,
        fromPantryG: null,
      });
    }
  });

  it('H24a: "2 bunches" with no grams per bunch is never turned into grams', () => {
    const rows = [{ ...NN06_GARDEN[0], amount: 2, unit: 'bunch' }] as GardenRecord[];
    const stock = stockOf(rows);
    const out = keep(stockAtBuild({ quantity: 1000, unit: 'g' }, stock, silverbeet, ctx));
    expect(out).toMatchObject({ section: 'to-buy', quantity: 1000, notes: [], audits: [] });
    const { line, audit, offer } = tap(lineFrom(out, 'g'), stock, 'enough');
    expect(offer.prompt).toBe('Garden: 2 bunches, as listed on 9 January.');
    expect(`${line.auditNote ?? ''} ${audit.reason}`).not.toMatch(/\d\s*g\b/);
  });
});

describe("re-checks and the owner's taps (LU5; G18, J30, J33, J34)", () => {
  const bought = (out: StockOutcome) => lineFrom(out, 'g');

  it('G18: a row not changed since the list last changed, or 8 days old, is asked about, never taken', () => {
    const later: StockContext = { ...ctx, previousListAt: '2000-01-09T12:00:00.000Z' };
    const old = stockOf([
      { ...NN06_GARDEN[0], updatedAt: '2000-01-02T00:00:00.000Z' },
    ] as GardenRecord[]);
    for (const [stock, at] of [
      [stockOf(NN06_GARDEN), later],
      [old, ctx],
    ] as const) {
      const out = stockAtBuild({ quantity: 500, unit: 'g' }, stock, silverbeet, at);
      expect(out).toMatchObject({ section: 'to-buy', quantity: 500, fromGardenG: null });
      const { line, audit, offer } = tap(bought(out), stock, 'use', silverbeet, at);
      expect(offer).toMatchObject({ recheck: true, action: 'Yes, use it' });
      expect(offer.prompt).toMatch(/Still have it\?$/);
      expect(audit.reason).toMatch(/; you said you still have it$/);
      expect(line).toMatchObject({ quantity: 200, fromGardenG: 300 });
      // One source per line: no further garden offer once it took grams (J10).
      expect(lineOffers(line, stock, at, true).filter((o) => o.source === 'garden')).toEqual([]);
    }
  });

  it('J30, J34: the second update re-asks a row taken before; a row dated after the clock is stale', () => {
    const chicken = stockOf([], [
      {
        ...GL02_PANTRY[2],
        ingredientId: 'seed:chicken-thigh',
        updatedAt: '2000-01-05T00:00:00.000Z',
      },
    ] as PantryRecord[]);
    const second: StockContext = { ...ctx, previousListAt: '2000-01-06T00:00:00.000Z' };
    expect(
      stockAtBuild({ quantity: 400, unit: 'g' }, chicken, plain, second).fromPantryG,
    ).toBeNull();
    const ahead = stockOf([
      { ...NN06_GARDEN[0], updatedAt: '2000-01-12T00:00:00.000Z' },
    ] as GardenRecord[]);
    expect(
      stockAtBuild({ quantity: 500, unit: 'g' }, ahead, silverbeet, ctx).fromGardenG,
    ).toBeNull();
  });

  it('a changed row refuses the tap; a tapped re-check keeps the wording the owner saw', () => {
    const stock = stockOf(NN06_GARDEN);
    const line = bought(stockAtBuild({ quantity: 500, unit: 'g' }, [], silverbeet, ctx));
    const [offer] = lineOffers(line, stock, ctx, true);
    if (offer === undefined) throw new Error('no offer');
    const gone = applyOffer(listOf(line), line.id, offer, [], info, silverbeet, ctx);
    expect(gone).toBeNull();
    const result = applyOffer(
      listOf(line),
      line.id,
      { ...offer, recheck: true },
      stock,
      info,
      silverbeet,
      ctx,
    );
    expect(result?.audit.reason).toMatch(/you said you still have it$/);
  });

  it("guards: no offer on a cooked line, a food no longer in the app, or a bought-anyway line's unknown amount", () => {
    const stock = stockOf(GL02_NULL_AMOUNT_GARDEN);
    const line = bought(stockAtBuild({ quantity: 500, unit: 'g' }, [], silverbeet, ctx));
    expect(lineOffers({ ...line, quantity: null, unit: null }, stock, ctx, true)).toEqual([]);
    expect(lineOffers(line, stock, ctx, false)).toEqual([]);
    expect(
      lineOffers({ ...line, auditNote: 'You chose to buy this anyway.' }, stock, ctx, true),
    ).toEqual([]);
  });

  it('J33: a source lowered or removed after it was taken offers Buy the full amount', () => {
    const out = stockAtBuild({ quantity: 500, unit: 'g' }, stockOf(NN06_GARDEN), silverbeet, ctx);
    const line = bought(out);
    const lower = stockOf([{ ...NN06_GARDEN[0], amount: 100 }] as GardenRecord[]);
    expect(lineOffers(line, lower, ctx, true).map((o) => [o.kind, o.prompt])).toEqual([
      ['buy-full', 'The garden now lists less than the 300 g this list took.'],
    ]);
    expect(lineOffers(line, [], ctx, true).map((o) => o.prompt)).toEqual([
      'The garden no longer lists this item.',
    ]);
    const { line: full, audit } = tap(line, [], 'buy-full');
    expect(full).toMatchObject({
      section: 'to-buy',
      quantity: 500,
      fromGardenG: null,
      fromPantryG: null,
    });
    expect(audit.reason).toBe('silverbeet: you chose to buy the full amount');
  });

  it('unmeasured pantry eggs stay to buy until the owner says the pantry has enough', () => {
    const stock = stockOf([], NN06_PANTRY_UNMEASURED);
    const out = stockAtBuild({ quantity: 8, unit: 'each' }, stock, eggs, ctx);
    expect(out.section).toBe('to-buy');
    const { line, audit } = tap(lineFrom(out, 'each'), stock, 'enough-unmeasured', eggs);
    expect(line).toMatchObject({
      section: 'already-have',
      auditNote: 'Pantry: some, not measured. You said you have enough.',
    });
    expect(audit.reason).toBe('eggs: you said the pantry has enough; amount not measured');
  });
});

describe('the C57 gram-figure scan (LS3; item 19 G11)', () => {
  it('a gram figure before "from garden" comes only from a weighed row, and says "about" when it came from a count', () => {
    expect(produced.length).toBeGreaterThan(10);
    const figure = /(\babout\s+)?\d[\d,.]*\s*g\b[^;]*?\bfrom\s+garden\b/gi;
    for (const { text, counted } of produced) {
      for (const match of text.matchAll(figure)) {
        if (counted) expect(match[1], text).toBeDefined();
      }
      expect(text).not.toMatch(/\b1,000 g\b.*from garden/);
    }
  });
});
