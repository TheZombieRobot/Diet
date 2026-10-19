// Each "iff" and "equals" rule inside one record has a passing and a failing case (section 16
// test 3). Bases are fixture rows; each case changes only what the rule is about.
import { checkRow, type RowCheck } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { snapshotV1 } from './snapshotV1';

type Row = Record<string, unknown>;
const rows = snapshotV1 as unknown as Record<string, Row[]>;
const row = (table: string, index = 0): Row => structuredClone(rows[table]?.[index] ?? {});
const outcome = (r: RowCheck) => (r.ok ? 'ok' : `${r.field} ${r.rule}`);

/** The result of validating `table` row `index` with `patch` applied (shallow) or `edit` run on a copy. */
function check(table: string, index: number, change: Row | ((r: Row) => void)): string {
  const r = row(table, index);
  if (typeof change === 'function') change(r);
  else Object.assign(r, change);
  return outcome(checkRow(table, r));
}

const label = (patch: Row) => (r: Row) => {
  r.label = { ...(r.label as Row), ...patch };
};

describe('rules inside one record (section 4; section 16 test 3)', () => {
  it('profile: the goal fields are all set or all null; updatedAt is not before createdAt', () => {
    expect(check('profile', 0, { goalKg: null, goalSetAt: null, goalReferenceKg: null })).toBe(
      'ok',
    );
    expect(check('profile', 0, { goalKg: null })).toBe('goalKg iff');
    expect(check('profile', 0, { goalReferenceKg: null })).toBe('goalKg iff');
    expect(check('profile', 0, { updatedAt: '1999-12-31T00:00:00.000Z' })).toBe('updatedAt format');
    expect(check('profile', 0, { updatedAt: '2000-01-01T00:00:00.000Z' })).toBe('ok');
    expect(check('profile', 0, { createdAt: '2000-01-03T00:00:00.000Z' })).toBe('updatedAt order');
  });

  it('readiness: the wording version is the current one or older', () => {
    expect(check('readiness', 2, { wordingVersion: 2 })).toBe('wordingVersion range');
  });

  it('targets: preset and window together, the window length matching the preset, protein max not below min', () => {
    expect(
      check('targets', 0, {
        fastingPreset: '22:2',
        eatingWindow: { start: '17:00', end: '19:00' },
      }),
    ).toBe('ok');
    expect(check('targets', 0, { fastingPreset: '22:2' })).toBe('eatingWindow equals');
    expect(
      check('targets', 0, {
        fastingPreset: 'custom',
        eatingWindow: { start: '17:30', end: '19:00' },
      }),
    ).toBe('ok');
    expect(
      check('targets', 0, { fastingPreset: null, eatingWindow: null, presetChosenBy: null }),
    ).toBe('ok');
    expect(check('targets', 0, { fastingPreset: null })).toBe('eatingWindow iff');
    expect(check('targets', 0, { presetChosenBy: null })).toBe('presetChosenBy iff');
    expect(
      check('targets', 0, {
        fastingPreset: 'custom',
        eatingWindow: { start: '19:00', end: '19:00' },
      }),
    ).toBe('eatingWindow range');
    expect(
      check('targets', 0, {
        fastingPreset: 'custom',
        eatingWindow: { start: '18:30', end: '19:00' },
      }),
    ).toBe('eatingWindow range');
    expect(
      check('targets', 0, {
        fastingPreset: 'custom',
        eatingWindow: { start: '19:00', end: '18:00' },
      }),
    ).toBe('ok');
    expect(check('targets', 0, { proteinRangeG: { min: 140, max: 120 } })).toBe(
      'proteinRangeG.max order',
    );
    expect(check('targets', 0, { proteinRangeG: { min: 80, max: 80 } })).toBe('ok');
  });

  it('settings: bounds other than the defaults need the explanation read; the weekly pattern has 7 days of 0–3 templates', () => {
    expect(check('settings', 0, { rapidLossExplanationReadAt: null })).toBe(
      'rapidLossExplanationReadAt iff',
    );
    expect(
      check('settings', 0, {
        rapidLossExplanationReadAt: null,
        rapidLossThresholdGPerWeek: 1000,
        rapidLossConsecutiveWeeks: 3,
      }),
    ).toBe('ok');
    expect(
      check('settings', 0, { rapidLossExplanationReadAt: null, rapidLossThresholdGPerWeek: 1000 }),
    ).toBe('rapidLossExplanationReadAt iff');
    const pattern = (rows.settings?.[0]?.weeklyPattern ?? []) as Row[];
    expect(check('settings', 0, { weeklyPattern: pattern.slice(0, 6) })).toBe(
      'weeklyPattern length',
    );
    expect(
      check('settings', 0, {
        weeklyPattern: [...pattern.slice(0, 6), { weekday: 1, templateIds: [] }],
      }),
    ).toBe('weeklyPattern unique');
    const four = ['seed:a', 'seed:b', 'seed:c', 'seed:d'];
    expect(
      check('settings', 0, {
        weeklyPattern: [{ weekday: 1, templateIds: four }, ...pattern.slice(1)],
      }),
    ).toBe('weeklyPattern[0].templateIds length');
    expect(check('settings', 0, { weeklyPattern: null })).toBe('ok');
    expect(check('settings', 0, { drinkingDayCutoverMinutes: 0 })).toBe('ok');
    expect(check('settings', 0, { drinkingDayCutoverMinutes: 45 })).toBe(
      'drinkingDayCutoverMinutes range',
    );
    expect(check('settings', 0, { rapidLossThresholdGPerWeek: 775 })).toBe(
      'rapidLossThresholdGPerWeek range',
    );
  });

  it('kickstart periods: the end, its zone and its reason come together, after the start', () => {
    expect(check('kickstart_periods', 0, { endedTimeZone: null })).toBe('endedTimeZone iff');
    expect(check('kickstart_periods', 0, { endReason: null })).toBe('endReason iff');
    expect(check('kickstart_periods', 3, { endedTimeZone: 'UTC' })).toBe('endedTimeZone iff');
    expect(check('kickstart_periods', 0, { endedAt: '2000-01-03T19:00:00.000Z' })).toBe(
      'endedAt order',
    );
  });

  it('kickstart checks: extended exactly when all four answers are no', () => {
    expect(check('kickstart_checks', 0, { palpitations: 'yes' })).toBe('outcome equals');
    expect(check('kickstart_checks', 0, { palpitations: 'yes', outcome: 'stop-sign' })).toBe('ok');
    expect(check('kickstart_checks', 1, { outcome: 'extended' })).toBe('outcome equals');
  });

  it('fasts: the end and its zone come together, after the start', () => {
    expect(check('fasts', 0, { endedTimeZone: null })).toBe('endedTimeZone iff');
    expect(check('fasts', 2, { endedTimeZone: 'UTC' })).toBe('endedTimeZone iff');
    expect(check('fasts', 0, { endedAt: '2000-01-01T06:00:00.000Z' })).toBe('endedAt order');
    expect(check('fasts', 0, { plannedFastMinutes: 1470 })).toBe('plannedFastMinutes range');
  });

  it('water: some water, or an electrolyte tick', () => {
    expect(check('water_log', 0, { ml: 0 })).toBe('ml range');
    expect(check('water_log', 1, { ml: 0, electrolyte: true })).toBe('ok');
  });

  it('ingredients: pack-size source and entered-at, yield and citation, unknown nutrients by source, and the all-eight refusal', () => {
    expect(check('ingredients', 0, { id: 'seed:example-food' })).toBe('id format');
    expect(check('ingredients', 0, { packSizeSource: 'typical' })).toBe('packSizeSource iff');
    expect(check('ingredients', 1, { packSizeEnteredAt: null })).toBe('packSizeEnteredAt iff');
    expect(check('ingredients', 2, { packSizeEnteredAt: '2000-01-01T00:00:00.000Z' })).toBe(
      'packSizeEnteredAt iff',
    );
    expect(check('ingredients', 1, { yieldCitation: null })).toBe('yieldCitation iff');
    expect(
      check('ingredients', 0, {
        unknownNutrients: ['proteinG'],
        nutrientsPer100g: { ...(rows.ingredients?.[0]?.nutrientsPer100g as Row), proteinG: 0 },
      }),
    ).toBe('unknownNutrients equals');
    expect(
      check('ingredients', 1, {
        unknownNutrients: ['fibreG'],
        nutrientsPer100g: { ...(rows.ingredients?.[1]?.nutrientsPer100g as Row), fibreG: 0 },
      }),
    ).toBe('unknownNutrients equals');
    expect(
      check('ingredients', 0, {
        unknownNutrients: ['fibreG'],
        nutrientsPer100g: { ...(rows.ingredients?.[0]?.nutrientsPer100g as Row), fibreG: 3 },
      }),
    ).toBe('nutrientsPer100g.fibreG equals');
    const all = [
      'energyKj',
      'proteinG',
      'fatG',
      'saturatedFatG',
      'carbsG',
      'sugarsG',
      'fibreG',
      'sodiumMg',
    ];
    expect(check('ingredients', 2, { unknownNutrients: all })).toBe('unknownNutrients length');
    expect(check('ingredients', 2, { unknownNutrients: ['fibreG', 'proteinG'] })).toBe(
      'unknownNutrients order',
    );
    expect(check('ingredients', 1, { sourceCitation: null })).toBe('sourceCitation iff');
    expect(check('ingredients', 1, { substitutes: [rows.ingredients?.[1]?.id] })).toBe(
      'substitutes unique',
    );
    expect(check('ingredients', 1, { packSizesG: [1000, 500] })).toBe('packSizesG order');
    expect(check('ingredients', 1, { seasonMonths: [12, 1] })).toBe('seasonMonths order');
  });

  it('ingredient overrides: one change per field, and never the seed itself as a substitute', () => {
    expect(
      check('ingredient_overrides', 0, (r) => {
        r.changes = [...(r.changes as Row[]), { field: 'name', value: 'Again' }];
      }),
    ).toBe('changes length');
    expect(
      check('ingredient_overrides', 1, (r) => {
        r.changes = [...(r.changes as Row[]), { field: 'addAllergens', value: ['egg'] }];
      }),
    ).toBe('changes unique');
    expect(
      check('ingredient_overrides', 1, (r) => {
        r.changes = [
          ...(r.changes as Row[]),
          { field: 'substitutes', value: ['seed:example-food'] },
        ];
      }),
    ).toBe('changes unique');
    expect(check('ingredient_overrides', 1, { changes: [{ field: 'colour', value: 'red' }] })).toBe(
      'changes[0].field enum',
    );
    expect(
      check('ingredient_overrides', 1, {
        changes: [
          { field: 'packSizes', value: { packSizesG: [], enteredAt: '2000-01-01T00:00:00.000Z' } },
        ],
      }),
    ).toBe('changes[0].value.packSizesG length');
    expect(check('ingredient_overrides', 1, { changes: [] })).toBe('changes length');
  });

  it('recipes: the source mix counts the lines, and confidence follows it (C32)', () => {
    expect(check('recipes', 0, { confidence: 'estimate' })).toBe('confidence equals');
    expect(check('recipes', 1, { confidence: 'database' })).toBe('confidence equals');
    expect(
      check('recipes', 0, { sourceMix: { label: 0, 'nz-fcdb': 1, usda: 0, estimate: 0 } }),
    ).toBe('sourceMix equals');
  });

  it('plan days: one meal per slot', () => {
    expect(
      check('plan_days', 0, (r) => {
        r.meals = [
          ...(r.meals as Row[]),
          { slot: 'dinner', recipeId: 'seed:x', myServes: 1, householdServes: 1 },
        ];
      }),
    ).toBe('meals unique');
  });

  it('food log: grams or servings, basis with grams, reference by kind, unknown nutrients and confidence by kind', () => {
    expect(check('food_log', 0, { servings: null })).toBe('grams missing');
    expect(check('food_log', 1, { weightBasis: null })).toBe('weightBasis iff');
    expect(check('food_log', 0, { refId: '2000-02-30#dinner' })).toBe('refId pattern');
    expect(check('food_log', 0, { refId: '2000-01-05#supper' })).toBe('refId pattern');
    expect(check('food_log', 1, { refId: 'not an id' })).toBe('refId pattern');
    expect(check('food_log', 3, { refId: 'seed:example-food' })).toBe('refId pattern');
    expect(check('food_log', 2, { unknownNutrients: ['sugarsG', 'fibreG'] })).toBe(
      'unknownNutrients equals',
    );
    expect(
      check('food_log', 3, { nutrients: { ...(rows.food_log?.[3]?.nutrients as Row), carbsG: 5 } }),
    ).toBe('nutrients.carbsG equals');
    expect(
      check('food_log', 1, {
        nutrients: { ...(rows.food_log?.[1]?.nutrients as Row), proteinG: 5 },
      }),
    ).toBe('ok');
    expect(check('food_log', 2, { confidence: 'database' })).toBe('confidence equals');
    expect(check('food_log', 3, { confidence: 'label' })).toBe('confidence equals');
    expect(check('food_log', 0, { confidence: 'label' })).toBe('confidence equals');
  });

  it('garden and pantry: unit with amount, grams per unit only for counted units', () => {
    expect(check('garden', 1, { unit: null })).toBe('unit iff');
    expect(check('garden', 0, { unit: 'g' })).toBe('unit iff');
    expect(check('garden', 3, { gramsPerUnit: 10 })).toBe('gramsPerUnit iff');
    expect(check('garden', 2, { gramsPerUnit: 1200 })).toBe('ok');
    expect(check('pantry', 0, { unit: null })).toBe('unit iff');
  });

  it('sessions: reps or seconds, done entries matching them and not more than the sets, ratings and completion only when done', () => {
    const movements = (rows.sessions?.[0]?.movements ?? []) as Row[];
    const first = movements[0] as Row;
    expect(check('sessions', 0, { movements: [{ ...first, seconds: 30 }] })).toBe(
      'movements[0].reps iff',
    );
    expect(check('sessions', 0, { movements: [{ ...first, reps: null }] })).toBe(
      'movements[0].reps iff',
    );
    expect(
      check('sessions', 0, { movements: [{ ...first, done: [{ reps: null, seconds: 10 }] }] }),
    ).toBe('movements[0].done iff');
    expect(check('sessions', 0, { movements: [{ ...first, sets: 1 }] })).toBe(
      'movements[0].done length',
    );
    expect(check('sessions', 0, { status: 'rested' })).toBe('exertion iff');
    expect(
      check('sessions', 0, { status: 'rested', exertion: null, soreness: null, energy: null }),
    ).toBe('completedAt iff');
    expect(check('sessions', 1, { status: 'done' })).toBe('completedAt iff');
    expect(check('sessions', 0, { timeZone: null })).toBe('timeZone iff');
  });

  it('beverage labels: at least one figure, energy as entered agreeing with kcal (a value of 0 included), origin', () => {
    expect(
      check('beverages', 0, label({ kcal: 0, energyAsEntered: { value: 0, unit: 'kcal' } })),
    ).toBe('ok');
    expect(
      check('beverages', 0, label({ kcal: 0, energyAsEntered: { value: 0, unit: 'kJ' } })),
    ).toBe('ok');
    expect(
      check('beverages', 0, label({ kcal: 94, energyAsEntered: { value: 393, unit: 'kJ' } })),
    ).toBe('label.kcal equals');
    expect(check('beverages', 0, label({ kcal: 95 }))).toBe('label.kcal equals');
    expect(check('beverages', 2, label({ energyAsEntered: { value: 1046, unit: 'kcal' } }))).toBe(
      'label.kcal equals',
    );
    expect(check('beverages', 1, label({ energyAsEntered: { value: 94, unit: 'kcal' } }))).toBe(
      'label.energyAsEntered iff',
    );
    expect(check('beverages', 0, label({ energyAsEntered: null }))).toBe(
      'label.energyAsEntered iff',
    );
    expect(check('beverages', 1, label({ standardDrinks: null }))).toBe(
      'label.standardDrinks missing',
    );
    expect(check('beverages', 0, label({ origin: 'owner' }))).toBe('ok');
    expect(check('beverages', 0, label({ origin: 'guessed' }))).toBe('label.origin enum');
  });

  it('drinks: the label figure wins when the label applies; kcal only from an applying label (C94, NN-01)', () => {
    expect(check('drinks_log', 0, { stdSource: 'calculated' })).toBe('stdSource equals');
    expect(check('drinks_log', 0, { stdDrinksPerServe: 1.3 })).toBe('stdDrinksPerServe equals');
    expect(check('drinks_log', 1, { stdSource: 'label' })).toBe('stdSource equals');
    expect(check('drinks_log', 1, { kcalPerServe: null })).toBe('kcalPerServe equals');
    expect(check('drinks_log', 2, { kcalPerServe: 94 })).toBe('kcalPerServe equals');
    expect(check('drinks_log', 2, { stdSource: 'label', stdDrinksPerServe: 1.4 })).toBe(
      'stdSource equals',
    );
    expect(check('drinks_log', 1, { stdDrinksPerServe: 0.1 })).toBe('ok'); // range-checked only; the shown figure is the larger
  });

  it('alcohol day notes: a note or a tick; updated not before entered', () => {
    expect(check('alcohol_day_notes', 0, { note: null })).toBe('note missing');
    expect(check('alcohol_day_notes', 1, { withdrawalTick: false })).toBe('note missing');
    expect(check('alcohol_day_notes', 1, { updatedAt: '2000-01-06T19:00:00.000Z' })).toBe(
      'updatedAt order',
    );
  });

  it('grocery lists: sent and received versions with their timestamps (C52)', () => {
    expect(check('grocery_lists', 1, { sentVersion: 4 })).toBe('sentVersion order');
    expect(check('grocery_lists', 1, { receivedVersion: 4 })).toBe('receivedVersion order');
    expect(
      check('grocery_lists', 0, {
        receivedVersion: 1,
        receivedAt: '2000-01-05T00:00:00.000Z',
        laptopReceivedAt: '2000-01-05T00:00:00.000Z',
      }),
    ).toBe('receivedVersion iff');
    expect(check('grocery_lists', 1, { transferId: null })).toBe('transferId iff');
    expect(check('grocery_lists', 1, { sentAt: null })).toBe('sentAt iff');
    expect(check('grocery_lists', 1, { laptopReceivedAt: null })).toBe('laptopReceivedAt iff');
    expect(check('grocery_lists', 1, { receivedAt: '1999-12-31T00:00:00.000Z' })).toBe(
      'receivedAt format',
    );
    expect(check('grocery_lists', 1, { receivedAt: '2000-01-06T02:59:00.000Z' })).toBe('ok'); // no ordering against sentAt
    expect(
      check('grocery_lists', 1, (r) => {
        const items = r.items as Row[];
        r.items = [{ ...items[0], unit: null }, ...items.slice(1)];
      }),
    ).toBe('items[0].unit iff');
    expect(
      check('grocery_lists', 1, (r) => {
        const items = r.items as Row[];
        r.items = [...items, items[0]];
      }),
    ).toBe('items unique');
  });

  it('card state: a registered trigger, a zone with a dismissal, and at least one timestamp', () => {
    expect(check('card_state', 0, { trigger: 'weekly' })).toBe('trigger pattern');
    expect(check('card_state', 5, { trigger: 'period:seed:x:0' })).toBe('trigger pattern');
    expect(check('card_state', 0, { dismissedTimeZone: null })).toBe('dismissedTimeZone iff');
    expect(check('card_state', 3, { doneAt: null })).toBe('firstShownAt missing');
  });
});
