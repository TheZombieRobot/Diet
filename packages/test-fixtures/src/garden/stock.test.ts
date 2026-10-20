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

describe('readStock (A1; GL-02, C110, G9, G18)', () => {
  it('A1 GL-02: counted lines in order with their quantities, and the rows left out with a reason', () => {
    expect(view.lines.map((l) => [l.name, l.quantity, l.daysLeft])).toEqual([
      ['Example spinach', { kind: 'grams', grams: 100, fromCount: null }, 0],
      ['Silverbeet', { kind: 'grams', grams: 300, fromCount: null }, 4],
      [
        'Example courgette',
        {
          kind: 'grams',
          grams: 500,
          fromCount: { amount: 2, unit: 'each', gramsPerUnit: 250.4 },
        },
        null,
      ],
      ['Example lettuce', { kind: 'count', amount: 2, unit: 'each' }, null],
      ['Eggs', { kind: 'count', amount: 6, unit: 'each' }, null],
      ['Example flour', { kind: 'grams', grams: 1000, fromCount: null }, null],
      ['Example tinned fish', { kind: 'unmeasured' }, null],
      ['Olive oil', { kind: 'count', amount: 500, unit: 'ml' }, null],
    ]);
    expect(view.lines[1]).toEqual({
      source: 'garden',
      recordId: stockId(1),
      ingredientId: 'seed:silverbeet',
      name: 'Silverbeet',
      quantity: { kind: 'grams', grams: 300, fromCount: null },
      asEntered: { amount: 300, unit: 'g', gramsPerUnit: null },
      harvestedAt: '2000-01-09',
      daysLeft: 4,
      updatedAt: STOCK_UPDATED_AT,
    });
    expect(view.notCounted.map((n) => [n.source, n.name, n.reason])).toEqual([
      ['garden', 'Example beans', 'not-ready'],
      ['garden', 'Example herb', 'not-linked'],
      ['garden', 'Example kale', 'past-keeps'],
      ['pantry', 'Example rice', 'none-left'],
      ['pantry', 'Example spice', 'not-linked'],
    ]);
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
