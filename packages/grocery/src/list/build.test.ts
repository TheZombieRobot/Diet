import {
  type GroceryItem,
  type GroceryListRecord,
  readStock,
  type RecipeLine,
  type StockView,
} from '@diet/core';
import {
  GL02_NULL_AMOUNT_GARDEN,
  listFoodsFixture,
  STOCK_NOW,
  STOCK_TODAY,
} from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { type BuildInput, buildGroceryList } from './build';
import type { DatedMeal, ResolvedRecipe } from './types';

const foods = listFoodsFixture();
const line = (ingredientId: string, rawG: number, displayAs: string | null = null): RecipeLine => ({
  ingredientId,
  rawG,
  cookedG: null,
  displayAs,
});
const recipes: Record<string, ResolvedRecipe> = {
  a: {
    title: 'Example traybake',
    serves: 1,
    lines: [
      line('seed:silverbeet', 500),
      line('seed:broccoli', 300),
      line('seed:example-gone', 50),
    ],
    seedLines: null,
  },
  b: {
    title: 'Example soup',
    serves: 1,
    lines: [line('seed:example-other', 80, 'Example spice mix')],
    seedLines: null,
  },
  big: {
    title: 'Example feast',
    serves: 1,
    lines: [line('seed:chicken-thigh', 2400)],
    seedLines: null,
  },
  drinks: { title: 'Example juice', serves: 1, lines: [line('seed:lemon', 120)], seedLines: null },
};
const meal = (recipeId: string, householdServes = 1): DatedMeal => ({
  date: '2000-01-10',
  meal: { slot: 'dinner', recipeId, myServes: 1, householdServes },
});
const NO_STOCK: StockView = { lines: [], notCounted: [] };
let n = 0;
const input = (over: Partial<BuildInput> = {}): BuildInput => ({
  meals: [meal('a')],
  recipeOf: (id) => recipes[id] ?? null,
  foods,
  profile: {
    allergens: [],
    glutenFreeHousehold: false,
    dislikeIngredientIds: [],
    dislikeTerms: [],
  },
  stock: NO_STOCK,
  ctx: { now: STOCK_NOW, today: STOCK_TODAY, timeZone: 'UTC', previousListAt: null },
  previous: null,
  randomId: () => `0b6f1d2e-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
  ...over,
});
const built = (over: Partial<BuildInput> = {}): GroceryItem[] => {
  const result = buildGroceryList(input(over));
  if (!result.ok) throw new Error(result.reason);
  return result.items;
};
const listWith = (items: GroceryItem[]): GroceryListRecord => ({
  id: '0b6f1d2e-0000-4000-8000-000000000999',
  version: 3,
  createdAt: STOCK_NOW,
  updatedAt: STOCK_NOW,
  storeName: 'Example store',
  sentVersion: null,
  sentAt: null,
  transferId: null,
  receivedVersion: null,
  receivedAt: null,
  laptopReceivedAt: null,
  items,
});
const byText = (items: readonly GroceryItem[], text: string) => {
  const found = items.find((i) => i.text === text);
  if (found === undefined) throw new Error(text);
  return found;
};

describe('buildGroceryList (LU7; GL-04, GL-05, GL-09, C111, NN-05, J32, J38, J43)', () => {
  it('names, aisles and order: unknown foods from the recipe line or title, under Other, last', () => {
    const items = built({ meals: [meal('a'), meal('b')] });
    expect(items.map((i) => [i.text, i.aisle, i.packSuggestion])).toEqual([
      ['Broccoli', 'Produce', '1 head'],
      ['Silverbeet', 'Produce', '1 bunch'],
      ['Example spice mix', 'Other', null],
      ['Ingredient no longer in the app, from Example traybake', 'Other', null],
    ]);
    expect(byText(items, 'Broccoli').substituteHint).toBe('Cauliflower');
    expect(items.every((i) => i.price === null && !i.ticked)).toBe(true);
  });

  it('an update keeps manual lines and ids; ticks and per-line prices only while the amount is unchanged (C111)', () => {
    const first = built();
    const price = { amountNzCents: 650, enteredAt: STOCK_NOW };
    const manual: GroceryItem = {
      ...byText(first, 'Broccoli'),
      id: '0b6f1d2e-0000-4000-8000-000000000777',
      origin: 'manual',
      text: 'Example batteries',
      ingredientId: 'seed:broccoli',
      substituteHint: 'Stale hint',
      aisle: 'Other',
    };
    const previous = listWith([
      ...first.map((i) =>
        i.text === 'Broccoli'
          ? { ...i, ticked: true, price: { ...price, basis: 'line' as const } }
          : i.text === 'Silverbeet'
            ? { ...i, ticked: true, price: { ...price, basis: 'per_kg' as const } }
            : i,
      ),
      manual,
    ]);
    const updated = built({ previous, meals: [meal('a'), meal('a')] });
    const broccoli = byText(updated, 'Broccoli');
    const silverbeet = byText(updated, 'Silverbeet');
    expect(broccoli.id).toBe(byText(first, 'Broccoli').id);
    // 600 g now ("2 heads"): neither the tick nor a per-line price stays; a per-kilogram price does.
    expect([broccoli.ticked, broccoli.price]).toEqual([false, null]);
    expect([silverbeet.ticked, silverbeet.price?.basis]).toEqual([false, 'per_kg']);
    expect(byText(updated, 'Example batteries').substituteHint).toBe('Cauliflower');
    const same = built({ previous });
    expect(byText(same, 'Broccoli')).toMatchObject({ ticked: true, price: { basis: 'line' } });
    expect(built({ previous: null }).some((i) => i.ticked || i.price !== null)).toBe(false);
  });

  it('J32: a line bought anyway stays to buy on an update, whatever the garden says', () => {
    const garden = readStock({
      garden: GL02_NULL_AMOUNT_GARDEN,
      pantry: [],
      today: STOCK_TODAY,
    });
    const fresh = byText(built({ stock: garden }), 'Silverbeet');
    expect(fresh).toMatchObject({ section: 'already-have', gardenAmountUnknown: true });
    const anyway = {
      ...fresh,
      section: 'to-buy' as const,
      gardenAmountUnknown: false,
      auditNote: 'You chose to buy this anyway.',
    };
    const again = byText(built({ stock: garden, previous: listWith([anyway]) }), 'Silverbeet');
    expect(again).toMatchObject({
      id: fresh.id,
      section: 'to-buy',
      quantity: 500,
      packSuggestion: '1 bunch',
      auditNote: 'You chose to buy this anyway.',
    });
  });

  it("J43: a need over 100,000 is refused with the food's name; over 500 lines is refused; nothing is truncated", () => {
    expect(buildGroceryList(input({ meals: [meal('big', 50)] }))).toMatchObject({
      ok: false,
      reason: 'amount-too-large',
      item: 'Chicken thigh',
    });
    const manyManual = Array.from({ length: 499 }, (_, i) => ({
      ...byText(built(), 'Broccoli'),
      id: `0b6f1d2e-0000-4000-8000-${String(5000 + i).padStart(12, '0')}`,
      origin: 'manual' as const,
      ingredientId: null,
    }));
    expect(buildGroceryList(input({ previous: listWith(manyManual) }))).toMatchObject({
      ok: false,
      reason: 'too-many-lines',
    });
  });
});
