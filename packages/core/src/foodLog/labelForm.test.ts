import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import {
  type LabelFormContext,
  type LabelFormInput,
  labelFormFrom,
  labelNameSoundsLikeDrink,
  parseLabelForm,
} from './labelForm';

/** A synthetic yoghurt label per 100 g (fibre not on the label). */
const YOGHURT: LabelFormInput = {
  name: 'Example yoghurt',
  describes: 'as-sold',
  per: '100g',
  servingSizeG: '',
  energy: '400',
  energyUnit: 'kJ',
  proteinG: '9.6',
  fatG: '2.0',
  saturatedFatG: '1.3',
  carbsG: '5.0',
  overseas: false,
  sugarsG: '4.8',
  fibreG: '',
  fibreNotOnLabel: true,
  sodiumMg: '45',
  packSizeG: '',
  confirmed: [],
};
const ADULT: LabelFormContext = {
  alcoholLoggingAvailable: true,
  otherLabelFoods: [],
  editingId: null,
};
const parse = (patch: Partial<LabelFormInput>, context: Partial<LabelFormContext> = {}) =>
  parseLabelForm({ ...YOGHURT, ...patch }, { ...ADULT, ...context });
const problems = (patch: Partial<LabelFormInput>) => {
  const r = parse(patch);
  return r.ok ? {} : r.problems;
};
const checkKinds = (patch: Partial<LabelFormInput>, context: Partial<LabelFormContext> = {}) => {
  const r = parse(patch, context);
  return r.ok ? [] : r.checks.map((c) => c.kind);
};

