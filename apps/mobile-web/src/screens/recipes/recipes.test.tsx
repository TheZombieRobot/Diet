// The recipe screens in the whole app (item 20 design 8.3, K1 to K10): the real repositories on
// fake-indexeddb and the shipped dataset and catalogue. Figures are synthetic owner corrections
// (no food data is loaded before checklist item 10), and every profile is synthetic.
import {
  type IngredientChange,
  type ReadinessConfirmationId,
  type ReadinessQuestionId,
  recipeData,
  type SeedRecipe,
  type UserAllergen,
} from '@diet/core';
import { foods, readiness, recipes, privacy } from '@diet/core/copy/health';
import { overrideFiguresFor, SYNTHETIC_PER_100G } from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { StorageFullError, StorageRuleError } from '../../db/errors';
import { appStorageStore } from '../../db/runtime';
import { onboardForTests, openTestDb, type TestDb } from '../../db/testKit';
import { recipeHref, routeHref } from '../../routes';
import { screenTitleStore } from '../../screenTitle';
import { swapStatusStore } from './status';

const seed = (slug: string): SeedRecipe => {
  const result = recipeData();
  const found =
    result.status === 'ok'
      ? result.data.recipes.find((r) => r.id === `seed:recipe-${slug}`)
      : undefined;
  if (found === undefined) throw new Error(slug);
  return found;
};
const TRAYBAKE = seed('chicken-silverbeet-traybake');
const FRITTATA = seed('silverbeet-feta-frittata');
const PATTIES = seed('salmon-silverbeet-patties');
/** A dataset line as a stored line (no swaps, no leftover mark). */
const stored = (l: SeedRecipe['lines'][number]) => ({
  ingredientId: l.ingredientId,
  rawG: l.rawG,
  cookedG: l.cookedG,
  displayAs: l.displayAs,
});
const ids = (r: SeedRecipe, ...more: string[]) => [...r.lines.map((l) => l.ingredientId), ...more];

interface Setup {
  readonly answers?: Partial<Record<ReadinessQuestionId, 'yes' | 'no'>>;
  readonly confirmations?: readonly ReadinessConfirmationId[];
  readonly allergens?: UserAllergen[];
  readonly glutenFreeHousehold?: boolean;
  /** Seeds given complete synthetic figures by an owner correction. */
  readonly figuresFor?: readonly string[];
  readonly changes?: Readonly<Record<string, IngredientChange[]>>;
}

let test: TestDb;
beforeEach(() => {
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
  // jsdom draws nothing, so it has no scrolling ("Scale servings" scrolls to the stepper).
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  swapStatusStore.set(null);
  screenTitleStore.set(null);
  test.db.shutDown();
  window.location.hash = '';
});

async function setup(options: Setup = {}): Promise<TestDb> {
  test = await openTestDb();
  await onboardForTests(test, {
    answers: options.answers ?? {},
    confirmations: options.confirmations ?? [],
    profile: {
      allergens: options.allergens ?? [],
      glutenFreeHousehold: options.glutenFreeHousehold ?? false,
    },
  });
  for (const { seedId, changes } of overrideFiguresFor([...new Set(options.figuresFor ?? [])]))
    await test.repos.ingredientOverrides.create({ seedId, changes });
  for (const [seedId, changes] of Object.entries(options.changes ?? {}))
    await test.repos.ingredientOverrides.create({ seedId, changes });
  return test;
}

/** The whole app at `hash`, waiting for the screen's first card. */
async function open(hash: string, waitFor: string): Promise<void> {
  appStorageStore.set(test.storage);
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('region', { name: waitFor }, { timeout: 5000 });
}
const openList = (options: Setup = {}) =>
  setup(options).then(() => open(routeHref('recipes'), recipes.list.sections.week));
const openPage = (recipe: { readonly id: string }, options: Setup = {}, suffix = '') =>
  setup(options).then(() => open(`${recipeHref(recipe.id)}${suffix}`, recipes.detail.atAGlance));

const region = (name: string) => screen.getByRole('region', { name });
const heading = () => screen.getByRole('heading', { level: 1 });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const lineOf = (name: string) =>
  within(region(recipes.ingredients.label))
    .getAllByRole('listitem')
    .find((li) => li.querySelector('.ui-line__name')?.textContent === name) ?? null;
