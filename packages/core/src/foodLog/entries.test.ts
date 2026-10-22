import { describe, expect, expectTypeOf, it } from 'vitest';
import { totalRows } from '../foods/figures';
import type { IngredientView } from '../storage/overrides';
import { NUTRIENT_KEYS, type Nutrients } from '../nutrition/nutrients';
import type { IngredientRecord } from '../storage/records';
import { entryBadge } from './day';
import {
  amountChecks,
  entryInstant,
  labelEntry,
  type LabelFoodForLog,
  nextServes,
  parseAmount,
  planEntry,
  type PortionFigures,
  recipeEntry,
  weighingChoices,
} from './entries';

const per100 = (patch: Partial<Nutrients>): Nutrients => ({
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
  ...patch,
});

/** The FL-03 / NN-04 fixture (design 2.3): a raw chicken label, fibre not on the label. */
const CHICKEN: LabelFoodForLog = {
  id: '00000000-0000-4000-8000-000000000c01',
  name: 'Example chicken breast',
  source: 'label',
  nutrientBasis: 'raw',
  nutrientsPer100g: per100({
    energyKj: 460,
    proteinG: 23,
    fatG: 2,
    saturatedFatG: 0.6,
    sodiumMg: 60,
  }),
  unknownNutrients: ['fibreG'],
  servingSizeG: null,
};
const YOGHURT: LabelFoodForLog = {
  ...CHICKEN,
  id: '00000000-0000-4000-8000-000000000c02',
  name: 'Example yoghurt',
  nutrientBasis: 'as-sold',
  nutrientsPer100g: per100({
    energyKj: 400,
    proteinG: 9.6,
    fatG: 2,
    saturatedFatG: 1.3,
    carbsG: 5,
    sugarsG: 4.8,
    sodiumMg: 45,
  }),
  servingSizeG: 170,
};
const grams = (g: number, weighed: 'raw' | 'as-sold' | 'cooked', before: number | null = null) =>
  ({ by: 'grams', grams: g, weighed, gramsInLabelState: before }) as const;
const draftOf = (r: ReturnType<typeof labelEntry>) => {
  if (!r.ok) throw new Error(r.refusal);
  return r.draft;
};

