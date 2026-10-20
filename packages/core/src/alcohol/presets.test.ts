import { describe, expect, it } from 'vitest';
import { kjToKcal } from '../nutrition/nutrients';
import { defaultBeverage } from '../storage/defaults';
import { isSeedId } from '../storage/primitives';
import type { BeverageRecord, StoredDrinkLabel } from '../storage/records';
import { validateRow } from '../storage/validate';
import {
  labelCheck,
  type PresetFormEvent,
  presetFields,
  presetFormInit,
  presetFormProblems,
  presetFormStep,
  presetFormView,
  presetSummary,
} from './presets';
import { DRINK_PICKER_SERVES } from './serves';

const NOW = '2000-03-01T00:00:00.000Z';
const SEEDED: BeverageRecord = defaultBeverage({
  now: NOW,
  randomId: () => '00000000-0000-4000-8000-000000000001',
});
const SEEDED_LABEL: StoredDrinkLabel = (() => {
  if (SEEDED.label === null) throw new Error('the seeded preset has a label');
  return SEEDED.label;
})();

/** The form after `events`, from the seeded preset. */
function after(events: readonly PresetFormEvent[], stored: BeverageRecord | null = SEEDED) {
  const state = events.reduce((s, e) => presetFormStep(s, e, stored), presetFormInit(stored));
  return { state, view: presetFormView(state, stored), saved: presetFields(stored, state).label };
}
const size = (text: string): PresetFormEvent => ({ kind: 'volume', text });
const CONFIRM: PresetFormEvent = { kind: 'confirm' };

describe('presetSummary (U5; AL-02, NN-01, D42)', () => {
  it('the seeded preset reads 1.3 std and 94 kcal, marked as figures that came with the app', () => {
    expect(presetSummary(SEEDED)).toMatchObject({ std1dp: 1.3, kcal: 94, presetDefault: true });
  });

  it('AL-02: a label figure of 1.4 for 330 mL at 5% is the figure shown', () => {
    const label = { ...SEEDED_LABEL, standardDrinks: 1.4, origin: 'owner' as const };
    expect(presetSummary({ ...SEEDED, label }).std1dp).toBe(1.4);
  });

  it.each([
    [
      'a picker serve with the seeded size and strength',
      { volumeMl: 330, abvPercent: 5, label: null },
    ],
    ['the seeded preset with its size edited to 440 mL', { ...SEEDED, volumeMl: 440 }],
    ['a new preset at 330 mL and 5% with no label', { volumeMl: 330, abvPercent: 5, label: null }],
  ])('NN-01: %s has no energy', (_case, beverage) => {
    expect(presetSummary(beverage).kcal).toBeNull();
  });

  it('the label of the seeded preset no longer counts once its size is edited (C92)', () => {
    expect(presetSummary({ ...SEEDED, volumeMl: 440 })).toMatchObject({
      labelIgnored: true,
      presetDefault: false,
    });
  });
});

