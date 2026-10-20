// The garden, pantry and harvest forms (item 19 design 2.2 and 2.4; A4; GD-03, G15, G29, G31).
// Item 13's add-a-crop rows (U29) stay in fasting/schedule.test.ts. Synthetic values.
import { describe, expect, it } from 'vitest';
import { validateRow } from '../storage/validate';
import type { GardenRecord } from '../storage/records';
import {
  checkGardenCrop,
  type FormProblem,
  type GardenCropDraft,
  gardenProblemText,
  type InventoryField,
  numberFieldText,
} from './cropForm';
import { checkHarvest } from './harvest';
import { checkPantryItem } from './pantryForm';

const TODAY = '2000-01-10';
const draft: GardenCropDraft = {
  name: 'Example lettuce',
  amount: '2',
  unit: 'each',
  harvestReady: false,
  keepsDays: '',
  ingredientId: null,
  gramsPerUnit: '',
  harvestedAt: '',
};
const stored = (harvestedAt: string): GardenRecord => ({
  id: '0b6f1d2e-0000-4000-8000-000000000201',
  ingredientId: null,
  name: 'Example lettuce',
  amount: 2,
  unit: 'each',
  gramsPerUnit: null,
  harvestReady: true,
  harvestedAt,
  perishabilityDays: null,
  updatedAt: '2000-01-01T00:00:00.000Z',
});
const context = { today: TODAY, previous: null };
const row = { id: '0b6f1d2e-0000-4000-8000-000000000202', updatedAt: '2000-01-10T00:00:00.000Z' };

