// The weight picture (item 14 design section 6.2, weight/overview.test.ts and the scenario parts
// of weight/band.test.ts): WT-03 to WT-05, WT-08 to WT-14; HS-11, HS-26, HS-27; NN-03; W9, W14,
// W18, W32. Synthetic scenarios; gates are plain objects.
import {
  addDays,
  type CardStateRecord,
  chartBlock,
  type KickstartPeriodRecord,
  phaseSegments,
  weightOverview,
  type WeightRecord,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import {
  gatesWith,
  onDay,
  Q5_YES_GATES,
  SCENARIO_DAY1,
  scenarioInstant,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
  weightScenarioInput,
} from './scenarios';

const { K10, K42, X3, R2, E10, NN03, PENDING } = WEIGHT_SCENARIOS;
type Over = Partial<Parameters<typeof weightScenarioInput>[0]>;

const overview = (options: WeightScenarioOptions, day: number, over: Over = {}, time = '09:00') =>
  weightOverview(weightScenarioInput({ ...onDay(options, day, time), ...over }));
const date = (day: number) => addDays(SCENARIO_DAY1, day - 1);
const periodId = (options: WeightScenarioOptions, day: number) =>
  weightScenario(onDay(options, day)).kickstart_periods.at(-1)?.id ?? '';

function card(
  over: Partial<CardStateRecord> & Pick<CardStateRecord, 'cardId' | 'trigger'>,
): CardStateRecord {
  return { firstShownAt: null, dismissedAt: null, dismissedTimeZone: null, doneAt: null, ...over };
}

describe('averages and the weekly change (WT-05)', () => {
  it('WT-05: the 7-day average is item 4’s hand calculation, 625.0 ÷ 7 (the 14-day one too: 7 of 14 days is enough)', () => {
    const kgs = [90.0, 89.6, 89.9, 89.2, 89.0, 88.8, 88.5];
    const weights: WeightRecord[] = kgs.map((kg, i) => ({
      id: `00000000-0000-4000-8000-0000000000${String(10 + i)}`,
      at: scenarioInstant(SCENARIO_DAY1, i + 1, '07:00'),
      timeZone: 'Pacific/Auckland',
      kg,
      source: 'manual',
      note: null,
    }));
    const view = weightOverview({ ...weightScenarioInput(onDay(NN03, 7)), weights });
    expect(view.average7Kg).toBeCloseTo(625 / 7, 10);
    expect(view.average14Kg).toBeCloseTo(625 / 7, 10);
  });

  it('K10: latest 96.786 kg and a 7-day average of 97.857 kg', () => {
    const view = overview(K10, 10);
    expect(view.latest?.kg).toBeCloseTo(96.786, 3);
    expect(view.average7Kg).toBeCloseTo(97.857, 3);
  });
});

describe('notes, chip and band by phase (WT-03, W9, W18, HS-26)', () => {
  it('WT-03: a Kickstart exempt day has the fast-drop note, week 2 of 3, a front-loaded band and no rapid-loss card', () => {
    const view = overview(K10, 10);
    expect(view.notes).toEqual(['kickstart']);
    expect(view.phase).toMatchObject({ kind: 'kickstart', week: 2, weeks: 3 });
    expect(view.cards.rapidLoss).toBeNull();
    expect(view.chart.weekLabels).toEqual([1, 2, 3, 4]);
    // Anchored at the onboarding weight, 100.0, and steeper over days 0–14 (C27).
    expect(view.chart.band?.[0]).toEqual({ index: 0, slowKg: 100, fastKg: 100 });
    expect(view.chart.band?.[14]?.fastKg).toBeCloseTo(96.5, 9);
  });

  it('W9: extension weeks and a restarted Kickstart’s later days never call a fast drop expected', () => {
    expect(overview(X3, 25).notes).toEqual(['kickstart-extended']);
    const r2 = overview(R2, 63);
    expect(r2.notes).toEqual(['kickstart-later']);
    expect(r2.cards.rapidLoss).not.toBeNull();
    // P2 is not the first Kickstart: a linear band.
    const band = r2.chart.band ?? [];
    expect((band[0]?.fastKg ?? 0) - (band[7]?.fastKg ?? 0)).toBeCloseTo(1, 9);
  });

  it('W18: the rebound sentence for 28 days after a Kickstart only', () => {
    expect(overview(K42, 31).notes).toEqual(['steady-pace', 'steady-rebound']);
    expect(overview(K42, 51).notes).toEqual(['steady-pace']);
    expect(overview({ ...K42, periods: [] }, 20).notes).toEqual(['steady-pace']);
  });

  it('HS-26: no band in balanced mode or when readiness closes the deficit', () => {
    expect(overview(K42, 30, { dietMode: 'balanced' }).chart).toMatchObject({
      band: null,
      bandHiddenBecause: 'no-carb-ceiling',
    });
    const q2 = gatesWith({ deficitAllowed: false, projectionBandAvailable: false });
    expect(overview(K42, 30, { gates: q2 }).chart).toMatchObject({
      band: null,
      bandHiddenBecause: 'gated',
    });
  });
});

describe('phase segments and four-week blocks (W34, C27)', () => {
  const segments = (
    options: WeightScenarioOptions,
    day: number,
    firstLowCarbAt?: string | null,
  ) => {
    const input = weightScenarioInput(onDay(options, day));
    return phaseSegments(
      input.periods,
      input.checks,
      SCENARIO_DAY1,
      firstLowCarbAt === undefined ? input.profile.firstLowCarbAt : firstLowCarbAt,
      input.homeTimeZone,
    );
  };

  it('one Kickstart, then Steady; an early end starts Steady on its end day; only the first Kickstart is front-loaded', () => {
    expect(segments(K42, 42).map((s) => [s.kind, s.start, s.frontLoaded])).toEqual([
      ['kickstart', date(1), true],
      ['steady', date(22), false],
    ]);
    expect(segments(E10, 35).map((s) => [s.kind, s.start, s.frontLoaded])).toEqual([
      ['kickstart', date(1), true],
      ['steady', date(10), false],
      ['kickstart', date(15), false],
      ['steady', date(36), false],
    ]);
  });

  it('no period: Steady from the first weigh-in; a period ended on its day 1 has no Kickstart segment', () => {
    expect(segments({ ...K42, periods: [] }, 10).map((s) => s.kind)).toEqual(['steady']);
    const endedDay1 = { ...K42, periods: [{ startDay: 1, endOnDay: 1 }] };
    expect(segments(endedDay1, 10).map((s) => s.kind)).toEqual(['steady']);
  });

  it('the first Kickstart is front-loaded only when the carb ceiling started with it', () => {
    expect(segments(K42, 10, scenarioInstant(SCENARIO_DAY1, -29, '07:30'))[0]?.frontLoaded).toBe(
      false,
    );
    expect(segments(K42, 10, null)[0]?.frontLoaded).toBe(false);
  });

  it('the band shape is exposed, so "steeper in your first Kickstart" is said only when drawn: not when it started 2 days after setup', () => {
    expect(overview(K10, 10).chart.shape).toBe('front-loaded');
    expect(overview({ ...K10, periods: [{ startDay: 3 }] }, 12).chart.shape).toBe('linear');
  });

  it('blocks: front-loaded on K10; day 30 of an extended Kickstart is block 2, linear; Steady starts a new block; R2 is linear', () => {
    const block = (options: WeightScenarioOptions, day: number) =>
      chartBlock(segments(options, day), date(day));
    expect(block(K10, 10)).toEqual({ blockStart: date(1), blockNumber: 0, shape: 'front-loaded' });
    expect(block(X3, 30)).toEqual({ blockStart: date(29), blockNumber: 1, shape: 'linear' });
    expect(block(K42, 22)).toEqual({ blockStart: date(22), blockNumber: 0, shape: 'linear' });
    expect(block(R2, 63)?.shape).toBe('linear');
    expect(overview(X3, 30).chart.weekLabels).toEqual([5, 6, 7, 8]);
  });
});

describe('the rapid-loss card can be hidden for the day only (WT-04, HS-11)', () => {
  const k42Card = (over: Partial<CardStateRecord>) => [
    card({ cardId: 'rapid-loss', trigger: 'steady', ...over }),
  ];

  it('WT-04: dismissed at 21:00 on day 42, hidden until local midnight, then back', () => {
    const cardStates = k42Card({
      dismissedAt: '2000-03-13T08:00:00.000Z',
      dismissedTimeZone: 'Pacific/Auckland',
    });
    expect(overview(K42, 42).cards.rapidLoss).toEqual({ thresholdKgPerWeek: 1, weeks: 3 });
    expect(overview(K42, 42, { cardStates }, '22:00').cards.rapidLoss).toBeNull();
    expect(overview(K42, 43, { cardStates }, '00:30').cards.rapidLoss).not.toBeNull();
  });

  it('WT-13, HS-11: it shows below BMI 18.5 and in balanced and moderate modes too', () => {
    const fast = { ...K42, ratesKgPerWeek: [1.5], periods: [] };
    const low = overview({ ...fast, startKg: 64 }, 28);
    expect(low.lowWeight).toBe(true);
    expect(low.cards.rapidLoss).not.toBeNull();
    for (const dietMode of ['balanced', 'moderate-low-carb'] as const) {
      expect(overview({ ...fast, dietMode }, 28).cards.rapidLoss, dietMode).not.toBeNull();
    }
  });

  it('HS-11: a stored "done" or a dismissal dated ahead never hides it', () => {
    expect(
      overview(K42, 42, { cardStates: k42Card({ doneAt: '2000-03-12T00:00:00.000Z' }) }).cards
        .rapidLoss,
    ).not.toBeNull();
    const ahead = k42Card({
      dismissedAt: '2000-03-20T00:00:00.000Z',
      dismissedTimeZone: 'Pacific/Auckland',
    });
    expect(overview(K42, 42, { cardStates: ahead }).cards.rapidLoss).not.toBeNull();
  });
});

describe('readiness and low weight (WT-13, RD-04, RD-06, W11, W32)', () => {
  it('WT-13: answer 5 takes away the phase, notes, band, goal and Kickstart cards; weigh-ins, line and rapid-loss stay', () => {
    const view = overview(K42, 42, { gates: Q5_YES_GATES });
    expect(view.phase).toEqual({ kind: 'none' });
    expect(view.notes).toEqual(['gated']);
    expect(view.chart).toMatchObject({ band: null, bandHiddenBecause: 'gated' });
    expect(view.goal).toEqual({ status: 'gated' });
    expect(view.cards).toMatchObject({
      extensionOffer: null,
      pendingStart: null,
      steadyExplainer: null,
    });
    expect(view.latest).not.toBeNull();
    expect(view.average7Kg).not.toBeNull();
    expect(view.chart.line.length).toBeGreaterThan(0);
    expect(view.cards.rapidLoss).not.toBeNull();
    expect(view.cards.fluctuation).toBe(true);
    expect(overview(K10, 10, { gates: Q5_YES_GATES }).cards.stopSigns).toBeNull();
  });

  it('nothing is ended before setup is finished, even with the gates closed', () => {
    expect(overview(K10, 10, { gates: Q5_YES_GATES }).kickstart.endNeeded).toBe('readiness-gated');
    const notDone = { gates: Q5_YES_GATES, settings: { onboardingCompletedAt: null } };
    expect(overview(K10, 10, notDone).kickstart.endNeeded).toBeNull();
  });

  it('WT-13: with a readiness question unanswered the note says so', () => {
    expect(
      overview(K42, 42, { gates: Q5_YES_GATES, missingReadinessAnswers: ['q5'] }).notes,
    ).toEqual(['gated-unanswered']);
  });

  it('W32: a recent weight below BMI 18.5 gives the GP line, no band, no Kickstart start or extension; the trend stays', () => {
    const low = { ...K42, startKg: 62, ratesKgPerWeek: [1.5] };
    const view = overview(low, 19);
    expect(view.lowWeight).toBe(true);
    expect(view.notes).toEqual(['low-weight']);
    expect(view.chart).toMatchObject({ band: null, bandHiddenBecause: 'low-weight' });
    expect(view.kickstart.start).toEqual({ available: false, reason: 'low-weight' });
    expect(view.cards.extensionOffer).toBeNull();
    expect(view.chart.line.length).toBeGreaterThan(0);
    // With item 13's gates a low weight also closes the deficit: the GP line still names it.
    expect(overview(low, 19, { gates: Q5_YES_GATES }).notes).toEqual(['low-weight']);
  });
});

describe('the Kickstart cards (HS-27, WT-08, WT-09, WT-11, W14, WT-14)', () => {
  it('HS-27, WT-11: the stop-sign card on every Kickstart day, with the blood-pressure wording under answer 4', () => {
    for (let day = 1; day <= 21; day++) {
      expect(overview(K42, day).cards.stopSigns).toMatchObject({
        forced: false,
        bloodPressureWording: false,
      });
    }
    const answer4 = gatesWith({ pharmacistReminder: true, bloodPressureSaltWording: true });
    expect(overview(K42, 10, { gates: answer4 }).cards.stopSigns?.bloodPressureWording).toBe(true);
  });

  it('WT-11: "Hide for today" hides it until local midnight only', () => {
    // No weigh-in on day 11, so the period keeps its synthetic id from day 10 to day 11.
    const k10 = { ...K10, days: (day: number) => day <= 10 };
    const trigger = `period:${periodId(k10, 10)}`;
    expect(periodId(k10, 11)).toBe(periodId(k10, 10));
    const hiddenAt21 = card({
      cardId: 'kickstart-stop-signs',
      trigger,
      dismissedAt: scenarioInstant(SCENARIO_DAY1, 10, '21:00'),
      dismissedTimeZone: 'Pacific/Auckland',
    });
    expect(overview(k10, 10, { cardStates: [hiddenAt21] }, '22:00').cards.stopSigns).toBeNull();
    expect(overview(k10, 11, { cardStates: [hiddenAt21] }, '00:30').cards.stopSigns).toMatchObject({
      trigger,
      forced: false,
    });
  });

  it('HS-27: a stop-sign answer, then a weight below BMI 18.5 that ends Kickstart: still forced through the end day', () => {
    const low = {
      ...K42,
      startKg: 64,
      ratesKgPerWeek: [1.5],
      periods: [
        { startDay: 1, stopSignOnDay: 19, endOnDay: 20, endReason: 'readiness-gated' as const },
      ],
    };
    const view = overview(low, 20);
    expect(view.lowWeight).toBe(true);
    expect(view.cards.stopSigns).toMatchObject({ forced: true, expanded: true, running: false });
  });

  it('HS-27: a stop-sign answer after the card was hidden for the day brings it back, forced and expanded', () => {
    const options = { ...K42, periods: [{ startDay: 1, stopSignOnDay: 19 }] };
    const trigger = `period:${periodId(options, 19)}`;
    const hiddenAt7 = card({
      cardId: 'kickstart-stop-signs',
      trigger,
      dismissedAt: scenarioInstant(SCENARIO_DAY1, 19, '07:00'),
      dismissedTimeZone: 'Pacific/Auckland',
    });
    expect(overview(K42, 19, { cardStates: [hiddenAt7] }, '07:30').cards.stopSigns).toBeNull();
    expect(overview(options, 19, { cardStates: [hiddenAt7] }).cards.stopSigns).toMatchObject({
      forced: true,
      expanded: true,
    });
  });

  it('WT-09: the day-19 extension offer carries the GP line at 2.5 kg a week (C08)', () => {
    expect(overview(K42, 19).cards.extensionOffer).toMatchObject({
      rapidLine: true,
      extensionsUsed: 0,
    });
  });

  it('WT-08: on day 22 the explainer shows at once with the 22:2 line while the stored 23:1 still waits to move', () => {
    const view = overview(K42, 22);
    expect(view.cards.steadyExplainer).toMatchObject({ carbCeilingG: 30, windowLine: true });
    expect(view.kickstart.presetMoveDue).toEqual({
      fastingPreset: '22:2',
      eatingWindow: { start: '17:00', end: '19:00' },
      presetChosenBy: 'default',
    });
    const user186 = {
      fastingPreset: '18:6' as const,
      eatingWindow: { start: '13:00', end: '19:00' },
      presetChosenBy: 'user' as const,
    };
    expect(overview(K42, 22, { targets: user186 }).cards.steadyExplainer?.windowLine).toBe(false);
    expect(overview(K42, 22, { targets: user186 }).kickstart.presetMoveDue).toBeNull();
  });

  it('C07: answer 4 never gets "23:1 was for Kickstart" or a one-tap 23:1; its set-aside default moves even during Kickstart', () => {
    const answer4 = gatesWith({ pharmacistReminder: true, bloodPressureSaltWording: true });
    const untouched22 = {
      fastingPreset: '22:2' as const,
      eatingWindow: { start: '17:00', end: '19:00' },
      presetChosenBy: 'default' as const,
    };
    const finished = overview(K42, 22, { gates: answer4, targets: untouched22 });
    expect(finished.cards.steadyExplainer).toMatchObject({ windowLine: false });
    expect(overview(K10, 10, { gates: answer4 }).kickstart.presetMoveDue).toEqual(untouched22);
    expect(overview(K10, 10).kickstart.presetMoveDue).toBeNull();
  });

  it('WT-08: the move does not wait for the explainer: finished, it is gone but the move is still due', () => {
    const done = card({
      cardId: 'steady-explainer',
      trigger: `period:${periodId(K42, 22)}`,
      doneAt: scenarioInstant(SCENARIO_DAY1, 22, '08:00'),
    });
    const view = overview(K42, 22, { cardStates: [done] });
    expect(view.cards.steadyExplainer).toBeNull();
    expect(view.kickstart.presetMoveDue?.fastingPreset).toBe('22:2');
  });

  it('W14: the start card for an opted-in owner with the window lines, and the 23:1 move; nothing before setup is complete', () => {
    const view = overview(PENDING, 1);
    expect(view.cards.pendingStart).toEqual({ windowLines: true });
    expect(view.kickstart.presetMoveDue?.fastingPreset).toBe('22:2');
    const notDone = overview(PENDING, 1, { settings: { onboardingCompletedAt: null } });
    expect(notDone.cards.pendingStart).toBeNull();
    expect(notDone.kickstart.presetMoveDue).toBeNull();
  });

  it('WT-14: the daily-changes explainer once there are weigh-ins on two dates, until Got it', () => {
    expect(overview(PENDING, 1).cards.fluctuation).toBe(false);
    expect(overview(K10, 2).cards.fluctuation).toBe(true);
    const done = card({
      cardId: 'weight-fluctuation-explainer',
      trigger: 'once',
      doneAt: scenarioInstant(SCENARIO_DAY1, 2, '08:00'),
    });
    expect(overview(K10, 2, { cardStates: [done] }).cards.fluctuation).toBe(false);
  });
});

describe('a Kickstart ended before its first day never ran (item 14 review; HS-11, D27)', () => {
  // Steady at 1.2 kg a week with daily weigh-ins. A Kickstart was started with the phone's clock
  // 3 days ahead (its day 1 is day 33) and ended once the clock was right: 1 ms after its start.
  const steady: WeightScenarioOptions = { ...K42, ratesKgPerWeek: [1.2], periods: [] };
  const neverRan = (day1: number): KickstartPeriodRecord => {
    const startedAt = scenarioInstant(SCENARIO_DAY1, day1, '07:30');
    return {
      id: '00000000-0000-4000-8000-000000099001',
      startedAt,
      timeZone: 'Pacific/Auckland',
      endedAt: new Date(Date.parse(startedAt) + 1).toISOString(),
      endedTimeZone: 'Pacific/Auckland',
      endReason: 'user-ended',
    };
  };
  const seen = (options: WeightScenarioOptions, day: number, day1 = 33) => {
    const input = weightScenarioInput(onDay(options, day));
    return weightOverview({ ...input, periods: [...input.periods, neverRan(day1)] });
  };

  it('the weight check-in card still shows on its day 1 and the 20 days after; no "Kickstart has finished" and no rebound note', () => {
    for (let day = 31; day <= 60; day++) {
      const view = seen(steady, day);
      expect(view.cards.rapidLoss, `day ${String(day)}`).not.toBeNull();
      expect(view.cards.steadyExplainer).toBeNull();
      expect(view.notes).toEqual(['steady-pace']);
      expect(view.chart.blockStart).toBe(overview(steady, day).chart.blockStart);
    }
    // Its one day still counts toward the 42-day cap.
    expect(seen(steady, 40).kickstart.usage).toEqual({ days: 1, extensions: 0 });
  });

  it('after an earlier Kickstart, Steady still follows that one (its rebound note and its "Kickstart has finished")', () => {
    const view = seen(K42, 34);
    expect(view.phase).toEqual({ kind: 'steady', lastKickstartEnd: date(21) });
    expect(view.cards.steadyExplainer?.trigger).toBe(`period:${periodId(K42, 34)}`);
  });

  it('HS-27: after a stop-sign, a later start (the clock 15 days ahead) ended before its day 1 leaves the forced card in place', () => {
    const stopSign = { ...K42, periods: [{ startDay: 1, stopSignOnDay: 19, endOnDay: 20 }] };
    expect(seen(stopSign, 20, 35).cards.stopSigns).toMatchObject({ forced: true, expanded: true });
  });

  it('a new start waits until the day after its day 1, and says so with that date; then it is offered', () => {
    for (const day of [30, 33]) {
      expect(seen(steady, day).kickstart.start).toEqual({
        available: false,
        reason: 'ended-ahead',
        day1: date(33),
      });
    }
    expect(seen(steady, 34).kickstart.start).toEqual({ available: true });
  });
});

describe('NN-03: a long-term goal 22% below the start weight', () => {
  it('is accepted and shown with its milestone: 80.0 kg on day 1, 78.3 kg on day 10', () => {
    expect(overview(NN03, 1).goal).toEqual({
      status: 'set',
      goalKg: 78,
      milestone: { kind: 'milestone', kg: 80 },
    });
    expect(overview(NN03, 10).goal).toMatchObject({ milestone: { kind: 'milestone', kg: 78.3 } });
  });
});
