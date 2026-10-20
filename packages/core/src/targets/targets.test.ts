// The targets engine's figures other than energy (item 21 design section 6.1): protein, carb
// ceilings, the saturated-fat budget, the guides, intake, ranking, form parsing and display.
// Synthetic values only.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { readinessGates, type GateInput } from '../readiness/gates';
import type { DietMode } from '../storage/records';
import type { Nutrients } from '../nutrition/nutrients';
import { effectiveNetCarbCeiling, type NetCarbCeiling } from './carbs';
import { electrolyteCopyKeys } from './copyFacts';
import { DIET_MODES, dietModeCarbKey, isDietMode, rankForDietMode } from './dietModes';
import { targetDisplay } from './display';
import { checkProteinPair, parseTargetEdit } from './edit';
import { dayEnergyFor, floorCheck, noEstimateEnergy } from './energy';
import { fibreGuide, saturatedFatBudget, waterGuide } from './guides';
import { dayIntake, foodEnergyKj, limitState, plannedFoodEnergyKj } from './intake';
import { effectiveProteinTarget, proteinTargets, type TargetFigures } from './protein';
import { safeProteinRange } from './sanitize';

const nutrients = (over: Partial<Nutrients> = {}): Nutrients => ({
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
  ...over,
});

describe('protein (C65, HS-22, HS-25; U1 to U3)', () => {
  it('U1: the top of the range with Kickstart figures, the bottom otherwise, never a literal 140', () => {
    const range = { min: 120, max: 140 };
    expect(effectiveProteinTarget('kickstart', range)).toBe(140);
    expect(effectiveProteinTarget('steady', range)).toBe(120);
    expect(effectiveProteinTarget('kickstart', { min: 90, max: 110 })).toBe(110);
    expect(proteinTargets('steady', { min: 90, max: 110 })).toEqual({
      rangeG: { min: 90, max: 110 },
      checkTargetG: 90,
      basis: 'range-bottom',
    });
  });

  it('U2, HS-22, HS-25: only the figures and the range go in; no window, deficit or energy', () => {
    expectTypeOf(proteinTargets).parameters.toEqualTypeOf<
      [TargetFigures, { min: number; max: number }]
    >();
    expectTypeOf(effectiveProteinTarget).parameters.toEqualTypeOf<
      [TargetFigures, { min: number; max: number }]
    >();
  });

  it('U3, C50: a stored range is brought into 80–200 g with the top never below the bottom', () => {
    expect(safeProteinRange({ min: 50, max: 140 })).toEqual({ min: 80, max: 140 });
    expect(safeProteinRange({ min: 120, max: 300 })).toEqual({ min: 120, max: 200 });
    expect(safeProteinRange({ min: 150, max: 130 })).toEqual({ min: 150, max: 150 });
    expect(safeProteinRange({ min: Number.NaN, max: Number.NaN })).toEqual({ min: 120, max: 140 });
  });
});

describe('net-carb ceilings (HS-09, RD-01 to RD-04, C61, C70, D30 override; U15)', () => {
  const ceiling = (over: Partial<Parameters<typeof effectiveNetCarbCeiling>[0]> = {}) =>
    effectiveNetCarbCeiling({
      dietMode: 'keto',
      figures: 'steady',
      ketoCeilingAvailable: true,
      carbCeilingBelow50Allowed: true,
      netCarbCeilingG: 30,
      moderateNetCarbCeilingG: 100,
      ...over,
    });

  it('keto Kickstart 20 g; after Kickstart the owner’s own ceiling (30 by default, 40 stored)', () => {
    expect(ceiling({ figures: 'kickstart' })).toEqual({
      kind: 'ceiling',
      grams: 20,
      basis: 'kickstart',
    });
    expect(ceiling()).toEqual({ kind: 'ceiling', grams: 30, basis: 'keto' });
    expect(ceiling({ netCarbCeilingG: 40 })).toMatchObject({ grams: 40 });
  });

  it('T6: answer 3 without the prescriber holds keto at 50 g, even with Kickstart figures', () => {
    for (const netCarbCeilingG of [20, 30, 50]) {
      for (const figures of ['steady', 'kickstart'] as const) {
        expect(ceiling({ carbCeilingBelow50Allowed: false, netCarbCeilingG, figures })).toEqual({
          kind: 'ceiling',
          grams: 50,
          basis: 'keto-held-at-50',
        });
      }
    }
    expect(
      ceiling({ dietMode: 'moderate-low-carb', carbCeilingBelow50Allowed: false }),
    ).toMatchObject({ grams: 100, basis: 'moderate' });
  });

  it('T5: answers 1, 2 and 5 switch off every ceiling, keto and moderate; balanced never has one', () => {
    for (const dietMode of ['keto', 'moderate-low-carb'] as const) {
      expect(ceiling({ dietMode, ketoCeilingAvailable: false, figures: 'kickstart' })).toEqual({
        kind: 'none',
        basis: 'readiness',
      });
    }
    expect(ceiling({ dietMode: 'balanced', figures: 'kickstart' })).toEqual({
      kind: 'none',
      basis: 'balanced',
    });
  });

  it('C50: stored ceilings are brought into range', () => {
    expect(ceiling({ netCarbCeilingG: 10 })).toMatchObject({ grams: 20 });
    expect(ceiling({ netCarbCeilingG: 60 })).toMatchObject({ grams: 50 });
    expect(ceiling({ netCarbCeilingG: Number.NaN })).toMatchObject({ grams: 30 });
    expect(ceiling({ dietMode: 'moderate-low-carb', moderateNetCarbCeilingG: 30 })).toMatchObject({
      grams: 50,
    });
    expect(ceiling({ dietMode: 'moderate-low-carb', moderateNetCarbCeilingG: 200 })).toMatchObject({
      grams: 130,
    });
  });
});

