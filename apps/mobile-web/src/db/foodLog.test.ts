// @vitest-environment node
// The food log repository on real records (item 23 design 5.3): FL-01 to FL-03, NN-04, C67, C43,
// HS-23, HS-32, HS-R23 and schema version 2. Real Dexie over fake-indexeddb; every figure is
// synthetic. The shipped release has no figures, so a recipe is logged with all eight unknown
// unless an owner correction gives its lines synthetic ones.
import {
  type LabelAmount,
  type LabelFormInput,
  NUTRIENT_KEYS,
  type ReadinessQuestionId,
  seedRecipe,
  type YesNo,
} from '@diet/core';
import { overrideFiguresFor } from '@diet/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { readFastingInputs } from '../screens/fasting/inputs';
import { mealSourcesFrom } from '../screens/fasting/mealSources';
import { StorageRuleError } from './errors';
import { onboardForTests, openTestDb, seedPlanDay, type TestDb } from './testKit';

let test: TestDb | undefined;
afterEach(() => {
  test?.db.shutDown();
  test = undefined;
});

/** 13:00 on 1 March 2000 in Auckland (the test clock). */
const TODAY = '2000-03-01';
const TRAYBAKE = 'seed:recipe-chicken-silverbeet-traybake';

async function open(
  options: {
    readonly answers?: Partial<Record<ReadinessQuestionId, YesNo>>;
    readonly birthYear?: number;
  } = {},
): Promise<TestDb> {
  test = await openTestDb();
  await onboardForTests(test, {
    ...(options.answers === undefined ? {} : { answers: options.answers }),
    profile: { birthYear: options.birthYear ?? 1970 },
  });
  return test;
}

/** Why a write was refused: the rule and its reason, or 'written'. */
const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => 'written',
    (error: unknown) =>
      error instanceof StorageRuleError
        ? `${error.rule}${error.reason === null ? '' : `:${error.reason}`}`
        : String(error),
  );

/** A synthetic raw chicken label per 100 g, fibre not on the label (design 2.3). */
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
  packSizeG: '500',
  confirmed: [],
};
const raw200: LabelAmount = { by: 'grams', grams: 200, weighed: 'raw', gramsInLabelState: null };
const cooked150: LabelAmount = {
  by: 'grams',
  grams: 150,
  weighed: 'cooked',
  gramsInLabelState: 200,
};