describe('the preset form (U5; A17, A42, C31, C92)', () => {
  const stored = SEEDED_LABEL;
  it.each<[string, PresetFormEvent[], Record<string, unknown>, unknown]>([
    [
      'Size 250, then 0.99 typed as standard drinks',
      [size('250'), { kind: 'std', text: '0.99' }],
      { canConfirm: false },
      {
        volumeMl: 250,
        abvPercent: 5,
        standardDrinks: 0.99,
        kcal: null,
        energyAsEntered: null,
        origin: 'owner',
      },
    ],
    [
      'Alcohol 4: the fields clear and say what they were for',
      [{ kind: 'abv', text: '4' }],
      { canConfirm: false, labelWasFor: { volumeMl: 330, abvPercent: 5 } },
      stored,
    ],
    [
      'Size 250, then back to 330: the stored figures come back',
      [size('250'), size('330')],
      { canConfirm: true, labelWasFor: null },
      stored,
    ],
    [
      '"They match my can\'s label"',
      [CONFIRM],
      { canConfirm: false },
      { ...stored, origin: 'owner' },
    ],
    ['confirmed, then Size 250', [CONFIRM, size('250')], { canConfirm: false }, stored],
    [
      'confirmed, then energy 95',
      [CONFIRM, { kind: 'energy', text: '95' }],
      { canConfirm: false },
      { ...stored, kcal: 95, energyAsEntered: { value: 95, unit: 'kcal' }, origin: 'owner' },
    ],
    ['both label fields cleared', [{ kind: 'energy', text: '' }], {}, null],
  ])('%s', (_case, events, view, saved) => {
    const result = after(events);
    expect(result.view).toMatchObject(view);
    expect(result.saved).toEqual(saved);
  });

  it('a size change empties the label fields at once, and the summary of what is saved has no energy', () => {
    const { state, saved } = after([size('250'), { kind: 'std', text: '0.99' }]);
    expect(after([size('250')]).state).toMatchObject({ energyText: '', stdText: '' });
    expect(after([size('250'), size('330')]).state).toMatchObject({ energyText: '94' });
    expect(presetSummary({ volumeMl: 250, abvPercent: 5, label: saved }).kcal).toBeNull();
    expect(state.labelConfirmed).toBe(false);
  });

  it('C31: 393 kJ is stored as typed, with kcal = kjToKcal(393), and passes the validator', () => {
    const fresh = [
      { kind: 'name', text: 'Example lager' },
      size('330'),
      { kind: 'abv', text: '5' },
      { kind: 'unit', unit: 'kJ' },
      { kind: 'energy', text: '393' },
    ] as const satisfies readonly PresetFormEvent[];
    const state = fresh.reduce((s, e) => presetFormStep(s, e, null), presetFormInit(null));
    const label = presetFields(null, state).label;
    expect(label?.kcal).toBe(kjToKcal(393));
    expect(label?.energyAsEntered).toEqual({ value: 393, unit: 'kJ' });
    expect(() =>
      validateRow('beverages', { ...SEEDED, ...presetFields(null, state), sortOrder: 1 }),
    ).not.toThrow();
  });

  it.each([
    ['an empty name', { name: '' }, { name: 'name' }],
    ['a size of 0', { volumeText: '0' }, { volume: 'volume' }],
    ['"5%" as the strength', { abvText: '5%' }, { abv: 'number' }],
    ['5,001 kcal', { energyText: '5001' }, { energy: 'energy' }],
    ['20,920 kJ', { energyText: '20920', energyUnit: 'kJ' }, {}],
    ['101 standard drinks', { stdText: '101' }, { std: 'std' }],
  ] as const)('%s', (_case, over, problems) => {
    expect(presetFormProblems({ ...presetFormInit(SEEDED), ...over })).toEqual(problems);
  });
});

describe('labelCheck and the picker serves (U5; A18, NN-01, AL-01)', () => {
  const can = { volumeMl: 330, abvPercent: 5 };
  it.each([
    ['a printed 0.13', 0.13, null, { stdDisagrees: true, kcalImplausible: false }],
    ['0 kcal', null, 0, { stdDisagrees: false, kcalImplausible: true }],
    ['1.3 and 94 kcal', 1.3, 94, { stdDisagrees: false, kcalImplausible: false }],
  ])('%s', (_case, std, kcal, expected) => {
    expect(labelCheck(can, std, kcal)).toEqual({ calculatedStd: 1.3, ...expected });
  });

  it('the six serves are the AL-01 measures, with unique seed ids and no label', () => {
    expect(DRINK_PICKER_SERVES.map((s) => [s.volumeMl, s.abvPercent])).toEqual([
      [330, 5],
      [440, 5],
      [150, 13],
      [30, 40],
      [500, 4.5],
      [250, 7],
    ]);
    const ids = DRINK_PICKER_SERVES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isSeedId)).toBe(true);
    expect(DRINK_PICKER_SERVES.some((s) => 'label' in s)).toBe(false);
  });
});
