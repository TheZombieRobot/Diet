// "Foods in the app" (item 18 design 7.3): the screen over the real repositories on
// fake-indexeddb, with the shipped catalogue, or fixture data injected through FoodDataContext.
// Counts come from the catalogue, never typed in. Synthetic records only.
import {
  type DatabaseSource,
  foodData,
  type FoodDataOk,
  type IngredientChange,
  loadFoodData,
  SEED_AISLES,
  type UserAllergen,
} from '@diet/core';
import { foods, privacy } from '@diet/core/copy/health';
import { exampleAttribution, exampleFoodData, exampleRelease } from '@diet/test-fixtures';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { onboardForTests, openTestDb, type TestDb } from '../../db/testKit';
import { FoodDataContext, type FoodDataValue } from '../../foods/FoodDataContext';
import { FoodsScreen } from './FoodsScreen';

const T = '2000-01-01T00:00:00.000Z';
const DATABASE_NAMES = [
  /Food Composition Database|\bFCDB\b|\bUSDA\b|FoodData|New Zealand Food/,
  /food composition/i,
];
const shipped = (): FoodDataOk => {
  const data = foodData();
  if (data.status !== 'ok') throw new Error('the shipped catalogue did not load');
  return data;
};

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

interface Show {
  readonly allergens?: UserAllergen[];
  readonly glutenFreeHousehold?: boolean;
  readonly overrides?: Readonly<Record<string, IngredientChange[]>>;
  readonly value?: FoodDataValue;
}

/** A finished setup with the profile and corrections given, then the screen. */
async function show({
  allergens = [],
  glutenFreeHousehold = false,
  overrides = {},
  value,
}: Show = {}): Promise<TestDb> {
  test = await openTestDb();
  await onboardForTests(test, { profile: { allergens, glutenFreeHousehold } });
  for (const [seedId, changes] of Object.entries(overrides))
    await test.repos.ingredientOverrides.create({ seedId, changes });
  appStorageStore.set(test.storage);
  const screenEl: ReactElement =
    value === undefined ? (
      <FoodsScreen />
    ) : (
      <FoodDataContext.Provider value={value}>
        <FoodsScreen />
      </FoodDataContext.Provider>
    );
  render(screenEl);
  await screen.findByRole('searchbox', { name: foods.screen.searchLabel });
  return test;
}

