import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../storage/records';
import type { LocalDate } from '../util/time';
import { getExerciseData } from './dataset';
import { estimateSeconds } from './duration';
import {
  type DoseInput,
  type DoseSuggestion,
  suggestDose,
  toSessionMovement,
  type VolumeHistory,
  weeklyCap,
  weeklyVolumes,
} from './progression';
import { check, movement, session } from './testSessions';

const NO_HISTORY: VolumeHistory = {
  lastWeek: null,
  lastSessionVolume: null,
  lastVariant: null,
  doneThisWeek: 0,
  doneThisSession: 0,
  setsDoneThisSession: 0,
  recentAtTop: 0,
  olderHistory: false,
};
type DoseCase = Partial<Omit<DoseInput, 'history'>> & { history?: Partial<VolumeHistory> };
const dose = (c: DoseCase): DoseSuggestion =>
  suggestDose({
    mode: 'planned',
    sets: 2,
    min: 8,
    max: 12,
    step: 1,
    variant: 'standard',
    nextCandidate: null,
    remainingOccurrences: 1,
    ...c,
    history: { ...NO_HISTORY, ...c.history },
  });
const week1 = (volume: number) => ({ volume, weeksAgo: 1 as const });

describe('EX-03, C76: a suggestion never adds more than about 10% a week', () => {
  it.each<[string, DoseCase, DoseSuggestion]>([
    ['no history', {}, { perSet: [8, 8], weeklyCap: null, reason: 'start', next: null }],
    [
      '3 × 8 last week: at most 26 this week',
      { sets: 3, history: { lastWeek: week1(24), lastSessionVolume: 24 } },
      { perSet: [9, 9, 8], weeklyCap: 26, reason: 'progress', next: null },
    ],
    [
      'at least one rep more when 10% rounds to nothing',
      { sets: 1, min: 5, max: 10, history: { lastWeek: week1(5), lastSessionVolume: 5 } },
      { perSet: [6], weeklyCap: 6, reason: 'progress', next: null },
    ],
    [
      'going from 2 to 3 sessions a week shares the same cap',
      { history: { lastWeek: week1(32), lastSessionVolume: 16 }, remainingOccurrences: 3 },
      { perSet: [6, 5], weeklyCap: 35, reason: 'capped', next: null },
    ],
    [
      'later the same week',
      {
        history: { lastWeek: week1(32), lastSessionVolume: 11, doneThisWeek: 11 },
        remainingOccurrences: 2,
      },
      { perSet: [6, 6], weeklyCap: 35, reason: 'capped', next: null },
    ],
    [
      "the week's amount reached",
      { history: { lastWeek: week1(16), lastSessionVolume: 16, doneThisWeek: 17 } },
      { perSet: [], weeklyCap: 17, reason: 'week-reached', next: null },
    ],
    [
      'the top of the range twice in a row suggests the next version',
      {
        nextCandidate: 'harder',
        remainingOccurrences: 2,
        history: { lastWeek: week1(72), lastSessionVolume: 24, recentAtTop: 2 },
      },
      { perSet: [12, 12], weeklyCap: 79, reason: 'top', next: 'harder' },
    ],
    [
      'holds, in 5-second steps',
      { min: 20, max: 40, step: 5, history: { lastWeek: week1(40), lastSessionVolume: 40 } },
      { perSet: [25, 20], weeklyCap: 45, reason: 'progress', next: null },
    ],
    [
      'jog intervals, in 10-second steps',
      {
        sets: 8,
        min: 30,
        max: 90,
        step: 10,
        remainingOccurrences: 2,
        history: { lastWeek: week1(480), lastSessionVolume: 240 },
      },
      { perSet: [40, 40, 30, 30, 30, 30, 30, 30], weeklyCap: 520, reason: 'progress', next: null },
    ],
    [
      'after a week with no full sessions the level holds, with no increase',
      { history: { lastWeek: { volume: 20, weeksAgo: 2 }, lastSessionVolume: 20 } },
      { perSet: [10, 10], weeklyCap: 20, reason: 'hold', next: null },
    ],
    [
      'a new version starts at the bottom of the range',
      {
        min: 6,
        max: 10,
        variant: 'harder',
        history: { lastVariant: 'standard', lastWeek: week1(20), lastSessionVolume: 20 },
      },
      { perSet: [6, 6], weeklyCap: 22, reason: 'new-variant', next: null },
    ],
    [
      'a lighter session has one set fewer at the bottom of the range',
      {
        mode: 'lighter',
        variant: 'easier',
        history: { lastVariant: 'standard', lastWeek: week1(24), lastSessionVolume: 24 },
      },
      { perSet: [8], weeklyCap: 26, reason: 'lighter', next: null },
    ],
    [
      'HS-29: a lighter session at the same version stays at the bottom of the range, with no next version',
      {
        mode: 'lighter',
        variant: 'easier',
        nextCandidate: 'standard',
        history: {
          lastVariant: 'easier',
          lastWeek: week1(24),
          lastSessionVolume: 24,
          recentAtTop: 2,
        },
      },
      { perSet: [8], weeklyCap: 26, reason: 'lighter', next: null },
    ],
    [
      'a version switch after one ticked set of 9: the session stays within 17',
      {
        variant: 'easier',
        history: {
          lastVariant: 'standard',
          lastWeek: week1(16),
          lastSessionVolume: 16,
          doneThisSession: 9,
          setsDoneThisSession: 1,
        },
      },
      { perSet: [7], weeklyCap: 17, reason: 'new-variant', next: null },
    ],
    [
      'a version switch after one ticked set of 5: the set left starts at the bottom of the range',
      {
        variant: 'easier',
        history: {
          lastVariant: 'standard',
          lastWeek: week1(16),
          lastSessionVolume: 16,
          doneThisSession: 5,
          setsDoneThisSession: 1,
        },
      },
      { perSet: [8], weeklyCap: 17, reason: 'new-variant', next: null },
    ],
    [
      "a switch once this session's amount is ticked",
      {
        variant: 'easier',
        history: {
          lastVariant: 'standard',
          lastWeek: week1(16),
          lastSessionVolume: 16,
          doneThisSession: 17,
          setsDoneThisSession: 2,
        },
      },
      { perSet: [], weeklyCap: 17, reason: 'session-done', next: null },
    ],
  ])('%s', (_label, input, expected) => {
    expect(dose(input)).toEqual(expected);
  });

  it('C76 holds over a grid of 768 histories, and the stored plan never implies more', () => {
    let checked = 0;
    for (const range of [
      { sets: 3, min: 8, max: 12, step: 1, unit: 'reps' as const },
      { sets: 2, min: 20, max: 40, step: 5, unit: 'seconds' as const },
    ]) {
      for (const lastWeek of [
        null,
        week1(1),
        week1(5),
        week1(24),
        week1(60),
        { volume: 24, weeksAgo: 2 as const },
      ]) {
        for (const lastSessionVolume of [null, 1, 16, 30]) {
          for (const doneThisWeek of [0, 5, 17, 40]) {
            for (const remainingOccurrences of [1, 3]) {
              for (const lastVariant of [null, 'easier' as const]) {
                const { unit, ...dims } = range;
                const d = dose({
                  ...dims,
                  remainingOccurrences,
                  history: { lastWeek, lastSessionVolume, doneThisWeek, lastVariant },
                });
                const total = d.perSet.reduce((a, b) => a + b, 0);
                d.perSet.forEach((v, i) => {
                  expect(v % range.step).toBe(0);
                  expect(v).toBeLessThanOrEqual(range.max);
                  expect(v).toBeLessThanOrEqual(d.perSet[i - 1] ?? v);
                });
                if (d.weeklyCap !== null) {
                  expect(total * remainingOccurrences + doneThisWeek).toBeLessThanOrEqual(
                    Math.max(d.weeklyCap, doneThisWeek),
                  );
                  if (doneThisWeek >= d.weeklyCap) expect(d.perSet).toEqual([]);
                }
                if (lastSessionVolume !== null) {
                  expect(total).toBeLessThanOrEqual(weeklyCap(lastSessionVolume, range.step));
                }
                if (lastVariant !== null) expect(total).toBeLessThanOrEqual(range.sets * range.min);
                const stored = toSessionMovement({
                  block: 'main',
                  exerciseId: 'seed:ex-squat',
                  variant: 'standard',
                  unit,
                  perSide: false,
                  perSet: d.perSet,
                  restSeconds: 60,
                  dose: d,
                });
                if (d.perSet.length === 0) expect(stored).toBeNull();
                else
                  expect(
                    (stored?.sets ?? 0) * (stored?.reps ?? stored?.seconds ?? 0),
                  ).toBeLessThanOrEqual(total);
                checked += 1;
              }
            }
          }
        }
      }
    }
    expect(checked).toBe(768);
    expect(() => weeklyCap(0, 1)).toThrow(RangeError);
  });
});