describe('label entries (FL-01, FL-03, NN-04, C67)', () => {
  it('U1 FL-01: 150 g of a per-100 g label as sold: figures for 150 g, badge Label, fibre not known', () => {
    const d = draftOf(labelEntry(YOGHURT, grams(150, 'as-sold')));
    expect(d).toMatchObject({
      sourceKind: 'label',
      refId: YOGHURT.id,
      grams: 150,
      weightBasis: 'as-sold',
      servings: null,
      unknownNutrients: ['fibreG'],
      confidence: 'label',
    });
    expect(d.nutrients.energyKj).toBeCloseTo(600, 9);
    expect(d.nutrients.proteinG).toBeCloseTo(14.4, 9);
    expect(d.nutrients.fibreG).toBe(0);
    const rows = totalRows(d.nutrients, d.unknownNutrients);
    expect(rows.find((r) => r.key === 'fibreG')?.text).toBe('not known');
    expect(rows.find((r) => r.key === 'proteinG')?.text).toBe('14 g');
    // U2: serves from the label store the grams, the serves and the label's state.
    const serve = draftOf(labelEntry(YOGHURT, { by: 'serves', serves: 1 }));
    expect(serve).toMatchObject({ grams: 170, servings: 1, weightBasis: 'as-sold' });
    expect(serve.nutrients.proteinG).toBeCloseTo(16.32, 9);
  });

  it('U3* FL-03: 200 g raw and 150 g cooked (200 g before) give the same figures, each with the state weighed', () => {
    const a = draftOf(labelEntry(CHICKEN, grams(200, 'raw')));
    const b = draftOf(labelEntry(CHICKEN, grams(150, 'cooked', 200)));
    expect(a).toMatchObject({ grams: 200, weightBasis: 'raw' });
    expect(b).toMatchObject({ grams: 150, weightBasis: 'cooked' });
    expect(a.nutrients.proteinG).toBeCloseTo(46, 9);
    expect(b.nutrients.proteinG).toBeCloseTo(46, 9);
    expect(b.nutrients.proteinG).not.toBeCloseTo(34.5, 1);
    expect(b.nutrients.carbsG).toBe(0);
    expect(labelEntry(CHICKEN, grams(150, 'cooked'))).toEqual({
      ok: false,
      refusal: 'label-state-weight-needed',
    });
    expect(
      amountChecks({
        amount: grams(150, 'cooked', 1500),
        draft: draftOf(labelEntry(CHICKEN, grams(150, 'cooked', 1500))),
        proteinTargetG: 140,
      }),
    ).toEqual(['before-weight', 'large-amount', 'large-protein']);
    expect(
      amountChecks({ amount: grams(150, 'cooked', 200), draft: b, proteinTargetG: 140 }),
    ).toEqual([]);
  });

  it('U4* a weight is never multiplied by figures for another state', () => {
    expect(weighingChoices('raw')).toEqual(['raw', 'cooked']);
    expect(weighingChoices('as-sold')).toEqual(['as-sold', 'cooked']);
    expect(weighingChoices('cooked')).toEqual(['cooked']);
    const roast = { ...CHICKEN, nutrientBasis: 'cooked' as const };
    expect(labelEntry(roast, grams(150, 'raw', 200))).toEqual({
      ok: false,
      refusal: 'weighed-not-offered',
    });
    expect(labelEntry(YOGHURT, grams(150, 'raw', 200))).toEqual({
      ok: false,
      refusal: 'weighed-not-offered',
    });
    // The amount step asks, with nothing preselected, unless the label is for the cooked food.
    expect(
      parseAmount({ by: 'grams', grams: '150', weighed: null, before: '', serves: '' }, 'raw'),
    ).toEqual({ ok: false, problems: { weighed: 'choose' } });
    expect(
      parseAmount({ by: 'grams', grams: '150', weighed: 'cooked', before: '', serves: '' }, 'raw'),
    ).toEqual({ ok: false, problems: { before: 'required' } });
    expect(
      parseAmount({ by: 'grams', grams: '150', weighed: null, before: '', serves: '' }, 'cooked'),
    ).toEqual({
      ok: true,
      amount: { by: 'grams', grams: 150, weighed: 'cooked', gramsInLabelState: null },
    });
  });

  it('U5* only an own label food is logged by weight: a catalogue view cannot be passed (H23c)', () => {
    expect(labelEntry({ ...CHICKEN, source: 'estimate' }, grams(100, 'raw'))).toEqual({
      ok: false,
      refusal: 'not-label-food',
    });
    expectTypeOf<IngredientView>().not.toExtend<LabelFoodForLog>();
    expectTypeOf<IngredientRecord>().toExtend<LabelFoodForLog>();
  });

  it('U6: amount edges and the per-entry limit', () => {
    expect(labelEntry(CHICKEN, grams(0, 'raw')).ok).toBe(false);
    expect(labelEntry(YOGHURT, grams(5000, 'as-sold')).ok).toBe(true);
    expect(labelEntry(CHICKEN, grams(5000.1, 'raw'))).toEqual({
      ok: false,
      refusal: 'amount-range',
    });
    expect(labelEntry(YOGHURT, { by: 'serves', serves: 10.5 }).ok).toBe(false);
    expect(labelEntry(YOGHURT, { by: 'serves', serves: 30 }).ok).toBe(false);
    expect(labelEntry({ ...YOGHURT, servingSizeG: null }, { by: 'serves', serves: 1 })).toEqual({
      ok: false,
      refusal: 'serving-size-missing',
    });
    const oil = { ...YOGHURT, nutrientsPer100g: per100({ energyKj: 3700, fatG: 100 }) };
    expect(labelEntry(oil, grams(5000, 'as-sold'))).toEqual({
      ok: false,
      refusal: 'too-much-for-one-entry',
    });
    const d = draftOf(labelEntry(YOGHURT, grams(1001, 'as-sold')));
    expect(
      amountChecks({ amount: grams(1001, 'as-sold'), draft: d, proteinTargetG: null }),
    ).toEqual(['large-amount']);
    expect(
      amountChecks({ amount: grams(1000, 'as-sold'), draft: d, proteinTargetG: null }),
    ).toEqual([]);
    expect(
      amountChecks({ amount: { by: 'serves', serves: 3.5 }, draft: d, proteinTargetG: null }),
    ).toEqual(['large-amount']);
  });
});

