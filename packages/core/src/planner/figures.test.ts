import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import { countedDay, figureComplete, planDayFigures, planMealFigures } from './figures';
import { fixtureLookup, meal, R } from './testData';

const lookup = fixtureLookup();

describe('planned figures (item 22 S5; FL-05, HS-23, HS-R18)', () => {
  it('the fixture recipes carry design 6.0’s figures per serve', () => {
    const a = lookup.checksOf(R.dinnerA);
    expect(a?.nutritionPerServe).toMatchObject({ energyKj: 4640, proteinG: 70 });
    expect(a?.nutritionPerServe.saturatedFatG).toBeCloseTo(12.6, 6);
    expect(lookup.checksOf(R.gardenF)?.nutritionPerServe).toMatchObject({
      energyKj: 2140,
      proteinG: 54,
      carbsG: 4,
    });
    expect(lookup.checksOf(R.packedG)?.unknownNutrients).toEqual([]);
    expect(lookup.viewOf(R.packedG)?.allergens.facts.allergensUnknown).toBe(true);
  });

  it('FL-05: dinner for 3 with my serves 1 is one serve, and household 3 → 4 changes nothing', () => {
    const one = planMealFigures(meal('dinner', R.dinnerA, 1, 1), lookup.checksOf(R.dinnerA));
    const three = planMealFigures(meal('dinner', R.dinnerA, 1, 3), lookup.checksOf(R.dinnerA));
    const four = planMealFigures(meal('dinner', R.dinnerA, 1, 4), lookup.checksOf(R.dinnerA));
    expect(three.nutrients).toEqual(one.nutrients);
    expect(four.nutrients).toEqual(three.nutrients);
  });

  it('HS-23 property: figures are per serve × my serves for any household 1–50', () => {
    const checks = lookup.checksOf(R.gardenF);
    if (checks === null) throw new Error('fixture');
    for (const household of [1, 2, 7, 20, 50]) {
      for (const my of [0.5, 1, 1.5, 2, 4]) {
        const f = planMealFigures(meal('dinner', R.gardenF, my, household), checks);
        for (const key of NUTRIENT_KEYS) {
          expect(f.nutrients[key]).toBeCloseTo(checks.nutritionPerServe[key] * my, 9);
        }
      }
    }
  });

  it('HS-R18: a missing recipe is incomplete in all eight figures and never complete as 0', () => {
    const f = planMealFigures(meal('dinner', 'seed:recipe-gone'), null);
    expect(f.recipeFound).toBe(false);
    expect(f.unknownNutrients).toEqual([...NUTRIENT_KEYS]);
    const day = planDayFigures([f]);
    for (const key of NUTRIENT_KEYS) expect(figureComplete(day, key)).toBe(false);
  });

  it('shipped state: every figure is unknown with a known part of 0, so energy is never complete', () => {
    const shipped = fixtureLookup({ loaded: false });
    const day = countedDay([meal('dinner', R.dinnerA, 2)], ['dinner'], shipped);
    expect(day.figures.totals.energyKj).toBe(0);
    expect(day.figures.unknownCounts.energyKj).toBe(1);
    expect(figureComplete(day.figures, 'energyKj')).toBe(false);
  });
});