const STYLE_CHIPS: readonly string[] = [
  ...Object.values(recipes.chips.style),
  ...Object.values(recipes.chips.styleWritten),
  recipes.chips.carbsNotWorkedOut,
];
const chips = () => [...document.querySelectorAll('.ui-chip')].map((c) => c.textContent);

describe('the recipe list (item 20)', () => {
  it('K1: the silverbeet week in day order, then dinners, snacks and breakfast and lunch; a copy takes its seed’s place', async () => {
    await setup();
    await test.repos.recipes.create({
      title: 'My frittata',
      serves: 4,
      timeMinutes: 35,
      lines: FRITTATA.lines.map(stored),
      method: [...FRITTATA.method],
      tags: [],
      allergens: [],
      derivedFromRecipeId: FRITTATA.id,
      nutritionPerServe: { ...SYNTHETIC_PER_100G },
      unknownNutrients: ['fibreG'],
      confidence: 'estimate',
      sourceMix: { label: 0, 'nz-fcdb': 0, usda: 0, estimate: FRITTATA.lines.length },
    });
    await open(routeHref('recipes'), recipes.list.sections.week);
    const labels = [...document.querySelectorAll('.ui-card__label')].map((h) => h.textContent);
    expect(labels).toEqual(['Silverbeet week', 'Dinners', 'Snacks', 'Breakfast and lunch']);
    const week = region(recipes.list.sections.week);
    expect(
      within(week)
        .getAllByRole('link')
        .map((a) => a.querySelector('.ui-link-row__overline')?.textContent),
    ).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7']);
    expect(within(week).getByText(recipes.list.weekHint)).toBeDefined();
    expect(within(week).getByText(recipes.list.weekMedicines)).toBeDefined();
    const day3 = within(week).getAllByRole('link')[2];
    expect(day3?.textContent).toContain('My frittata');
    expect(day3?.textContent).toContain(recipes.chips.yourVersion);
    expect(screen.queryByText(FRITTATA.title)).toBeNull();
  });

  it('K1: a records read that fails says so, with Reload', async () => {
    await setup();
    vi.spyOn(test.storage.repos.recipes, 'context').mockRejectedValue(new Error('unreadable'));
    appStorageStore.set(test.storage);
    window.location.hash = routeHref('recipes');
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain(recipes.list.readFailed);
    expect(button(privacy.backupCard.reload)).toBeDefined();
  });

  it('K2 P13 HS-32: with answer 5 yes, no carb chip anywhere and the reason is named; heart chips stay', async () => {
    await openList({ answers: { q5: 'yes' }, figuresFor: ids(TRAYBAKE) });
    expect(chips().filter((c) => STYLE_CHIPS.includes(c))).toEqual([]);
    expect(document.body.textContent).toContain(
      `Keto labels are not shown because of what you told the app about ${readiness.reasonPhrases['eating-disorder-or-low-weight']}.`,
    );
    expect(screen.getByRole('link', { name: readiness.settingsRow.title })).toBeDefined();
    const traybake = screen.getByRole('link', { name: new RegExp(TRAYBAKE.title) });
    expect(traybake.textContent).toContain(recipes.chips.heartSmart);
  });

  it('K2 HS-33: with answer 3 yes and no prescriber confirmation, the carb chips show with the prescriber notice', async () => {
    await openList({ answers: { q3: 'yes' } });
    expect(chips()).toContain(recipes.chips.styleWritten.keto);
    expect(screen.getByText(recipes.labels.prescriberCheck)).toBeDefined();
    expect(screen.getByText(readiness.confirmationHints.prescriberAgreed)).toBeDefined();
  });

  it('K5 P41 P15: "Check labels for allergens" only for an owner who lists one; a gluten-free household sees gluten cereals', async () => {
    await openList({ allergens: ['peanut'], glutenFreeHousehold: true });
    const cups = screen.getByRole('link', { name: /Ginger beef mince lettuce cups/ });
    expect(cups.textContent).toContain(recipes.chips.checkLabels);
    expect(cups.textContent).toContain(recipes.chips.glutenHousehold);
    cleanup();
    test.db.shutDown();
    await openList();
    expect(chips()).not.toContain(recipes.chips.checkLabels);
  });

  it('K8: Food links to the recipes with their count; the rest of Food is still to come', async () => {
    await setup();
    await open(routeHref('food'), recipes.foodLink.cardLabel);
    const link = within(region(recipes.foodLink.cardLabel)).getByRole('link');
    expect(link.textContent).toContain('30 recipes, with a silverbeet week');
    expect(link.getAttribute('href')).toBe('#/recipes');
    expect(
      screen.getByText('More of this screen arrives at a later step of the build checklist.'),
    ).toBeDefined();
  });
});

