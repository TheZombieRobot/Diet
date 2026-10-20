// The stock read for the planner and the grocery list (item 19 design 2.5; A1, A2; GL-02, GD-03,
// C57, C110, G9, G18). Synthetic rows from stockFixtures.ts.
import {
  amountText,
  gardenRowStatus,
  needsRecheck,
  pantryRowStatus,
  readStock,
  readyGardenIngredientIds,
  stockByIngredient,
  type StockLine,
  type StockQuantity,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import {
  GL02_GARDEN,
  GL02_NULL_AMOUNT_GARDEN,
  GL02_PANTRY,
  NN06_GARDEN,
  NN06_PANTRY_UNMEASURED,
  STOCK_NOW,
  STOCK_TODAY,
  STOCK_UPDATED_AT,
  stockId,
} from './stockFixtures';

const view = readStock({ garden: GL02_GARDEN, pantry: GL02_PANTRY, today: STOCK_TODAY });

/** A garden line as the design specifies it, every field written out. */
const gardenLine = (
  n: number,
  ingredientId: string,
  name: string,
  quantity: StockQuantity,
  asEntered: StockLine['asEntered'],
  harvestedAt: string | null,
  daysLeft: number | null,
): StockLine => ({
  source: 'garden',
  recordId: stockId(n),
  ingredientId,
  name,
  quantity,
  asEntered,
  harvestedAt,
  daysLeft,
  updatedAt: STOCK_UPDATED_AT,
});
const pantryLine = (
  n: number,
  ingredientId: string,
  name: string,
  quantity: StockQuantity,
  asEntered: StockLine['asEntered'],
  updatedAt: string = STOCK_UPDATED_AT,
): StockLine => ({
  source: 'pantry',
  recordId: stockId(n),
  ingredientId,
  name,
  quantity,
  asEntered,
  harvestedAt: null,
  daysLeft: null,
  updatedAt,
});

describe('readStock (A1; GL-02, C110, G9, G18)', () => {
  // The exact StockView (design A1): every line's ids, link, quantity, the owner's figures, dates
  // and order, and every row left out with its id, reason and when it was changed.
  it('A1 GL-02: the exact stock view of the GL-02 rows', () => {
    expect(view).toEqual({
      lines: [
        gardenLine(
          2,
          'seed:example-spinach',
          'Example spinach',
          { kind: 'grams', grams: 100, fromCount: null },
          { amount: 100, unit: 'g', gramsPerUnit: null },
          '2000-01-05',
          0,
        ),
        gardenLine(
          1,
          'seed:silverbeet',
          'Silverbeet',
          { kind: 'grams', grams: 300, fromCount: null },
          { amount: 300, unit: 'g', gramsPerUnit: null },
          '2000-01-09',
          4,
        ),
        gardenLine(
          3,
          'seed:example-courgette',
          'Example courgette',
          {
            kind: 'grams',
            grams: 500,
            fromCount: { amount: 2, unit: 'each', gramsPerUnit: 250.4 },
          },
          { amount: 2, unit: 'each', gramsPerUnit: 250.4 },
          null,
          null,
        ),
        gardenLine(
          4,
          'seed:example-lettuce',
          'Example lettuce',
          { kind: 'count', amount: 2, unit: 'each' },
          { amount: 2, unit: 'each', gramsPerUnit: null },
          null,
          null,
        ),
        pantryLine(
          12,
          'seed:example-eggs',
          'Eggs',
          { kind: 'count', amount: 6, unit: 'each' },
          { amount: 6, unit: 'each', gramsPerUnit: null },
        ),
        pantryLine(
          13,
          'seed:example-flour',
          'Example flour',
          { kind: 'grams', grams: 1000, fromCount: null },
          { amount: 1000, unit: 'g', gramsPerUnit: null },
          '2000-01-02T00:00:00.000Z',
        ),
        pantryLine(
          14,
          'seed:example-tinned-fish',
          'Example tinned fish',
          { kind: 'unmeasured' },
          { amount: null, unit: null, gramsPerUnit: null },
        ),
        pantryLine(
          11,
          'seed:example-olive-oil',
          'Olive oil',
          { kind: 'count', amount: 500, unit: 'ml' },
          { amount: 500, unit: 'ml', gramsPerUnit: null },
        ),
      ],
      notCounted: [
        ['garden', 5, 'Example beans', 'not-ready'],
        ['garden', 7, 'Example herb', 'not-linked'],
        ['garden', 6, 'Example kale', 'past-keeps'],
        ['pantry', 15, 'Example rice', 'none-left'],
        ['pantry', 16, 'Example spice', 'not-linked'],
      ].map(([source, n, name, reason]) => ({
        source,
        recordId: stockId(n as number),
        name,
        reason,
        updatedAt: STOCK_UPDATED_AT,
      })),
    });
  });

  it('A1 NN-06: the NN-06 silverbeet is 300 g, weighed', () => {
    expect(
      readStock({ garden: NN06_GARDEN, pantry: [], today: STOCK_TODAY }).lines.map(
        (l) => l.quantity,
      ),
    ).toEqual([{ kind: 'grams', grams: 300, fromCount: null }]);
  });

  it('A1: the screen status and the stock read agree on every row', () => {
    const counted = new Set(view.lines.map((l) => l.recordId));
    for (const row of GL02_GARDEN) {
      expect(gardenRowStatus(row, STOCK_TODAY).counted, row.name).toBe(counted.has(row.id));
    }
    for (const row of GL02_PANTRY) {
      expect(pantryRowStatus(row).counted, row.name).toBe(counted.has(row.id));
    }
  });

  it('A1 G18: a line is checked again when older than 7 days or not changed since the previous list', () => {
    const flour = view.lines.find((l) => l.name === 'Example flour');
    const silverbeet = view.lines.find((l) => l.name === 'Silverbeet');
    if (flour === undefined || silverbeet === undefined) throw new Error('fixture lines missing');
    expect(needsRecheck(flour, { now: STOCK_NOW, previousListAt: null })).toBe(true);
    expect(needsRecheck(silverbeet, { now: STOCK_NOW, previousListAt: null })).toBe(false);
    expect(
      needsRecheck(silverbeet, { now: STOCK_NOW, previousListAt: '2000-01-09T12:00:00.000Z' }),
    ).toBe(true);
    // The boundary: exactly 7 days is still fresh; a millisecond more is checked again.
    const at = { now: STOCK_NOW, previousListAt: null };
    expect(needsRecheck({ updatedAt: '2000-01-03T00:00:00.000Z' }, at)).toBe(false);
    expect(needsRecheck({ updatedAt: '2000-01-02T23:59:59.999Z' }, at)).toBe(true);
    // The planner's tie-break: counted garden lines only, none older than 7 days.
    expect([...readyGardenIngredientIds(view, STOCK_NOW)].sort()).toEqual([
      'seed:example-courgette',
      'seed:example-lettuce',
      'seed:example-spinach',
      'seed:silverbeet',
    ]);
    expect(readyGardenIngredientIds(view, '2000-01-17T00:00:00.000Z').size).toBe(0);
  });

  it('two rows of one food are both kept, for item 24 to add', () => {
    const twice = readStock({
      garden: [...NN06_GARDEN, ...GL02_NULL_AMOUNT_GARDEN],
      pantry: [],
      today: STOCK_TODAY,
    });
    expect(
      stockByIngredient(twice)
        .get('seed:silverbeet')
        ?.map((l) => l.quantity.kind),
    ).toEqual(['grams', 'amount-unknown']);
  });
});

describe('amounts not entered (A2; GD-03, C57)', () => {
  it('A2: a garden amount not entered is amount-unknown, a pantry one unmeasured; no weight is made up', () => {
    const seeded = readStock({
      garden: GL02_NULL_AMOUNT_GARDEN,
      pantry: NN06_PANTRY_UNMEASURED,
      today: STOCK_TODAY,
    });
    expect(seeded.lines.map((l) => l.quantity)).toEqual([
      { kind: 'amount-unknown' },
      { kind: 'unmeasured' },
    ]);
    const all = [...GL02_GARDEN, ...GL02_NULL_AMOUNT_GARDEN, ...NN06_GARDEN];
    const pantry = [...GL02_PANTRY, ...NN06_PANTRY_UNMEASURED];
    for (const line of readStock({ garden: all, pantry, today: STOCK_TODAY }).lines) {
      if (line.asEntered.amount === null) expect(line.quantity.kind, line.name).not.toBe('grams');
    }
    // What the screens show for those rows carries no figure at all.
    for (const row of all.filter((r) => r.amount === null)) {
      expect(amountText(row, 'garden'), row.name).not.toMatch(/\d/);
      expect(amountText({ ...row, harvestReady: false }, 'garden')).not.toMatch(/\d/);
    }
    for (const row of pantry.filter((r) => r.amount === null)) {
      expect(amountText(row, 'pantry'), row.name).not.toMatch(/\d/);
    }
  });
});
