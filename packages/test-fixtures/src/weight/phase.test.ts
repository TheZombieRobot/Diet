// The phase engine (item 14 design section 6.2, weight/phase.test.ts): WT-08, WT-09, WT-11,
// WT-12; HS-27; C45, C56, C59; D27, D28; W9, W13, W14, W22, W31, W32. Synthetic scenarios.
import {
  addDays,
  effectiveDeficit,
  extensionOfferDue,
  kickstartEndNeeded,
  kickstartNotStarted,
  kickstartPending,
  kickstartStartAvailability,
  type PhaseInput,
  phaseInputFrom,
  phaseOn,
  rapidLossExemptDates,
  stopSignsDue,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import {
  onDay,
  Q3_OPEN_GATES,
  Q5_YES_GATES,
  scenarioInstant,
  SCENARIO_DAY1,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenarioInput,
} from './scenarios';

const { K10, K42, X3, R2, E10, PENDING } = WEIGHT_SCENARIOS;
type Over = Parameters<typeof weightScenarioInput>[0] extends infer T ? Partial<T> : never;

/** The phase input of a scenario on its day `day` at 09:00 local. */
function on(options: WeightScenarioOptions, day: number, over: Over = {}): PhaseInput {
  return phaseInputFrom(weightScenarioInput({ ...onDay(options, day), ...over }));
}

const oneExtension: WeightScenarioOptions = { ...K42, periods: [{ startDay: 1, extensions: 1 }] };
/** The local date of scenario day `day`. */
const date = (day: number) => addDays(SCENARIO_DAY1, day - 1);
/** The local dates of scenario days `from` to `to`, inclusive. */
const dates = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => date(from + i));

