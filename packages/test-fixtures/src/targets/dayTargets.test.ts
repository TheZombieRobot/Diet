// The targets engine over item 14's weight scenarios (item 21 design section 6.1, U10 and U26):
// WT-08 (the deficit part), C08 and C56. The Kickstart state comes from item 14's one "running
// now" rule, so the figures switch at the same moment as the phase. Synthetic scenarios.
import {
  dayTargetsFromRecords,
  type Instant,
  type LocalDate,
  phaseInputFrom,
  phaseOn,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import {
  onDay,
  SCENARIO_ZONE,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
  weightScenarioInput,
} from '../weight/scenarios';

const { K10, K42, X3, E10 } = WEIGHT_SCENARIOS;

/** The engine's view of a scenario on its day `day` at `time` local. */
function seen(options: WeightScenarioOptions, day: number, time = '09:00') {
  const at: { today: LocalDate; now: Instant } = onDay(options, day, time);
  const snapshot = weightScenario({ ...options, today: at.today });
  const [profile] = snapshot.profile;
  const [targets] = snapshot.targets;
  const [settings] = snapshot.settings;
  if (profile === undefined || targets === undefined || settings === undefined) {
    throw new Error('A scenario always has its singletons');
  }
  const view = dayTargetsFromRecords(
    {
      profile,
      targets,
      settings,
      readiness: snapshot.readiness,
      periods: snapshot.kickstart_periods,
      checks: snapshot.kickstart_checks,
      weights: snapshot.weights,
    },
    { at: at.now, today: at.today, deviceZone: SCENARIO_ZONE },
  );
  const phase = phaseOn(phaseInputFrom(weightScenarioInput({ ...options, ...at })));
  return { view, phase };
}

describe('WT-08: the deficit from the stored periods (U10)', () => {
  it('day 21 is a Kickstart day with the Kickstart deficit; day 22 is Steady at 15%, with nothing written in between', () => {
    const day21 = seen(K42, 21);
    expect(day21.view.targets).toMatchObject({
      figures: 'kickstart',
      deficit: { pct: 30, basis: 'kickstart' },
    });
    const day22 = seen(K42, 22, '00:30');
    expect(day22.view.targets).toMatchObject({
      figures: 'steady',
      kickstartSuspended: null,
      deficit: { pct: 15, basis: 'steady' },
    });
    expect(day22.view.kickstart).toEqual({ running: false });
  });

  it('a stored Steady deficit of 20% is used, and the deficit always lies in 15–20%', () => {
    const steady20 = seen({ ...K42, targets: { steadyDeficitPct: 20 } }, 30);
    expect(steady20.view.targets.deficit).toEqual({ pct: 20, basis: 'steady' });
  });
});

describe('the Kickstart state agrees with the phase engine (C08, C56; U26)', () => {
  it.each([
    ['running (K10 day 10)', K10, 10],
    ['extended (X3 day 28)', X3, 28],
    ['past its scheduled last day (K42 day 25)', K42, 25],
    ['ended early, before the next one (E10 day 12)', E10, 12],
    ['the second period running (E10 day 20)', E10, 20],
  ] as const)('%s', (_name, options, day) => {
    const { view, phase } = seen(options, day);
    expect(view.kickstart.running).toBe(phase.kind === 'kickstart');
    expect(view.targets.figures).toBe(phase.kind === 'kickstart' ? 'kickstart' : 'steady');
  });

  it('a stop-sign check in the running period is reported; the period still runs (HS-11)', () => {
    const { view, phase } = seen({ ...X3, periods: [{ startDay: 1, stopSignOnDay: 19 }] }, 20);
    expect(phase.kind).toBe('kickstart');
    expect(view.kickstart).toMatchObject({ running: true, stopSignReported: true });
    expect(view.targets).toMatchObject({ figures: 'steady', kickstartSuspended: 'stop-sign' });
  });
});

describe('a stop-sign pause outlasts an early end (F4; HEALTH_SAFETY section 4, T27)', () => {
  it('stop-sign at 8:00 on day 20, End at 12:00: no deficit that afternoon or on day 21; Steady from day 22', () => {
    const ended = { ...K42, periods: [{ startDay: 1, stopSignOnDay: 20, endOnDay: 20 }] };
    const day20 = seen(ended, 20, '13:00');
    expect(day20.view.kickstart).toEqual({ running: false, stopSignPauseUntil: '2000-02-21' });
    expect(day20.view.targets.deficit).toEqual({ pct: 0, basis: 'none-stop-sign' });
    expect(seen(ended, 21).view.targets.deficit.basis).toBe('none-stop-sign');
    expect(seen(ended, 22, '00:30').view.targets.deficit).toEqual({ pct: 15, basis: 'steady' });
  });
});
