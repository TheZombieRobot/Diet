// The Move screens' derivations (item 27 design section 5.1, U1 to U12). Item 26's rules are
// tested in exercise/; these test only what the screens add on top. Every row is synthetic.
import { describe, expect, it } from 'vitest';
import { move, readiness } from '../copy/health';
import { getExerciseData } from '../exercise/dataset';
import { estimateSeconds } from '../exercise/duration';
import { templateById } from '../exercise/lookup';
import { ALL_NO, check, movement, session } from '../exercise/testSessions';
import { type ResolvedWeek, resolveWeeklyPattern } from '../exercise/week';
import { readinessGates } from '../readiness/gates';
import type { ReadinessGates } from '../storage/readiness';
import type { YesNo } from '../storage/primitives';
import type { KickstartCheckRecord, SessionRecord, WeeklyPatternDay } from '../storage/records';
import { PRE_START_STOP_SIGN_CARD, preStartTrigger } from '../weight/preStart';
import { type MoveRecords, moveContext, preStartStopSignDay } from './context';
import {
  heatElectrolyteLines,
  heatWaterExtraMl,
  heatWaterMl,
  templateIdFromSlug,
  templateSlug,
  weekFooter,
} from './display';
import { todaySessions } from './items';
import { completeWorkoutTarget, historyRows, sessionScreenState, todayHeadline } from './today';

const data = getExerciseData();
const A = 'seed:session-a';
const B = 'seed:session-b';
const C = 'seed:session-c';
const WALK = 'seed:session-beach-walk';
const JOG = 'seed:session-beach-jog';
const BODYWEIGHT = { bands: false, dumbbells: false };
/** Tuesday 18 January 2000, 9:00 am in Auckland. */
const NOW = '2000-01-17T20:00:00.000Z';
const TUE = '2000-01-18';

type Answers = Partial<Record<'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7', YesNo | null>>;
function gates(answers: Answers = {}): ReadinessGates {
  return readinessGates({
    answers: { q1: 'no', q2: 'no', q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no', ...answers },
    confirmations: { prescriberAgreed: false, gpExerciseDiscussed: false },
    minimumAgeYears: 50,
    lowWeight: false,
  });
}

function records(fields: Partial<MoveRecords> = {}): MoveRecords {
  return {
    profile: {
      equipmentBands: false,
      equipmentDumbbells: false,
      jogOptIn: false,
      dietMode: 'keto',
    },
    weeklyPattern: null,
    sessions: [],
    fasts: [],
    kickstartChecks: [],
    preStartStopSignDay: null,
    ...fields,
  };
}

const ctxOf = (
  fields: Partial<MoveRecords> = {},
  g: ReadinessGates = gates(),
  clock = { today: TUE, now: NOW },
) => moveContext(data, records(fields), g, clock);

/** A week with these weekdays' templates and every other day empty. */
function pattern(days: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string[]>>): WeeklyPatternDay[] {
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
    weekday,
    templateIds: days[weekday] ?? [],
  }));
}

function stopCheck(
  askedAt: string,
  fields: Partial<KickstartCheckRecord> = {},
): KickstartCheckRecord {
  return {
    id: '00000000-0000-4000-8000-000000000900',
    periodId: '00000000-0000-4000-8000-000000000901',
    askedAt,
    timeZone: 'Pacific/Auckland',
    dizzyOnStanding: 'no',
    palpitations: 'no',
    crampsNotSettling: 'no',
    faintAtWork: 'no',
    energyRating: null,
    sleepRating: null,
    outcome: 'extended',
    ...fields,
  };
}

const fast = (startedAt: string, endedAt: string | null, n = 1) => ({
  id: `00000000-0000-4000-8000-00000000080${n}`,
  startedAt,
  endedAt,
  timeZone: 'Pacific/Auckland',
  endedTimeZone: endedAt === null ? null : 'Pacific/Auckland',
});