describe('the history behind a suggestion (squat, 2 × 8–12, today Wednesday 2000-01-19)', () => {
  const A = 'seed:session-a';
  const squat = (n: number, date: LocalDate, done: number[], more: Partial<SessionRecord> = {}) =>
    session(n, {
      date,
      templateId: A,
      movements: [movement('seed:ex-squat', 'standard', done)],
      ...more,
    });
  const easierSquat = (
    n: number,
    date: LocalDate,
    done: number[],
    more: Partial<SessionRecord> = {},
  ) =>
    session(n, {
      date,
      templateId: A,
      movements: [movement('seed:ex-squat', 'easier', done)],
      ...more,
    });

  it.each<
    [
      string,
      SessionRecord[],
      { today?: LocalDate; exclude?: string },
      Partial<VolumeHistory>,
      Partial<DoseSuggestion> | null,
    ]
  >([
    [
      'never catch up: after an empty week the level holds',
      [squat(1, '2000-01-04', [8, 8])],
      {},
      { lastWeek: { volume: 16, weeksAgo: 2 } },
      { reason: 'hold', perSet: [8, 8] },
    ],
    [
      'ticks count whatever the status',
      [
        squat(1, '2000-01-17', [5], { status: 'rested' }),
        squat(2, '2000-01-18', [12, 12], { status: 'planned' }),
      ],
      {},
      { doneThisWeek: 29 },
      null,
    ],
    [
      'an unfinished week is not empty; only ticks count, never the planned reps',
      [
        session(1, {
          date: '2000-01-11',
          templateId: A,
          status: 'planned',
          movements: [movement('seed:ex-squat', 'standard', [8, 8], { planned: 500 })],
        }),
      ],
      {},
      { lastWeek: { volume: 16, weeksAgo: 1 } },
      null,
    ],
    [
      'lighter sessions count this week but never set the baseline',
      [
        squat(1, '2000-01-04', [10, 10]),
        easierSquat(2, '2000-01-11', [5], { preCheck: check('heatOrSun') }),
        easierSquat(3, '2000-01-18', [5], { preCheck: check('heatOrSun') }),
      ],
      {},
      {
        lastWeek: { volume: 20, weeksAgo: 2 },
        lastSessionVolume: 20,
        lastVariant: 'standard',
        doneThisWeek: 5,
      },
      null,
    ],
    [
      'an unticked movement is not a session of it',
      [squat(1, '2000-01-04', [8, 8]), squat(2, '2000-01-12', [])],
      {},
      { lastSessionVolume: 16 },
      { reason: 'hold', perSet: [8, 8] },
    ],
    [
      'the row being re-planned is left out of the history, and its ticks are this session',
      [squat(1, '2000-01-19', [12, 12], { status: 'planned' })],
      { exclude: '00000000-0000-4000-8000-000000000001' },
      { doneThisWeek: 0, lastSessionVolume: null, doneThisSession: 24, setsDoneThisSession: 2 },
      null,
    ],
    [
      'sessions dated after today are left out',
      [squat(1, '2000-01-20', [12, 12])],
      {},
      { doneThisWeek: 0, lastSessionVolume: null },
      null,
    ],
    [
      'a harder squat 2000-01-04, read on Sunday 2000-01-23: still in the window',
      [
        squat(1, '2000-01-04', [8, 8], {
          movements: [movement('seed:ex-squat', 'harder', [8, 8])],
        }),
      ],
      { today: '2000-01-23' },
      { lastWeek: { volume: 16, weeksAgo: 2 }, lastVariant: 'harder', olderHistory: false },
      null,
    ],
    [
      'the same squat read on Monday 2000-01-24: restarts, version included',
      [
        squat(1, '2000-01-04', [8, 8], {
          movements: [movement('seed:ex-squat', 'harder', [8, 8])],
        }),
      ],
      { today: '2000-01-24' },
      { lastWeek: null, lastSessionVolume: null, lastVariant: null, olderHistory: true },
      null,
    ],
    [
      'two weeks or more without it restarts from the first amount',
      [squat(1, '2000-01-04', [8, 8])],
      { today: '2000-02-09' },
      { lastWeek: null, lastSessionVolume: null, olderHistory: true },
      { reason: 'restart', perSet: [8, 8] },
    ],
    [
      'all versions count together',
      [squat(1, '2000-01-11', [8]), easierSquat(2, '2000-01-13', [10])],
      {},
      { lastWeek: { volume: 18, weeksAgo: 1 }, lastVariant: 'easier' },
      null,
    ],
    [
      'the top of the range twice in a row',
      [squat(1, '2000-01-11', [12, 12]), squat(2, '2000-01-13', [12, 12])],
      {},
      { recentAtTop: 2 },
      null,
    ],
    [
      'one set below the top breaks the run',
      [squat(1, '2000-01-11', [12, 12]), squat(2, '2000-01-13', [12, 11])],
      {},
      { recentAtTop: 0 },
      null,
    ],
    [
      'an unfinished session at the top does not count',
      [squat(1, '2000-01-11', [12, 12]), squat(2, '2000-01-13', [12, 12], { status: 'planned' })],
      {},
      { recentAtTop: 0 },
      null,
    ],
    [
      'the top at another version does not count',
      [1, 2].map((n) =>
        squat(n, `2000-01-1${n + 1}`, [], {
          movements: [movement('seed:ex-squat', 'harder', [12, 12])],
        }),
      ),
      {},
      { recentAtTop: 0 },
      null,
    ],
    [
      'one set at the top is not the whole session',
      [squat(1, '2000-01-11', [12]), squat(2, '2000-01-13', [12])],
      {},
      { recentAtTop: 0 },
      null,
    ],
  ])('%s', (_label, rows, opts, expected, expectedDose) => {
    const history = weeklyVolumes(rows, 'seed:ex-squat', opts.today ?? '2000-01-19', {
      variant: 'standard',
      sets: 2,
      max: 12,
      excludeSessionId: opts.exclude ?? null,
    });
    expect(history).toMatchObject(expected);
    if (expectedDose !== null) expect(dose({ history })).toMatchObject(expectedDose);
  });

  it('session lengths stay within about 20 to 35 minutes', () => {
    const data = getExerciseData();
    const lengths = data.templates.map((t) => [
      t.id,
      estimateSeconds(data, t, 'start', { bands: false, dumbbells: false }),
      estimateSeconds(data, t, 'top', { bands: true, dumbbells: true }),
    ]);
    expect(lengths).toEqual([
      ['seed:session-a', 1477, 2040],
      ['seed:session-b', 1608, 2032],
      ['seed:session-c', 1572, 1928],
      ['seed:session-beach-walk', 1470, 2010],
      ['seed:session-beach-jog', 1440, 1920],
    ]);
  });
});
