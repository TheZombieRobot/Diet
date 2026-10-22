// The Food log and the summary for a GP on real records (item 23 design 5.4): FL-01 to FL-03,
// H23a, H23c, HS-32, HS-R18, C11, C100. The whole app over fake-indexeddb at the test clock (13:00
// on 1 March 2000 in Auckland); every figure is synthetic, and the shipped release has none.
import {
  type FoodLogRecord,
  type LabelFormInput,
  logDay,
  NUTRIENT_KEYS,
  type ReadinessQuestionId,
  seedRecipe,
  type YesNo,
} from '@diet/core';
import { alcohol, foodLog, foods, today } from '@diet/core/copy/health';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { appStorageStore } from '../../db/runtime';
import { onboardForTests, openTestDb, seedPlanDay, type TestDb } from '../../db/testKit';
import type * as files from '../../files';
import { downloadTypeFor, offerDownload } from '../../files';
import { foodLogHref, gpSummaryHref } from '../../routes';
import { screenTitleStore } from '../../screenTitle';
import { TotalsCard } from './EatenCard';
import type { LogContext } from './logContext';

// The browser's download is replaced, so the summary's buttons can run in jsdom.
vi.mock('../../files', async (importOriginal) => ({
  ...(await importOriginal<typeof files>()),
  offerDownload: vi.fn(),
}));

const copy = foodLog;
const TODAY = '2000-03-01';
const TRAYBAKE = 'seed:recipe-chicken-silverbeet-traybake';

let test: TestDb;
beforeEach(() => {
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  screenTitleStore.set(null);
  test.db.shutDown();
  window.location.hash = '';
  vi.mocked(offerDownload).mockClear();
});

async function open(
  hash = foodLogHref(),
  options: { readonly answers?: Partial<Record<ReadinessQuestionId, YesNo>> } = {},
  waitForCard: string = copy.add.label,
): Promise<void> {
  test = await openTestDb();
  await onboardForTests(test, { answers: options.answers ?? {} });
  appStorageStore.set(test.storage);
  window.location.hash = hash;
  render(<App />);
  await screen.findByRole('region', { name: waitForCard }, { timeout: 5000 });
}

const card = (name: string) => screen.getByRole('region', { name });
/** A figure in a NutrientTable, by its row's name. */
const figure = (table: HTMLElement, name: RegExp) =>
  within(table).getByRole('rowheader', { name }).nextElementSibling?.textContent;
const TRAYBAKE_TITLE = seedRecipe(TRAYBAKE)?.title ?? '';
const openRow = (title: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }));
};
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const type = (label: string, value: string) => {
  fireEvent.change(field(label), { target: { value } });
};
const choose = (legend: string, option: string) => {
  const group = screen.getByRole('radiogroup', { name: legend });
  fireEvent.click(within(group).getByRole('radio', { name: new RegExp(`^${option}`) }));
};
const logIt = () => {
  const panel = screen.getByRole('region', { name: copy.add.fromLabel });
  fireEvent.click(within(panel).getByRole('button', { name: copy.add.logIt }));
};

/** A synthetic raw chicken label per 100 g, fibre not on the label (design 2.3). */
function typeChickenLabel(): void {
  type(copy.label.name, 'Example chicken breast');
  choose(copy.label.describes, copy.label.describesOptions.raw);
  type('Energy, kJ per 100 g', '460');
  type('Protein, g per 100 g', '23');
  type('Fat, total, g per 100 g', '2');
  type('Saturated fat, g per 100 g', '0.6');
  type('Carbohydrate (as on an NZ/AU label), g per 100 g', '0');
  type('Sugars, g per 100 g', '0');
  fireEvent.click(screen.getByRole('checkbox', { name: copy.label.fibreNotOnLabel }));
  type('Sodium, mg per 100 g', '60');
}