describe('a recipe’s page (item 20)', () => {
  it('K3 NU-10 HS-37 HS-39 NU-09: with no figures loaded, "not known" everywhere, no badge, no heart line, "Written for keto"', async () => {
    await openPage(TRAYBAKE);
    const card = region(recipes.nutrition.label);
    const cells = within(card).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual(Array<string>(8).fill(foods.figures.notKnown));
    expect(within(card).getByText(foods.totals.noneLoaded)).toBeDefined();
    expect(card.querySelector('.ui-chip')).toBeNull();
    expect(card.textContent).not.toContain('Heart-smart');
    expect(within(card).getByTestId('recipe-footer').textContent).toBe(foods.footer.noDatabase);
    expect(chips()).toContain(recipes.chips.styleWritten.keto);
    expect(chips().filter((c) => Object.values(recipes.chips.style).includes(c as never))).toEqual(
      [],
    );
    expect(screen.getByTestId('recipe-carb-style').textContent).toBe(
      'Written for keto. Its carbs are not worked out yet.',
    );
    const substitute = button(recipes.actions.substitute);
    expect(substitute.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(substitute.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe(recipes.swap.blockedFigures);
    for (const name of [recipes.actions.addToPlan, recipes.actions.logAsEaten]) {
      const later = button(new RegExp(`^${name}`));
      expect(later.getAttribute('aria-disabled')).toBe('true');
      expect(later.textContent).toContain(recipes.actions.later);
      fireEvent.click(later);
    }
    fireEvent.click(substitute);
    expect(screen.queryByText(recipes.swap.whichLegend)).toBeNull();
    expect(await test.repos.recipes.list()).toEqual([]);
  });

  it('K4 HS-23 NU-02: with figures, one serve’s rows and the Estimate badge; cooking for 8 changes amounts only', async () => {
    await openPage(FRITTATA, { figuresFor: ids(FRITTATA) });
    const card = region(recipes.nutrition.label);
    const before = within(card)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(before.some((t) => /\d/.test(t))).toBe(true);
    expect(within(card).getByText(foods.badges.estimate)).toBeDefined();
    expect(within(card).getByTestId('recipe-heart').textContent).toContain('a serve');
    expect(within(card).getByText(recipes.heart.capReference)).toBeDefined();
    fireEvent.click(button(recipes.ingredients.more));
    fireEvent.click(button(recipes.ingredients.more));
    fireEvent.click(button(recipes.ingredients.more));
    fireEvent.click(button(recipes.ingredients.more));
    const eggs = lineOf('Eggs');
    expect(eggs?.textContent).toContain('800 g');
    expect(eggs?.textContent).toContain('As written for 4 serves: 8 eggs');
    expect(eggs?.textContent).toContain('About 16 eggs');
    expect(
      within(card)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(before);
    fireEvent.click(screen.getByRole('switch', { name: recipes.nutrition.per100Switch }));
    expect(within(card).getByText(recipes.nutrition.caption100)).toBeDefined();
  });

  it('K4 HS-23: opened from a plan day with ?my=2, the planned portion is twice one serve; a pinch reads "under 1 g"', async () => {
    const muffins = seed('snack-silverbeet-egg-muffins');
    await openPage(muffins, { figuresFor: ids(muffins) }, '?my=2');
    const card = region(recipes.nutrition.label);
    const tables = within(card).getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(within(card).getByTestId('recipe-heart').textContent).toContain('your portion');
    const energy = (t: HTMLElement) => within(t).getAllByRole('cell')[0]?.textContent ?? '';
    const one = Number(energy(tables[0] as HTMLElement).replace(/\D/g, ''));
    const two = Number(energy(tables[1] as HTMLElement).replace(/\D/g, ''));
    expect(Math.abs(two - 2 * one)).toBeLessThanOrEqual(1);
    for (let i = 0; i < 5; i++) fireEvent.click(button(recipes.ingredients.fewer));
    expect(lineOf('Black pepper')?.textContent).toContain(recipes.ingredients.underOneGram);
  });

  it('K5 HS-24 P30 P41: a listed allergen leads the page; allergens not fully known are never shown as free of one', async () => {
    await openPage(FRITTATA, { allergens: ['egg'] });
    const glance = region(recipes.detail.atAGlance);
    expect(within(glance).getByRole('alert').textContent).toBe(
      'This recipe contains egg, which you listed as allergens to avoid.',
    );
    expect(lineOf('Eggs')?.textContent).toContain('Has egg, which you listed');
    cleanup();
    test.db.shutDown();
    await openPage(FRITTATA, { allergens: ['peanut'] });
    const card = region(recipes.allergens.label);
    expect(card.textContent).toContain(
      'Its allergens are not fully known, so it is never shown as free of peanuts.',
    );
    expect(lineOf('Olive oil')?.textContent).toContain(foods.screen.rowCheckLabel);
    expect(lineOf('Black pepper')?.textContent).toContain(foods.screen.rowCheckLabel);
    expect(lineOf('Silverbeet')?.textContent).not.toContain(foods.screen.rowCheckLabel);
    cleanup();
    test.db.shutDown();
    await openPage(FRITTATA);
    expect(region(recipes.allergens.label).textContent).toContain(recipes.allergens.checkLabels);
    expect(document.body.textContent).not.toContain(foods.screen.rowCheckLabel);
  });

  it('K5 HS-24: an owner copy that lost its almonds still lists tree nuts, from the recipe it was made from', async () => {
    await setup();
    const lines = PATTIES.lines.filter((l) => l.ingredientId !== 'seed:almond-meal').map(stored);
    const copy = await test.repos.recipes.create({
      title: 'My patties',
      serves: 4,
      timeMinutes: 30,
      lines,
      method: [...PATTIES.method],
      tags: [],
      allergens: [],
      derivedFromRecipeId: PATTIES.id,
      nutritionPerServe: { ...SYNTHETIC_PER_100G },
      unknownNutrients: ['fibreG'],
      confidence: 'estimate',
      sourceMix: { label: 0, 'nz-fcdb': 0, usda: 0, estimate: lines.length },
    });
    await open(recipeHref(copy.id), recipes.detail.atAGlance);
    expect(region(recipes.allergens.label).textContent).toContain(
      'Listed because the recipe this was made from contains tree nuts.',
    );
  });

  it('K7: the dish name is the heading and the tab title; a leftovers link moves focus to the new heading; not found reads "Recipe"', async () => {
    const soup = seed('silverbeet-lemon-chicken-soup');
    await openPage(soup);
    expect(heading().textContent).toBe(soup.title);
    expect(document.title).toContain(soup.title);
    fireEvent.click(screen.getByRole('link', { name: TRAYBAKE.title }));
    await waitFor(() => {
      expect(heading().textContent).toBe(TRAYBAKE.title);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(heading());
    });
    act(() => {
      window.location.hash = recipeHref('seed:recipe-not-in-the-dataset');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByText(recipes.detail.notFound)).toBeDefined();
    expect(heading().textContent).toBe('Recipe');
  });

  it('K10 P40 P26 C102: answer 2 shows the pregnancy note; answer 4 puts the salt line on soy sauce only', async () => {
    const stirFry = seed('tofu-mushroom-silverbeet-stir-fry');
    await openPage(stirFry, { answers: { q2: 'yes', q4: 'yes' } });
    expect(screen.getByText(recipes.detail.pregnancyNote)).toBeDefined();
    expect(lineOf('Soy sauce')?.textContent).toContain(recipes.ingredients.addsSalt);
    expect(lineOf('Soy sauce')?.textContent).toContain(readiness.bloodPressure.electrolyte);
    expect(lineOf('Firm tofu')?.textContent).not.toContain(recipes.ingredients.addsSalt);
    cleanup();
    test.db.shutDown();
    await openPage(stirFry);
    expect(screen.queryByText(recipes.detail.pregnancyNote)).toBeNull();
    expect(document.body.textContent).not.toContain(recipes.ingredients.addsSalt);
  });
});

describe('substitute ingredient (item 20)', () => {
  const openPanel = async (line: string) => {
    fireEvent.click(button(recipes.actions.substitute));
    fireEvent.click(await screen.findByRole('radio', { name: new RegExp(`^${line}`) }));
  };

  it('K6 C107 HS-24: a swap carrying a listed allergen is not offered; a brand-dependent one says check the label', async () => {
    await openPage(TRAYBAKE, { allergens: ['soy'], figuresFor: ids(TRAYBAKE, 'seed:firm-tofu') });
    await openPanel('Chicken thigh');
    expect(screen.queryByRole('radio', { name: /^Firm tofu/ })).toBeNull();
    expect(screen.getByText(recipes.swap.hiddenAllergenOne)).toBeDefined();
    cleanup();
    test.db.shutDown();
    await openPage(PATTIES, { allergens: ['fish'], figuresFor: ids(PATTIES) });
    await openPanel('Pink salmon');
    expect(screen.queryByRole('radio', { name: /^Tuna/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^Sardines/ })).toBeNull();
    cleanup();
    test.db.shutDown();
    await openPage(TRAYBAKE, { figuresFor: ids(TRAYBAKE, 'seed:firm-tofu') });
    await openPanel('Chicken thigh');
    expect(
      screen.getByRole('radio', { name: /^Firm tofu/ }).closest('label')?.textContent,
    ).toContain('Contains soy · Check the label for allergens');
  });

  it('K6 K9: Use saves a copy and opens it with Undo; Undo goes back to the original', async () => {
    await openPage(TRAYBAKE, { figuresFor: ids(TRAYBAKE, 'seed:chicken-breast') });
    await openPanel('Chicken thigh');
    fireEvent.click(screen.getByRole('radio', { name: /^Chicken breast/ }));
    fireEvent.click(button('Use Chicken breast'));
    expect(await screen.findByText(/^Swapped Chicken thigh for Chicken breast\./)).toBeDefined();
    const [copy] = await test.repos.recipes.list();
    expect(copy?.derivedFromRecipeId).toBe(TRAYBAKE.id);
    expect(window.location.hash).toBe(recipeHref(copy?.id ?? ''));
    await screen.findByText(recipes.chips.yourVersion);
    fireEvent.click(button(recipes.swap.undo));
    expect(await screen.findByText(recipes.swap.undone)).toBeDefined();
    expect(await test.repos.recipes.list()).toEqual([]);
    // Any press on the page clears the status.
    fireEvent.click(button(recipes.actions.scale));
    expect(screen.queryByText(recipes.swap.undone)).toBeNull();
  });

  it('K6: each refusal says why and changes nothing', async () => {
    await openPage(TRAYBAKE, { figuresFor: ids(TRAYBAKE, 'seed:chicken-breast') });
    const cases: [Error, string][] = [
      [new StorageRuleError('recipes', 'recipe-figures-unknown'), recipes.swap.blockedFigures],
      [new StorageRuleError('recipes', 'recipe-swap-not-allowed'), recipes.swap.notAllowed],
      [new StorageFullError(), privacy.storageFull],
      [new Error('other'), recipes.swap.failed],
    ];
    await openPanel('Chicken thigh');
    fireEvent.click(screen.getByRole('radio', { name: /^Chicken breast/ }));
    for (const [error, message] of cases) {
      vi.spyOn(test.storage.repos.recipes, 'swapLine').mockRejectedValue(error);
      fireEvent.click(button('Use Chicken breast'));
      expect((await screen.findByRole('alert')).textContent).toBe(message);
    }
    expect(await test.repos.recipes.list()).toEqual([]);
  });

  it('K9: with the records closed, the writes are off but Cooking for still works', async () => {
    await openPage(TRAYBAKE, { figuresFor: ids(TRAYBAKE) });
    act(() => {
      test.db.gate.close();
    });
    expect(await screen.findByText(privacy.backupCard.closed)).toBeDefined();
    expect(button(recipes.actions.substitute).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button(recipes.ingredients.more));
    expect(lineOf('Chicken thigh')?.textContent).toContain('1,000 g');
  });
});
