// The planner's windows and per-date targets from stored records (item 22 design S2, S3; cross-item
// rulings 2 and 4; C07, C55, HS-22, HS-25, C65, T27). Synthetic scenarios.
import {
  addDays,
  type DayTargetRecords,
  type DayTargetsInput,
  dayTargetsFromRecords,
  dayWindow,
  type Id,
  type KickstartEndReason,
  planDayContextFor,
  planDayTargets,
  plannerScheduleOf,
  type PlannerClock,
  type PlanDayRecord,
  type PlanRecords,
  planSlotsFor,
  planTargetsBase,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import {
  onDay,
  SCENARIO_DAY1,
  SCENARIO_ZONE,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '../weight/scenarios';

const { K10 } = WEIGHT_SCENARIOS;
const date = (day: number) => addDays(SCENARIO_DAY1, day - 1);

/** The planner's records and clock for a scenario on day `day` at 09:00. */
function setup(
  options: WeightScenarioOptions,
  day: number,
  extra: {
    readonly planDays?: PlanRecords['planDays'];
    readonly endsPending?: ReadonlyMap<Id, KickstartEndReason>;
  } = {},
): { readonly records: PlanRecords; readonly clock: PlannerClock } {
  const seen = onDay(options, day);
  const s = weightScenario(seen);
  const [profile] = s.profile;
  const [targets] = s.targets;
  const [settings] = s.settings;
  if (profile === undefined || targets === undefined || settings === undefined)
    throw new Error('scenario');
  const records: PlanRecords = {
    profile,
    targets,
    settings,
    readiness: s.readiness,
    periods: s.kickstart_periods,
    checks: s.kickstart_checks,
    weights: s.weights,
    cardStates: s.card_state,
    planDays: extra.planDays ?? [],
    ownRecipes: [],
    ownIngredients: [],
    overrides: [],
    symptoms: [],
  };
  return {
    records,
    clock: {
      at: seen.now,
      today: seen.today,
      deviceZone: SCENARIO_ZONE,
      ...(extra.endsPending === undefined ? {} : { endsPending: extra.endsPending }),
    },
  };
}

/** The windows the planner gives scenario days `from` to `to`. */
function windows(
  options: WeightScenarioOptions,
  day: number,
  from: number,
  to: number,
  extra = {},
) {
  const { records, clock } = setup(options, day, extra);
  const base = planTargetsBase(records, clock);
  const ps = plannerScheduleOf(records, base, clock);
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const w = dayWindow(date(from + i), ps);
    return w === null ? null : `${w.start}-${w.end}`;
  });
}

const ONE = '18:00-19:00';
const TWO = '17:00-19:00';