describe('the food log repository (item 23)', () => {
  it('D1 FL-01 C43: a new label food and its entry are stored together, or neither', async () => {
    const t = await open();
    const { food, entry } = await t.repos.foodLog.logNewLabelFood({
      form: CHICKEN,
      amount: raw200,
    });
    expect(food).toMatchObject({
      source: 'label',
      allergens: null,
      aisle: 'Other',
      packSizesG: [500],
      packSizeSource: 'owner',
      unknownNutrients: ['fibreG'],
    });
    expect(entry).toMatchObject({ sourceKind: 'label', refId: food.id, confidence: 'label' });
    const before = await t.repos.ingredients.list();
    expect(
      await refusal(
        t.repos.foodLog.logNewLabelFood({
          form: { ...CHICKEN, name: 'Example fish' },
          amount: { ...raw200, grams: 6000 },
        }),
      ),
    ).toBe('entry-refused:amount-range');
    expect(await t.repos.ingredients.list()).toEqual(before);
    expect(await t.repos.foodLog.list()).toEqual([entry]);
  });

  it('D2* D3* FL-03 NN-04: raw and cooked weights stay as weighed; another state is refused', async () => {
    const t = await open();
    const { food } = await t.repos.foodLog.logNewLabelFood({ form: CHICKEN, amount: raw200 });
    const b = await t.repos.foodLog.logLabel({ foodId: food.id, amount: cooked150 });
    const rows = await t.repos.foodLog.list();
    expect(rows.map((r) => [r.grams, r.weightBasis])).toEqual([
      [200, 'raw'],
      [150, 'cooked'],
    ]);
    expect(rows[0]?.nutrients.proteinG).toBeCloseTo(46, 9);
    expect(rows[1]?.nutrients.proteinG).toBeCloseTo(46, 9);
    // A time change keeps the weight and its state.
    const moved = await t.repos.foodLog.changeEntry(b.id, { at: '2000-02-29T20:00:00.000Z' });
    expect(moved).toMatchObject({ grams: 150, weightBasis: 'cooked' });
    // A cooked label weighed raw is refused by the repository itself.
    const roast = await t.repos.foodLog.logNewLabelFood({
      form: { ...CHICKEN, name: 'Example roast chicken', describes: 'cooked', packSizeG: '' },
      amount: { by: 'grams', grams: 100, weighed: 'cooked', gramsInLabelState: null },
    });
    const count = (await t.repos.foodLog.list()).length;
    expect(
      await refusal(
        t.repos.foodLog.logLabel({
          foodId: roast.food.id,
          amount: { by: 'grams', grams: 150, weighed: 'raw', gramsInLabelState: 200 },
        }),
      ),
    ).toBe('entry-refused:weighed-not-offered');
    expect(await t.repos.foodLog.list()).toHaveLength(count);
  });

  it('D4 FL-02: a recipe whose ingredients have no figures is stored with all eight unknown (schema version 2)', async () => {
    const t = await open();
    const entry = await t.repos.foodLog.logRecipe({ recipeId: TRAYBAKE, serves: 1.5 });
    expect(entry).toMatchObject({
      sourceKind: 'recipe',
      refId: TRAYBAKE,
      servings: 1.5,
      unknownNutrients: [...NUTRIENT_KEYS],
      confidence: 'estimate',
    });
    expect(Object.values(entry.nutrients).every((v) => v === 0)).toBe(true);
  });

  it('D5* D5b* HS-23: a planned meal is logged once, for the owner’s serves, on its date', async () => {
    const t = await open();
    await seedPlanDay(t, {
      date: TODAY,
      dietMode: 'balanced',
      meals: [
        { slot: 'dinner', recipeId: TRAYBAKE, myServes: 1, householdServes: 4 },
        { slot: 'lunch', recipeId: TRAYBAKE, myServes: 0, householdServes: 2 },
      ],
      eatingWindow: null,
    });
    const first = await t.repos.foodLog.logPlan({ date: TODAY, slot: 'dinner' });
    expect(first).toMatchObject({ sourceKind: 'plan', refId: `${TODAY}#dinner`, servings: 1 });
    expect(
      await refusal(t.repos.foodLog.logPlan({ date: TODAY, slot: 'dinner', logAgain: true })),
    ).toBe('plan-slot-logged');
    expect(await refusal(t.repos.foodLog.logPlan({ date: TODAY, slot: 'lunch' }))).toBe(
      'plan-not-found',
    );
    expect(
      await refusal(
        t.repos.foodLog.logPlan({ date: '2000-02-29', slot: 'dinner', at: t.env.now() }),
      ),
    ).toBe('entry-other-day');
    // The same recipe again that day needs the owner's "log it again".
    expect(await refusal(t.repos.foodLog.logRecipe({ recipeId: TRAYBAKE, serves: 1 }))).toBe(
      'already-logged',
    );
    expect(
      await refusal(t.repos.foodLog.logRecipe({ recipeId: TRAYBAKE, serves: 1, logAgain: true })),
    ).toBe('written');
  });

  it('D5b*: a planned meal already logged as the same recipe is not logged again from the plan without the confirmation', async () => {
    const t = await open();
    await t.repos.foodLog.logRecipe({ recipeId: TRAYBAKE, serves: 1 });
    await seedPlanDay(t, {
      date: TODAY,
      dietMode: 'balanced',
      meals: [{ slot: 'dinner', recipeId: TRAYBAKE, myServes: 1, householdServes: 4 }],
      eatingWindow: null,
    });
    expect(await refusal(t.repos.foodLog.logPlan({ date: TODAY, slot: 'dinner' }))).toBe(
      'plan-slot-logged',
    );
    const again = await t.repos.foodLog.logPlan({
      date: TODAY,
      slot: 'dinner',
      serves: 1.5,
      logAgain: true,
    });
    expect(again.servings).toBe(1.5);
  });

  it('D6*: no entry is dated ahead of now, by any method', async () => {
    const t = await open();
    const later = '2000-03-01T00:01:00.000Z';
    const { entry } = await t.repos.foodLog.logNewLabelFood({ form: CHICKEN, amount: raw200 });
    for (const write of [
      t.repos.foodLog.logLabel({ foodId: entry.refId ?? '', amount: raw200, at: later }),
      t.repos.foodLog.logNewLabelFood({
        form: { ...CHICKEN, name: 'Example fish' },
        amount: raw200,
        at: later,
      }),
      t.repos.foodLog.logRecipe({ recipeId: TRAYBAKE, serves: 1, at: later }),
      t.repos.foodLog.logPlan({ date: TODAY, slot: 'dinner', at: later }),
      t.repos.foodLog.changeEntry(entry.id, { at: later }),
    ])
      expect(await refusal(write)).toBe('future-time');
  });

  it('D7 D7b: a changed amount is rebuilt from current figures; a gone or re-planned source is refused', async () => {
    const t = await open();
    const recipe = seedRecipe(TRAYBAKE);
    if (recipe === null) throw new Error('No traybake');
    const entry = await t.repos.foodLog.logRecipe({ recipeId: TRAYBAKE, serves: 1 });
    expect(entry.unknownNutrients).toHaveLength(8);
    // Owner corrections give every line figures: the next change reflects them.
    for (const { seedId, changes } of overrideFiguresFor(recipe.lines.map((l) => l.ingredientId)))
      await t.repos.ingredientOverrides.create({ seedId, changes });
    const changed = await t.repos.foodLog.changeEntry(entry.id, { serves: 2 });
    expect(changed).toMatchObject({ id: entry.id, servings: 2, unknownNutrients: [] });
    expect(changed.nutrients.energyKj).toBeGreaterThan(0);
    expect(await refusal(t.repos.foodLog.changeEntry(entry.id, { amount: raw200 }))).toBe(
      'entry-refused',
    );
    // A plan row whose slot now holds another recipe is not rebuilt as that food.
    await seedPlanDay(t, {
      date: TODAY,
      dietMode: 'balanced',
      meals: [{ slot: 'dinner', recipeId: TRAYBAKE, myServes: 1, householdServes: 4 }],
      eatingWindow: null,
    });
    const plan = await t.repos.foodLog.logPlan({ date: TODAY, slot: 'dinner', logAgain: true });
    await seedPlanDay(t, {
      date: TODAY,
      dietMode: 'balanced',
      meals: [
        {
          slot: 'dinner',
          recipeId: 'seed:recipe-silverbeet-feta-frittata',
          myServes: 1,
          householdServes: 1,
        },
      ],
      eatingWindow: null,
    });
    expect(await refusal(t.repos.foodLog.changeEntry(plan.id, { serves: 2 }))).toBe(
      'food-source-missing',
    );
    expect(await t.repos.foodLog.get(plan.id)).toEqual(plan);
  });

  it('D11: the meal check reads the food log: nothing logged on an empty day, the logged figures otherwise (ruling 23)', async () => {
    const t = await open();
    const sources = async () => {
      const read = await readFastingInputs(t.storage, TODAY);
      if (!read.ok) throw new Error('not read');
      return mealSourcesFrom({
        inputs: read.inputs,
        data: null,
        schedule: { standing: null, overrides: [] } as never,
      });
    };
    expect((await sources()).loggedIntake(TODAY)).toMatchObject({ empty: true, proteinG: 0 });
    const { food } = await t.repos.foodLog.logNewLabelFood({ form: CHICKEN, amount: raw200 });
    await t.repos.foodLog.logLabel({ foodId: food.id, amount: cooked150 });
    const logged = (await sources()).loggedIntake(TODAY);
    expect(logged).toMatchObject({ empty: false, otherEntries: 2 });
    expect(logged?.proteinG).toBeCloseTo(92, 9);
  });

  it('D8: changing a label food keeps past entries; the pack rule', async () => {
    const t = await open();
    const { food, entry } = await t.repos.foodLog.logNewLabelFood({
      form: CHICKEN,
      amount: raw200,
    });
    const kept = await t.repos.foodLog.saveLabelFood({
      id: food.id,
      form: { ...CHICKEN, proteinG: '25', confirmed: [] },
    });
    expect(kept).toMatchObject({ packSizesG: [500], packSizeEnteredAt: food.packSizeEnteredAt });
    expect(kept.nutrientsPer100g.proteinG).toBe(25);
    expect(await t.repos.foodLog.get(entry.id)).toEqual(entry);
    const cleared = await t.repos.foodLog.saveLabelFood({
      id: food.id,
      form: { ...CHICKEN, packSizeG: '' },
    });
    expect(cleared).toMatchObject({
      packSizesG: [],
      packSizeSource: null,
      packSizeEnteredAt: null,
    });
  });

  it.each([
    ['answer 1 yes', { answers: { q1: 'yes' } }],
    ['a birth year that may be under 18', { birthYear: 1983 }],
  ] as const)(
    'D12* HS-32: with %s, a drink-named label food is refused with every box ticked',
    async (_, options) => {
      const t = await open(options);
      t.env.set('2000-03-01T00:00:00.000Z');
      const everyTick = [
        'energy-mismatch',
        'sat-fat-over-fat',
        'sugars-over-carbs',
        'sounds-like-alcohol',
        'same-name',
      ] as const;
      const form = {
        ...CHICKEN,
        name: 'Example lager',
        describes: 'as-sold' as const,
        confirmed: everyTick,
      };
      const amount: LabelAmount = {
        by: 'grams',
        grams: 330,
        weighed: 'as-sold',
        gramsInLabelState: null,
      };
      expect(await refusal(t.repos.foodLog.logNewLabelFood({ form, amount }))).toBe(
        'label-refused:alcohol-name',
      );
      expect(await t.repos.ingredients.list()).toEqual(
        (await t.repos.ingredients.list()).filter((i) => i.source !== 'label'),
      );
    },
  );

  it('D12* D13*: an adult with the tick may log one; the rules run again whoever calls', async () => {
    const t = await open();
    const amount: LabelAmount = {
      by: 'grams',
      grams: 330,
      weighed: 'as-sold',
      gramsInLabelState: null,
    };
    const form = { ...CHICKEN, name: 'Example lager', describes: 'as-sold' as const };
    expect(await refusal(t.repos.foodLog.logNewLabelFood({ form, amount }))).toBe(
      'label-refused:unconfirmed',
    );
    const { food } = await t.repos.foodLog.logNewLabelFood({
      form: { ...form, confirmed: ['sounds-like-alcohol'] },
      amount,
    });
    // An energy far from the macronutrients, unticked, is refused even from a hand-built form.
    expect(
      await refusal(
        t.repos.foodLog.saveLabelFood({
          id: food.id,
          form: { ...form, energy: '96', confirmed: ['sounds-like-alcohol'] },
        }),
      ),
    ).toBe('label-refused:unconfirmed');
  });
});