describe('route slugs (U1)', () => {
  it.each([
    ['seed:session-beach-walk', 'beach-walk'],
    ['seed:session-a', 'a'],
    ['seed:ex-squat', null],
  ])('templateSlug(%s) is %s', (id, slug) => {
    expect(templateSlug(id)).toBe(slug);
  });

  it.each([
    ['A', 'seed:session-a'],
    ['beach-walk', 'seed:session-beach-walk'],
    ['', null],
    ['a b', null],
    ['../x', null],
    ['a--b', null],
    ['x'.repeat(52), null],
  ])('templateIdFromSlug(%j) is %s', (slug, id) => {
    expect(templateIdFromSlug(slug)).toBe(id);
  });
});

describe('moveContext (U2; M32, HS-02, EX-05)', () => {
  it('the default week on a Tuesday: Session A today, four rest days, jogging off', () => {
    const ctx = ctxOf();
    expect(ctx.items.map((i) => [i.templateId, i.state, i.row])).toEqual([
      [A, 'not-started', null],
    ]);
    expect(ctx.days.filter((d) => d.state === 'rest-day')).toHaveLength(4);
    expect(ctx.jog.state).toBe('off-few');
  });

  it.each([
    ['a fast from 2 hours ago', [fast('2000-01-17T18:00:00.000Z', null)], {}, true, false],
    [
      'the same with fasting gated (Q2)',
      [fast('2000-01-17T18:00:00.000Z', null)],
      { q2: 'yes' },
      false,
      false,
    ],
    ['a fast from 25 hours ago', [fast('2000-01-16T19:00:00.000Z', null)], {}, false, true],
    [
      // 30 minutes apart, so one span of 25 hours (item 15's span rule).
      'a fast restarted half an hour after one ended',
      [
        fast('2000-01-16T19:00:00.000Z', '2000-01-17T07:00:00.000Z', 1),
        fast('2000-01-17T07:30:00.000Z', null, 2),
      ],
      {},
      false,
      true,
    ],
  ] as const)('%s: fastingNow %s, over the ceiling %s', (_, fasts, answers, now, over) => {
    const ctx = ctxOf({ fasts }, gates(answers));
    expect(ctx.fastingNow).toBe(now);
    expect(ctx.fastOverCeiling).toBe(over);
  });

  it.each([
    [
      'faint at work yesterday',
      [stopCheck('2000-01-16T22:00:00.000Z', { faintAtWork: 'yes' })],
      null,
      '2000-01-17',
    ],
    [
      'the same 15 days earlier',
      [stopCheck('2000-01-01T22:00:00.000Z', { faintAtWork: 'yes' })],
      null,
      null,
    ],
    [
      'an "extended" outcome with palpitations not no',
      [stopCheck('2000-01-16T22:00:00.000Z', { palpitations: 'yes' })],
      null,
      '2000-01-17',
    ],
    [
      // Ruling 9's cautious reading of a clock set back: a check dated after now counts.
      'faint at work an hour after now',
      [stopCheck('2000-01-17T21:00:00.000Z', { faintAtWork: 'yes' })],
      null,
      TUE,
    ],
    ['a pre-start yes today', [], TUE, TUE],
    // The pre-start "yes" is a record: it counts for 336 hours, in every tab and after a relaunch.
    ['a pre-start yes 2 days ago still counts', [], '2000-01-16', '2000-01-16'],
  ] as const)('stop signs: %s', (_, kickstartChecks, preStartStopSignDay, day) => {
    expect(ctxOf({ kickstartChecks, preStartStopSignDay }).stopSignOn).toBe(day);
  });

  /** A pre-start "yes" as item 14 records it: a card_state row of its date, shown at `at`. */
  const preStartRow = (
    date: string,
    at: string,
  ): Parameters<typeof preStartStopSignDay>[0][number] => ({
    cardId: PRE_START_STOP_SIGN_CARD,
    trigger: preStartTrigger(date),
    firstShownAt: at,
    dismissedAt: null,
    dismissedTimeZone: null,
    doneAt: null,
  });
  it.each([
    [
      'a record 13 days ago',
      [preStartRow('2000-01-05', '2000-01-04T20:00:00.000Z')],
      null,
      '2000-01-05',
    ],
    ['a record 15 days ago', [preStartRow('2000-01-03', '2000-01-02T20:00:00.000Z')], null, null],
    ['no record, a "yes" this page holds from 14 days ago', [], '2000-01-04', '2000-01-04'],
    ['no record, a "yes" this page holds from 15 days ago', [], '2000-01-03', null],
    [
      'the later of a record and a held "yes"',
      [preStartRow('2000-01-10', '2000-01-09T20:00:00.000Z')],
      '2000-01-12',
      '2000-01-12',
    ],
  ] as const)('preStartStopSignDay: %s', (_, rows, held, day) => {
    expect(preStartStopSignDay(rows, held, { today: TUE, now: NOW })).toBe(day);
  });

  it('a stored Sunday jog while jogging is locked is shown as the walk on Sunday', () => {
    const ctx = ctxOf({ weeklyPattern: pattern({ 2: [A], 5: [B], 7: [JOG] }) });
    expect(ctx.week.jogShownAsWalk).toBe(true);
    expect(ctx.jogAsWalkDays).toEqual([7]);
  });
});