describe('the planner’s windows (item 22 S2; rulings 2 and 4, C07, C55, HS-03)', () => {
  it('(a) Kickstart day 20 with the untouched default: one meal to day 21, 22:2 from day 22', () => {
    expect(windows(K10, 20, 20, 23)).toEqual([ONE, ONE, TWO, TWO]);
  });

  it('(b) Steady with the untouched default plans 22:2; (e) a 23:1 the owner chose stays 23:1', () => {
    const steady: WeightScenarioOptions = { ...K10, periods: [] };
    expect(windows(steady, 20, 20, 22)).toEqual([TWO, TWO, TWO]);
    const chosen = {
      ...steady,
      targets: {
        fastingPreset: '23:1',
        eatingWindow: { start: '18:00', end: '19:00' },
        presetChosenBy: 'user',
      },
    } as WeightScenarioOptions;
    expect(windows(chosen, 20, 20, 22)).toEqual([ONE, ONE, ONE]);
  });

  it('(c) answer 5 "yes": no window on any date, stored per-day windows ignored', () => {
    const q5 = { ...K10, readiness: { q5: 'yes' } } as WeightScenarioOptions;
    const planDays = [
      {
        date: date(21),
        dietMode: 'keto',
        meals: [],
        eatingWindow: { start: '17:00', end: '19:00' },
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
    ] satisfies PlanDayRecord[];
    expect(windows(q5, 20, 20, 22, { planDays })).toEqual([null, null, null]);
  });

  it('(d) answer 4 unanswered, and (g) answer 4 "yes" mid-Kickstart, never plan one meal a day (ruling 4)', () => {
    for (const q4 of [null, 'yes'] as const) {
      const options = { ...K10, readiness: { q4 } } as WeightScenarioOptions;
      expect(windows(options, 10, 10, 22).every((w) => w === TWO)).toBe(true);
    }
  });

  it('(f) no fasting plan: no window, the ordinary pattern; (h) a latched end reads 22:2 from today', () => {
    const none = {
      ...K10,
      targets: { fastingPreset: null, eatingWindow: null, presetChosenBy: 'user' },
    } as WeightScenarioOptions;
    expect(windows(none, 20, 20, 21)).toEqual([null, null]);
    expect(planSlotsFor(null).pattern).toBe('ordinary');
    const { records } = setup(K10, 15);
    const id = records.periods[0]?.id ?? '';
    expect(
      windows(K10, 15, 15, 16, { endsPending: new Map([[id, 'user-ended' as const]]) }),
    ).toEqual([TWO, TWO]);
  });

  it('V3: a past date shows only its stored window and counts every stored meal', () => {
    const planDays = [
      {
        date: date(18),
        dietMode: 'keto',
        meals: [],
        eatingWindow: { start: '17:00', end: '19:00' },
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
    ] satisfies PlanDayRecord[];
    const { records, clock } = setup(K10, 20, { planDays });
    const base = planTargetsBase(records, clock);
    const ctx = planDayContextFor(records, clock, plannerScheduleOf(records, base, clock), base);
    expect(ctx(date(18))).toMatchObject({ state: 'past', window: { start: '17:00' } });
    expect(ctx(date(18)).counted).toEqual(['breakfast', 'lunch', 'meal1', 'snack', 'dinner']);
    expect(ctx(date(19)).window).toBeNull();
  });
});

describe('each date’s targets (item 22 S3; HS-22, HS-25, C65, T27)', () => {
  it('today’s are item 21’s; Kickstart figures to the last day, Steady figures after it', () => {
    const { records, clock } = setup(K10, 20);
    const base = planTargetsBase(records, clock);
    expect(planDayTargets(base, clock.today)).toEqual(
      dayTargetsFromRecords(records as DayTargetRecords, clock).targets,
    );
    const d21 = planDayTargets(base, date(21));
    const d22 = planDayTargets(base, date(22));
    expect([d21.figures, d22.figures]).toEqual(['kickstart', 'steady']);
    expect([d21.protein.checkTargetG, d22.protein.checkTargetG]).toEqual([140, 120]);
    expect(d21.netCarbs).toMatchObject({ kind: 'ceiling', grams: 20 });
    expect(d22.netCarbs).toMatchObject({ kind: 'ceiling', basis: 'keto' });
    expect(d21.deficit.pct).toBeGreaterThan(d22.deficit.pct);
  });

  it('T27: a stop-sign check pauses Kickstart figures on every later date (a 120 g check)', () => {
    const paused = { ...K10, periods: [{ startDay: 1, extensions: 1, stopSignOnDay: 20 }] };
    const { records, clock } = setup(paused, 20);
    const base = planTargetsBase(records, clock);
    for (const day of [20, 21, 22])
      expect(planDayTargets(base, date(day)).protein.checkTargetG).toBe(120);
  });

  it('HS-22: no window or preset reaches the targets', () => {
    const noWindow: 'eatingWindow' | 'fastingPreset' extends keyof DayTargetsInput ? false : true =
      true;
    expect(noWindow).toBe(true);
    expect(planDayTargets.length).toBe(2);
  });
});