describe('saturated fat, fibre and water (HS-09, C70, C71, T10, T12; U16, U17)', () => {
  const kick = dayEnergyFor(13_000, { pct: 30, basis: 'kickstart' }, 5000);

  it('HS-09: the budget comes from the day’s planned energy, rounded down, never the estimate', () => {
    expect(saturatedFatBudget(kick, 10)).toEqual({
      kind: 'budget',
      grams: 24,
      pct: 10,
      fromKj: 9100,
    });
    expect(saturatedFatBudget(kick, 10)).not.toMatchObject({ grams: 35 });
    const steady = dayEnergyFor(13_000, { pct: 15, basis: 'steady' }, 5000);
    expect(saturatedFatBudget(steady, 10)).toMatchObject({ grams: 29 });
    expect(saturatedFatBudget(kick, 5)).toMatchObject({ grams: 12 });
    expect(saturatedFatBudget(kick, 15)).toMatchObject({ grams: 24, pct: 10 });
    expect(saturatedFatBudget(kick, 2)).toMatchObject({ pct: 5 });
    expect(saturatedFatBudget(noEstimateEnergy('missing-weight', 5000), 10)).toEqual({
      kind: 'none',
    });
  });

  it('C70, T12: the NRV guides by sex, the higher with no sex, and the owner’s own in range', () => {
    expect([fibreGuide('male', null), fibreGuide('female', null), fibreGuide(null, null)]).toEqual([
      { grams: 30, source: 'nrv' },
      { grams: 25, source: 'nrv' },
      { grams: 30, source: 'nrv' },
    ]);
    expect(fibreGuide('female', 40)).toEqual({ grams: 40, source: 'owner' });
    expect([fibreGuide('male', 5).grams, fibreGuide('male', 90).grams]).toEqual([10, 70]);
    expect(fibreGuide('female', Number.NaN)).toEqual({ grams: 25, source: 'nrv' });
    expect([
      waterGuide('male', null).ml,
      waterGuide('female', null).ml,
      waterGuide(null, null).ml,
    ]).toEqual([2600, 2100, 2600]);
    expect(waterGuide('female', 3000)).toEqual({ ml: 3000, source: 'owner' });
  });
});

