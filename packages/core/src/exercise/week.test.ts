import { describe, expect, it } from 'vitest';
import type { SessionRecord, WeeklyPatternDay } from '../storage/records';
import type { LocalDate } from '../util/time';
import { getExerciseData } from './dataset';
import { sessionStartGate, sessionWriteProblem, type StartGate } from './start';
import { movement, session } from './testSessions';
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
  const workMonToFri = ['2000-01-17', '2000-01-18', '2000-01-19', '2000-01-20', '2000-01-21'].map(
    (date, i) => done(10 + i, date, WALK),
  );
  it.each<[string, Partial<Parameters<typeof sessionStartGate>[1]>, StartGate]>([
    [
      'RD-05: readiness answer 6 without the GP confirmation',
      { gates: { exercisePlansAvailable: false } },
      { kind: 'blocked' },
    ],
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
      'A on Tuesday after C on Monday',
      { sessions: [done(1, '2000-01-17', C)] },
      { kind: 'refused', problem: 'back-to-back' },
    ],
    [
      'A on Tuesday after B earlier that day',
      { sessions: [done(1, '2000-01-18', B)] },
      { kind: 'refused', problem: 'already-today' },
    ],
    [
      'the Saturday walk after work Monday to Friday',
      { templateId: WALK, today: '2000-01-22', sessions: workMonToFri },
      { kind: 'refused', problem: 'rest-days' },
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
    ['A on Tuesday with nothing else', {}, { kind: 'ready', steps: ['stopRules', 'preCheck'] }],
  ])('%s', (_label, change, gate) => {
    expect(
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
      }),
    ).toEqual(gate);
  });

  it('nothing with work is written without a pre-session check; resting without it is fine', () => {
    const base = { date: '2000-01-18', templateId: A, preCheck: null };
    expect(sessionWriteProblem(session(1, { ...base, status: 'done' }))).toBe('no-pre-check');
    expect(
      sessionWriteProblem(
        session(2, {
          ...base,
          status: 'planned',
          movements: [movement('seed:ex-squat', 'standard', [8])],
        }),
      ),
    ).toBe('no-pre-check');
    expect(sessionWriteProblem(session(3, { ...base, status: 'rested' }))).toBeNull();
  });
});
