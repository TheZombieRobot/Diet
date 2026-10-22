import { describe, expect, it } from 'vitest';
import type { PreCheck, SessionRecord } from '../storage/records';
import { addDays, type LocalDate } from '../util/time';
import { getExerciseData } from './dataset';
import { isToleratedWalk, type JogState, jogStatus, toleratedWalkCount } from './jog';
import { ALL_NO, check, movement, session } from './testSessions';

const data = getExerciseData();
const WALK = 'seed:session-beach-walk';
const JOG = 'seed:session-beach-jog';

const walk = (n: number, date: LocalDate, more: Partial<SessionRecord> = {}): SessionRecord =>
  session(n, {
    date,
    templateId: WALK,
    movements: [movement('seed:ex-beach-walk', 'standard', [900], { unit: 'seconds' })],
    exertion: 3,
    soreness: 3,
    ...more,
  });
/** A later check: the owner answered the check, all no, and chose to rest. */
const restAfterCheck = (n: number, date: LocalDate): SessionRecord =>
  session(n, { date, templateId: 'seed:session-a', status: 'rested', preCheck: ALL_NO });

describe('C51: a tolerated walk', () => {
  it.each<[string, Partial<SessionRecord>, PreCheck | null, boolean]>([
    ['15 minutes, every check no, effort and soreness 3, a clear next check', {}, ALL_NO, true],
    ['not finished (rested)', { status: 'rested' }, ALL_NO, false],
    ['a yes before it (a lighter walk)', { preCheck: check('heatOrSun') }, ALL_NO, false],
    ['effort 4', { exertion: 4 }, ALL_NO, false],
    ['soreness 4', { soreness: 4 }, ALL_NO, false],
    ['not rated', { exertion: null, soreness: null }, ALL_NO, false],
    ['pain at the next check', {}, check('painOrInjury'), false],
    ['back or leg symptoms at the next check', {}, check('backOrLegSymptoms'), false],
    ['no later check yet', {}, null, false],
    [
      'only 1 minute walked',
      { movements: [movement('seed:ex-beach-walk', 'standard', [60], { unit: 'seconds' })] },
      ALL_NO,
      false,
    ],
    ['not a walk (session A)', { templateId: 'seed:session-a' }, ALL_NO, false],
  ])('%s', (_label, change, next, tolerated) => {
    expect(isToleratedWalk(data, walk(1, '2000-01-08', change), next)).toBe(tolerated);
  });

  it('at most one walk a day counts; the next check is on a later day; a walk after today is not counted', () => {
    const sameDay = [1, 2, 3, 4].map((n) => walk(n, '2000-01-08'));
    expect(
      toleratedWalkCount(data, [...sameDay, restAfterCheck(5, '2000-01-11')], '2000-01-19'),
    ).toBe(1);
    expect(
      toleratedWalkCount(
        data,
        [walk(1, '2000-01-08'), restAfterCheck(2, '2000-01-08')],
        '2000-01-19',
      ),
    ).toBe(0);
    expect(
      toleratedWalkCount(
        data,
        [walk(1, '2000-01-20'), restAfterCheck(2, '2000-01-21')],
        '2000-01-19',
      ),
    ).toBe(0);
  });
});

