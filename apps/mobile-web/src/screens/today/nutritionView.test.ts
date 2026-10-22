// The Nutrition today card with figures that are not known (item 18's handover to item 21: H21a to
// H21c; item 18 design 1.4; HS-37, C11, C97, T25). Pure, over the engine's view of synthetic
// scenarios and synthetic log rows; no database.
import {
  dayIntake,
  dayTargetsFromRecords,
  type DayTargetsView,
  NUTRIENT_KEYS,
  sourcesInUse,
} from '@diet/core';
import { foods } from '@diet/core/copy/health';
import {
  exampleAttribution,
  exampleFoodData,
  onDay,
  SCENARIO_ZONE,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { drink, foodEntry, MALE } from '../targets/targetsTestKit';
import { type FoodFigures, nutritionTodayView } from './nutritionView';

function viewOf(options: WeightScenarioOptions, day = 10): DayTargetsView {
  const seen = onDay(options, day);
  const s = weightScenario(seen);
  const [profile] = s.profile;
  const [targets] = s.targets;
  const [settings] = s.settings;
  if (profile === undefined || targets === undefined || settings === undefined) {
    throw new Error('A scenario always has its singletons');
  }
  return dayTargetsFromRecords(
    {
      profile,
      targets,
      settings,
      readiness: s.readiness,
      periods: s.kickstart_periods,
      checks: s.kickstart_checks,
      weights: s.weights,
      cardStates: s.card_state,
    },
    { at: seen.now, today: seen.today, deviceZone: SCENARIO_ZONE },
  );
}

const NOT_LOADED: FoodFigures = { loaded: false, approved: [], attributions: {} };
/** A planned dinner whose ingredients have no figures yet: every figure not known. */
const notLoadedDinner = () =>
  foodEntry('18:00', 'Example planned dinner', {}, { unknown: [...NUTRIENT_KEYS] });
const allText = (model: ReturnType<typeof nutritionTodayView>) =>
  [
    ...model.rows.map((r) => r.value),
    ...model.pair.map((r) => r.value),
    ...model.notes.map((n) => n.text),
    model.energyNote ?? '',
    model.footer,
  ].join('\n');

describe('the Nutrition today card when food figures are not known (item 18; HS-37)', () => {
  it('H21a C11: not-loaded food and two known drinks: energy "not known", no "Food 0 kJ", no energy parts drawn, no badge', () => {
    const food = [notLoadedDinner()];
    const drinks = [drink('2000-02-09T20:00:00.000Z', 1), drink('2000-02-09T21:00:00.000Z', 1)];
    const model = nutritionTodayView(
      viewOf(MALE),
      dayIntake(food, drinks),
      food,
      'keto',
      NOT_LOADED,
    );
    const [energy] = model.rows;
    expect(energy?.value).toBe(foods.figures.notKnown);
    expect(energy?.segments).toEqual([]);
    expect(energy?.state).toBe('incomplete');
    expect(model.notes.find((n) => n.part === 'alcohol')?.text).toMatch(/^Food: not known · /);
    expect(allText(model)).not.toMatch(/\b0 kJ\b/);
    expect(allText(model)).not.toMatch(/at least 0\b/);
    expect(model.entries.map((e) => e.tag)).toEqual([null]);
    expect(model.energyNote).toBe(foods.today.figuresNotLoaded);
    expect(model.footer).toBe(foods.footer.noDatabase);
  });

  it('H21b T25: under answer 5, not-loaded figures read "not known" with no bar and no state', () => {
    const food = [notLoadedDinner()];
    const view = viewOf({ ...MALE, readiness: { q5: 'yes' } });
    const model = nutritionTodayView(view, dayIntake(food, []), food, 'keto', NOT_LOADED);
    for (const row of [...model.rows, ...model.pair]) {
      expect(row.value, row.label).toBe(foods.figures.notKnown);
      expect(row.segments, row.label).toBeNull();
    }
    expect(model.energyNote).toBeNull();
  });

  it('H21c D35: protein 17.6 g known and incomplete reads "at least 17 of 140 g", never complete', () => {
    const food = [
      foodEntry('12:00', 'Example lunch', { energyKj: 2000, proteinG: 17.6 }),
      foodEntry('13:00', 'Example snack', { energyKj: 500 }, { unknown: ['proteinG'] }),
    ];
    const model = nutritionTodayView(viewOf(MALE), dayIntake(food, []), food, 'keto', NOT_LOADED);
    const protein = model.rows[1];
    expect(protein?.value).toBe('at least 17 of 140 g');
    expect(protein?.state).toBe('incomplete');
    // Grams below 10 g show one decimal (item 18's rounding, X2).
    const small = [foodEntry('12:00', 'Example', { fibreG: 2.3 })];
    const fibre = nutritionTodayView(viewOf(MALE), dayIntake(small, []), small, 'keto', NOT_LOADED)
      .rows[2];
    expect(fibre?.value).toMatch(/^2\.3 of /);
  });

  it('NU-09 C97: the footer names a database only for an approved one shown; the not-loaded line goes once figures load', () => {
    const food = [foodEntry('12:00', 'Example', { energyKj: 900 }, { confidence: 'database' })];
    const loaded: FoodFigures = {
      loaded: sourcesInUse(exampleFoodData('usda')).length > 0,
      approved: ['usda'],
      attributions: exampleAttribution,
    };
    const model = nutritionTodayView(viewOf(MALE), dayIntake(food, []), food, 'keto', loaded);
    expect(model.footer).toBe(
      'Database figures are averages from Example database. Label figures are as you typed them, and Estimates are approximate. Your plate will differ.',
    );
    expect(model.entries[0]?.tag).toEqual({ tone: 'neutral', text: foods.badges.database });
    const unknownFood = [notLoadedDinner()];
    expect(
      nutritionTodayView(viewOf(MALE), dayIntake(unknownFood, []), unknownFood, 'keto', loaded)
        .energyNote,
    ).toBeNull();
    // A label-only day names no database, even with one approved.
    const labelled = [foodEntry('12:00', 'Example', { energyKj: 900 }, { confidence: 'label' })];
    expect(
      nutritionTodayView(viewOf(MALE), dayIntake(labelled, []), labelled, 'keto', loaded).footer,
    ).toBe(foods.footer.noDatabase);
  });

  it('C97 N43: a Database entry restored while no database is approved is tagged Estimate, under the no-database footer', () => {
    const food = [foodEntry('12:00', 'Example', { energyKj: 900 }, { confidence: 'database' })];
    const model = nutritionTodayView(viewOf(MALE), dayIntake(food, []), food, 'keto', NOT_LOADED);
    expect(model.entries[0]?.tag).toEqual({ tone: 'amber', text: foods.badges.estimate });
    expect(model.footer).toBe(foods.footer.noDatabase);
    expect(allText(model)).not.toContain(foods.badges.database);
  });

  it('C11 D35: "Food: at least" never rounds up, and a fibre bar with a missing figure is incomplete', () => {
    const food = [
      foodEntry('12:00', 'Example lunch', { energyKj: 6999.6, fibreG: 4 }),
      foodEntry('13:00', 'Example snack', {}, { unknown: ['energyKj', 'fibreG'] }),
    ];
    const drinks = [drink('2000-02-09T20:00:00.000Z', 1)];
    const model = nutritionTodayView(
      viewOf(MALE),
      dayIntake(food, drinks),
      food,
      'keto',
      NOT_LOADED,
    );
    expect(model.notes.find((n) => n.part === 'alcohol')?.text).toMatch(
      /^Food: at least 6,999 kJ · /,
    );
    expect(model.rows[2]?.state).toBe('incomplete');
  });
});