describe('intake: food apart from alcohol (C11, C31, C92, NN-01; U18, U19)', () => {
  const food = [
    { nutrients: nutrients({ energyKj: 4000, proteinG: 60 }), unknownNutrients: [] },
    { nutrients: nutrients({ energyKj: 3000, proteinG: 50 }), unknownNutrients: [] },
  ];
  const can = { volumeMl: 330, abvPercent: 5 };
  const sixCans = [{ kcalPerServe: 94, count: 6, beverage: can }];

  it('C11: six cans of 94 kcal are their own 2,360 kJ; the floor check and protein never see them', () => {
    const day = dayIntake(food, sixCans);
    expect(day.alcohol).toEqual({ knownKcal: 564, knownKj: 2360, unknownCount: 0, count: 6 });
    expect(foodEnergyKj(food)).toBe(7000);
    expect(day.food.energyKj).toBe(7000);
    expect(day.totalEnergyKj).toBe(9360);
    expect(day.food.proteinG).toBe(110);
    expect(floorCheck(foodEnergyKj(food), 5000)).toEqual(floorCheck(day.food.energyKj, 5000));
    expect(dayIntake(food, [{ kcalPerServe: 94, count: 1, beverage: can }]).alcohol.knownKj).toBe(
      393,
    );
  });

  it('NN-01: a drink with unknown energy is counted as unknown, never as 0', () => {
    const day = dayIntake(food, [...sixCans, { kcalPerServe: null, count: 1, beverage: can }]);
    expect(day.alcohol).toEqual({ knownKcal: 564, knownKj: 2360, unknownCount: 1, count: 7 });
    expect(day.totalIncomplete).toBe(true);
    expect(day.foodEnergyIncomplete).toBe(false);
  });

  it('HS-36, A40: six cans whose label says 0 kcal are six drinks of unknown energy, as on the Drinks screen', () => {
    const day = dayIntake(food, [{ kcalPerServe: 0, count: 6, beverage: can }]);
    expect(day.alcohol).toEqual({ knownKcal: 0, knownKj: 0, unknownCount: 6, count: 6 });
    expect(day.totalIncomplete).toBe(true);
  });

  it('D35: an entry with no figure makes that nutrient’s total a lower bound', () => {
    const day = dayIntake(
      [...food, { nutrients: nutrients(), unknownNutrients: ['energyKj', 'carbsG'] }],
      [],
    );
    expect(day.unknownCounts).toMatchObject({ energyKj: 1, carbsG: 1, proteinG: 0 });
    expect(day.foodEnergyIncomplete).toBe(true);
    expect(dayIntake([], []).entryCount).toBe(0);
  });

  it('HS-23: a planned day counts the owner’s own serves only', () => {
    const meal = { perServe: nutrients({ energyKj: 3000 }), myServes: 1, householdServes: 3 };
    expect(plannedFoodEnergyKj([meal, { ...meal, householdServes: 8 }])).toBe(6000);
  });

  it('T11, D35: a bar compares what it shows; a lower bound is never within', () => {
    expect(limitState(20.4, 0, 20)).toBe('within');
    expect(limitState(20.5, 0, 20)).toBe('over');
    expect(limitState(18, 1, 20)).toBe('incomplete');
    expect(limitState(25, 1, 20)).toBe('over');
  });
});

describe('diet modes and suggestion order (FL-04, T13, T31; U22, U23)', () => {
  const bowl = {
    id: 'r1',
    title: 'Bean and rice bowl',
    perServe: nutrients({ carbsG: 55 }),
    unknownNutrients: [],
  };
  const traybake = {
    id: 'r2',
    title: 'Chicken and silverbeet traybake',
    perServe: nutrients({ carbsG: 6 }),
    unknownNutrients: [],
  };
  const unknown = {
    id: 'r3',
    title: 'A soup',
    perServe: nutrients(),
    unknownNutrients: ['carbsG'] as const,
  };
  const keto: NetCarbCeiling = { kind: 'ceiling', grams: 30, basis: 'keto' };
  const none: NetCarbCeiling = { kind: 'none', basis: 'balanced' };
  const titles = (ceiling: NetCarbCeiling) =>
    rankForDietMode([bowl, traybake, unknown], ceiling).map((r) => r.title);

  it('FL-04: keto puts the low-carb dish first, balanced the title order, and back again; nothing is removed', () => {
    expect(titles(keto)).toEqual([
      'Chicken and silverbeet traybake',
      'Bean and rice bowl',
      'A soup',
    ]);
    expect(titles(none)).toEqual([
      'A soup',
      'Bean and rice bowl',
      'Chicken and silverbeet traybake',
    ]);
    expect(titles(keto)[0]).toBe('Chicken and silverbeet traybake');
    expect(rankForDietMode([bowl, traybake, unknown], keto)).toHaveLength(3);
  });

  it('moderate: dishes within half the ceiling tie at 0; unknown carbs sort last with any ceiling', () => {
    const moderate: NetCarbCeiling = { kind: 'ceiling', grams: 100, basis: 'moderate' };
    expect(dietModeCarbKey(traybake, moderate)).toBe(0);
    expect(dietModeCarbKey(bowl, moderate)).toBe(5);
    expect(dietModeCarbKey(unknown, moderate)).toBe(Number.POSITIVE_INFINITY);
  });

  it('T31: with ceilings off by readiness, keto mode gives the plain title order', () => {
    expect(titles({ kind: 'none', basis: 'readiness' })).toEqual(titles(none));
  });

  it('U23: DIET_MODES is the DietMode union; isDietMode refuses anything else', () => {
    expectTypeOf<(typeof DIET_MODES)[number]>().toEqualTypeOf<DietMode>();
    expect(DIET_MODES.every(isDietMode)).toBe(true);
    expect([isDietMode('Keto'), isDietMode(''), isDietMode(null)]).toEqual([false, false, false]);
  });
});

