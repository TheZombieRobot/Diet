// @vitest-environment node
// The fasting view (item 15 design 3.3 to 3.10): one test per row of the meal-check decision
// table, and the states the screens are built from. Synthetic records; the gate, the preset and
// the meal figures are injected as a FastingContext.
import {
  addDays,
  type CardStateRecord,
  defaultProfile,
  defaultSettings,
  defaultTargets,
  type EatingWindow,
  type FastRecord,
  type GateInput,
  type KickstartCheckRecord,
  type KickstartPeriodRecord,
  type LoggedIntake,
  parseClockTime,
  type PlanDayRecord,
  type PlannedMealFigures,
  plannedMealsOf,
  READINESS_CONFIRMATION_IDS,
  READINESS_QUESTION_IDS,
  readinessGates,
  type SymptomRecord,
  zonedWallTimeToInstant,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import type { FastingInputs } from './inputs';
import { fastingContext, type MealSources, mealSources as itemFifteenSources } from './integration';
import { type FastingContext, type FastingView, fastingView, joiningSpanStart } from './view';

const NZ = 'Pacific/Auckland';
const D = '2000-01-04';
const at = (date: string, time: string): number =>
  zonedWallTimeToInstant(date, parseClockTime(time), NZ);
const iso = (ms: number): string => new Date(ms).toISOString();
const ONE_MEAL: EatingWindow = { start: '18:00', end: '19:00' };
const SNACK_AND_DINNER: EatingWindow = { start: '17:00', end: '19:00' };
const T0 = '2000-01-01T00:00:00.000Z';

const fast = (id: string, start: number, end: number | null): FastRecord => ({
  id,
  startedAt: iso(start),
  timeZone: NZ,
  endedAt: end === null ? null : iso(end),
  endedTimeZone: end === null ? null : NZ,
  plannedFastMinutes: null,
  snackTime: null,
  dinnerTime: null,
  note: null,
});
const windowDay = (date: string, eatingWindow: EatingWindow | null): PlanDayRecord => ({
  date,
  dietMode: 'keto',
  meals: [],
  eatingWindow,
  updatedAt: T0,
});

function inputs(today: string, more: Partial<FastingInputs> = {}): FastingInputs {
  return {
    today,
    targets: {
      ...defaultTargets(T0),
      fastingPreset: '23:1',
      eatingWindow: ONE_MEAL,
      presetChosenBy: 'user',
    },
    settings: defaultSettings(),
    profile: defaultProfile(T0),
    periods: [],
    checks: [],
    readiness: [],
    weights: [],
    fasts: [],
    planDays: [],
    symptoms: [],
    snackCards: {},
    nudgeCard: undefined,
    preStartCards: [],
    drinks: [],
    ...more,
  };
}

function context(
  more: Partial<FastingContext> & { window?: EatingWindow | null } = {},
): FastingContext {
  const window = more.window === undefined ? ONE_MEAL : more.window;
  return {
    gate: { fastingGated: false, pharmacistReminder: false, quiet: false },
    preset: { fastingPreset: window === null ? null : 'custom', eatingWindow: window },
    kickstart: { running: false },
    // Item 21's figures for the day (mealTargets.ts): 140 g of protein and a 9,100 kJ target.
    mealTargets: () => ({ proteinTargetG: 140, energyTargetKj: 9_100 }),
    mealSources: itemFifteenSources,
    stopSignPause: false,
    ...more,
  };
}

const dinner = (proteinG: number): PlannedMealFigures => ({
  slot: 'dinner',
  proteinG,
  proteinKnown: true,
  foodEnergyKj: 9_500,
  proteinFoodCookedG: 450,
  incomplete: false,
});
/** Sources with a planned dinner on `dates` and, optionally, a food log. */
const sources = (
  dates: Record<string, number>,
  logged: Record<string, LoggedIntake> = {},
): MealSources => ({
  plannedMeals: (date) => (dates[date] === undefined ? null : [dinner(dates[date])]),
  loggedIntake: (date) => logged[date] ?? null,
});
const shortLog: LoggedIntake = {
  proteinG: 95,
  foodEnergyKj: 9_500,
  loggedSlots: ['dinner'],
  otherEntries: 0,
  incomplete: false,
};
const open = (view: FastingView) => {
  if (view.kind !== 'open') throw new Error(`expected the open view, got ${view.kind}`);
  return view;
};
const dismissed = (date: string): CardStateRecord => ({
  cardId: 'single-meal-snack',
  trigger: `date:${date}`,
  firstShownAt: T0,
  dismissedAt: T0,
  dismissedTimeZone: NZ,
  doneAt: null,
});

describe('the meal-check decision table (design 3.7; HS-18, C62)', () => {
  it("row 1: after the window, a short log gives the after line and tomorrow's snack once", () => {
    const view = open(
      fastingView(
        inputs(D),
        context({ mealSources: sources({}, { [D]: shortLog }) }),
        at(D, '21:00'),
        NZ,
      ),
    );
    expect(view.closed).toMatchObject({ region: 'closed', date: D, kind: 'after' });
    // Tomorrow's upcoming region has no plan: it offers the snack itself, so "after" does not.
    expect(view.upcoming).toMatchObject({ date: addDays(D, 1), kind: 'one-meal-unavailable' });
    expect(view.upcoming?.snack.fits).toEqual(SNACK_AND_DINNER);
    expect(view.closed?.tomorrowSnack).toBeNull();
    const planned = open(
      fastingView(
        inputs(D),
        context({ mealSources: sources({ [addDays(D, 1)]: 150 }, { [D]: shortLog }) }),
        at(D, '21:00'),
        NZ,
      ),
    );
    expect(planned.upcoming?.kind).toBe('ok');
    expect(planned.closed?.tomorrowSnack).toEqual(SNACK_AND_DINNER);
  });

  it('row 2: after the window with enough logged, or nothing logged, nothing shows', () => {
    const enough = { ...shortLog, proteinG: 150 };
    for (const log of [{ [D]: enough }, {}]) {
      const view = open(
        fastingView(inputs(D), context({ mealSources: sources({}, log) }), at(D, '21:00'), NZ),
      );
      expect(view.closed?.kind).toBe('hidden');
    }
  });

  it('row 3: a short plan offers the snack, and with the snack already added still shows the reasons', () => {
    const view = open(
      fastingView(inputs(D), context({ mealSources: sources({ [D]: 95 }) }), at(D, '10:00'), NZ),
    );
    expect(view.upcoming).toMatchObject({
      region: 'upcoming',
      date: D,
      day: 'today',
      kind: 'offer',
      reasons: ['protein'],
      headline: { proteinG: 95, dinnerOnly: true },
      snack: { added: null, fits: SNACK_AND_DINNER },
    });
    const added = open(
      fastingView(
        inputs(D, { planDays: [windowDay(D, SNACK_AND_DINNER)] }),
        context({ mealSources: sources({ [D]: 95 }) }),
        at(D, '10:00'),
        NZ,
      ),
    );
    expect(added.upcoming).toMatchObject({
      kind: 'offer',
      snack: { added: SNACK_AND_DINNER, fits: null },
      undoSnackAllowed: true,
    });
  });

  it('row 4: "Not now" collapses the offer for that date only', () => {
    const view = open(
      fastingView(
        inputs(D, { snackCards: { [D]: dismissed(D) } }),
        context({ mealSources: sources({ [D]: 95 }) }),
        at(D, '10:00'),
        NZ,
      ),
    );
    expect(view.upcoming?.kind).toBe('offer-collapsed');
    expect(view.upcoming?.reasons).toEqual(['protein']);
  });

  it('row 5: a dinner at the target passes, with its headline', () => {
    const view = open(
      fastingView(inputs(D), context({ mealSources: sources({ [D]: 140 }) }), at(D, '10:00'), NZ),
    );
    expect(view.upcoming).toMatchObject({ kind: 'ok', reasons: [], headline: { proteinG: 140 } });
  });

  it('rows 6 to 8: with no figures, a snack day, a one-meal day, and any other day', () => {
    const snackDay = open(
      fastingView(
        inputs(D, { planDays: [windowDay(D, SNACK_AND_DINNER)] }),
        context(),
        at(D, '10:00'),
        NZ,
      ),
    );
    expect(snackDay.upcoming?.kind).toBe('snack-added');
    expect(open(fastingView(inputs(D), context(), at(D, '10:00'), NZ)).upcoming?.kind).toBe(
      'one-meal-unavailable',
    );
    const sixteen = context({ window: { start: '11:00', end: '19:00' } });
    expect(open(fastingView(inputs(D), sixteen, at(D, '09:00'), NZ)).upcoming?.kind).toBe('hidden');
  });

  it('with no energy target the check never passes: the snack and the widen line are offered (item 21)', () => {
    const noTarget = context({
      mealSources: sources({ [D]: 160 }),
      mealTargets: () => ({ proteinTargetG: 140, energyTargetKj: null }),
    });
    const view = open(fastingView(inputs(D), noTarget, at(D, '10:00'), NZ));
    expect(view.upcoming).toMatchObject({
      kind: 'offer',
      reasons: ['energy-unknown'],
      energyChecked: false,
      snack: { fits: SNACK_AND_DINNER },
    });
  });

  it('an earlier window on a reflux day is not a snack: a short dinner still shows the reasons, with no Add', () => {
    const symptom: SymptomRecord = {
      id: 's1',
      at: iso(at(D, '08:00')),
      timeZone: NZ,
      symptom: 'heartburn',
      severity: null,
      note: null,
    };
    const view = open(
      fastingView(
        inputs(D, {
          planDays: [windowDay(D, { start: '17:00', end: '18:00' })],
          symptoms: [symptom],
        }),
        context({ mealSources: sources({ [D]: 95 }) }),
        at(D, '10:00'),
        NZ,
      ),
    );
    expect(view.upcoming).toMatchObject({
      kind: 'offer',
      reasons: ['protein'],
      snack: { added: null, fits: null },
      refluxDay: true,
    });
  });

  it('with the item-15 sources, every meal-check view is hidden, snack-added or one-meal-unavailable (no fake figures)', () => {
    for (const window of [ONE_MEAL, SNACK_AND_DINNER, { start: '11:00', end: '19:00' }]) {
      for (const time of ['06:00', '17:30', '18:30', '21:00']) {
        const view = open(fastingView(inputs(D), context({ window }), at(D, time), NZ));
        for (const region of [view.upcoming, view.closed]) {
          if (region === null) continue;
          expect(['hidden', 'snack-added', 'one-meal-unavailable']).toContain(region.kind);
          expect(region.headline).toBeNull();
          expect(region.reasons).toEqual([]);
        }
      }
    }
  });

  it('a plan row with no meals is not a plan: unavailable, never "plan short" (C73)', () => {
    const rows = [windowDay(D, null)];
    const fromRows: MealSources = {
      plannedMeals: (date) =>
        plannedMealsOf(rows.find((r) => r.date === date)) === null ? null : [dinner(0)],
      loggedIntake: () => null,
    };
    const view = open(
      fastingView(
        inputs(D, { planDays: rows }),
        context({ mealSources: fromRows }),
        at(D, '10:00'),
        NZ,
      ),
    );
    expect(view.upcoming?.kind).toBe('one-meal-unavailable');
  });
});

describe('the fasting view states (design 3.3, 3.4)', () => {
  it('a wrapped window open at 01:00 is still "tonight": the upcoming date is yesterday, labelled today', () => {
    const view = open(
      fastingView(
        inputs(D),
        context({ window: { start: '22:00', end: '02:00' } }),
        at(D, '01:00'),
        NZ,
      ),
    );
    expect(view.upcoming).toMatchObject({ date: addDays(D, -1), day: 'today' });
    expect(view.idle?.openUntil?.date).toBe(addDays(D, -1));
    expect(view.closed).toBeNull();
  });

  it("labels the next window tomorrow after tonight's has closed", () => {
    const view = open(fastingView(inputs(D), context(), at(D, '20:00'), NZ));
    expect(view.upcoming).toMatchObject({ date: addDays(D, 1), day: 'tomorrow' });
  });

  it('while gated there is no timer, pattern, history, streak or option; an open fast can still be ended', () => {
    const view = fastingView(
      inputs(D, {
        fasts: [fast('f1', at(D, '07:00'), null)],
        planDays: [windowDay(addDays(D, 1), SNACK_AND_DINNER)],
        targets: { ...defaultTargets(T0), refluxPreferEarlier: true, refluxPreferSplit: true },
      }),
      context({ gate: { fastingGated: true, pharmacistReminder: true, quiet: false } }),
      at(D, '10:00'),
      NZ,
    );
    expect(view.kind).toBe('gated');
    if (view.kind !== 'gated') return;
    expect(Object.keys(view).sort()).toEqual(['kind', 'openFast', 'quiet', 'reflux']);
    expect(view.openFast).toMatchObject({ plan: null, endHint: { kind: 'none' } });
    expect(view.reflux.options).toBeNull();
  });

  it('carries the pharmacist line when readiness answer 4 is yes or unanswered (C07)', () => {
    const view = open(
      fastingView(
        inputs(D),
        context({ gate: { fastingGated: false, pharmacistReminder: true, quiet: false } }),
        at(D, '10:00'),
        NZ,
      ),
    );
    expect(view.pharmacist).toBe(true);
  });

  it('a capped plan reaches the running view as an eat-by time (C30)', () => {
    const start = at('2026-04-04', '18:30');
    const view = open(
      fastingView(
        inputs('2026-04-04', { fasts: [fast('f1', start, null)] }),
        context(),
        start + 60_000,
        NZ,
      ),
    );
    expect(view.running?.plan?.cappedAtCeiling).toBe(true);
    expect(view.running?.endHint).toEqual({ kind: 'eat-by', atMs: start + 86_400_000 });
    expect(view.running?.spanPlannedMinutes).toBe(1440);
  });

  it('a fast started before that day\'s window and still running after it closed is planned to 24 hours, never "open" (review)', () => {
    const fasts = [fast('f1', at('2000-01-03', '15:00'), null)];
    const view = open(fastingView(inputs(D, { fasts }), context(), at(D, '09:00'), NZ));
    expect(view.running).toMatchObject({
      phase: 'fasting',
      endHint: { kind: 'eat-by', atMs: at(D, '15:00') },
      spanPlannedMinutes: 1440,
    });
    const evening = open(
      fastingView(inputs('2000-01-03', { fasts }), context(), at('2000-01-03', '19:30'), NZ),
    );
    expect(evening.running?.phase).toBe('fasting');
  });

  it("a fast restarted within the hour is capped from the first fast's start (FS-06)", () => {
    const fasts = [fast('f1', at(D, '17:00'), at(D, '17:30')), fast('f2', at(D, '18:00'), null)];
    const view = open(
      fastingView(inputs(addDays(D, 1), { fasts }), context(), at(addDays(D, 1), '10:00'), NZ),
    );
    expect(view.running?.endHint).toEqual({ kind: 'eat-by', atMs: at(addDays(D, 1), '17:00') });
  });

  it('during a fast, a window opening past its 24 hours gets no time, no one-meal line and no snack past them (review)', () => {
    const fasts = [fast('f1', at('2000-01-03', '15:00'), null)];
    // The 5 pm snack today opens 26 hours in: neither it nor the one-meal line is offered.
    const morning = open(fastingView(inputs(D, { fasts }), context(), at(D, '09:00'), NZ));
    expect(morning.upcoming).toMatchObject({
      kind: 'hidden',
      afterCeiling: true,
      snack: { fits: null },
    });
    const added = open(
      fastingView(
        inputs(D, { fasts, planDays: [windowDay(D, SNACK_AND_DINNER)] }),
        context(),
        at(D, '15:30'),
        NZ,
      ),
    );
    expect(added.upcoming).toMatchObject({ kind: 'snack-added', afterCeiling: true });
    // On the April night the snack opens inside the 24 hours, so it is still offered.
    const april = [fast('f1', at('2026-04-04', '18:30'), null)];
    const capped = open(
      fastingView(inputs('2026-04-05', { fasts: april }), context(), at('2026-04-05', '09:00'), NZ),
    );
    expect(capped.upcoming).toMatchObject({
      kind: 'one-meal-unavailable',
      afterCeiling: true,
      snack: { fits: SNACK_AND_DINNER },
    });
  });

  it("a fast a minute after the last one joins its span: the elapsed time and the over-24 phase are the span's", () => {
    const firstEnd = at(D, '18:50');
    const fasts = [
      fast('f1', firstEnd - (23 * 60 + 50) * 60_000, firstEnd),
      fast('f2', firstEnd + 60_000, null),
    ];
    expect(joiningSpanStart(fasts.slice(0, 1), firstEnd + 60_000)).toBe(
      Date.parse(fasts[0]?.startedAt ?? ''),
    );
    const view = open(
      fastingView(
        inputs(addDays(D, 1), { fasts }),
        context(),
        firstEnd + 60_000 + (23 * 60 + 49) * 60_000,
        NZ,
      ),
    );
    expect(view.running?.joinedGapMs).toBe(60_000);
    expect(view.running?.phase).toBe('over-ceiling');
    expect(view.running?.meter.over).toBe(true);
  });

  it('Start is the primary button only outside the window with no reasons (HS-18, F50)', () => {
    const variant = (c: FastingContext, time: string) =>
      open(fastingView(inputs(D), c, at(D, time), NZ)).startVariant;
    expect(variant(context(), '10:00')).toBe('primary');
    expect(variant(context(), '18:30')).toBe('secondary');
    expect(variant(context({ window: null }), '10:00')).toBe('secondary');
    expect(variant(context({ mealSources: sources({ [D]: 95 }) }), '10:00')).toBe('secondary');
  });

  it('history: newest first, joined fasts and over-24 spans marked; the streak counts completed fasts', () => {
    const fasts = [
      fast('a', at('2000-01-02', '19:00'), at('2000-01-03', '18:00')),
      fast('b', at('2000-01-03', '19:00'), at('2000-01-04', '10:00')),
      fast('c', at('2000-01-04', '10:30'), at('2000-01-04', '21:00')),
    ];
    const view = open(fastingView(inputs(D, { fasts }), context(), at(D, '22:00'), NZ));
    expect(
      view.history.rows.map((r) => [
        r.fast.id,
        r.over24,
        r.joined?.gapMs ?? null,
        r.joinedFirst?.spanMs ?? null,
      ]),
    ).toEqual([
      ['c', true, 30 * 60_000, null],
      ['b', true, null, 26 * 3_600_000],
      ['a', false, null, null],
    ]);
    expect(view.history.streakDays).toBe(1);
    expect(view.lastEnded).toMatchObject({ fast: { id: 'c' }, over24: true });
  });
});

describe('the preset every reader uses (cross-item ruling 2; C07)', () => {
  const gateInput: GateInput = {
    answers: Object.fromEntries(
      READINESS_QUESTION_IDS.map((q) => [q, 'no']),
    ) as GateInput['answers'],
    confirmations: Object.fromEntries(
      READINESS_CONFIRMATION_IDS.map((c) => [c, false]),
    ) as GateInput['confirmations'],
    minimumAgeYears: 40,
    lowWeight: false,
  };
  /** A stored 23:1 Kickstart default, keto since well before any period. */
  const contextWith = (
    periods: KickstartPeriodRecord[],
    checks: KickstartCheckRecord[] = [],
    preStart: { readonly cards?: CardStateRecord[]; readonly held?: string } = {},
  ) =>
    fastingContext({
      inputs: inputs(D, {
        targets: {
          ...defaultTargets(T0),
          fastingPreset: '23:1',
          eatingWindow: ONE_MEAL,
          presetChosenBy: 'kickstart-default',
        },
        profile: { ...defaultProfile(T0), carbCeilingStartedAt: iso(at('1999-12-01', '00:00')) },
        periods,
        checks,
        preStartCards: preStart.cards ?? [],
      }),
      gateInput,
      gates: readinessGates(gateInput),
      now: iso(at(D, '10:00')),
      deviceTimeZone: NZ,
      endsPending: new Map(),
      preStartHeld: preStart.held ?? null,
    });

  it('with no Kickstart running, a stored Kickstart default plans 22:2', () => {
    const c = contextWith([]);
    expect(c.preset).toMatchObject({ fastingPreset: '22:2', eatingWindow: SNACK_AND_DINNER });
    expect(c.kickstart).toEqual({ running: false });
  });

  const period: KickstartPeriodRecord = {
    id: 'k1',
    startedAt: iso(at(addDays(D, -20), '08:00')),
    timeZone: NZ,
    endedAt: null,
    endedTimeZone: null,
    endReason: null,
  };

  it('F20: a stop-sign check in the Kickstart, or a pre-start "yes" today, pauses the timing; the preset still follows the phase', () => {
    const stopSign: KickstartCheckRecord = {
      id: 'c1',
      periodId: 'k1',
      askedAt: iso(at(D, '08:00')),
      timeZone: NZ,
      dizzyOnStanding: 'yes',
      palpitations: 'no',
      crampsNotSettling: 'no',
      faintAtWork: 'no',
      energyRating: null,
      sleepRating: null,
      outcome: 'stop-sign',
    };
    const paused = contextWith([period], [stopSign]);
    expect(paused.stopSignPause).toBe(true);
    expect(paused.preset).toMatchObject({ fastingPreset: '23:1' });
    expect(contextWith([period]).stopSignPause).toBe(false);
    // A pre-start "yes" today: its record (any tab, after a relaunch), or this page's hold until
    // the record is written; one from yesterday no longer pauses.
    const yes = (date: string): CardStateRecord => ({
      cardId: 'kickstart-stop-signs',
      trigger: `date:${date}`,
      firstShownAt: iso(at(date, '08:00')),
      dismissedAt: null,
      dismissedTimeZone: null,
      doneAt: null,
    });
    expect(contextWith([], [], { cards: [yes(D)] }).stopSignPause).toBe(true);
    expect(contextWith([], [], { held: D }).stopSignPause).toBe(true);
    expect(contextWith([], [], { cards: [yes(addDays(D, -1))] }).stopSignPause).toBe(false);
  });

  it('on the last day of a running Kickstart it plans 23:1, and the next day already 22:2', () => {
    const c = contextWith([period]);
    expect(c.preset).toMatchObject({ fastingPreset: '23:1', eatingWindow: ONE_MEAL });
    expect(c.kickstart).toMatchObject({
      running: true,
      lastDay: D,
      presetAfter: { fastingPreset: '22:2', eatingWindow: SNACK_AND_DINNER },
    });
  });
});

describe('after a Kickstart stop-sign answer (F20; HEALTH_SAFETY sections 2 and 3)', () => {
  it('a running fast is not timed to the window: no planned length, no window on the meter, eat now', () => {
    const started = at(addDays(D, -1), '19:00');
    const fasting = inputs(D, { fasts: [fast('f1', started, null)] });
    const view = open(fastingView(fasting, context({ stopSignPause: true }), at(D, '09:00'), NZ));
    expect(view.stopSignPause).toBe(true);
    expect(view.running).toMatchObject({
      endHint: { kind: 'eat-now' },
      spanPlannedMinutes: null,
      plan: null,
      meter: { window: null },
    });
    // Without the pause the same fast is timed to 6:00 pm.
    const timed = open(fastingView(fasting, context(), at(D, '09:00'), NZ));
    expect(timed.running?.endHint.kind).toBe('window');
  });

  it('nothing offers or names a window time: no 5 pm snack, no reflux option, no next window', () => {
    const symptom: SymptomRecord = {
      id: 's1',
      at: iso(at(D, '06:40')),
      timeZone: NZ,
      symptom: 'heartburn',
      severity: null,
      note: null,
    };
    const refluxDay = inputs(D, { symptoms: [symptom] });
    const timed = open(fastingView(refluxDay, context(), at(D, '09:00'), NZ));
    expect(timed.upcoming?.snack.fits).toEqual(SNACK_AND_DINNER);
    expect(timed.reflux.options).not.toBeNull();
    expect(timed.pattern?.next).not.toBeNull();
    const paused = open(
      fastingView(refluxDay, context({ stopSignPause: true }), at(D, '09:00'), NZ),
    );
    // The meal check carries the pause, so a snack added before the answer shows without times.
    expect(paused.upcoming).toMatchObject({ snack: { fits: null }, stopSignPause: true });
    expect(paused.reflux.options).toBeNull();
    expect(paused.pattern).toMatchObject({ next: null });
    // After tonight's window, tomorrow's snack is not offered either.
    const evening = (stopSignPause: boolean) =>
      open(
        fastingView(
          inputs(D),
          context({
            mealSources: sources({ [addDays(D, 1)]: 150 }, { [D]: shortLog }),
            stopSignPause,
          }),
          at(D, '21:00'),
          NZ,
        ),
      ).closed?.tomorrowSnack;
    expect(evening(false)).toEqual(SNACK_AND_DINNER);
    expect(evening(true)).toBeNull();
  });
});

describe('the reflux options (F26)', () => {
  it('on a symptom day, once the window has opened there is nothing left to offer, so there are no options at all', () => {
    const symptom: SymptomRecord = {
      id: 's1',
      at: iso(at(D, '06:40')),
      timeZone: NZ,
      symptom: 'heartburn',
      severity: null,
      note: null,
    };
    const withSymptom = inputs(D, { symptoms: [symptom] });
    expect(
      open(fastingView(withSymptom, context(), at(D, '07:00'), NZ)).reflux.options,
    ).toMatchObject({ day: 'today', symptomTriggered: true });
    expect(open(fastingView(withSymptom, context(), at(D, '18:10'), NZ)).reflux.options).toBeNull();
  });
});
