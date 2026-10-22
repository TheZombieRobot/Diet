import { checkRow, DEFAULT_STORE_NAME, type GroceryListRecord } from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import {
  addManualLine,
  checkManualLine,
  checkStoreName,
  type ManualLineDraft,
  type ManualProblem,
  toggleTick,
} from './edit';

const draft = (over: Partial<ManualLineDraft>): ManualLineDraft => ({
  name: 'Example batteries',
  ingredientId: null,
  amount: '',
  unit: null,
  aisle: 'Other',
  ...over,
});
const LIST: GroceryListRecord = {
  id: '0b6f1d2e-0000-4000-8000-000000000999',
  version: 1,
  createdAt: '2000-01-10T00:00:00.000Z',
  updatedAt: '2000-01-10T00:00:00.000Z',
  storeName: DEFAULT_STORE_NAME,
  sentVersion: null,
  sentAt: null,
  transferId: null,
  receivedVersion: null,
  receivedAt: null,
  laptopReceivedAt: null,
  items: [],
};

/** Design 2.8's mapping from a field's problem to its message. */
const MESSAGES: Record<string, string> = {
  'name:required': grocery.manual.errors.nameRequired,
  'name:length': grocery.manual.errors.nameLength,
  'name:price-text': grocery.manual.errors.nameNoPrice,
  'amount:not-a-number': grocery.manual.errors.digitsOnly,
  'amount:range': grocery.manual.errors.amountRange,
  'unit:required': grocery.manual.errors.unitRequired,
};

describe('owner changes (LU8; GL-05, GL-08, HS-16)', () => {
  it('checkManualLine refuses prices, stock and cart states in names, and amounts it would have to guess', () => {
    const cases: [Partial<ManualLineDraft>, Partial<Record<string, ManualProblem>>][] = [
      [{ amount: '1,200', unit: 'g' }, { amount: 'not-a-number' }],
      [{ amount: '0', unit: 'g' }, { amount: 'range' }],
      [{ amount: '2' }, { unit: 'required' }],
      [{ name: 'x'.repeat(101) }, { name: 'length' }],
      [{ name: '   ' }, { name: 'required' }],
      [{ name: 'Milk $4.50' }, { name: 'price-text' }],
      [{ name: 'Bread (in stock)' }, { name: 'price-text' }],
      [{ name: 'Eggs, added to cart' }, { name: 'price-text' }],
      [{ name: 'Butter on special' }, { name: 'price-text' }],
    ];
    for (const [over, problems] of cases) {
      const result = checkManualLine(draft(over));
      expect(result.ok ? {} : result.problems, JSON.stringify(over)).toEqual(problems);
      for (const [field, problem] of Object.entries(problems)) {
        expect(MESSAGES[`${field}:${String(problem)}`]).toBeDefined();
      }
    }
  });

  it('accepted values pass the grocery_lists validator; a blank amount needs no unit', () => {
    const accepted = [
      draft({ name: '  Chicken   stock ', amount: '2.5', unit: 'each' }),
      draft({ name: 'Laundry basket' }),
      draft({ name: 'Beef stock cubes', amount: '100000', unit: 'g', aisle: 'Health food' }),
    ];
    for (const value of accepted) {
      const result = checkManualLine(value);
      if (!result.ok) throw new Error(value.name);
      const items = addManualLine(
        LIST,
        { ...result.value, substituteHint: null },
        '0b6f1d2e-0000-4000-8000-000000000001',
      );
      expect(checkRow('grocery_lists', { ...LIST, items }).ok, value.name).toBe(true);
    }
    expect(checkManualLine(draft({ name: ' Chicken  stock ' }))).toMatchObject({
      ok: true,
      value: { text: 'Chicken stock', quantity: null, unit: null },
    });
  });

  it('GL-04: an own aisle sorts after the shipped aisles and before "Other"', () => {
    let items: GroceryListRecord['items'] = [];
    for (const [n, aisle] of [
      [1, 'Other'],
      [2, 'Pets'],
      [3, 'Produce'],
    ] as const) {
      const value = { text: `Example ${String(n)}`, ingredientId: null, quantity: null };
      items =
        addManualLine(
          { ...LIST, items },
          { ...value, unit: null, aisle, substituteHint: null },
          `0b6f1d2e-0000-4000-8000-00000000000${String(n)}`,
        ) ?? [];
    }
    expect(items.map((i) => i.aisle)).toEqual(['Produce', 'Pets', 'Other']);
  });

  it('an already-have line has no tick; the store name may not carry a price', () => {
    const items =
      addManualLine(
        LIST,
        {
          text: 'Example',
          ingredientId: null,
          quantity: null,
          unit: null,
          aisle: 'Other',
          substituteHint: null,
        },
        '0b6f1d2e-0000-4000-8000-000000000001',
      ) ?? [];
    const list = { ...LIST, items: items.map((i) => ({ ...i, section: 'already-have' as const })) };
    expect(toggleTick(list, '0b6f1d2e-0000-4000-8000-000000000001', true)).toBeNull();
    expect(checkStoreName('Store: specials')).toEqual({ ok: false, problem: 'price-text' });
    expect(checkStoreName(DEFAULT_STORE_NAME)).toEqual({ ok: true, value: DEFAULT_STORE_NAME });
    expect(checkStoreName('x'.repeat(81))).toEqual({ ok: false, problem: 'length' });
  });
});