describe('parseLabelForm (item 23 design 2.2; C01, C31, C68)', () => {
  it('U10: stores a per-100 g label as typed, fibre not on the label as unknown and 0', () => {
    const r = parse({});
    expect(r).toMatchObject({
      ok: true,
      food: {
        name: 'Example yoghurt',
        nutrientBasis: 'as-sold',
        unknownNutrients: ['fibreG'],
        carbBasisAsEntered: 'available',
        servingSizeG: null,
        packSizesG: [],
      },
    });
    if (!r.ok) throw new Error('refused');
    expect(r.food.nutrientsPer100g).toMatchObject({ energyKj: 400, proteinG: 9.6, fibreG: 0 });
  });

  it('U10: each problem on its own field, and nothing is stored', () => {
    expect(problems({ proteinG: '12,5' })).toEqual({ proteinG: 'not-number' });
    expect(problems({ fatG: '-1' })).toEqual({ fatG: 'not-number' });
    expect(problems({ sugarsG: '' })).toEqual({ sugarsG: 'required' });
    expect(problems({ per: 'serve' })).toEqual({ servingSizeG: 'serving-needed' });
    expect(problems({ overseas: true })).toEqual({ fibreG: 'fibre-needed-overseas' });
    expect(problems({ proteinG: '100.5' })).toEqual({ proteinG: 'too-high' });
    // 35 g protein in a 30 g serve is 116.7 g in 100 g.
    expect(problems({ per: 'serve', servingSizeG: '30', proteinG: '35' })).toEqual({
      proteinG: 'too-high',
    });
    expect(problems({ proteinG: '50', fatG: '50', carbsG: '5', sugarsG: '1' })).toEqual({
      form: 'sum-over',
    });
    expect(problems({ energy: '3801' })).toEqual({ energy: 'energy-too-high' });
    expect(problems({ sodiumMg: '40001' })).toEqual({ sodiumMg: 'sodium-too-high' });
    expect(problems({ packSizeG: '0' })).toEqual({ packSizeG: 'pack-range' });
    expect(problems({ describes: null })).toEqual({ describes: 'choose' });
  });

  it('U10: kcal is stored as kJ (C31), per serve as per 100 g, and an overseas label takes the fibre out (C01)', () => {
    // 94 kcal is 393.3 kJ, within the check of the 322 kJ its macronutrients give.
    const kcal = parse({ energy: '94', energyUnit: 'kcal' });
    expect(kcal.ok && kcal.food.nutrientsPer100g.energyKj).toBeCloseTo(393.296, 3);
    const serve = parse({
      per: 'serve',
      servingSizeG: '170',
      energy: '680',
      proteinG: '16.3',
      fatG: '3.4',
      saturatedFatG: '2.2',
      carbsG: '8.5',
      sugarsG: '8.2',
      sodiumMg: '77',
    });
    expect(serve.ok && serve.food.nutrientsPer100g.proteinG).toBeCloseTo(9.588, 3);
    expect(serve.ok && serve.food.servingSizeG).toBe(170);
    const overseas = parse({
      overseas: true,
      carbsG: '20',
      fibreG: '5',
      fibreNotOnLabel: false,
      sugarsG: '4',
      energy: '600',
    });
    expect(overseas).toMatchObject({
      ok: true,
      food: { carbBasisAsEntered: 'total', nutrientsPer100g: { carbsG: 15, fibreG: 5 } },
    });
    // Fibre is never taken out of an NZ/AU figure.
    const local = parse({
      carbsG: '20',
      fibreG: '5',
      fibreNotOnLabel: false,
      sugarsG: '4',
      energy: '600',
    });
    expect(local.ok && local.food.nutrientsPer100g.carbsG).toBe(20);
  });

  it('U11: a check needs its tick; the energy check reports in the unit and measure typed', () => {
    // A yoghurt's 96 kcal typed as kJ: its macronutrients give 322 kJ per 100 g.
    expect(parse({ energy: '96' })).toMatchObject({
      ok: false,
      problems: {},
      checks: [{ kind: 'energy-mismatch', computed: 322, entered: 96, unit: 'kJ', per: '100g' }],
    });
    expect(parse({ energy: '96', confirmed: ['energy-mismatch'] }).ok).toBe(true);
    // Per serve in kcal: reported per serve in kcal.
    const r = parse({
      per: 'serve',
      servingSizeG: '200',
      energyUnit: 'kcal',
      energy: '50',
      proteinG: '19.2',
      fatG: '4',
      saturatedFatG: '2.6',
      carbsG: '10',
      sugarsG: '9.6',
      sodiumMg: '90',
    });
    expect(r).toMatchObject({
      ok: false,
      checks: [{ kind: 'energy-mismatch', computed: 154, entered: 50, unit: 'kcal', per: 'serve' }],
    });
    expect(checkKinds({ fatG: '0.1', saturatedFatG: '0.2' })).toEqual(['sat-fat-over-fat']);
    expect(parse({ fatG: '0.1', saturatedFatG: '0.2', confirmed: ['sat-fat-over-fat'] }).ok).toBe(
      true,
    );
    expect(checkKinds({ carbsG: '5.0', sugarsG: '5.1' })).toEqual(['sugars-over-carbs']);
    const other = { id: '00000000-0000-4000-8000-000000000001', name: 'example  YOGHURT' };
    expect(checkKinds({}, { otherLabelFoods: [other] })).toEqual(['same-name']);
    expect(checkKinds({}, { otherLabelFoods: [other], editingId: other.id })).toEqual([]);
  });

  it('U11 HS-32: a drink-like name needs a tick from an adult, and is refused outright while alcohol logging is off', () => {
    expect(checkKinds({ name: 'Example lager' })).toEqual(['sounds-like-alcohol']);
    expect(parse({ name: 'Example lager', confirmed: ['sounds-like-alcohol'] }).ok).toBe(true);
    const off = { alcoholLoggingAvailable: false };
    const everyTick = [
      'energy-mismatch',
      'sat-fat-over-fat',
      'sugars-over-carbs',
      'sounds-like-alcohol',
      'same-name',
    ] as const;
    expect(parse({ name: 'Example lager', confirmed: everyTick }, off)).toEqual({
      ok: false,
      problems: { name: 'alcohol-name' },
      checks: [],
    });
    expect(parse({ name: 'Apple cider vinegar' }, off).ok).toBe(true);
  });

  it('U12: a stored food reopens per 100 g in kJ, at most two decimals, and re-parses to the same food', () => {
    const stored = parse({
      per: 'serve',
      servingSizeG: '170',
      energy: '680',
      proteinG: '16.3',
      fatG: '3.4',
      saturatedFatG: '2.2',
      carbsG: '8.5',
      sugarsG: '8.2',
      sodiumMg: '77',
    });
    if (!stored.ok) throw new Error('refused');
    const form = labelFormFrom({ ...stored.food, packSizesG: [500] });
    expect(form).toMatchObject({
      per: '100g',
      energyUnit: 'kJ',
      proteinG: '9.59',
      fibreNotOnLabel: true,
      packSizeG: '500',
    });
    const again = parseLabelForm(form, ADULT);
    if (!again.ok) throw new Error('refused');
    for (const key of NUTRIENT_KEYS)
      expect(again.food.nutrientsPer100g[key], key).toBeCloseTo(
        stored.food.nutrientsPer100g[key],
        2,
      );
    expect(again.food.unknownNutrients).toEqual(['fibreG']);
    // An overseas food keeps its basis; a food floored at 0 available stays at 0.
    for (const [carbs, fibre, available] of [
      ['20', '3', 17],
      ['10', '12', 0],
    ] as const) {
      const overseas = parse({
        overseas: true,
        carbsG: carbs,
        fibreG: fibre,
        fibreNotOnLabel: false,
        sugarsG: '1',
        energy: '500',
        confirmed: ['energy-mismatch'],
      });
      if (!overseas.ok) throw new Error('refused');
      const reopened = parseLabelForm(
        { ...labelFormFrom({ ...overseas.food, packSizesG: [] }), confirmed: ['energy-mismatch'] },
        ADULT,
      );
      expect(reopened).toMatchObject({
        ok: true,
        food: { carbBasisAsEntered: 'total', nutrientsPer100g: { carbsG: available } },
      });
    }
  });
});

describe('labelNameSoundsLikeDrink (C11)', () => {
  it('U19: flags drink names and styles, not foods and soft drinks named after a drink', () => {
    for (const name of [
      'Example lager',
      'Example Steinlager',
      'Example Pinot Noir',
      'Example IPA',
      'Hard seltzer, lime',
      'Example cider',
      'Example RTD',
      'Alcoholic ginger beer',
    ])
      expect(labelNameSoundsLikeDrink(name), name).toBe(true);
    for (const name of [
      'Apple cider vinegar',
      'Red wine vinegar',
      'Ginger beer',
      'Root beer',
      'Kale',
      'Ginger',
      'Scotch fillet',
      'Fruit cocktail in juice',
      'Porterhouse steak',
    ])
      expect(labelNameSoundsLikeDrink(name), name).toBe(false);
  });
});