const search = (text: string) => {
  fireEvent.change(screen.getByRole('searchbox', { name: foods.screen.searchLabel }), {
    target: { value: text },
  });
};
const status = () => screen.getByRole('status').textContent;
/** A food's row: its button's name starts with the food's name ("Pasta", not "Pasta, cooked"). */
const row = (name: string) =>
  screen.getByRole('button', {
    name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}(?: |$)`),
  });
/** Opens a food (searching for it first) and returns its panel. */
const open = (query: string, name: string): HTMLElement => {
  search(query);
  fireEvent.click(row(name));
  return screen.getByRole('region', { name });
};
const value = (data: FoodDataOk, approved: readonly DatabaseSource[] = []): FoodDataValue => ({
  data,
  approved,
  attributions: exampleAttribution,
});

describe('Foods in the app (item 18; UX 7a)', () => {
  it('K2 FD-01: aisle cards in order with every food; search by name or other name', async () => {
    await show();
    const data = shipped();
    const aisles = SEED_AISLES.filter((a) => data.catalogue.foods.some((f) => f.aisle === a));
    const cards = screen
      .getAllByRole('region')
      .map((r) => within(r).getByRole('heading').textContent);
    expect(cards).toEqual([foods.screen.findLabel, ...aisles]);
    expect(screen.getAllByRole('listitem')).toHaveLength(data.catalogue.foods.length);
    expect(status()).toBe(`${String(data.catalogue.foods.length)} foods`);

    search('chard');
    expect(
      screen.getAllByRole('region').map((r) => within(r).getByRole('heading').textContent),
    ).toEqual([foods.screen.findLabel, foods.screen.matchesLabel]);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Silverbeet/),
    ]);
    expect(status()).toBe('1 matching food');
    search('zzz');
    expect(status()).toBe(foods.screen.noMatch);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    search('c');
    expect(screen.getAllByRole('listitem')).toHaveLength(data.catalogue.foods.length);
  });

  it('K3 FD-02 NU-09 C97 HS-36: a not-loaded food shows its facts, eight "not known" figures, no badge and the footer', async () => {
    await show();
    const panel = open('chard', 'Silverbeet');
    const text = panel.textContent;
    for (const expected of [
      'Swiss chard, Chard, Silver beet',
      'Sold by the bunch',
      foods.detail.packsTypical,
      'One bunch weighs about 500 g as bought (typical), used only to count how many to buy.',
      foods.detail.allergensNone,
      'All year',
      foods.detail.seasonNote,
      foods.detail.gardenYes,
      'Spinach, Kale',
      foods.notLoaded,
      foods.footer.noDatabase,
    ])
      expect(text).toContain(expected);
    expect(text).not.toContain('Badge:');
    const table = within(panel).getByRole('table', { name: 'Nutrition per 100 g, raw' });
    expect(
      within(table)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(Array.from({ length: 8 }, () => 'not known'));
    for (const pattern of DATABASE_NAMES) expect(text).not.toMatch(pattern);
    expect(text).not.toMatch(/\b0\s*(g|kJ|mg)\b/);

    // One panel at a time; a search that hides the open food closes it.
    search('');
    fireEvent.click(row('Kale'));
    expect(
      screen
        .getAllByRole('region', { name: /^(Silverbeet|Kale)$/ })
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['Kale']);
    search('zzz');
    search('kale');
    expect(screen.queryByRole('region', { name: 'Kale' })).toBeNull();
  });

  it('K4 FD-03 C43 HS-24 owner request: allergens complete, brand-dependent, single-food and in conflict', async () => {
    await show({ allergens: ['soy'] });
    search('firm tofu');
    expect(row('Firm tofu').textContent).toContain('Contains soy · Check the label for allergens');
    expect(row('Firm tofu').textContent).toContain('Has soy, which you listed');
    fireEvent.click(row('Firm tofu'));
    const tofu = screen.getByRole('region', { name: 'Firm tofu' }).textContent;
    expect(tofu).toContain('Contains soy. Other allergens depend on the brand: check the label.');
    expect(tofu).toContain('Has soy, which you listed to avoid.');
    cleanup();
    test?.db.shutDown();

    await show({ allergens: ['peanut'] });
    search('firm tofu');
    expect(row('Firm tofu').textContent).not.toContain('which you listed');
    fireEvent.click(row('Firm tofu'));
    expect(screen.getByRole('region', { name: 'Firm tofu' }).textContent).toContain(
      foods.detail.allergenUnknownForYou,
    );
    const oil = open('olive', 'Olive oil').textContent;
    expect(row('Olive oil').textContent).toContain(foods.screen.rowCheckLabel);
    expect(oil).toContain(foods.detail.allergensSingle);
    expect(oil).toContain(foods.detail.allergenUnknownForYou);
    search('silverbeet');
    expect(row('Silverbeet').textContent).not.toContain('Check the label');
    cleanup();
    test?.db.shutDown();

    await show({ allergens: ['gluten'] });
    const pasta = open('pasta', 'Pasta');
    expect(row('Pasta').textContent).toContain('Has wheat (gluten), which you listed');
    expect(pasta.textContent).toContain('Has wheat (gluten), which you listed to avoid.');
    cleanup();
    test?.db.shutDown();

    await show({ allergens: ['wheat'] });
    search('pasta');
    expect(row('Pasta').textContent).toContain('Has wheat, which you listed');
    expect(row('Pasta').textContent).not.toContain('(gluten)');
  });

  it('K8 C107 FL-07 HS-24: swaps never carry a listed allergen; gluten-free swaps only for a gluten-free household', async () => {
    const swapsOf = (panel: HTMLElement) =>
      within(panel).getByText(foods.detail.swaps).nextElementSibling?.textContent ?? '';
    await show({ allergens: ['peanut', 'fish'] });
    expect(swapsOf(open('tahini', 'Tahini'))).not.toContain('Peanut butter');
    expect(swapsOf(open('chicken breast', 'Chicken breast'))).not.toContain('White fish');
    expect(swapsOf(open('pasta', 'Pasta'))).toBe(foods.detail.swapsNoneShown);
    cleanup();
    test?.db.shutDown();

    await show({ allergens: ['gluten'] });
    expect(swapsOf(open('pasta', 'Pasta'))).toBe(foods.detail.swapsNoneShown);
    cleanup();
    test?.db.shutDown();

    await show({ glutenFreeHousehold: true });
    expect(swapsOf(open('pasta', 'Pasta'))).toBe(
      'White rice (check the label), Quinoa (check the label)',
    );
    expect(swapsOf(open('spring water', 'Tuna in spring water'))).toBe(
      'Tuna in oil (check the label), Pink salmon (canned) (check the label)',
    );
  });

  it('K9 HEALTH_SAFETY section 4 C97 X4: a badge only with a number, and a footer naming only an approved database', async () => {
    // Made-up figures on the synthetic example food only.
    const figures = {
      energyKj: 100,
      proteinG: 1,
      fatG: 1,
      saturatedFatG: 1,
      carbsG: 1,
      sugarsG: 1,
      fibreG: 0,
      sodiumMg: 1,
    };
    const correction = (
      source: 'label' | 'usda',
      unknownNutrients: 'fibreG'[],
    ): IngredientChange => ({
      field: 'nutrition',
      value: {
        nutrientsPer100g: figures,
        unknownNutrients,
        carbBasisAsEntered: 'available',
        nutrientBasis: 'raw',
        source,
        sourceCitation: source === 'usda' ? 'Example citation' : null,
      },
    });
    const label = correction('label', ['fibreG']);
    await show({ value: value(exampleFoodData()), overrides: { 'seed:example-green': [label] } });
    let panel = open('leafy', 'Example leafy green');
    expect(panel.textContent).toContain('Badge: Label');
    expect(within(panel).getByRole('row', { name: /^Fibre/ }).textContent).toBe('Fibrenot known');
    expect(panel.textContent).toContain(
      'The label figures entered for this food have no figure for fibre. Each missing figure shows as not known.',
    );
    expect(panel.textContent).toContain(foods.sourceOwn.label);
    expect(panel.textContent).toContain(foods.footer.noDatabase);
    cleanup();
    test?.db.shutDown();

    // A database correction from a restore while nothing is approved counts as Estimate.
    const usda = correction('usda', []);
    await show({ value: value(exampleFoodData()), overrides: { 'seed:example-green': [usda] } });
    panel = open('leafy', 'Example leafy green');
    expect(panel.textContent).toContain('Badge: Estimate');
    expect(panel.textContent).toContain(foods.footer.noDatabase);
    cleanup();
    test?.db.shutDown();

    await show({ value: value(exampleFoodData('usda'), ['usda']) });
    panel = open('leafy', 'Example leafy green');
    expect(panel.textContent).toContain('Badge: Database');
    expect(panel.textContent).toContain('From Example database: Example database food X1.');
    expect(panel.textContent).toContain('Database figures are averages from Example database.');
  });

  it("K5 C69 N17 N21: the screen's states, corrections and a release that cannot be read", async () => {
    // A release that fails its rules: every figure stays not known, with its own notice.
    const unreadable = loadFoodData(
      shipped().catalogue,
      exampleRelease('usda'),
      [],
      exampleAttribution,
    );
    if (unreadable.status !== 'ok') throw new Error('the catalogue should load');
    await show({
      value: value(unreadable),
      overrides: {
        'seed:spinach': [
          { field: 'packSizes', value: { packSizesG: [250], enteredAt: T } },
          { field: 'aisle', value: 'Health food' },
        ],
      },
    });
    const cards = screen
      .getAllByRole('region')
      .map((r) => within(r).getByRole('heading').textContent);
    expect(cards.slice(-2)).toEqual(['Frozen', 'Health food']);
    const spinach = open('spinach', 'Spinach').textContent;
    expect(spinach).toContain('Your sizes, entered 1 January 2000.');
    expect(spinach).toContain(foods.releaseUnreadable);
    cleanup();
    test?.db.shutDown();

    // A catalogue that cannot be read: the first card only, with Reload.
    test = await openTestDb();
    await onboardForTests(test);
    appStorageStore.set(test.storage);
    render(
      <FoodDataContext.Provider
        value={{ data: { status: 'error' }, approved: [], attributions: {} }}
      >
        <FoodsScreen />
      </FoodDataContext.Provider>,
    );
    expect(await screen.findByText(foods.screen.readFailed)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: privacy.backupCard.reload }));
    expect(test.storage.platform.reloads).toBe(1);
    expect(screen.queryByRole('searchbox')).toBeNull();
    cleanup();

    // No profile row: an error, never "no allergens".
    const failing = {
      ...test.storage,
      repos: {
        ...test.storage.repos,
        profile: { ...test.storage.repos.profile, get: () => Promise.reject(new Error('missing')) },
      },
    };
    appStorageStore.set(failing);
    render(<FoodsScreen />);
    expect(await screen.findByText(foods.screen.readFailed)).toBeDefined();
    cleanup();

    // Storage not open yet.
    appStorageStore.set(null);
    render(<FoodsScreen />);
    expect(screen.getByRole('status').textContent).toBe(privacy.backupCard.notReady);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
