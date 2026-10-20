import { describe, expect, it } from 'vitest';
import type { ReadinessGates } from '../storage/readiness';
import type {
  PreCheck,
  SessionMovement,
  SessionRecord,
  WeeklyPatternDay,
} from '../storage/records';
import type { LocalDate } from '../util/time';
import { getExerciseData } from './dataset';
import { sessionStartGate, sessionWriteProblem, type StartGate } from './start';
import { ALL_NO, check, movement, session } from './testSessions';
import {
  checkWeeklyPattern,
  type DayState,
  occurrencesLeft,
  resolveWeeklyPattern,
  type WeekProblem,
  weekDays,
} from './week';

const data = getExerciseData();
const A = 'seed:session-a';
const B = 'seed:session-b';
const C = 'seed:session-c';
const WALK = 'seed:session-beach-walk';
const JOG = 'seed:session-beach-jog';
const BODYWEIGHT = { bands: false, dumbbells: false };
const locked = { jogUnlocked: false };

/** A full week from the days given (ISO weekday → template ids); every other day is rest. */
const week = (days: Partial<Record<number, string[]>>): WeeklyPatternDay[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, templateIds: days[weekday] ?? [] }));
const DEFAULT = { 2: [A], 5: [B], 6: [WALK] };
const defaultWeek = resolveWeeklyPattern(data, null, locked);
const done = (n: number, date: LocalDate, templateId: string) =>
  session(n, { date, templateId, movements: [movement('seed:ex-squat', 'standard', [8, 8])] });