describe('todaySessions (U3; item 26 3.14, M31)', () => {
  const row = (n: number, fields: Partial<SessionRecord> = {}) =>
    session(n, { date: TUE, templateId: A, ...fields });
  const squat = movement('seed:ex-squat', 'standard', [8]);
  const unticked = { ...squat, done: [] };
  const week = resolveWeeklyPattern(data, null, { jogUnlocked: false });
  const items = (sessions: SessionRecord[], w = week) =>
    todaySessions(data, w, sessions, TUE).map((i) => [
      i.templateId,
      i.state,
      i.row?.id ?? null,
      i.planned,
    ]);
  const id = (n: number) => row(n).id;

  it.each([
    ['no rows', [], [[A, 'not-started', null, true]]],
    ['in progress', [row(1, { status: 'planned' })], [[A, 'in-progress', id(1), true]]],
    ['done', [row(1)], [[A, 'done', id(1), true]]],
    ['rested', [row(1, { status: 'rested' })], [[A, 'rested', id(1), true]]],
    ['skipped reads as rested', [row(1, { status: 'skipped' })], [[A, 'rested', id(1), true]]],
    [
      'an unchecked row with nothing ticked is reused',
      [row(1, { status: 'planned', preCheck: null, movements: [unticked] })],
      [[A, 'not-started', id(1), true]],
    ],
    [
      'an unchecked row with ticks is left alone',
      [row(1, { status: 'planned', preCheck: null, movements: [squat] })],
      [[A, 'not-started', null, true]],
    ],
    [
      'in progress beats done',
      [row(2), row(1, { status: 'planned' })],
      [[A, 'in-progress', id(1), true]],
    ],
    [
      'an unplanned C row with work is added, not planned',
      [row(1, { templateId: C })],
      [
        [A, 'not-started', null, true],
        [C, 'done', id(1), false],
      ],
    ],
    [
      'a template no longer in the dataset comes last',
      [row(1, { templateId: 'seed:session-gone' })],
      [
        [A, 'not-started', null, true],
        ['seed:session-gone', 'done', id(1), false],
      ],
    ],
  ] as const)('%s', (_, sessions, expected) => {
    expect(items([...sessions])).toEqual(expected);
  });

  it('A and the walk on one day: strength first, whatever the stored order', () => {
    const both = resolveWeeklyPattern(data, pattern({ 2: [WALK, A], 5: [B], 7: [C] }), {
      jogUnlocked: false,
    });
    expect(items([], both).map(([t]) => t)).toEqual([A, WALK]);
  });
});