describe('form parsing: refuse, never clamp (C50, T18; U24)', () => {
  it('whole numbers, with or without thousands commas, inside each range', () => {
    expect(parseTargetEdit('energyFloorKj', '5,000')).toEqual({ ok: true, value: 5000 });
    expect(parseTargetEdit('energyFloorKj', ' 6000 ')).toEqual({ ok: true, value: 6000 });
    expect(parseTargetEdit('energyFloorKj', '4,999')).toEqual({
      ok: false,
      error: { kind: 'floor-too-low' },
    });
    expect(parseTargetEdit('energyFloorKj', '20,001')).toEqual({
      ok: false,
      error: { kind: 'floor-too-high' },
    });
    expect(parseTargetEdit('proteinMin', '79')).toEqual({
      ok: false,
      error: { kind: 'range', min: 80, max: 200 },
    });
  });

  it('decimals, signs, units, exponents and empty text are refused; empty means default for the guides', () => {
    for (const text of ['5.5', '-1', '30%', '1e3', '', '5,00']) {
      expect(parseTargetEdit('netCarbCeilingG', text)).toEqual({
        ok: false,
        error: { kind: 'whole-number' },
      });
    }
    expect(parseTargetEdit('fibreGuideG', '')).toEqual({ ok: true, value: null });
    expect(parseTargetEdit('waterTargetMl', ' ')).toEqual({ ok: true, value: null });
    expect(checkProteinPair(150, 130)).toEqual({ kind: 'min-above-max' });
    expect(checkProteinPair(120, 140)).toBeNull();
  });
});

describe('what a readiness answer does to the display (T25, T26, C41, C102; U30, U31)', () => {
  const allNo: GateInput = {
    answers: { q1: 'no', q2: 'no', q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no' },
    confirmations: { prescriberAgreed: false, gpExerciseDiscussed: false },
    minimumAgeYears: 40,
    lowWeight: false,
  };
  interface Over {
    readonly answers?: Partial<GateInput['answers']>;
    readonly minimumAgeYears?: number;
    readonly lowWeight?: boolean;
  }
  const display = (over: Over) => {
    const input: GateInput = {
      ...allNo,
      ...(over.minimumAgeYears === undefined ? {} : { minimumAgeYears: over.minimumAgeYears }),
      ...(over.lowWeight === undefined ? {} : { lowWeight: over.lowWeight }),
      answers: { ...allNo.answers, ...over.answers },
    };
    return targetDisplay(input, readinessGates(input));
  };

  it('answer 1, an under-18 birth year, an unanswered 1: plain figures, each with its own reason', () => {
    expect(display({ answers: { q1: 'yes' } })).toMatchObject({
      plainFigures: true,
      estimateGate: 'under-18-answer',
    });
    expect(display({ minimumAgeYears: 17 })).toMatchObject({
      plainFigures: true,
      estimateGate: 'under-18-birth-year',
    });
    expect(display({ answers: { q1: null } })).toMatchObject({
      plainFigures: true,
      estimateGate: 'unanswered',
      missingAnswers: ['q1'],
    });
  });

  it('answer 5 yes or unanswered, or a low current weight (HS-35): plain figures, with an estimate', () => {
    for (const over of [
      { answers: { q5: 'yes' } },
      { answers: { q5: null } },
      { lowWeight: true },
    ] as const) {
      expect(display(over)).toMatchObject({ plainFigures: true, estimateGate: null });
    }
  });

  it('answer 2 yes or unanswered: the pregnancy note, not plain figures; all no: nothing', () => {
    expect(display({ answers: { q2: 'yes' } })).toMatchObject({
      pregnancyNote: true,
      plainFigures: false,
    });
    expect(display({ answers: { q2: null } })).toMatchObject({ pregnancyNote: true });
    expect(display({})).toEqual({
      plainFigures: false,
      pregnancyNote: false,
      missingAnswers: [],
      estimateGate: null,
    });
  });

  it('C102: the electrolyte card’s blood-pressure line shows for answer 4 yes or unanswered', () => {
    const keys = (q4: 'yes' | 'no' | null) => {
      const input = { ...allNo, answers: { ...allNo.answers, q4 } };
      return electrolyteCopyKeys(readinessGates(input));
    };
    expect(keys('no')).toEqual(['body']);
    expect(keys('yes')).toEqual(['body', 'bloodPressure']);
    expect(keys(null)).toEqual(['body', 'bloodPressure']);
  });
});
