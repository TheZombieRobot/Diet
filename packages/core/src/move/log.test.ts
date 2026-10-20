// The session log and the plan editor (item 27 design section 5.1, L1 to L12). Item 26's plan,
// gate and write rules are tested in exercise/; these test what the screens add. Synthetic rows.
import { describe, expect, it } from 'vitest';
import { getExerciseData } from '../exercise/dataset';
import { exerciseById, templateById } from '../exercise/lookup';
import { planSession, type PlanContext } from '../exercise/plan';
import { sessionWriteProblem } from '../exercise/start';
import { ALL_NO, check, movement, session } from '../exercise/testSessions';
import type { Exercise, SessionTemplate } from '../exercise/types';
import { resolveWeeklyPattern } from '../exercise/week';
import type { SessionRecord, WeeklyPatternDay } from '../storage/records';
import { validateRow } from '../storage/validate';
import { layoutSession } from './layout';
import {
  appendMovement,
  finishPatch,
  ratingPatch,
  replaceMovement,
  restedSessionDraft,
  SESSION_LIMITS,
  sessionMode,
  startedSessionDraft,
  switchVariants,
  tickAsPlanned,
  tickSet,
  untickSet,
} from './log';
import {
  dayChoiceOf,
  editorStart,
  patternOptions,
  planChangeRestProblem,
  withDayChoice,
} from './pattern';

const data = getExerciseData();
const A = 'seed:session-a';
const B = 'seed:session-b';
const C = 'seed:session-c';
const WALK = 'seed:session-beach-walk';
const JOG = 'seed:session-beach-jog';
const TUE = '2000-01-18';
const BOTH = { bands: true, dumbbells: true };
const BODYWEIGHT = { bands: false, dumbbells: false };
const ID = '00000000-0000-4000-8000-000000000001';
const NO_RULING_9 = { stopSignOn: null, fastOverCeiling: false };