describe('the Food log (item 23)', () => {
  it('K2 K4* FL-01 FL-03: a label food, empty to start, weighed after cooking with its weight before cooking', async () => {
    await open();
    openRow(copy.add.fromLabel);
    const protein = field('Protein, g per 100 g');
    expect(protein.value).toBe('');
    expect(protein.getAttribute('inputMode')).toBe('decimal');
    expect(protein.getAttribute('autoComplete')).toBe('off');
    // Every field names its measure: Per serve changes the labels.
    choose(copy.label.per, copy.label.perOptions.serve);
    expect(field('Protein, g per serve')).toBeDefined();
    choose(copy.label.per, copy.label.perOptions['100g']);
    typeChickenLabel();
    type(copy.amount.grams, '150');
    // Nothing is preselected for how it was weighed.
    const weighed = screen.getByRole('radiogroup', { name: copy.amount.weighed });
    expect(
      within(weighed)
        .getAllByRole('radio')
        .every((r) => !(r as HTMLInputElement).checked),
    ).toBe(true);
    logIt();
    expect(await screen.findByText(copy.amount.errors.weighedNeeded)).toBeDefined();
    choose(copy.amount.weighed, copy.amount.weighedOptions.cooked);
    logIt();
    expect(await screen.findByText(copy.amount.errors.beforeNeeded)).toBeDefined();
    // An extra zero in the weight before cooking asks for a tick.
    type(copy.amount.before, '1500');
    expect(screen.getByText(copy.amount.checkBefore)).toBeDefined();
    logIt();
    expect(await screen.findByText(copy.label.errors.confirmNeeded)).toBeDefined();
    expect(await test.repos.foodLog.list()).toEqual([]);
    type(copy.amount.before, '200');
    expect(screen.queryByText(copy.amount.checkBefore)).toBeNull();
    logIt();
    await waitFor(() => {
      expect(within(card(copy.add.label)).getByRole('status').textContent).toBe(
        'Logged Example chicken breast.',
      );
    });
    const [entry] = await test.repos.foodLog.list();
    expect(entry).toMatchObject({ grams: 150, weightBasis: 'cooked', confidence: 'label' });
    expect(entry?.nutrients.proteinG).toBeCloseTo(46, 9);
    const row = within(card(copy.entries.label)).getByRole('button', {
      name: /^Example chicken breast/,
    });
    expect(row.textContent).toContain('150 g cooked');
    expect(row.textContent).toContain(foods.badges.label);
    fireEvent.click(row);
    const table = within(card(copy.entries.label)).getByRole('table');
    // A known zero reads "0 g"; fibre, not on the label, reads "not known".
    expect(figure(table, /Net carbs/)).toBe('0 g');
    expect(figure(table, /fibre/i)).toBe(foods.figures.notKnown);
  });

  it('K3* H23c: a name from the food list fills only the name; every figure stays empty', async () => {
    await open();
    openRow(copy.add.fromLabel);
    type(copy.label.name, 'chicken');
    const pick = await screen.findByRole('button', { name: 'Chicken breast' });
    expect(screen.getByText(copy.label.figuresYours)).toBeDefined();
    fireEvent.click(pick);
    expect(field(copy.label.name).value).toBe('Chicken breast');
    for (const label of [
      'Energy, kJ per 100 g',
      'Protein, g per 100 g',
      'Fat, total, g per 100 g',
      'Sodium, mg per 100 g',
    ])
      expect(field(label).value).toBe('');
  });

  it('K16* HS-32: with answer 1 yes, a drink name is refused on the field, with no tick and no Drinks tab', async () => {
    await open(foodLogHref(), { answers: { q1: 'yes' } });
    openRow(copy.add.fromLabel);
    typeChickenLabel();
    type(copy.label.name, 'Example lager');
    type(copy.amount.grams, '330');
    choose(copy.amount.weighed, copy.amount.weighedOptions.raw);
    logIt();
    expect(await screen.findByText(copy.label.errors['alcohol-name'])).toBeDefined();
    expect(screen.queryByText(copy.label.confirmFood)).toBeNull();
    expect(document.querySelector('main')?.textContent).not.toMatch(/Drinks tab/);
    expect(await test.repos.foodLog.list()).toEqual([]);
  });

  it('K6 FL-02: a recipe with no figures logs with eight "not known", no tag, and a second time only on confirmation', async () => {
    await open();
    openRow(copy.add.fromRecipe);
    type(copy.recipe.search, 'traybake');
    fireEvent.click(await screen.findByRole('button', { name: TRAYBAKE_TITLE }));
    const panel = screen.getByRole('region', { name: copy.add.fromRecipe });
    const cells = within(panel)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(cells).toEqual(Array<string>(8).fill(foods.figures.notKnown));
    expect(cells.join(' ')).not.toMatch(/\d/);
    expect(within(panel).getByText(foods.totals.noneLoaded)).toBeDefined();
    expect(panel.querySelector('.ui-chip')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: copy.add.logIt }));
    await waitFor(async () => {
      expect(await test.repos.foodLog.list()).toHaveLength(1);
    });
    const [first] = await test.repos.foodLog.list();
    expect(first).toMatchObject({ refId: TRAYBAKE, unknownNutrients: [...NUTRIENT_KEYS] });
    // The entry has no badge and says it had no figures.
    const row = await within(card(copy.entries.label)).findByRole('button', {
      name: new RegExp(`^${TRAYBAKE_TITLE}`),
    });
    expect(row.querySelector('.ui-chip')).toBeNull();
    fireEvent.click(row);
    expect(within(card(copy.entries.label)).getByText(copy.entries.noFigures)).toBeDefined();
    expect(within(card(copy.totals.label)).getByText(copy.totals.noneKnown)).toBeDefined();
    // The same recipe again asks first.
    openRow(copy.add.fromRecipe);
    type(copy.recipe.search, 'traybake');
    fireEvent.click(await screen.findByRole('button', { name: TRAYBAKE_TITLE }));
    const again = screen.getByRole('region', { name: copy.add.fromRecipe });
    fireEvent.click(within(again).getByRole('button', { name: copy.add.logIt }));
    // The confirmation takes focus, and Cancel gives it back to Log it (review).
    const confirm = await within(again).findByRole('button', { name: copy.plan.logAgain });
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(within(again).getByRole('button', { name: copy.add.cancel }));
    expect(document.activeElement).toBe(
      within(again).getByRole('button', { name: copy.add.logIt }),
    );
    fireEvent.click(within(again).getByRole('button', { name: copy.add.logIt }));
    fireEvent.click(await within(again).findByRole('button', { name: copy.plan.logAgain }));
    await waitFor(async () => {
      expect(await test.repos.foodLog.list()).toHaveLength(2);
    });
  });

  it('K7: a planned meal logs with one tap today, as the plan row; Undo removes exactly it', async () => {
    test = await openTestDb();
    await onboardForTests(test, {});
    await seedPlanDay(test, {
      date: TODAY,
      dietMode: 'balanced',
      meals: [{ slot: 'dinner', recipeId: TRAYBAKE, myServes: 1, householdServes: 4 }],
      eatingWindow: null,
    });
    appStorageStore.set(test.storage);
    window.location.hash = foodLogHref();
    render(<App />);
    await screen.findByRole('region', { name: copy.add.label }, { timeout: 5000 });
    openRow(copy.add.fromPlan);
    const panel = screen.getByRole('region', { name: copy.add.fromPlan });
    fireEvent.click(within(panel).getByRole('button', { name: copy.add.logIt }));
    const status = within(card(copy.add.label)).getByRole('status');
    await waitFor(() => {
      expect(status.textContent).toMatch(/^Logged /);
    });
    expect(document.activeElement).toBe(status);
    expect(await test.repos.foodLog.list()).toMatchObject([
      { sourceKind: 'plan', refId: `${TODAY}#dinner`, servings: 1 },
    ]);
    // Undo is pressed, so it has focus when it goes away.
    const undo = within(card(copy.add.label)).getByRole('button', { name: copy.add.undo });
    undo.focus();
    fireEvent.click(undo);
    await waitFor(async () => {
      expect(await test.repos.foodLog.list()).toEqual([]);
    });
    // The Undo button is gone; focus stays on the line that says so (review).
    await waitFor(() => {
      expect(status.textContent).toMatch(/^Removed /);
    });
    expect(document.activeElement).toBe(status);
  });

  it('K9* HS-R18: an entry with every figure listed but lower bounds above 0 shows "at least", its badge, and no "no figures" line', async () => {
    test = await openTestDb();
    await onboardForTests(test, {});
    const row: Omit<FoodLogRecord, 'id'> = {
      at: '2000-02-29T22:00:00.000Z',
      timeZone: 'Pacific/Auckland',
      sourceKind: 'recipe',
      refId: TRAYBAKE,
      name: 'Example traybake',
      grams: null,
      weightBasis: null,
      servings: 1,
      nutrients: {
        ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])),
        proteinG: 30,
        energyKj: 900,
      } as FoodLogRecord['nutrients'],
      unknownNutrients: [...NUTRIENT_KEYS],
      confidence: 'estimate',
    };
    await test.repos.foodLog.create(row);
    appStorageStore.set(test.storage);
    window.location.hash = foodLogHref();
    render(<App />);
    const totals = await screen.findByRole(
      'region',
      { name: copy.totals.label },
      { timeout: 5000 },
    );
    expect(figure(totals, /Protein/)).toBe('at least 30 g');
    expect(figure(totals, /Sodium/)).toBe(foods.figures.notKnown);
    for (const td of within(totals).getAllByRole('cell'))
      expect(td.textContent).toMatch(new RegExp(`^(at least|${foods.figures.notKnown})`));
    expect(within(totals).queryByText(copy.totals.noneKnown)).toBeNull();
    const entry = within(card(copy.entries.label)).getByRole('button', {
      name: /^Example traybake/,
    });
    expect(entry.textContent).toContain(foods.badges.estimate);
    fireEvent.click(entry);
    expect(screen.queryByText(copy.entries.noFigures)).toBeNull();
  });

  it('K10: water for a past day: an amount at a time, removed again, and the electrolyte tick at noon that day', async () => {
    await open(foodLogHref('2000-02-28'), {}, copy.water.label);
    const water = card(copy.water.label);
    expect(within(water).getByText(copy.water.noneDay)).toBeDefined();
    fireEvent.change(within(water).getByLabelText(copy.water.amount), { target: { value: '400' } });
    fireEvent.click(within(water).getByRole('button', { name: copy.water.add }));
    await waitFor(() => {
      expect(within(water).getByLabelText(copy.water.time).getAttribute('aria-invalid')).toBe(
        'true',
      );
    });
    // Water is drunk, and the error does not repeat the hint (review).
    expect(within(water).getByText(copy.water.timeHintPast)).toBeDefined();
    expect(within(water).getByText(copy.amount.errors.timeRequired)).toBeDefined();
    expect(water.textContent).not.toMatch(/ate it/);
    fireEvent.change(within(water).getByLabelText(copy.water.time), { target: { value: '09:30' } });
    fireEvent.click(within(water).getByRole('button', { name: copy.water.add }));
    const remove = await within(water).findByRole('button', { name: 'Remove 400 mL at 9:30 am' });
    expect(await test.repos.water.list()).toMatchObject([
      { ml: 400, at: '2000-02-27T20:30:00.000Z', electrolyte: false },
    ]);
    fireEvent.click(within(water).getByRole('switch', { name: copy.water.electrolytesDay }));
    await waitFor(async () => {
      expect((await test.repos.water.list()).find((r) => r.ml === 0)).toMatchObject({
        electrolyte: true,
        at: '2000-02-27T23:00:00.000Z',
      });
    });
    fireEvent.click(remove);
    await waitFor(async () => {
      expect((await test.repos.water.list()).filter((r) => r.ml > 0)).toEqual([]);
    });
  });
});