describe('UX 4d: beach jogging needs the opt-in and four tolerated walks', () => {
  /** k tolerated walks on 3, 4, 5 … January, then a clear check the day after the last. */
  const walks = (k: number): SessionRecord[] => [
    ...Array.from({ length: k }, (_, i) => walk(i + 1, addDays('2000-01-03', i))),
    restAfterCheck(50, addDays('2000-01-03', k)),
  ];
  const jogOn = (n: number, date: LocalDate, more: Partial<SessionRecord> = {}) =>
    session(n, {
      date,
      templateId: JOG,
      movements: [movement('seed:ex-beach-jog', 'standard', [30, 30, 30], { unit: 'seconds' })],
      exertion: 2,
      soreness: 2,
      ...more,
    });
  const hardJog = jogOn(60, '2000-01-09', { exertion: 5 });
  const unfinishedJog = jogOn(61, '2000-01-09', {
    status: 'planned',
    exertion: null,
    soreness: null,
  });
  const walkAfter = [walk(70, '2000-01-10'), restAfterCheck(71, '2000-01-11')];

  it.each<[string, boolean, SessionRecord[], JogState]>([
    ['opt-in off with 6 tolerated walks: never switched on for you', false, walks(6), 'off-ready'],
    ['opt-in off with 2', false, walks(2), 'off-few'],
    ['opt-in on with 3', true, walks(3), 'on-few'],
    ['opt-in on with 4', true, walks(4), 'unlocked'],
    [
      'then a jog rated effort 2 and soreness 2',
      true,
      [...walks(4), jogOn(60, '2000-01-09')],
      'unlocked',
    ],
    ['then a jog rated effort 5', true, [...walks(4), hardJog], 'paused'],
    [
      'then a jog rated soreness 5',
      true,
      [...walks(4), jogOn(60, '2000-01-09', { soreness: 5 })],
      'paused',
    ],
    [
      'then a jog rated 2 and 2 with pain at the next check',
      true,
      [
        ...walks(4),
        jogOn(60, '2000-01-09'),
        session(62, {
          date: '2000-01-10',
          templateId: WALK,
          status: 'rested',
          preCheck: check('painOrInjury'),
        }),
      ],
      'paused',
    ],
    [
      'then a jog rated 2 and 2 with back or leg symptoms at the next check',
      true,
      [
        ...walks(4),
        jogOn(60, '2000-01-09'),
        session(62, {
          date: '2000-01-10',
          templateId: WALK,
          status: 'rested',
          preCheck: check('backOrLegSymptoms'),
        }),
      ],
      'paused',
    ],
    [
      'ruling 10: then a jog stopped part-way on an earlier day, never rated, with a clear next check',
      true,
      [...walks(4), unfinishedJog, restAfterCheck(62, '2000-01-10')],
      'paused',
    ],
    [
      'ruling 10: an unfinished jog is unrated, whatever its rating fields hold',
      true,
      [
        ...walks(4),
        jogOn(61, '2000-01-09', { status: 'planned' }),
        restAfterCheck(62, '2000-01-10'),
      ],
      'paused',
    ],
    [
      'ruling 10: the same jog with pain at the next check',
      true,
      [
        ...walks(4),
        unfinishedJog,
        session(62, {
          date: '2000-01-10',
          templateId: WALK,
          status: 'rested',
          preCheck: check('painOrInjury'),
        }),
      ],
      'paused',
    ],
    [
      'ruling 10: a jog in progress today can still be resumed',
      true,
      [...walks(4), jogOn(61, '2000-01-19', { status: 'planned', exertion: null, soreness: null })],
      'unlocked',
    ],
    [
      'then a tolerated walk on the same day as the hard jog',
      true,
      [...walks(4), hardJog, walk(70, '2000-01-09'), restAfterCheck(71, '2000-01-11')],
      'paused',
    ],
    [
      'then a lighter jog after a yes, rated 2 and 2: only a walk clears the pause',
      true,
      [
        ...walks(4),
        hardJog,
        jogOn(63, '2000-01-12', { preCheck: check('heatOrSun') }),
        restAfterCheck(64, '2000-01-13'),
      ],
      'paused',
    ],
    [
      'then a lighter jog after a yes, rated effort 5',
      true,
      [...walks(4), jogOn(63, '2000-01-12', { preCheck: check('heatOrSun'), exertion: 5 })],
      'paused',
    ],
    [
      'then one more tolerated walk after it',
      true,
      [...walks(4), hardJog, ...walkAfter],
      'unlocked',
    ],
    // The clock set back two days: rows dated after today count against jogging, never for it.
    [
      'a clock set back: a jog dated after today rated effort 5',
      true,
      [...walks(4), jogOn(60, '2000-01-21', { exertion: 5 })],
      'paused',
    ],
    [
      'a clock set back: a jog dated after today never finished',
      true,
      [...walks(4), jogOn(61, '2000-01-21', { status: 'planned', exertion: null, soreness: null })],
      'paused',
    ],
    [
      'a clock set back: a walk dated after today does not clear the pause',
      true,
      [...walks(4), hardJog, walk(70, '2000-01-21'), restAfterCheck(71, '2000-01-22')],
      'paused',
    ],
  ])('%s', (_label, jogOptIn, sessions, state) => {
    expect(jogStatus(data, { jogOptIn, sessions, today: '2000-01-19' }).state).toBe(state);
  });
});