describe('phase from the stored periods (WT-08, C45)', () => {
  it('day 21 is Kickstart week 3 of 3; day 22 is Steady with no launch in between (only the clock moves)', () => {
    const day21 = on(K42, 21);
    expect(phaseOn(day21)).toMatchObject({ kind: 'kickstart', day: 21, week: 3, weeks: 3 });
    const day22 = { ...day21, now: scenarioInstant(SCENARIO_DAY1, 22, '00:30'), today: date(22) };
    expect(phaseOn(day22)).toEqual({ kind: 'steady', lastKickstartEnd: date(21) });
  });

  it('after one extension, day 28 is week 4 of 4 and day 29 is Steady; weeks = 3 + extensions', () => {
    expect(phaseOn(on(oneExtension, 28))).toMatchObject({ kind: 'kickstart', week: 4, weeks: 4 });
    expect(phaseOn(on(oneExtension, 29)).kind).toBe('steady');
  });

  it('WT-08: from day 22 the planner gets the Steady deficit (15–20%), never the Kickstart one', () => {
    const input = on(K42, 22);
    const figures = phaseOn(input).kind === 'kickstart' ? 'kickstart' : 'steady';
    expect(
      effectiveDeficit({
        figures,
        dietMode: input.dietMode,
        gates: input.gates,
        stopSignPause: false,
        kickstartDeficitPct: 30,
        steadyDeficitPct: 15,
      }),
    ).toEqual({ pct: 15, basis: 'steady' });
  });

  it('week labels: days 1, 7, 8, 14, 15, 21 are weeks 1, 1, 2, 2, 3, 3', () => {
    const weeks = [1, 7, 8, 14, 15, 21].map((day) => {
      const phase = phaseOn(on(K42, day));
      return phase.kind === 'kickstart' ? phase.week : null;
    });
    expect(weeks).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe('Kickstart only while keto mode and the readiness gates allow it (C56, DECISIONS)', () => {
  it('a running period in balanced mode reads Steady and asks for a left-keto end', () => {
    const input = on(K10, 10, { dietMode: 'balanced' });
    expect(phaseOn(input).kind).toBe('steady');
    expect(kickstartEndNeeded(input)).toBe('left-keto');
  });

  it('item 21 T7: a keto run broken since the start (carbCeilingStartedAt later) reads Steady and asks for left-keto', () => {
    const input = on(K10, 10, {
      profile: { carbCeilingStartedAt: scenarioInstant(SCENARIO_DAY1, 5, '10:00') },
    });
    expect(phaseOn(input).kind).toBe('steady');
    expect(kickstartEndNeeded(input)).toBe('left-keto');
    expect(kickstartEndNeeded(on(K10, 10, { profile: { carbCeilingStartedAt: null } }))).toBe(
      'left-keto',
    );
  });

  it('answer 5 gives no phase and answer 3 open gives Steady, both ending as readiness-gated, which is checked first', () => {
    expect(phaseOn(on(K10, 10, { gates: Q5_YES_GATES }))).toEqual({ kind: 'none' });
    expect(kickstartEndNeeded(on(K10, 10, { gates: Q5_YES_GATES }))).toBe('readiness-gated');
    expect(phaseOn(on(K10, 10, { gates: Q3_OPEN_GATES })).kind).toBe('steady');
    expect(kickstartEndNeeded(on(K10, 10, { gates: Q3_OPEN_GATES }))).toBe('readiness-gated');
    expect(kickstartEndNeeded(on(K10, 10, { gates: Q3_OPEN_GATES, dietMode: 'balanced' }))).toBe(
      'readiness-gated',
    );
    expect(kickstartEndNeeded(on(K10, 10))).toBeNull();
  });

  it('never restarts by itself: an ended period stays Steady when keto or the gates come back', () => {
    const leftKeto = {
      ...K10,
      periods: [{ startDay: 1, endOnDay: 5, endReason: 'left-keto' as const }],
    };
    expect(phaseOn(on(leftKeto, 10)).kind).toBe('steady');
    expect(kickstartEndNeeded(on(leftKeto, 10))).toBeNull();
    const gated = {
      ...K10,
      periods: [{ startDay: 1, endOnDay: 5, endReason: 'readiness-gated' as const }],
    };
    expect(phaseOn(on(gated, 10)).kind).toBe('steady');
  });

  it('W13 end latch: a latched running period reads Steady with all gates open, and keeps its latched reason', () => {
    const plain = on(K10, 10);
    const periodId = plain.periods[0]?.id ?? '';
    const latched = { ...plain, endsPending: new Map([[periodId, 'readiness-gated' as const]]) };
    expect(phaseOn(latched)).toEqual({ kind: 'steady', lastKickstartEnd: plain.today });
    expect(kickstartEndNeeded(latched)).toBe('readiness-gated');
  });
});

describe('a period whose first day has not come (item 12 kickstartPeriodState; a start dated ahead)', () => {
  /** E10 on day 35 with its second period's start moved to day 37 (the clock was ahead). */
  const ahead = (over: Over = {}): PhaseInput => {
    const input = on(E10, 35, over);
    const [first, second] = input.periods;
    if (first === undefined || second === undefined) throw new Error('E10 has two periods');
    return {
      ...input,
      periods: [first, { ...second, startedAt: scenarioInstant(SCENARIO_DAY1, 37, '07:30') }],
      carbCeilingStartedAt: scenarioInstant(SCENARIO_DAY1, 37, '07:30'),
    };
  };

  it('reads Steady after the earlier Kickstart, is reported as not started, and is not a Kickstart day', () => {
    const input = ahead();
    expect(phaseOn(input)).toEqual({ kind: 'steady', lastKickstartEnd: date(10) });
    expect(kickstartNotStarted(input)).toEqual({
      periodId: input.periods[1]?.id,
      day1: date(37),
    });
    expect(
      rapidLossExemptDates(input.periods, input.checks, input.today, 'Pacific/Auckland'),
    ).toEqual(new Set(dates(1, 10)));
    expect(kickstartNotStarted(on(K10, 10))).toBeNull();
  });

  it('a start is refused as not started; it can still be ended, by the same rule as a running one', () => {
    expect(
      kickstartStartAvailability(ahead(), { lowWeight: false, preStartStopSignToday: false }),
    ).toEqual({
      available: false,
      reason: 'not-started',
    });
    expect(kickstartEndNeeded(ahead())).toBeNull();
    expect(kickstartEndNeeded(ahead({ gates: Q3_OPEN_GATES }))).toBe('readiness-gated');
    expect(kickstartEndNeeded(ahead({ dietMode: 'balanced' }))).toBe('left-keto');
    const latchedId = ahead().periods[1]?.id ?? '';
    const latched = { ...ahead(), endsPending: new Map([[latchedId, 'readiness-gated' as const]]) };
    expect(kickstartNotStarted(latched)).toBeNull();
    expect(kickstartEndNeeded(latched)).toBe('readiness-gated');
  });
});

describe('starting a Kickstart (D27, W14, W31, W32)', () => {
  const ctx = { lowWeight: false, preStartStopSignToday: false };
  const reason = (input: PhaseInput, over: Partial<typeof ctx> = {}) => {
    const result = kickstartStartAvailability(input, { ...ctx, ...over });
    return result.available ? 'available' : result.reason;
  };
  const noPeriod: WeightScenarioOptions = PENDING;

  it('each reason alone', () => {
    expect(reason(on(noPeriod, 1))).toBe('available');
    expect(reason(on(noPeriod, 1, { gates: Q3_OPEN_GATES }))).toBe('gated');
    expect(reason(on(noPeriod, 1, { dietMode: 'moderate-low-carb' }))).toBe('not-keto');
    expect(reason(on(noPeriod, 1), { lowWeight: true })).toBe('low-weight');
    expect(reason(on(K10, 10))).toBe('running');
    expect(reason(on(noPeriod, 1), { preStartStopSignToday: true })).toBe('stop-sign-today');
  });

  it('ended early today is refused (a new day 1 must come after it); ended yesterday is not', () => {
    const endedDay10 = { ...K42, periods: [{ startDay: 1, endOnDay: 10 }] };
    expect(reason(on(endedDay10, 10, {}), {})).toBe('ended-today');
    expect(reason(on(endedDay10, 11))).toBe('available');
    expect(reason(on(K42, 21))).toBe('running');
    expect(reason(on(K42, 22))).toBe('available');
  });

  it('waits 336 hours after a stored stop-sign check (W31)', () => {
    const stopSign = { ...K42, periods: [{ startDay: 1, stopSignOnDay: 19 }] };
    // The check is at 08:00 on day 19: 13 days 23 hours later, then 14 days 1 hour later.
    expect(reason(on(stopSign, 33, {}), {})).toBe('available');
    const at = (time: string) => ({
      ...on(stopSign, 33),
      now: scenarioInstant(SCENARIO_DAY1, 33, time),
    });
    expect(reason(at('07:00'))).toBe('recent-stop-sign');
    expect(reason(at('09:00'))).toBe('available');
    // The review's case: a stop-sign on day 20, a start asked for on day 22.
    expect(reason(on({ ...K42, periods: [{ startDay: 1, stopSignOnDay: 20 }] }, 22))).toBe(
      'recent-stop-sign',
    );
  });

  it('the longest wait is the one given: a stop-sign or the cap is never "from tomorrow" (item 14 review)', () => {
    const stopSignThenEnd = { ...K42, periods: [{ startDay: 1, stopSignOnDay: 19, endOnDay: 19 }] };
    expect(reason(on(stopSignThenEnd, 19))).toBe('recent-stop-sign');
    const capThenEnd = { ...K42, periods: [{ startDay: 1, extensions: 1, endOnDay: 25 }] };
    expect(reason(on(capThenEnd, 25))).toBe('cap');
    expect(reason(on(capThenEnd, 25), { preStartStopSignToday: true })).toBe('cap');
  });

  it('D27: a new Kickstart needs a full 21 days under the 42-day cap', () => {
    expect(
      reason(on({ ...K42, periods: [{ startDay: 1, extensions: 1, endOnDay: 22 }] }, 23)),
    ).toBe('cap');
    expect(reason(on(X3, 43))).toBe('cap');
  });

  it('order: low weight first, then a closed gate beats everything else, even a period running by time', () => {
    expect(reason(on(K10, 10, { gates: Q3_OPEN_GATES }), { lowWeight: true })).toBe('low-weight');
    expect(
      reason(on(K10, 10, { gates: Q3_OPEN_GATES, dietMode: 'balanced' }), {
        preStartStopSignToday: true,
      }),
    ).toBe('gated');
  });

  it('W14: the start card is due only for an opted-in owner, after setup, with no period ever, while a start is available', () => {
    const pending = (over: Partial<Parameters<typeof kickstartPending>[0]>) =>
      kickstartPending({
        kickstartOptIn: true,
        onboardingCompleted: true,
        periods: [],
        start: { available: true },
        ...over,
      });
    expect(pending({})).toBe(true);
    expect(pending({ kickstartOptIn: false })).toBe(false);
    expect(pending({ onboardingCompleted: false })).toBe(false);
    expect(
      pending({ periods: on({ ...K42, periods: [{ startDay: 1, endOnDay: 2 }] }, 5).periods }),
    ).toBe(false);
    expect(pending({ start: { available: false, reason: 'gated' } })).toBe(false);
  });
});

describe('the dates free of the rapid-loss card (D27, WT-12) and the day kinds (W9)', () => {
  const exempt = (input: PhaseInput) =>
    [...rapidLossExemptDates(input.periods, input.checks, input.today, input.homeTimeZone)].sort();

  it('one Kickstart: its 21 days; with an extension, days 22–28 are not exempt', () => {
    expect(exempt(on(K42, 42))).toEqual(dates(1, 21));
    expect(exempt(on(oneExtension, 28))).toEqual(dates(1, 21));
  });

  it('counted across every Kickstart: an early end and a restart share the 21 days; a second full Kickstart has none', () => {
    expect(exempt(on(E10, 35))).toEqual([...dates(1, 10), ...dates(15, 25)]);
    expect(exempt(on(R2, 63))).toEqual(dates(1, 21));
  });

  it('W9: exempt, extension and later days', () => {
    const dayKind = (input: PhaseInput) => {
      const phase = phaseOn(input);
      return phase.kind === 'kickstart' ? phase.dayKind : phase.kind;
    };
    expect(dayKind(on(K10, 10))).toBe('exempt');
    expect(dayKind(on(X3, 25))).toBe('extension');
    expect(dayKind(on(R2, 63))).toBe('later');
    expect(dayKind(on(E10, 19))).toBe('exempt');
    expect(dayKind(on(E10, 29))).toBe('later');
  });
});

describe('the extension offer (C59, D27, D28, WT-09)', () => {
  const offer = (input: PhaseInput, lowWeight = false) =>
    extensionOfferDue(phaseOn(input), input, lowWeight);

  it('is due only in the last 3 days of the scheduled phase, keyed by the extensions already in the period', () => {
    expect(offer(on(K42, 18))).toBeNull();
    for (const day of [19, 20, 21]) {
      const input = on(K42, day);
      expect(offer(input)).toEqual({
        periodId: input.periods[0]?.id,
        trigger: `period:${input.periods[0]?.id ?? ''}:0`,
        scheduledLastDay: date(21),
        extensionsUsed: 0,
      });
    }
    expect(offer(on(oneExtension, 25))).toBeNull();
    for (const day of [26, 27, 28]) expect(offer(on(oneExtension, day))?.trigger).toMatch(/:1$/);
  });

  it('is never due after a stop-sign in the period, at the caps, in Steady, or below BMI 18.5', () => {
    expect(offer(on({ ...K42, periods: [{ startDay: 1, stopSignOnDay: 19 }] }, 20))).toBeNull();
    expect(offer(on(X3, 40))).toBeNull();
    expect(offer(on(K42, 22))).toBeNull();
    expect(offer(on(K42, 19), true)).toBeNull();
  });
});

describe('the Kickstart stop-sign card (HS-27, WT-11, W22)', () => {
  const due = (input: PhaseInput) => stopSignsDue(phaseOn(input), input);
  const stopSign19 = { ...K42, periods: [{ startDay: 1, stopSignOnDay: 19 }] };

  it('shows on every Kickstart day, hideable for the day (not forced): extension weeks and a restarted Kickstart too', () => {
    for (let day = 1; day <= 21; day++) {
      expect(due(on(K42, day))).toMatchObject({ forced: false, expanded: false, running: true });
    }
    expect(due(on(K42, 22))).toBeNull();
    for (let day = 22; day <= 42; day++) {
      expect(due(on(X3, day)), `X3 day ${String(day)}`).toMatchObject({ forced: false });
    }
    for (let day = 15; day <= 35; day++) {
      expect(due(on(E10, day)), `E10 day ${String(day)}`).toMatchObject({ forced: false });
    }
  });

  it('after a stop-sign answer it is forced and expanded through the period’s last day, whatever the phase', () => {
    for (const day of [19, 20, 21]) {
      expect(due(on(stopSign19, day))).toMatchObject({
        forced: true,
        expanded: true,
        running: true,
      });
      expect(due(on(stopSign19, day, { gates: Q5_YES_GATES }))).toMatchObject({ forced: true });
    }
    expect(due(on(stopSign19, 22))).toBeNull();
  });

  it('after an early end that follows the check, it stays forced on the end day only', () => {
    const ended = { ...K42, periods: [{ startDay: 1, stopSignOnDay: 19, endOnDay: 20 }] };
    expect(due(on(ended, 20))).toMatchObject({ forced: true, running: false });
    expect(due(on(ended, 21))).toBeNull();
  });
});
