// Each core union's values are exported as a frozen array beside the type, and the two agree
// (section 4.3). The checks are at the type level (tsc runs over test files) and at run time.
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Beverage, DrinkLabel } from '../alcohol/standardDrinks';
import type { EatingWindow } from '../fasting/eatingWindow';
import type { WeighIn } from '../weight/trend';
import type { ActivityLevel, ACTIVITY_FACTORS } from '../energy/energyEstimate';
import { FASTING_PRESET_IDS, FASTING_PRESETS, type FastingPresetId } from '../fasting/eatingWindow';
import {
  type Confidence,
  CONFIDENCES,
  NUTRITION_SOURCES,
  type NutritionSource,
} from '../nutrition/confidence';
import { CARB_BASES, type CarbBasis, type NUTRIENT_KEYS } from '../nutrition/nutrients';
import { ALLERGENS, type Allergen, USER_ALLERGENS, type UserAllergen } from './allergens';
import { CARD_IDS, type CARD_REGISTRY, type CardId } from './cards';
import type {
  BeverageRecord,
  DrinkLogRecord,
  NutrientKey,
  StoredDrinkLabel,
  TargetsRecord,
  WeightRecord,
} from './records';
import { STORAGE_RULES } from './primitives';

describe('enum arrays agree with their unions (section 4.3)', () => {
  it('type level', () => {
    expectTypeOf<(typeof NUTRITION_SOURCES)[number]>().toEqualTypeOf<NutritionSource>();
    expectTypeOf<(typeof CONFIDENCES)[number]>().toEqualTypeOf<Confidence>();
    expectTypeOf<(typeof CARB_BASES)[number]>().toEqualTypeOf<CarbBasis>();
    expectTypeOf<(typeof FASTING_PRESET_IDS)[number]>().toEqualTypeOf<FastingPresetId>();
    expectTypeOf<(typeof NUTRIENT_KEYS)[number]>().toEqualTypeOf<NutrientKey>();
    expectTypeOf<keyof typeof ACTIVITY_FACTORS>().toEqualTypeOf<ActivityLevel>();
    expectTypeOf<(typeof ALLERGENS)[number]>().toEqualTypeOf<Allergen>();
    expectTypeOf<(typeof USER_ALLERGENS)[number]>().toEqualTypeOf<UserAllergen>();
    expectTypeOf<keyof typeof CARD_REGISTRY>().toEqualTypeOf<CardId>();
  });

  it('run time: frozen, without duplicates, and matching the data they describe', () => {
    for (const list of [
      NUTRITION_SOURCES,
      CONFIDENCES,
      CARB_BASES,
      FASTING_PRESET_IDS,
      ALLERGENS,
      USER_ALLERGENS,
      CARD_IDS,
      STORAGE_RULES,
    ]) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(FASTING_PRESETS.map((p) => p.id)).toEqual([...FASTING_PRESET_IDS]);
    expect(ALLERGENS).toHaveLength(15);
    expect(USER_ALLERGENS).toEqual([...ALLERGENS, 'gluten']);
  });
});

describe('stored rows can be passed straight to the core functions (sections 4.3, 4.6, 4.10)', () => {
  it('type level', () => {
    expectTypeOf<WeightRecord>().toExtend<WeighIn>();
    expectTypeOf<BeverageRecord>().toExtend<Beverage>();
    expectTypeOf<DrinkLogRecord['beverage']>().toExtend<Beverage>();
    expectTypeOf<StoredDrinkLabel>().toExtend<DrinkLabel>();
    expectTypeOf<NonNullable<TargetsRecord['eatingWindow']>>().toEqualTypeOf<EatingWindow>();
  });
});