const PORTION: PortionFigures = {
  refId: 'seed:recipe-example',
  title: 'Example traybake',
  perServe: per100({ energyKj: 2000, proteinG: 40 }),
  unknownNutrients: [],
  confidence: 'database',
};

describe('recipe and plan entries (FL-02, C32, HS-23)', () => {
  it('U7 FL-02: a recipe entry keeps its confidence and unknowns; all eight unknown has no badge', () => {
    const d = recipeEntry(PORTION, 1.5);
    expect(d).toMatchObject({
      ok: true,
      draft: {
        sourceKind: 'recipe',
        refId: PORTION.refId,
        servings: 1.5,
        grams: null,
        confidence: 'database',
      },
    });
    if (!d.ok) throw new Error('refused');
    expect(d.draft.nutrients.proteinG).toBe(60);
    expect(entryBadge(d.draft, ['usda'])).toBe('database');
    // While no database is approved a Database entry is shown as Estimate (entryConfidence).
    expect(entryBadge(d.draft, [])).toBe('estimate');
    const none = recipeEntry(
      {
        ...PORTION,
        perServe: per100({}),
        unknownNutrients: [...NUTRIENT_KEYS],
        confidence: 'estimate',
      },
      1,
    );
    if (!none.ok) throw new Error('refused');
    expect(none.draft.unknownNutrients).toEqual([...NUTRIENT_KEYS]);
    expect(entryBadge(none.draft, ['usda'])).toBeNull();
  });

  it('U8*: never Label, and a plan entry takes the owner’s serves only (HS-23)', () => {
    for (const confidence of ['database', 'estimate'] as const) {
      for (let serves = 0.05; serves <= 10; serves += 0.35) {
        for (const r of [
          recipeEntry({ ...PORTION, confidence }, serves),
          planEntry('2026-10-18', 'dinner', { ...PORTION, confidence }, serves),
        ])
          expect(r.ok && r.draft.confidence).toBe(confidence);
      }
    }
    const plan = planEntry('2026-10-18', 'dinner', PORTION, 1);
    expect(plan).toMatchObject({
      ok: true,
      draft: { sourceKind: 'plan', refId: '2026-10-18#dinner', servings: 1 },
    });
    if (plan.ok) expect(plan.draft.nutrients.proteinG).toBe(40);
  });

  it('U9: serves in range; the Stepper snaps to quarter serves', () => {
    expect(planEntry('2026-10-18', 'dinner', PORTION, 1 / 3).ok).toBe(true);
    expect(planEntry('2026-10-18', 'dinner', PORTION, 0).ok).toBe(false);
    expect(planEntry('2026-10-18', 'dinner', PORTION, 10.01).ok).toBe(false);
    expect([nextServes(0.333, 1), nextServes(0.333, -1)]).toEqual([0.5, 0.25]);
    expect([nextServes(1, 1), nextServes(1, -1)]).toEqual([1.25, 0.75]);
    expect([nextServes(10, 1), nextServes(0.25, -1)]).toEqual([10, 0.25]);
  });
});

describe('entryInstant (design 2.4)', () => {
  const NOW = '2026-10-18T07:00:00.000Z'; // 8 pm in Auckland.
  it('U13: required, format, future, other day, and a valid past time', () => {
    const at = (date: string, time: string, zone = 'Pacific/Auckland') =>
      entryInstant(date, time, zone, NOW);
    expect(at('2026-10-18', '')).toEqual({ ok: false, problem: 'required' });
    expect(at('2026-10-18', '25:00')).toEqual({ ok: false, problem: 'format' });
    expect(at('2026-10-18', '21:00')).toEqual({ ok: false, problem: 'future' });
    expect(at('2026-10-18', '12:30')).toEqual({ ok: true, at: '2026-10-17T23:30:00.000Z' });
    // Samoa skipped 30 December 2011 entirely.
    expect(at('2011-12-30', '12:00', 'Pacific/Apia')).toEqual({ ok: false, problem: 'other-day' });
  });
});