describe('the item 19 crop, pantry and harvest fields (A4)', () => {
  it.each([
    ['grams per item kept for each', { gramsPerUnit: '250.5' }, { gramsPerUnit: 250.5 }],
    [
      'grams per unit dropped for grams',
      { unit: 'g', gramsPerUnit: '250' },
      { gramsPerUnit: null },
    ],
    [
      'grams per unit dropped with no amount',
      { amount: '', gramsPerUnit: '250' },
      { unit: null, gramsPerUnit: null },
    ],
    ['a picked date today', { harvestedAt: TODAY }, { harvestedAt: TODAY }],
    [
      'the link passed through',
      { ingredientId: 'seed:silverbeet' },
      { ingredientId: 'seed:silverbeet' },
    ],
  ] as const)('accepted: %s', (_name, patch, expected) => {
    const checked = checkGardenCrop({ ...draft, ...patch }, context);
    expect(checked).toMatchObject({ ok: true, value: expected });
    if (checked.ok) expect(() => validateRow('garden', { ...checked.value, ...row })).not.toThrow();
  });

  it.each([
    ['a picked date after today', { harvestedAt: '2000-01-11' }, { harvestedAt: 'future' }],
    ['a picked date before 2000', { harvestedAt: '1999-12-31' }, { harvestedAt: 'too-early' }],
    ['a date that is not one', { harvestedAt: '2000-02-30' }, { harvestedAt: 'format' }],
    ['grams per item over 5,000', { gramsPerUnit: '5001' }, { gramsPerUnit: 'range' }],
    ['"1,200" for an amount (G31)', { amount: '1,200' }, { amount: 'not-a-number' }],
    // Item 19 review: the screens show two decimal places, so "0.001" would read "0".
    ['three decimal places in an amount', { amount: '0.001' }, { amount: 'decimals' }],
    ['three decimal places per item', { gramsPerUnit: '250.125' }, { gramsPerUnit: 'decimals' }],
  ] as const)('refused: %s', (_name, patch, problems) => {
    expect(checkGardenCrop({ ...draft, ...patch }, context)).toEqual({ ok: false, problems });
  });

  it('G31: an unchanged stored figure saves as it is, however many decimal places it has', () => {
    const previous = { ...stored(TODAY), amount: 1e-7, unit: 'g' as const };
    const field = numberFieldText(previous.amount);
    expect(field).toBe('0.0000001');
    expect(
      checkGardenCrop({ ...draft, unit: 'g', amount: field }, { today: TODAY, previous }),
    ).toMatchObject({ ok: true, value: { amount: 1e-7 } });
    expect(
      checkGardenCrop({ ...draft, unit: 'g', amount: '0.0000002' }, { today: TODAY, previous }),
    ).toMatchObject({ problems: { amount: 'decimals' } });
    // "2.50" is two decimal places, "1200" none.
    expect(checkGardenCrop({ ...draft, amount: '2.50' }, context)).toMatchObject({ ok: true });
    expect(
      checkPantryItem({ name: 'Example rice', ingredientId: null, amount: '0.005', unit: 'g' }),
    ).toMatchObject({ problems: { amount: 'decimals' } });
    expect(
      checkPantryItem(
        { name: 'Example rice', ingredientId: null, amount: '0.005', unit: 'g' },
        { amount: 0.005 },
      ),
    ).toMatchObject({ ok: true, value: { amount: 0.005 } });
  });

  it('G15: a stored date after today is accepted while unchanged, and refused once changed', () => {
    const previous = stored('2000-01-12');
    expect(
      checkGardenCrop({ ...draft, harvestedAt: '2000-01-12' }, { today: TODAY, previous }).ok,
    ).toBe(true);
    expect(
      checkGardenCrop({ ...draft, harvestedAt: '2000-01-11' }, { today: TODAY, previous }),
    ).toMatchObject({
      problems: { harvestedAt: 'future' },
    });
  });

  it('G29: a pantry amount of 0 needs a unit; an empty amount stores nulls; every accepted item is valid', () => {
    const item = { name: 'Example rice', ingredientId: null, amount: '0', unit: null };
    expect(checkPantryItem(item)).toEqual({ ok: false, problems: { unit: 'required' } });
    expect(checkPantryItem({ ...item, amount: '-1', unit: 'g' })).toMatchObject({
      problems: { amount: 'not-a-number' },
    });
    for (const accepted of [
      { ...item, unit: 'g' as const },
      { ...item, amount: '', unit: 'ml' as const },
      { ...item, amount: '100000', unit: 'each' as const },
    ]) {
      const checked = checkPantryItem(accepted);
      if (!checked.ok) throw new Error('expected the pantry item to be accepted');
      expect(() => validateRow('pantry', { ...checked.value, ...row })).not.toThrow();
    }
    expect(checkPantryItem({ ...item, amount: '' })).toMatchObject({
      value: { amount: null, unit: null },
    });
  });

  it('a harvest needs a picked date, and keeps the crop form number rules', () => {
    const harvest = { amount: '300', unit: 'g' as const, gramsPerUnit: '', pickedOn: TODAY };
    expect(checkHarvest(harvest, TODAY)).toEqual({
      ok: true,
      value: { amount: 300, unit: 'g', gramsPerUnit: null, pickedOn: TODAY },
    });
    expect(checkHarvest({ ...harvest, pickedOn: ' ' }, TODAY)).toEqual({
      ok: false,
      problems: { pickedOn: 'format' },
    });
    expect(checkHarvest({ ...harvest, amount: '2', unit: null }, TODAY)).toMatchObject({
      problems: { unit: 'required' },
    });
    expect(checkHarvest({ ...harvest, amount: '0.001' }, TODAY)).toMatchObject({
      problems: { amount: 'decimals' },
    });
    // The crop's own weight per item, prefilled, keeps its value while unchanged.
    const each = { ...harvest, amount: '2', unit: 'each' as const, gramsPerUnit: '250.125' };
    expect(checkHarvest(each, TODAY)).toMatchObject({ problems: { gramsPerUnit: 'decimals' } });
    expect(checkHarvest(each, TODAY, { gramsPerUnit: 250.125 })).toMatchObject({
      value: { gramsPerUnit: 250.125 },
    });
  });

  it('every field and problem has words', () => {
    const fields: InventoryField[] = [
      'name',
      'amount',
      'unit',
      'keepsDays',
      'gramsPerUnit',
      'harvestedAt',
      'pickedOn',
    ];
    const problems: FormProblem[] = [
      'required',
      'length',
      'range',
      'not-a-number',
      'format',
      'future',
      'too-early',
      'decimals',
    ];
    for (const field of fields) {
      for (const problem of problems) {
        for (const source of ['garden', 'pantry'] as const) {
          expect(
            gardenProblemText(field, problem, source).length,
            `${field} ${problem}`,
          ).toBeGreaterThan(0);
        }
      }
    }
    expect(gardenProblemText('amount', 'range', 'pantry')).not.toBe(
      gardenProblemText('amount', 'range'),
    );
  });
});