function get<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Missing ${what}`);
  return value;
}
const template = (id: string): SessionTemplate => get(templateById(data, id), id);
const exercise = (id: string): Exercise => get(exerciseById(data, id), id);
const defaultWeek = resolveWeeklyPattern(data, null, { jogUnlocked: false });

function plan(id: string, fields: Partial<PlanContext> = {}) {
  return planSession(data, template(id), {
    preCheck: ALL_NO,
    choice: 'planned',
    equipment: BODYWEIGHT,
    sessions: [],
    week: defaultWeek,
    today: TUE,
    sessionId: null,
    variantOverrides: new Map(),
    ...fields,
  });
}

const stored = (draft: ReturnType<typeof startedSessionDraft>): SessionRecord => ({
  id: ID,
  ...draft,
  completedAt: null,
  timeZone: null,
});

describe('the rows a choice writes (L1, L2; HS-29, M31)', () => {
  it('a planned choice after a hot-day yes stores the lighter session, which item 26 accepts', () => {
    const preCheck = check('heatOrSun');
    const draft = startedSessionDraft({
      today: TUE,
      templateId: B,
      preCheck,
      plan: plan(B, { preCheck, choice: 'planned', equipment: BOTH }),
    });
    const main = draft.movements.filter((m) =>
      template(B).main.some((s) => s.exerciseId === m.exerciseId),
    );
    expect(main.length).toBeGreaterThan(0);
    for (const m of main) {
      expect(m.variant, m.exerciseId).toBe('easier');
      expect(m.sets).toBe(1);
    }
    expect(draft).toMatchObject({ status: 'planned', preCheck });
    expect(sessionWriteProblem(data, stored(draft))).toBeNull();
  });

  it.each([null, ALL_NO])(
    'a rest with check %j: rested, nothing stored, no ratings',
    (preCheck) => {
      expect(restedSessionDraft({ today: TUE, templateId: A, preCheck })).toMatchObject({
        status: 'rested',
        movements: [],
        preCheck,
        exertion: null,
        soreness: null,
        energy: null,
      });
    },
  );
});

describe('ticks (L3, L4; EX-04, C76, storage 4.9)', () => {
  const reps = movement('seed:ex-squat', 'standard', [], { planned: 8 });
  const secs = movement('seed:ex-front-plank', 'easier', [], { unit: 'seconds', planned: 20 });
  const two = { ...reps, sets: 2 };

  it('a tick appends what was done; a third tick on two sets makes three; untick keeps the sets', () => {
    expect(tickSet([reps], 0, 9)[0]?.done).toEqual([{ reps: 9, seconds: null }]);
    expect(tickSet([secs], 0, 25)[0]?.done).toEqual([{ reps: null, seconds: 25 }]);
    const three = tickSet(tickSet(tickSet([two], 0, 9), 0, 8), 0, 8);
    expect(three[0]?.sets).toBe(3);
    const back = untickSet(three, 0);
    expect(back[0]?.done).toHaveLength(2);
    expect(back[0]?.sets).toBe(3);
    expect(untickSet([reps], 0)).toEqual([reps]);
  });

  it.each([
    ['0 reps', [reps], 0, 0],
    ['501 reps', [reps], 0, 501],
    ['3,601 seconds', [secs], 0, 3601],
    ['2.5 reps', [reps], 0, 2.5],
    ['a missing movement', [reps], 3, 8],
  ])('refuses %s', (_, movements, index, amount) => {
    expect(() => tickSet(movements, index, amount)).toThrow(RangeError);
  });

  it('a 21st tick is refused with max-sets', () => {
    let ms = [reps];
    for (let i = 0; i < 20; i += 1) ms = tickSet(ms, 0, 8);
    expect(() => tickSet(ms, 0, 8)).toThrow('max-sets');
  });

  it('log a set anyway appends one ticked set; the version switch replaces only unticked movements', () => {
    const added = appendMovement(
      [],
      { exerciseId: 'seed:ex-squat', variant: 'easier', unit: 'reps' },
      6,
    );
    expect(added).toEqual([
      {
        exerciseId: 'seed:ex-squat',
        variant: 'easier',
        sets: 1,
        reps: 6,
        seconds: null,
        done: [{ reps: 6, seconds: null }],
      },
    ]);
    expect(() =>
      appendMovement(added, { exerciseId: 'seed:ex-squat', variant: 'easier', unit: 'reps' }, 6),
    ).toThrow(RangeError);
    const harder = { ...reps, variant: 'harder' as const };
    expect(replaceMovement([reps], 'seed:ex-squat', harder)).toEqual([harder]);
    expect(replaceMovement([reps], 'seed:ex-squat', null)).toEqual([]);
    expect(() => replaceMovement(tickSet([reps], 0, 8), 'seed:ex-squat', harder)).toThrow('ticked');
  });
});

describe('ratings and the finish (L5; EX-04, HS-29)', () => {
  it('a rating is a whole number 1–5 and is never cleared', () => {
    expect(ratingPatch('exertion', 3)).toEqual({ exertion: 3 });
    for (const bad of [0, 6, 2.5, null]) {
      expect(() => ratingPatch('exertion', bad as number)).toThrow(RangeError);
    }
  });

  it('finish trims the note, refuses one too long, and refuses a row with no check', () => {
    const row = session(1, { date: TUE, templateId: A, status: 'planned' });
    const values = { exertion: 3, soreness: null, energy: 4, note: '   ' };
    expect(finishPatch(data, row, values)).toEqual({
      ok: true,
      patch: { status: 'done', exertion: 3, soreness: null, energy: 4, note: null },
    });
    expect(() => finishPatch(data, row, { ...values, note: 'x'.repeat(501) })).toThrow(RangeError);
    expect(finishPatch(data, { ...row, preCheck: null }, values)).toEqual({
      ok: false,
      problem: 'no-pre-check',
    });
  });
});

describe('the session layout (L6; N6, C76)', () => {
  it('matches the warm-up and cool-down march in order and the main movements by exercise', () => {
    const p = plan(A);
    const row = stored(
      startedSessionDraft({ today: TUE, templateId: A, preCheck: ALL_NO, plan: p }),
    );
    const blocks = layoutSession(data, template(A), p, row);
    const march = (b: number) =>
      blocks[b]?.movements.find((m) => m.exercise?.id === 'seed:ex-march');
    expect(blocks.map((b) => b.block)).toEqual(['warmUp', 'main', 'coolDown']);
    expect(march(0)?.index).toBe(0);
    expect(march(2)?.index).toBe(
      row.movements.findLastIndex((m) => m.exerciseId === 'seed:ex-march'),
    );
  });

  it('a stored 2 × 8 for the plan [9, 8] shows [9, 8]; ticks count toward the rest of the session', () => {
    const history = [
      session(10, {
        date: '2000-01-11',
        templateId: A,
        movements: [movement('seed:ex-squat', 'standard', [8, 8])],
      }),
    ];
    const p = plan(A, { sessions: history });
    const squat = (blocks: ReturnType<typeof layoutSession>) =>
      blocks[1]?.movements.find((m) => m.exercise?.id === 'seed:ex-squat');
    expect(p.movements.find((m) => m.exerciseId === 'seed:ex-squat')?.perSet).toEqual([9, 8]);
    const row = stored(
      startedSessionDraft({ today: TUE, templateId: A, preCheck: ALL_NO, plan: p }),
    );
    expect(row.movements.find((m) => m.exerciseId === 'seed:ex-squat')).toMatchObject({
      sets: 2,
      reps: 8,
    });
    expect(squat(layoutSession(data, template(A), p, row))?.toDo).toEqual([9, 8]);
    // Ten done on set 1: the second set's amount keeps the session within its share.
    const index = row.movements.findIndex((m) => m.exerciseId === 'seed:ex-squat');
    const ticked = { ...row, movements: tickSet(row.movements, index, 10) };
    const again = plan(A, { sessions: [...history, ticked], sessionId: ID });
    expect(squat(layoutSession(data, template(A), again, ticked))?.toDo).toEqual([7]);
    // The whole amount in set 1: nothing more is suggested, not the stored 8 (EX-03).
    const all = { ...row, movements: tickSet(row.movements, index, 17) };
    const spent = plan(A, { sessions: [...history, all], sessionId: ID });
    expect(squat(layoutSession(data, template(A), spent, all))?.toDo).toEqual([]);
  });

  it('ruling 9 during a planned session: a movement not started becomes the lighter one, one started takes no more sets', () => {
    const p = plan(A);
    const row = stored(
      startedSessionDraft({ today: TUE, templateId: A, preCheck: ALL_NO, plan: p }),
    );
    const at = (id: string) => row.movements.findIndex((m) => m.exerciseId === id);
    const started = { ...row, movements: tickSet(row.movements, at('seed:ex-squat'), 8) };
    const lighter = plan(A, { choice: 'lighter', sessions: [started], sessionId: ID });
    const main = layoutSession(data, template(A), lighter, started)[1]?.movements ?? [];
    const of = (id: string) => main.find((m) => m.exercise?.id === id);
    expect(of('seed:ex-squat')).toMatchObject({ closed: true, replace: false, toDo: [] });
    const row2 = of('seed:ex-row');
    expect(row2).toMatchObject({ replace: true, closed: false, planned: { variant: 'easier' } });
    expect(row2?.toDo).toEqual(row2?.planned?.perSet);
    const planned = get(row2?.planned ?? undefined, 'the planned row');
    const next = tickAsPlanned(started.movements, planned, 6);
    expect(next.find((m) => m.exerciseId === 'seed:ex-row')).toMatchObject({
      variant: 'easier',
      done: [{ reps: 6, seconds: null }],
    });
    expect(next).toHaveLength(started.movements.length);
  });

  it('a lighter row keeps its one set; a week-reached movement is not stored; an unknown one comes last', () => {
    const lighter = plan(A, { choice: 'lighter' });
    const row = stored(
      startedSessionDraft({ today: TUE, templateId: A, preCheck: ALL_NO, plan: lighter }),
    );
    const again = plan(A, { choice: 'lighter', sessions: [row], sessionId: ID });
    const squat = layoutSession(data, template(A), again, row)[1]?.movements.find(
      (m) => m.exercise?.id === 'seed:ex-squat',
    );
    expect(squat?.toDo).toEqual([8]);

    const reached = [
      session(10, {
        date: '2000-01-10',
        templateId: A,
        movements: [movement('seed:ex-squat', 'standard', [8, 8])],
      }),
      session(11, {
        date: '2000-01-17',
        templateId: C,
        movements: [movement('seed:ex-squat', 'standard', [12, 12, 11])],
      }),
    ];
    const capped = plan(A, { sessions: reached });
    const cappedRow = stored(
      startedSessionDraft({ today: TUE, templateId: A, preCheck: ALL_NO, plan: capped }),
    );
    const unknown = { ...movement('seed:ex-gone', 'standard', [5]), sets: 2 };
    const blocks = layoutSession(data, template(A), capped, {
      ...cappedRow,
      movements: [...cappedRow.movements, unknown],
    });
    const main = blocks[1]?.movements ?? [];
    expect(main.find((m) => m.exercise?.id === 'seed:ex-squat')).toMatchObject({
      index: null,
      toDo: [],
    });
    expect(main.at(-1)).toMatchObject({ exercise: null, planned: null, toDo: [5] });
  });
});

describe('the session mode and the version switch (L7, L11; HS-29, N6, N32, C112)', () => {
  const main = (variant: 'easier' | 'standard', sets: number) =>
    template(A)
      .main.slice(0, 5)
      .map((s) => ({ ...movement(s.exerciseId, variant, []), sets }));
  const row = (movements: SessionRecord['movements'], preCheck = ALL_NO) =>
    session(1, { date: TUE, templateId: A, status: 'planned', movements, preCheck });

  it.each([
    [
      'any yes, even with planned chosen',
      row(main('standard', 2), check('tiredOrPoorSleep')),
      'planned',
      'lighter',
    ],
    ['all no with lighter chosen', row(main('standard', 2)), 'lighter', 'lighter'],
    ['all no, nothing chosen, the stored lighter shape', row(main('easier', 1)), null, 'lighter'],
    ['all no, a planned row', row(main('standard', 2)), null, 'planned'],
    [
      'all no, every main movement switched to easier but two sets each',
      row(main('easier', 2)),
      null,
      'planned',
    ],
    // Every main movement's amount for the week was reached at the start: nothing tells the
    // choices apart after a reload, so the cautious one.
    ['all no, no main movement stored, after a reload', row([]), null, 'lighter'],
    ['all no, no main movement stored, planned chosen here', row([]), 'planned', 'planned'],
  ] as const)('%s → %s', (_, r, chosen, mode) => {
    expect(sessionMode(template(A), r, chosen, NO_RULING_9)).toBe(mode);
  });

  it.each([
    [
      'a Kickstart stop sign in the last 336 hours',
      { stopSignOn: '2000-01-17', fastOverCeiling: false },
    ],
    ['a fast past 24 hours', { stopSignOn: null, fastOverCeiling: true }],
  ] as const)(
    'ruling 9, %s: a planned session is lighter, also one chosen planned before it began',
    (_, ruling9) => {
      expect(sessionMode(template(A), row(main('standard', 2)), 'planned', ruling9)).toBe(
        'lighter',
      );
      expect(sessionMode(template(A), row(main('standard', 2)), null, ruling9)).toBe('lighter');
    },
  );

  it('an unknown template is lighter only after a yes or under ruling 9', () => {
    expect(sessionMode(null, row(main('easier', 1)), null, NO_RULING_9)).toBe('planned');
    expect(sessionMode(null, row([], check('heatOrSun')), null, NO_RULING_9)).toBe('lighter');
    expect(
      sessionMode(null, row(main('easier', 1)), null, { stopSignOn: null, fastOverCeiling: true }),
    ).toBe('lighter');
  });

  it.each([
    ['the hinge, planned', 'seed:ex-hip-hinge', BOTH, 'planned', ['easier', 'standard']],
    [
      'the row, planned',
      'seed:ex-row',
      BOTH,
      'planned',
      ['easier', 'standard', 'harder', 'band', 'dumbbell'],
    ],
    ['the row, lighter', 'seed:ex-row', BOTH, 'lighter', ['easier']],
    ['the band pull-apart with bands off', 'seed:ex-band-pull-apart', BODYWEIGHT, 'planned', []],
  ] as const)('switchVariants: %s', (_, id, eq, mode, expected) => {
    expect(switchVariants(exercise(id), eq, mode)).toEqual(expected);
  });
});

describe('the weekly plan editor (L8, L12; EX-05, EX-07, C51)', () => {
  const pattern = (
    days: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string[]>>,
  ): WeeklyPatternDay[] =>
    ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
      weekday,
      templateIds: days[weekday] ?? [],
    }));

  it('starts from the week shown, sets a day, and offers the jog only when unlocked', () => {
    const fallback = resolveWeeklyPattern(
      data,
      pattern({ 1: [A], 2: [B], 3: [C], 4: [WALK], 5: [A], 6: [B], 7: [C] }),
      { jogUnlocked: false },
    );
    expect(fallback.source).toBe('default-fallback');
    expect(editorStart(fallback)).toEqual(data.defaultWeek);
    const monday = withDayChoice(data.defaultWeek, 1, { strength: A, beach: WALK });
    expect(monday[0]?.templateIds).toEqual([A, WALK]);
    expect(dayChoiceOf(data, { templateIds: [WALK, A, 'seed:session-gone'] })).toEqual({
      strength: A,
      beach: WALK,
    });
    expect(withDayChoice(monday, 1, { strength: null, beach: null })[0]?.templateIds).toEqual([]);
    expect(() => withDayChoice(monday.slice(1), 1, { strength: A, beach: null })).toThrow(
      RangeError,
    );
    expect(patternOptions(data, false).beach.map((t) => t.id)).toEqual([WALK]);
    expect(patternOptions(data, true).beach.map((t) => t.id)).toEqual([WALK, JOG]);
    expect(patternOptions(data, false).strength.map((t) => t.id)).toEqual([A, B, C]);
  });

  // Wednesday A, Thursday walk, Friday B, Saturday walk and Sunday C were done.
  const doneWeek = [
    session(1, { date: '2000-01-19', templateId: A }),
    session(2, { date: '2000-01-20', templateId: WALK }),
    session(3, { date: '2000-01-21', templateId: B }),
    session(4, { date: '2000-01-22', templateId: WALK }),
    session(5, { date: '2000-01-23', templateId: C }),
  ];
  const review = pattern({ 1: [WALK], 2: [A], 3: [WALK], 4: [B], 5: [WALK] });
  // Monday walk, Wednesday A, Friday B and Sunday C.
  const sundayC = pattern({ 1: [WALK], 3: [A], 5: [B], 7: [C] });
  const doneOn = (dates: string[]) =>
    dates.map((date, i) => session(20 + i, { date, templateId: i % 2 === 0 ? A : WALK }));
  it.each([
    ['the review plan on that Sunday', review, '2000-01-23', doneWeek, 'rolling-rest-days'],
    [
      // Six active days in a row: the five done, then Monday's walk.
      'a walk the next Monday, then rest',
      pattern({ 1: [WALK], 4: [B], 5: [WALK], 6: [A] }),
      '2000-01-23',
      doneWeek,
      'rolling-rest-days',
    ],
    [
      'a plan that starts with two rest days',
      pattern({ 3: [WALK], 4: [B], 5: [WALK], 6: [A] }),
      '2000-01-23',
      doneWeek,
      null,
    ],
    ['the review plan after Monday and Tuesday rested', review, '2000-01-26', doneWeek, null],
    ['the standard week on a fresh profile', null, '2000-01-23', [], null],
    [
      // Today's planned session, not started yet, counts as active.
      'Wednesday to Saturday done, then C today and a walk tomorrow',
      sundayC,
      '2000-01-23',
      doneWeek.slice(0, 4),
      'rolling-rest-days',
    ],
    [
      // The window that starts six days back counts too.
      'Monday to Friday done, then C on Sunday',
      pattern({ 3: [A], 5: [B], 7: [C] }),
      '2000-01-23',
      doneOn(['2000-01-17', '2000-01-18', '2000-01-19', '2000-01-20', '2000-01-21']),
      'rolling-rest-days',
    ],
    [
      'the standard week after five days done in a row',
      null,
      '2000-01-18',
      doneOn(['2000-01-13', '2000-01-14', '2000-01-15', '2000-01-16', '2000-01-17']),
      'rolling-rest-days',
    ],
    [
      // A session rested today is not an active day.
      'Wednesday to Saturday done, C rested today, a walk tomorrow',
      sundayC,
      '2000-01-23',
      [
        ...doneWeek.slice(0, 4),
        session(6, { date: '2000-01-23', templateId: C, status: 'rested' }),
      ],
      null,
    ],
  ] as const)('planChangeRestProblem: %s', (_, draft, today, sessions, expected) => {
    expect(planChangeRestProblem(data, draft, { sessions, today, jogUnlocked: false })).toBe(
      expected,
    );
  });
});

describe('SESSION_LIMITS (L9; storage 4.9)', () => {
  const row = (fields: Partial<SessionRecord>) => ({
    ...session(1, { date: TUE, templateId: A }),
    ...fields,
  });
  const reps = (n: number, sets: number) => ({
    ...movement('seed:ex-squat', 'standard', Array<number>(sets).fill(n)),
  });
  const secs = (n: number) => movement('seed:ex-front-plank', 'standard', [n], { unit: 'seconds' });

  it.each([
    ['sets', reps(8, SESSION_LIMITS.maxSets), reps(8, SESSION_LIMITS.maxSets + 1)],
    ['reps', reps(SESSION_LIMITS.reps.max, 1), reps(SESSION_LIMITS.reps.max + 1, 1)],
    ['seconds', secs(SESSION_LIMITS.seconds.max), secs(SESSION_LIMITS.seconds.max + 1)],
  ])('%s: the limit passes the validator and one more fails', (_, ok, over) => {
    expect(() => validateRow('sessions', row({ movements: [ok] }))).not.toThrow();
    expect(() => validateRow('sessions', row({ movements: [over] }))).toThrow();
  });

  it('a note of the longest length passes and one more character fails', () => {
    expect(() =>
      validateRow('sessions', row({ note: 'x'.repeat(SESSION_LIMITS.noteMax) })),
    ).not.toThrow();
    expect(() =>
      validateRow('sessions', row({ note: 'x'.repeat(SESSION_LIMITS.noteMax + 1) })),
    ).toThrow();
  });
});