describe('completeWorkoutTarget and todayHeadline (U4, U5; EX-08)', () => {
  const both = pattern({ 2: [A, WALK], 5: [B], 7: [C] });
  it.each([
    [
      'A in progress',
      {},
      [session(1, { date: TUE, templateId: A, status: 'planned' })],
      { kind: 'finish', templateId: A },
    ],
    [
      'an in-progress row the plan has moved away from (finish only)',
      { weeklyPattern: pattern({ 3: [A], 5: [B], 7: [C] }) },
      [session(1, { date: TUE, templateId: A, status: 'planned' })],
      { kind: 'finish', templateId: A },
    ],
    ['one session not started', {}, [], { kind: 'start', templateId: A }],
    ['A and the walk not started', { weeklyPattern: both }, [], { kind: 'choose' }],
    [
      'all done or rested',
      { weeklyPattern: both },
      [
        session(1, { date: TUE, templateId: A }),
        session(2, { date: TUE, templateId: WALK, status: 'rested' }),
      ],
      { kind: 'none' },
    ],
    ['a rest day', { weeklyPattern: pattern({ 1: [A], 5: [B] }) }, [], { kind: 'none' }],
  ] as const)('%s', (_, fields, sessions, target) => {
    expect(completeWorkoutTarget(ctxOf({ ...fields, sessions: [...sessions] }).items)).toEqual(
      target,
    );
  });

  it.each([
    ['a rest day', { weeklyPattern: pattern({ 1: [A], 5: [B] }) }, [], { kind: 'rest-day' }],
    ['the planned names', { weeklyPattern: both }, [], { kind: 'planned', templateIds: [A, WALK] }],
    ['all done', {}, [session(1, { date: TUE, templateId: A })], { kind: 'done' }],
    [
      'all rested',
      {},
      [session(1, { date: TUE, templateId: A, status: 'rested' })],
      { kind: 'rested' },
    ],
    [
      'done and rested reads as done',
      { weeklyPattern: both },
      [
        session(1, { date: TUE, templateId: A }),
        session(2, { date: TUE, templateId: WALK, status: 'rested' }),
      ],
      { kind: 'done' },
    ],
  ] as const)('headline: %s', (_, fields, sessions, headline) => {
    expect(todayHeadline(ctxOf({ ...fields, sessions: [...sessions] }).items)).toEqual(headline);
  });
});