describe('the Food log after its review (item 23)', () => {
  /** A synthetic raw chicken label per 100 g, fibre not on the label. */
  const CHICKEN: LabelFormInput = {
    name: 'Example chicken breast',
    describes: 'raw',
    per: '100g',
    servingSizeG: '',
    energy: '460',
    energyUnit: 'kJ',
    proteinG: '23',
    fatG: '2',
    saturatedFatG: '0.6',
    carbsG: '0',
    overseas: false,
    sugarsG: '0',
    fibreG: '',
    fibreNotOnLabel: true,
    sodiumMg: '60',
    packSizeG: '',
    confirmed: [],
  };
  const raw200 = { by: 'grams', grams: 200, weighed: 'raw', gramsInLabelState: null } as const;
  async function openWith(seed: (t: TestDb) => Promise<unknown>, hash = foodLogHref()) {
    test = await openTestDb();
    await onboardForTests(test, {});
    await seed(test);
    appStorageStore.set(test.storage);
    window.location.hash = hash;
    render(<App />);
    await screen.findByRole('region', { name: copy.add.label }, { timeout: 5000 });
  }

  it('HS-32 HS-40: once alcohol logging is off, a drink-named label food stored before is not offered', async () => {
    await openWith(async (t) => {
      await t.repos.foodLog.logNewLabelFood({
        form: {
          ...CHICKEN,
          name: 'Example lager',
          describes: 'as-sold',
          confirmed: ['sounds-like-alcohol'],
        },
        amount: { by: 'grams', grams: 330, weighed: 'as-sold', gramsInLabelState: null },
      });
      await t.repos.foodLog.logNewLabelFood({ form: CHICKEN, amount: raw200 });
      await t.repos.readiness.answer('q1', 'yes');
    });
    openRow(copy.add.again);
    const panel = screen.getByRole('region', { name: copy.add.again });
    expect(within(panel).getByRole('button', { name: 'Example chicken breast' })).toBeDefined();
    expect(within(panel).queryByRole('button', { name: 'Example lager' })).toBeNull();
  });

  it('design 1.4: a changed amount gets the amount checks of a new entry; removing the last entry focuses the empty line', async () => {
    await openWith((t) => t.repos.foodLog.logNewLabelFood({ form: CHICKEN, amount: raw200 }));
    const eaten = card(copy.entries.label);
    fireEvent.click(within(eaten).getByRole('button', { name: /^Example chicken breast/ }));
    fireEvent.click(within(eaten).getByRole('button', { name: copy.entries.change }));
    type(copy.amount.grams, '4000');
    const changeButton = () =>
      within(eaten).getAllByRole('button', { name: copy.entries.change }).at(-1) as HTMLElement;
    fireEvent.click(changeButton());
    expect(await within(eaten).findByText(copy.label.errors.confirmNeeded)).toBeDefined();
    expect(within(eaten).getByText(copy.amount.checkLarge)).toBeDefined();
    expect((await test.repos.foodLog.list())[0]?.grams).toBe(200);
    fireEvent.click(within(eaten).getByRole('checkbox', { name: copy.amount.confirmAmount }));
    fireEvent.click(changeButton());
    await waitFor(async () => {
      expect((await test.repos.foodLog.list())[0]?.grams).toBe(4000);
    });
    // Remove the only entry: focus goes to the line saying the day is empty (review).
    fireEvent.click(within(eaten).getByRole('button', { name: /^Example chicken breast/ }));
    fireEvent.click(within(eaten).getByRole('button', { name: copy.entries.remove }));
    fireEvent.click(within(eaten).getByRole('button', { name: copy.entries.removeYes }));
    const empty = await within(eaten).findByText(copy.entries.noneToday);
    await waitFor(() => {
      expect(document.activeElement).toBe(empty);
    });
  });

  it('C11 HS-37: Day totals says the alcohol energy is at least the known part when a drink’s is not known', () => {
    const drink = { count: 1, beverage: { volumeMl: 330, abvPercent: 5 } };
    const day = logDay(
      [],
      [
        { ...drink, kcalPerServe: 100 },
        { ...drink, kcalPerServe: null },
      ],
      TODAY,
      'Pacific/Auckland',
    );
    const entry: FoodLogRecord = {
      id: '00000000-0000-4000-8000-000000000001',
      at: '2000-02-29T22:00:00.000Z',
      timeZone: 'Pacific/Auckland',
      sourceKind: 'label',
      refId: '00000000-0000-4000-8000-000000000002',
      name: 'Example yoghurt',
      grams: 150,
      weightBasis: 'as-sold',
      servings: null,
      nutrients: {
        ...Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 1])),
        energyKj: 400,
      } as FoodLogRecord['nutrients'],
      unknownNutrients: [],
      confidence: 'label',
    };
    render(
      <TotalsCard
        ctx={{ approved: [] } as unknown as LogContext}
        day={{ ...day, entries: [entry] }}
        alcoholShown
      />,
    );
    const lines = [...document.querySelectorAll('[data-part=alcohol]')].map((p) => p.textContent);
    expect(lines).toEqual([
      'Alcohol: at least 418 kJ',
      alcohol.dayEnergy.unknownOne,
      copy.totals.alcoholApart,
    ]);
  });

  it('a past day: a planned meal’s time field takes focus with one hint; steps show no save time', async () => {
    const past = '2000-02-29';
    await openWith(
      (t) =>
        seedPlanDay(t, {
          date: past,
          dietMode: 'balanced',
          meals: [{ slot: 'dinner', recipeId: TRAYBAKE, myServes: 1, householdServes: 4 }],
          eatingWindow: null,
        }),
      foodLogHref(past),
    );
    openRow(copy.add.fromPlan);
    const panel = screen.getByRole('region', { name: copy.add.fromPlan });
    fireEvent.click(within(panel).getByRole('button', { name: copy.add.logIt }));
    const time = await within(panel).findByLabelText(copy.amount.time);
    expect(document.activeElement).toBe(time);
    fireEvent.click(within(panel).getByRole('button', { name: copy.add.logIt }));
    await within(panel).findByText(copy.amount.errors.timeRequired);
    expect(within(panel).getAllByText(/ate it/)).toEqual([
      within(panel).getByText(copy.plan.pastDayTime),
    ]);
    const steps = screen.getByRole('region', { name: today.cards.steps });
    fireEvent.click(within(steps).getByRole('button', { name: copy.steps.enter }));
    fireEvent.change(within(steps).getByLabelText(copy.steps.field), {
      target: { value: '6400' },
    });
    fireEvent.click(within(steps).getByRole('button', { name: today.steps.save }));
    await within(steps).findByText('6,400');
    expect(steps.textContent).not.toMatch(/saved at/);
  });
});

