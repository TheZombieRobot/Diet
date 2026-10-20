// The Energy card's explanation lines and the Nutrition card's note order (item 21 design section
// 6.3, H1 to H17): C61, C102, C108, T26, T27, T36. Pure, over the engine's view of synthetic
// scenarios; no database.
import { dayIntake, dayTargetsFromRecords, type DayTargetsView } from '@diet/core';
import { alcohol, readiness, targets as copy, weight } from '@diet/core/copy/health';
import {
  onDay,
  SCENARIO_ZONE,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { nutritionTodayView } from '../today/nutritionView';
import { energyExplanation } from './energyExplanation';
import { drink, FEMALE, foodEntry, MALE, MALE_STEADY } from './targetsTestKit';

/** The engine's view of a scenario on its day `day` at 09:00. */
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
    },
    { at: seen.now, today: seen.today, deviceZone: SCENARIO_ZONE },
  );
}

const lines = (options: WeightScenarioOptions, day?: number) =>
  energyExplanation(viewOf(options, day)).lines;
const stopSign = { ...MALE, periods: [{ startDay: 1, stopSignOnDay: 19 }] };

describe('the first matching explanation (C61, C108; H1 to H14)', () => {
  it('H1, H2: no estimate under 18 says only that; a missing input names the floor in kJ and kcal', () => {
    expect(lines({ ...MALE_STEADY, readiness: { q1: 'yes' } })).toEqual([
      copy.energy.noTargetNotEstimated,
    ]);
    expect(lines({ ...MALE, heightCm: null })[0]).toBe(
      'With no rough guide there is no energy target, so the planner does not fill days by itself and Kickstart figures are not used. The 5,000 kJ floor (about 1,200 kcal) still applies to every plan.',
    );
  });

  it('H3, H4, H9: below the floor the line names the floor and never a percentage', () => {
    const raised = lines({ ...FEMALE, periods: [], targets: { energyFloorKj: 6000 } });
    expect(raised[0]).toContain('below the 6,000 kJ floor');
    const wt06 = lines(FEMALE);
    expect(wt06[0]).toMatch(/^This is the energy floor/);
    expect([...raised, ...wt06].join(' ')).not.toContain('%');
  });

  it('H5: answer 2 plans at the guide with the pregnancy note and the readiness link', () => {
    const explained = energyExplanation(viewOf({ ...MALE, readiness: { q2: 'yes' } }));
    expect(explained.lines[0]).toBe(
      'The energy deficit is off because of what you told the app about pregnancy or breastfeeding. Meals are planned at the rough guide.',
    );
    expect(explained.lines).toContain(copy.energy.pregnancyNote);
    expect(explained.readinessLink).toBe(true);
  });

  it('H10 to H14: Kickstart, a 0% Kickstart, Steady, and a Kickstart suspended by readiness or the mode', () => {
    expect(lines(MALE)[0]).toBe(
      'Kickstart: 30% below the rough guide, with protein held at 140 g and net carbs at 20 g.',
    );
    expect(lines({ ...MALE, targets: { kickstartDeficitPct: 0 } })[0]).toBe(
      'Kickstart with no deficit, because you set the Kickstart deficit to 0%. Protein is held at 140 g and net carbs at 20 g.',
    );
    expect(lines(MALE_STEADY)[0]).toBe('Steady: 15% below the rough guide.');
    const q3 = energyExplanation(viewOf({ ...MALE, readiness: { q3: 'yes' } }));
    expect(q3.lines.slice(0, 2)).toEqual([
      'Steady: 15% below the rough guide.',
      'Kickstart is off because of what you told the app about diabetes medication. Kickstart figures are not in use.',
    ]);
    expect(q3.readinessLink).toBe(true);
    expect(lines({ ...MALE, dietMode: 'balanced' })[1]).toBe(
      copy.energy.kickstartSuspended['diet-mode'],
    );
  });
});

describe('the lines after it (T16, T27, C102; H7, H8, H15, H16)', () => {
  it('H7, F36: a stop-sign pause carries item 14’s one wording of the action and 111, then the 111 and Healthline rows', () => {
    const explained = energyExplanation(viewOf(stopSign, 20));
    expect(explained.lines).toContain(copy.energy.kickstartSuspended['stop-sign']);
    expect(explained.lines).toContain(weight.stopSigns.action);
    expect(explained.lines).toContain('Call 111 if you faint or feel very unwell.');
    expect(explained.stopSignRows).toBe(true);
    expect(energyExplanation(viewOf(MALE, 20)).stopSignRows).toBe(false);
  });

  it('F4: after End Kickstart on the stop-sign day, no deficit until its scheduled last day, and why', () => {
    const ended = { ...MALE, periods: [{ startDay: 1, stopSignOnDay: 20, endOnDay: 20 }] };
    const view = viewOf(ended, 21);
    expect(view.targets.deficit.basis).toBe('none-stop-sign');
    const explained = energyExplanation(view);
    expect(explained.lines[0]).toBe(
      'Because of the stop-sign you reported, no deficit is planned until the end of 21 February 2000, the day this Kickstart was due to finish. After that the app plans with the Steady deficit.',
    );
    expect(explained.lines).toContain(weight.stopSigns.action);
    expect(explained.stopSignRows).toBe(true);
  });

  it('H8: with answer 4 unanswered, the blood-pressure wording replaces the salt line', () => {
    const text = lines({ ...stopSign, readiness: { q4: null } }, 20);
    expect(text).toContain(readiness.bloodPressure.stopSign);
    expect(text).not.toContain(weight.stopSigns.action);
  });

  it('H15, H16: an older weigh-in asks for a new one; the alcohol line is last, only where alcohol is logged', () => {
    const stale = lines({ ...MALE_STEADY, days: (d) => d <= 5 }, 21);
    expect(stale.slice(-2)).toEqual([copy.energy.staleWeight, alcohol.dayEnergy.foodOnly]);
    expect(lines({ ...MALE_STEADY, days: (d) => d <= 7 }, 21)).not.toContain(
      copy.energy.staleWeight,
    );
    expect(lines({ ...MALE, readiness: { q1: 'yes' } })).not.toContain(alcohol.dayEnergy.foodOnly);
  });
});

describe('the Nutrition card’s notes, in order (H17)', () => {
  it('missing figures, food and alcohol, unknown drinks, the floor, then the pregnancy note', () => {
    const view = viewOf({ ...FEMALE, readiness: { q2: 'yes' }, targets: { energyFloorKj: 9000 } });
    const food = [
      foodEntry('12:00', 'Example', { energyKj: 3000 }, { unknown: ['proteinG', 'fibreG'] }),
    ];
    const drinks = [
      drink('2000-02-09T20:00:00.000Z', 1),
      drink('2000-02-09T21:00:00.000Z', 2, null),
    ];
    const model = nutritionTodayView(view, dayIntake(food, drinks), food, 'keto');
    expect(model.notes).toEqual([
      { text: '1 entry has no protein figure, so the total is at least what is shown.' },
      { text: '1 entry has no fibre figure, so the total is at least what is shown.' },
      { text: 'Food 3,000 kJ · Alcohol 393 kJ', part: 'alcohol' },
      { text: 'Energy is unknown for 2 drinks, so the day total is incomplete.', part: 'alcohol' },
      { text: "Today's energy figure is the 9,000 kJ floor: a safety net, not a target." },
      { text: copy.energy.pregnancyNote },
    ]);
  });
});