describe('sessionScreenState (U6; RD-05, HS-28, HS-12, M29)', () => {
  const state = (
    templateId: string | null,
    fields: Partial<MoveRecords> = {},
    opts: {
      g?: ReadinessGates;
      pinned?: string | null;
      clock?: { today: string; now: string };
    } = {},
  ) => sessionScreenState(data, ctxOf(fields, opts.g, opts.clock), templateId, opts.pinned ?? null);
  const inProgress = session(1, { date: TUE, templateId: A, status: 'planned' });

  it.each([
    ['Q6 yes', gates({ q6: 'yes' })],
    ['Q6 not answered', gates({ q6: null })],
    [
      'a value that is not exactly true',
      { ...gates(), exercisePlansAvailable: 'yes' as unknown as boolean },
    ],
  ])('RD-05: %s blocks, even with done and in-progress rows', (_, g) => {
    const sessions = [session(2, { date: TUE, templateId: WALK }), inProgress];
    expect(state(A, { sessions }, { g })).toEqual({ kind: 'blocked' });
    // A done row's summary is blocked too: it never reaches the start gate.
    expect(state(WALK, { sessions }, { g })).toEqual({ kind: 'blocked' });
  });

  it('a slug that is no template is refused; done, in progress and an unchecked done row', () => {
    expect(state(null)).toMatchObject({ kind: 'refused', problem: 'unknown-template' });
    expect(state(A, { sessions: [session(1, { date: TUE, templateId: A })] })).toMatchObject({
      kind: 'done',
      editable: true,
    });
    expect(
      state(A, { sessions: [session(1, { date: TUE, templateId: A, preCheck: null })] }),
    ).toMatchObject({ kind: 'done', editable: false });
    expect(state(A, { sessions: [inProgress] })).toMatchObject({ kind: 'log', row: inProgress });
  });

  it('a started session the gate now refuses can still be finished', () => {
    const unlockedJog = {
      weeklyPattern: pattern({ 2: [JOG], 4: [A], 6: [B] }),
      sessions: [session(1, { date: TUE, templateId: JOG, status: 'planned' })],
    };
    expect(state(JOG, unlockedJog)).toMatchObject({ kind: 'finish-only', reason: 'jog-locked' });
    expect(
      state(A, { weeklyPattern: pattern({ 4: [A], 6: [B] }), sessions: [inProgress] }),
    ).toMatchObject({ kind: 'finish-only', reason: 'not-planned-today' });
  });

  it('the row open at midnight stays in view: finish only while started, read-only once done', () => {
    const clock = { today: '2000-01-19', now: '2000-01-18T11:01:00.000Z' };
    expect(state(A, { sessions: [inProgress] }, { pinned: inProgress.id, clock })).toMatchObject({
      kind: 'finish-only',
      reason: 'day-changed',
      row: inProgress,
    });
    const done = session(1, { date: TUE, templateId: A });
    expect(state(A, { sessions: [done] }, { pinned: done.id, clock })).toMatchObject({
      kind: 'done',
      editable: false,
    });
  });

  it('before start: the beach steps on a walk day, the pain-free note on B, an unchecked row reused', () => {
    const sat = { today: '2000-01-22', now: '2000-01-21T20:00:00.000Z' };
    const fri = { today: '2000-01-21', now: '2000-01-20T20:00:00.000Z' };
    expect(state(WALK, {}, { clock: sat })).toMatchObject({
      kind: 'before-start',
      steps: ['stopRules', 'beachPrompts', 'preCheck'],
      reuseRowId: null,
    });
    expect(state(B, {}, { clock: fri })).toMatchObject({
      steps: ['stopRules', 'painFreeOnly', 'preCheck'],
    });
    const unchecked = session(1, { date: TUE, templateId: A, status: 'planned', preCheck: null });
    expect(state(A, { sessions: [unchecked] })).toMatchObject({
      kind: 'before-start',
      reuseRowId: unchecked.id,
    });
  });

  it('refusals: B on a Tuesday, and A the day after C', () => {
    expect(state(B)).toMatchObject({ kind: 'refused', problem: 'not-planned-today' });
    const mondayC = session(1, { date: '2000-01-17', templateId: C });
    expect(state(A, { sessions: [mondayC] })).toMatchObject({
      kind: 'refused',
      problem: 'back-to-back',
    });
  });

  it.each([
    ['an unchecked rest is removed', [], null, 'remove'],
    ['a rest from the check is reopened', [], ALL_NO, 'reopen'],
    [
      'a rest from the check while the gate refuses has no undo',
      [session(2, { date: '2000-01-17', templateId: C })],
      ALL_NO,
      null,
    ],
  ] as const)('rested: %s (restUndo)', (_, others, preCheck, undo) => {
    const rested = session(1, { date: TUE, templateId: A, status: 'rested', preCheck });
    expect(state(A, { sessions: [...others, rested] })).toMatchObject({ kind: 'rested', undo });
  });
});