describe('the summary for a GP (item 23; C100, H23a)', () => {
  it('K14: shows "not known" for the share with an incomplete day, and offers a text and a CSV file, nothing else', async () => {
    test = await openTestDb();
    await onboardForTests(test, {});
    const base = {
      timeZone: 'Pacific/Auckland',
      grams: null,
      weightBasis: null,
      servings: 1,
      name: 'Example traybake',
    } as const;
    await test.repos.foodLog.create({
      ...base,
      at: '2000-02-27T23:30:00.000Z',
      sourceKind: 'recipe',
      refId: TRAYBAKE,
      nutrients: Object.fromEntries(
        NUTRIENT_KEYS.map((k) => [k, 0]),
      ) as unknown as FoodLogRecord['nutrients'],
      unknownNutrients: [...NUTRIENT_KEYS],
      confidence: 'estimate',
    });
    appStorageStore.set(test.storage);
    window.location.hash = gpSummaryHref(56);
    render(<App />);
    const summary = await screen.findByRole(
      'region',
      { name: copy.gp.summaryLabel },
      { timeout: 5000 },
    );
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: copy.gp.rangeOptions['56'] }).checked,
    ).toBe(true);
    expect(summary.textContent).toContain(copy.gp.shareNotKnownWhy);
    expect(summary.textContent).toContain(copy.gp.mixNotKnown);
    expect(summary.textContent).not.toMatch(/\bkg\b|standard drink/i);
    fireEvent.click(within(summary).getByRole('button', { name: copy.gp.saveText }));
    fireEvent.click(within(summary).getByRole('button', { name: copy.gp.saveCsv }));
    expect(vi.mocked(offerDownload).mock.calls.map((c) => [c[1], downloadTypeFor(c[1])])).toEqual([
      ['diet-gp-summary-2000-03-01.txt', 'text/plain;charset=utf-8'],
      ['diet-gp-summary-2000-03-01.csv', 'text/csv;charset=utf-8'],
    ]);
    expect(String(vi.mocked(offerDownload).mock.calls[0]?.[0])).toContain(
      'Saturated fat, share of food energy: not known',
    );
    expect(within(summary).getByRole('status').textContent).toContain(
      'diet-gp-summary-2000-03-01.csv',
    );
  });
});