describe('the weekly plan (EX-05)', () => {
  it.each<[string, Partial<Record<number, string[]>>, boolean, WeekProblem[]]>([
    ['EX-05: the default week', DEFAULT, false, []],
    ['A Tue, C Thu, B Sat, walk Sun', { 2: [A], 4: [C], 6: [B], 7: [WALK] }, false, []],
    [
      'A Sun, B Mon (Sunday to Monday counts)',
      { 1: [B], 7: [A] },
      false,
      ['strength-back-to-back'],
    ],
    ['only A', { 2: [A] }, false, ['strength-count']],
    ['A and B on Tue, C on Fri', { 2: [A, B], 5: [C] }, false, ['day-too-full']],
    [
      'A Tue, B Fri, walks Mon, Wed, Thu, Sat',
      { 1: [WALK], 2: [A], 3: [WALK], 4: [WALK], 5: [B], 6: [WALK] },
      false,
      ['rest-days'],
    ],
    [
      'the default week with a jog on Sunday, locked',
      { ...DEFAULT, 7: [JOG] },
      false,
      ['jog-locked'],
    ],
    [
      'the default week with jogs on Monday and Tuesday, unlocked',
      { ...DEFAULT, 1: [JOG], 2: [A, JOG] },
      true,
      ['jog-limit', 'jog-on-strength-day'],
    ],
    [
      'jogs on Monday, Wednesday and Saturday, none beside another, unlocked',
      { 1: [JOG], 2: [A], 3: [JOG], 5: [B], 6: [JOG] },
      true,
      ['jog-limit'],
    ],
    [
      'a walk and a jog on Saturday, unlocked',
      { ...DEFAULT, 6: [WALK, JOG] },
      true,
      ['day-too-full'],
    ],
    [
      'the default week with an unknown session on Monday',
      { ...DEFAULT, 1: ['seed:session-gone'] },
      false,
      ['unknown-template'],
    ],
  ])('checkWeeklyPattern: %s', (_label, days, jogUnlocked, problems) => {
    expect(checkWeeklyPattern(data, week(days), { jogUnlocked })).toEqual(problems);
  });

  it('resolveWeeklyPattern: no stored plan shows the default week', () => {
    expect(defaultWeek.source).toBe('default');
    expect(defaultWeek.days).toEqual(week(DEFAULT));
  });

  it('resolveWeeklyPattern: a valid stored plan is shown as stored', () => {
    const stored = week({ 2: [A], 4: [C], 6: [B] });
    expect(resolveWeeklyPattern(data, stored, locked)).toMatchObject({
      source: 'stored',
      days: stored,
    });
  });

  it('EX-05: an imported plan with sessions every day is never shown; the default week is, with the reasons', () => {
    const everyDay = week({ 1: [WALK], 2: [A], 3: [WALK], 4: [B], 5: [WALK], 6: [C], 7: [WALK] });
    const resolved = resolveWeeklyPattern(data, everyDay, locked);
    expect(resolved.source).toBe('default-fallback');
    expect(resolved.days.filter((d) => d.templateIds.length === 0).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(resolved.problems).toEqual(['rest-days']);
  });

  it('resolveWeeklyPattern: a locked jog shows as the walk and an unknown id is dropped', () => {
    const resolved = resolveWeeklyPattern(
      data,
      week({ ...DEFAULT, 1: ['seed:session-gone'], 7: [JOG] }),
      locked,
    );
    expect(resolved).toMatchObject({ source: 'stored-adjusted', jogShownAsWalk: true });
    expect(resolved.days).toEqual(week({ ...DEFAULT, 7: [WALK] }));
  });
});

describe('the week view: rest is never a failure', () => {
  const today = '2000-01-19';
  it.each<[string, LocalDate, SessionRecord[], DayState]>([
    ['Monday with nothing planned', '2000-01-17', [], 'rest-day'],
    ['Tuesday with a done row', '2000-01-18', [done(1, '2000-01-18', A)], 'done'],
    [
      'Tuesday with a rested row',
      '2000-01-18',
      [session(1, { date: '2000-01-18', templateId: A, status: 'rested' })],
      'rested',
    ],
    [
      'Tuesday with a skipped row',
      '2000-01-18',
      [session(1, { date: '2000-01-18', templateId: A, status: 'skipped' })],
      'rested',
    ],
    ['Tuesday with no row', '2000-01-18', [], 'not-done'],
    [
      'Tuesday with an unfinished row that has ticked sets',
      '2000-01-18',
      [
        session(1, {
          date: '2000-01-18',
          templateId: A,
          status: 'planned',
          movements: [movement('seed:ex-squat', 'standard', [8])],
        }),
      ],
      'done',
    ],
    ['Friday, still to come', '2000-01-21', [], 'planned'],
  ])('%s', (_label, date, rows, state) => {
    const day = weekDays(data, defaultWeek, rows, '2000-01-17', today).find((d) => d.date === date);
    expect(day?.state).toBe(state);
  });

  it('the row is planned twice in the default week: Tuesday shares the weekly amount with Friday', () => {
    expect(occurrencesLeft(data, defaultWeek, 'seed:ex-row', '2000-01-18', BODYWEIGHT)).toBe(2);
    expect(occurrencesLeft(data, defaultWeek, 'seed:ex-row', '2000-01-21', BODYWEIGHT)).toBe(1);
  });
});

describe('the start gate: every way into a session (RD-05, EX-05)', () => {
  const threeSessions = resolveWeeklyPattern(data, week({ 2: [A], 4: [C], 6: [B] }), locked);
  const jogWeek = resolveWeeklyPattern(data, week({ ...DEFAULT, 3: [JOG], 7: [JOG] }), {
    jogUnlocked: true,
  });
  const walkDays = (dates: LocalDate[]) => dates.map((date, i) => done(10 + i, date, WALK));
  const workMonToFri = walkDays([
    '2000-01-17',
    '2000-01-18',
    '2000-01-19',
    '2000-01-20',
    '2000-01-21',
  ]);
  const jog = (n: number, date: LocalDate) =>
    session(n, {
      date,
      templateId: JOG,
      movements: [movement('seed:ex-beach-jog', 'standard', [30], { unit: 'seconds' })],
    });
  const today = (n: number, more: Partial<SessionRecord>) =>
    session(n, { date: '2000-01-18', templateId: A, status: 'planned', ...more });
  const restedWithPain = today(1, { status: 'rested', preCheck: check('painOrInjury') });
  const lighterNoTicks = today(2, { preCheck: check('heavyWorkDay') });
  type Change = Partial<Parameters<typeof sessionStartGate>[1]>;
  const ready = { kind: 'ready', steps: ['stopRules', 'preCheck'] } as const;
  const gate = (change: Change) =>
    sessionStartGate(data, {
      gates: { exercisePlansAvailable: true },
      templateId: A,
      today: '2000-01-18',
      week: defaultWeek,
      jogUnlocked: false,
      sessions: [],
      equipment: BODYWEIGHT,
      sessionId: null,
      ...change,
    });

  it.each<[string, Change, StartGate]>([
    [
      'B on Tuesday, not planned that day',
      { templateId: B },
      { kind: 'refused', problem: 'not-planned-today' },
    ],
    [
      'a stored planned jog while jogging is not unlocked',
      {
        templateId: JOG,
        sessions: [session(1, { date: '2000-01-18', templateId: JOG, status: 'planned' })],
      },
      { kind: 'refused', problem: 'jog-locked' },
    ],
    [
      'A again after resting with a pain answer this morning',
      { sessions: [restedWithPain] },
      { kind: 'refused', problem: 'earlier-yes' },
    ],
    [
      'A again after a lighter heavy-work-day row with no ticks',
      { sessions: [lighterNoTicks] },
      { kind: 'refused', problem: 'earlier-yes' },
    ],
    [
      'resuming that rested row itself',
      { sessions: [restedWithPain], sessionId: restedWithPain.id },
      ready,
    ],
    [
      "resuming today's own row with ticked sets",
      {
        sessions: [today(3, { movements: [movement('seed:ex-squat', 'standard', [8])] })],
        sessionId: today(3, {}).id,
      },
      ready,
    ],
    [
      'A on Tuesday after C on Monday',
      { sessions: [done(1, '2000-01-17', C)] },
      { kind: 'refused', problem: 'back-to-back' },
    ],
    [
      "A on Tuesday with Monday's C row passed as the row being resumed",
      { sessions: [done(1, '2000-01-17', C)], sessionId: done(1, '2000-01-17', C).id },
      { kind: 'refused', problem: 'back-to-back' },
    ],
    [
      "A on Tuesday with B's row from earlier that day passed as the row being resumed",
      { sessions: [done(1, '2000-01-18', B)], sessionId: done(1, '2000-01-18', B).id },
      { kind: 'refused', problem: 'already-today' },
    ],
    [
      'A on Tuesday with strength already logged on Wednesday',
      { sessions: [done(1, '2000-01-19', B)] },
      { kind: 'refused', problem: 'back-to-back' },
    ],
    [
      'A on Tuesday after a session the dataset no longer holds, with squats, on Monday',
      { sessions: [done(1, '2000-01-17', 'seed:session-gone')] },
      { kind: 'refused', problem: 'back-to-back' },
    ],
    [
      'A on Tuesday after B earlier that day',
      { sessions: [done(1, '2000-01-18', B)] },
      { kind: 'refused', problem: 'already-today' },
    ],
    [
      'the Saturday walk after a walk earlier that day',
      { templateId: WALK, today: '2000-01-22', sessions: walkDays(['2000-01-22']) },
      { kind: 'refused', problem: 'already-today' },
    ],
    [
      'the Wednesday jog after a jog on Tuesday',
      {
        templateId: JOG,
        today: '2000-01-19',
        week: jogWeek,
        jogUnlocked: true,
        sessions: [jog(1, '2000-01-18')],
      },
      { kind: 'refused', problem: 'jog-limit' },
    ],
    [
      'the Sunday jog after jogs on Monday and Thursday',
      {
        templateId: JOG,
        today: '2000-01-23',
        week: jogWeek,
        jogUnlocked: true,
        sessions: [jog(1, '2000-01-17'), jog(2, '2000-01-20')],
      },
      { kind: 'refused', problem: 'jog-limit' },
    ],
    [
      'the Wednesday jog after strength earlier that day',
      {
        templateId: JOG,
        today: '2000-01-19',
        week: jogWeek,
        jogUnlocked: true,
        sessions: [done(1, '2000-01-19', C)],
      },
      { kind: 'refused', problem: 'jog-on-strength-day' },
    ],
    [
      'A on Tuesday after a jog earlier that day',
      { jogUnlocked: true, sessions: [jog(1, '2000-01-18')] },
      { kind: 'refused', problem: 'jog-on-strength-day' },
    ],
    [
      'B on Saturday after strength on Monday, Wednesday and Thursday',
      {
        templateId: B,
        today: '2000-01-22',
        week: threeSessions,
        sessions: [done(1, '2000-01-17', A), done(2, '2000-01-19', B), done(3, '2000-01-20', C)],
      },
      { kind: 'refused', problem: 'strength-count' },
    ],
    [
      'B on Monday after strength on Tuesday, Thursday and Saturday the week before (the ISO week)',
      {
        templateId: B,
        today: '2000-01-24',
        week: resolveWeeklyPattern(data, week({ 1: [B], 3: [A], 5: [C] }), locked),
        sessions: [done(1, '2000-01-18', A), done(2, '2000-01-20', B), done(3, '2000-01-22', C)],
      },
      { kind: 'ready', steps: ['stopRules', 'painFreeOnly', 'preCheck'] },
    ],
    [
      'the Saturday walk after work Monday to Friday',
      { templateId: WALK, today: '2000-01-22', sessions: workMonToFri },
      { kind: 'refused', problem: 'rest-days' },
    ],
    [
      'ruling 11: A on Tuesday after walks Thursday to Monday, across two ISO weeks',
      {
        sessions: walkDays(['2000-01-13', '2000-01-14', '2000-01-15', '2000-01-16', '2000-01-17']),
      },
      { kind: 'refused', problem: 'rest-days' },
    ],
    [
      'ruling 11: A on Tuesday with walks on Monday and Wednesday to Saturday, rows dated after today (a clock moved back), in a 7-day window that does not end today',
      {
        sessions: walkDays(['2000-01-17', '2000-01-19', '2000-01-20', '2000-01-21', '2000-01-22']),
      },
      { kind: 'refused', problem: 'rest-days' },
    ],
    ['A on Tuesday with nothing else', {}, ready],
  ])('%s', (_label, change, expected) => {
    expect(gate(change)).toEqual(expected);
  });

  it.each<[string, Change]>([
    ['A on Tuesday', {}],
    ['B on Tuesday, not planned', { templateId: B }],
    ['a session the dataset does not hold', { templateId: 'seed:session-gone' }],
    ['a jog while locked', { templateId: JOG }],
    ['A after a pain answer today', { sessions: [restedWithPain] }],
    ['A after C on Monday', { sessions: [done(1, '2000-01-17', C)] }],
    ['A after B earlier that day', { sessions: [done(1, '2000-01-18', B)] }],
    ['resuming a row', { sessions: [restedWithPain], sessionId: restedWithPain.id }],
  ])('RD-05: readiness answer 6 without the GP confirmation blocks first: %s', (_label, change) => {
    expect(gate({ ...change, gates: { exercisePlansAvailable: false } })).toEqual({
      kind: 'blocked',
    });
    const missing = {} as Pick<ReadinessGates, 'exercisePlansAvailable'>;
    expect(gate({ ...change, gates: missing })).toEqual({ kind: 'blocked' });
  });

  it('nothing with work is written without a pre-session check, and a row after a yes holds only the lighter session', () => {
    const base = { date: '2000-01-18', templateId: A, preCheck: null };
    expect(sessionWriteProblem(data, session(1, { ...base, status: 'done' }))).toBe('no-pre-check');
    expect(
      sessionWriteProblem(
        data,
        session(2, {
          ...base,
          status: 'planned',
          movements: [movement('seed:ex-squat', 'standard', [8])],
        }),
      ),
    ).toBe('no-pre-check');
    expect(sessionWriteProblem(data, session(3, { ...base, status: 'rested' }))).toBeNull();

    const afterYes = (preCheck: PreCheck, ...movements: SessionMovement[]) =>
      sessionWriteProblem(data, session(4, { ...base, templateId: B, preCheck, movements }));
    const march = movement('seed:ex-march', 'standard', [150], { unit: 'seconds' });
    expect(
      afterYes(check('heatOrSun'), march, movement('seed:ex-squat', 'easier', [8])),
    ).toBeNull();
    expect(afterYes(check('heatOrSun'), movement('seed:ex-squat', 'harder', [12, 12]))).toBe(
      'lighter-only',
    );
    expect(afterYes(check('heavyWorkDay'), movement('seed:ex-row', 'dumbbell', [12]))).toBe(
      'lighter-only',
    );
    expect(afterYes(check('backOrLegSymptoms'), movement('seed:ex-hip-hinge', 'easier', [8]))).toBe(
      'lighter-only',
    );
    expect(afterYes(ALL_NO, movement('seed:ex-squat', 'harder', [12, 12]))).toBeNull();
  });
});