describe('the week footer, history and heat water (U7 to U11)', () => {
  it('weekFooter: the default week, a week of one strength session kind, and none', () => {
    const footer = (p: WeeklyPatternDay[] | null) =>
      weekFooter(data, resolveWeeklyPattern(data, p, { jogUnlocked: false }), BODYWEIGHT);
    expect(footer(null)).toEqual({
      strength: { labels: 'A, B', minutes: '25 to 27' },
      walk: true,
      jog: false,
    });
    expect(footer(pattern({ 2: [A], 5: [A] })).strength).toEqual({ labels: 'A', minutes: '25' });
    const week: ResolvedWeek = {
      days: ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({ weekday, templateIds: [] })),
      source: 'stored',
      jogShownAsWalk: false,
      problems: [],
    };
    expect(weekFooter(data, week, BODYWEIGHT)).toEqual({ strength: null, walk: false, jog: false });
  });

  it('historyRows (EX-04): done, rested, skipped and ticked rows, newest first, limited', () => {
    const ticked = session(4, {
      date: '2000-01-14',
      templateId: A,
      status: 'planned',
      movements: [movement('seed:ex-squat', 'standard', [8])],
    });
    const rows = [
      session(1, { date: '2000-01-11', templateId: A }),
      session(2, { date: '2000-01-12', templateId: WALK, status: 'rested' }),
      session(3, { date: '2000-01-13', templateId: B, status: 'skipped' }),
      ticked,
      session(5, { date: '2000-01-15', templateId: C, status: 'planned' }),
      session(6, { date: '2000-01-19', templateId: A }),
      {
        ...session(7, { date: '2000-01-11', templateId: WALK }),
        completedAt: '2000-01-11T09:00:00.000Z',
      },
    ];
    expect(historyRows(rows, TUE, 10).map((r) => r.id.slice(-1))).toEqual([
      '4',
      '3',
      '2',
      '7',
      '1',
    ]);
    expect(historyRows(rows, TUE, 2)).toHaveLength(2);
    expect(() => historyRows(rows, TUE, 0)).toThrow(RangeError);
  });

  it.each([
    [0, 500],
    [1, 500],
    [2040, 500],
    [3600, 500],
    [3601, 1000],
    [7200, 1000],
  ])('heatWaterMl(%i) is %i', (seconds, ml) => {
    expect(heatWaterMl(seconds)).toBe(ml);
  });

  it('heatWaterMl refuses a negative or unknown length; every shipped session gives 500 mL', () => {
    expect(() => heatWaterMl(-1)).toThrow(RangeError);
    expect(() => heatWaterMl(Number.NaN)).toThrow(RangeError);
    for (const t of data.templates) {
      for (const eq of [BODYWEIGHT, { bands: true, dumbbells: true }]) {
        expect(heatWaterMl(estimateTop(t.id, eq)), t.id).toBe(500);
      }
    }
  });

  const walkSeconds = (s: number) =>
    movement('seed:ex-beach-walk', 'standard', [s], { unit: 'seconds' });
  it.each([
    ['no rows', [], 0],
    ['a done beach walk today', [session(1, { date: TUE, templateId: WALK })], 500],
    [
      'A in progress on a hot day',
      [session(1, { date: TUE, templateId: A, status: 'planned', preCheck: check('heatOrSun') })],
      500,
    ],
    ['A with every answer no', [session(1, { date: TUE, templateId: A })], 0],
    ['a rested walk', [session(1, { date: TUE, templateId: WALK, status: 'rested' })], 0],
    ["yesterday's walk", [session(1, { date: '2000-01-17', templateId: WALK })], 0],
    [
      'a walk with 70 minutes ticked',
      [session(1, { date: TUE, templateId: WALK, movements: [walkSeconds(4200)] })],
      1000,
    ],
    [
      'a walk and a hot-day A',
      [
        session(1, { date: TUE, templateId: WALK }),
        session(2, { date: TUE, templateId: A, preCheck: check('heatOrSun') }),
      ],
      1000,
    ],
  ] as const)('heatWaterExtraMl: %s', (_, sessions, ml) => {
    expect(heatWaterExtraMl(data, [...sessions], TUE, BODYWEIGHT)).toBe(ml);
  });

  const lines = (dietMode: 'keto' | 'balanced' | 'moderate-low-carb', answers: Answers) =>
    heatElectrolyteLines({ dietMode, gates: gates(answers) });
  it.each([
    ['balanced', 'balanced', {}, []],
    ['keto, every gate open, Q4 no', 'keto', {}, [move.safety.beachPrompts.electrolytes]],
    [
      'keto, Q4 yes',
      'keto',
      { q4: 'yes' },
      [move.safety.beachPrompts.electrolytes, readiness.bloodPressure.electrolyte],
    ],
    [
      'keto, Q4 not answered',
      'keto',
      { q4: null },
      [move.safety.beachPrompts.electrolytes, readiness.bloodPressure.electrolyte],
    ],
    ['keto, Q5 yes (no keto ceiling)', 'keto', { q5: 'yes' }, []],
    ['moderate low-carb', 'moderate-low-carb', {}, []],
  ] as const)('heatElectrolyteLines: %s', (_, mode, answers, expected) => {
    expect(lines(mode, answers)).toEqual(expected);
  });
});

function estimateTop(id: string, eq: { bands: boolean; dumbbells: boolean }): number {
  const t = templateById(data, id);
  if (t === undefined) throw new Error(id);
  return estimateSeconds(data, t, 'top', eq);
}
