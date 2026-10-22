// Every sessions write goes through one helper (item 27 design section 5.2, A3; HS-29, item 26
// 3.7): refusals are made inside the write, on the stored rows as they are then, and nothing is
// written. Two tabs, a tab that has not caught up and midnight are refused the same way.
import {
  getExerciseData,
  type MoveContext,
  moveContext,
  readinessGates,
  restedSessionDraft,
  type SessionDraft,
  type WeeklyPatternDay,
} from '@diet/core';
import { moveScreen, privacy } from '@diet/core/copy/health';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageFullError } from '../../db/errors';
import { counts, openTestDb, type TestDb } from '../../db/testKit';
import {
  A,
  checkWith,
  done,
  moveFixture,
  MOVE_NOW,
  pattern,
  resetMove,
  sessionRows,
  WALK,
} from './moveTestKit';
import {
  MoveWriteRefused,
  moveSaveMessage,
  removeRestedSession,
  startSession,
  writeSession,
} from './sessionWrites';

const data = getExerciseData();
let test: TestDb | undefined;
let other: TestDb | undefined;
afterEach(() => {
  resetMove(test);
  other?.db.close();
  test = undefined;
  other = undefined;
  vi.restoreAllMocks();
});

const TUE = '2000-01-18';
const draft = (fields: Partial<SessionDraft>): SessionDraft => ({
  date: TUE,
  templateId: A,
  status: 'planned',
  movements: [],
  preCheck: checkWith(),
  exertion: null,
  soreness: null,
  energy: null,
  durationMinutes: null,
  note: null,
  ...fields,
});
const refused = (code: string): unknown =>
  expect.objectContaining({ name: 'MoveWriteRefused', code });

/** The context a screen drew on Tuesday morning, before any of today's rows were written. */
async function screenContext(
  db: TestDb,
  weeklyPattern: WeeklyPatternDay[] | null = null,
): Promise<MoveContext> {
  return moveContext(
    data,
    {
      profile: await db.repos.profile.get(),
      weeklyPattern,
      sessions: [],
      fasts: [],
      kickstartChecks: [],
      preStartStopSignDay: null,
    },
    readinessGates({
      answers: { q1: 'no', q2: 'no', q3: 'no', q4: 'no', q5: 'no', q6: 'no', q7: 'no' },
      confirmations: { prescriberAgreed: false, gpExerciseDiscussed: false },
      minimumAgeYears: 50,
      lowWeight: false,
    }),
    { today: TUE, now: MOVE_NOW },
  );
}
const choose = (ctx: MoveContext, choice: 'planned' | 'lighter' | 'rest', ...yes: string[]) => ({
  ctx,
  templateId: A,
  check: checkWith(...(yes as Parameters<typeof checkWith>)),
  choice,
  reopened: null,
});

describe('writeSession refuses a row with work and no check, or more than the lighter session after a yes', () => {
  it('creating a row with ticks and no check writes nothing', async () => {
    test = await moveFixture();
    const before = await counts(test.db);
    const ticked = draft({ preCheck: null, movements: [done('seed:ex-squat', 'standard', [8])] });
    await expect(writeSession(test.storage, data, null, ticked)).rejects.toEqual(
      refused('no-pre-check'),
    );
    expect(await counts(test.db)).toEqual(before);
  });

  it.each([
    [
      'ticks added to a stored row with no check',
      { status: 'planned' as const },
      { movements: [done('seed:ex-squat', 'standard', [8])] },
      'no-pre-check',
    ],
    ['a rating on a done row with no check (from a backup)', {}, { exertion: 3 }, 'no-pre-check'],
  ])('%s', async (_, stored, patch, code) => {
    test = await moveFixture({
      sessions: [{ date: TUE, templateId: A, preCheck: null, ...stored }],
    });
    const [row] = await sessionRows(test);
    await expect(
      writeSession(test.storage, data, row?.id ?? '', patch, 'in-progress'),
    ).rejects.toEqual(refused(code));
    expect((await sessionRows(test))[0]).toEqual(row);
  });

  it('a harder version after a yes is refused as lighter-only', async () => {
    test = await moveFixture({
      sessions: [{ date: TUE, templateId: A, status: 'planned', preCheck: checkWith('heatOrSun') }],
    });
    const [row] = await sessionRows(test);
    const harder = { movements: [{ ...done('seed:ex-squat', 'harder', []), sets: 1, reps: 8 }] };
    await expect(
      writeSession(test.storage, data, row?.id ?? '', harder, 'in-progress'),
    ).rejects.toEqual(refused('lighter-only'));
  });

  it('a rest with no check is written; an update sends only its patch', async () => {
    test = await moveFixture();
    const rested = await writeSession(
      test.storage,
      data,
      null,
      restedSessionDraft({ today: TUE, templateId: A, preCheck: null }),
    );
    expect(rested).toMatchObject({ status: 'rested', preCheck: null });
    const update = vi.spyOn(test.repos.sessions, 'updateChecked');
    await writeSession(test.storage, data, rested.id, { exertion: 2 }, 'done').catch(() => null);
    expect(update).toHaveBeenCalledWith(rested.id, { exertion: 2 }, expect.any(Function));
  });
});

describe('a tab that has not caught up, or a day that has ended, changes nothing (item 27 review)', () => {
  const squat = [done('seed:ex-squat', 'standard', [9])];
  it.each([
    [
      '"Rest instead" from a session another tab finished',
      { status: 'done' as const, movements: squat },
      { status: 'rested' as const },
      'unticked' as const,
    ],
    [
      'Save on the finish card of a session another tab rested after a yes',
      { status: 'rested' as const, preCheck: checkWith('painOrInjury') },
      { status: 'done' as const, exertion: 2 },
      'finishable' as const,
    ],
    [
      'a tick on yesterday’s session after midnight',
      { date: '2000-01-17', status: 'planned' as const },
      { movements: [done('seed:ex-squat', 'standard', [8])] },
      'in-progress' as const,
    ],
    [
      '"Rest instead" on Today for a row another tab started',
      { status: 'planned' as const },
      { status: 'rested' as const },
      'unchecked' as const,
    ],
  ])('%s', async (_, stored, patch, state) => {
    test = await moveFixture({ sessions: [{ date: TUE, templateId: A, ...stored }] });
    const [row] = await sessionRows(test);
    await expect(writeSession(test.storage, data, row?.id ?? '', patch, state)).rejects.toEqual(
      refused('changed'),
    );
    expect((await sessionRows(test))[0]).toEqual(row);
  });

  it('a tick worked out before another tab’s tick is refused, so that tick is kept', async () => {
    test = await moveFixture({
      sessions: [{ date: TUE, templateId: A, status: 'planned', movements: squat }],
    });
    const [row] = await sessionRows(test);
    if (row === undefined) throw new Error('No row');
    const seen = { ...row, movements: [{ ...row.movements[0], done: [] }] } as typeof row;
    const mine = { movements: [done('seed:ex-squat', 'standard', [7])] };
    await expect(
      writeSession(test.storage, data, row.id, mine, 'in-progress', seen),
    ).rejects.toEqual(refused('changed'));
    expect((await sessionRows(test))[0]?.movements).toEqual(row.movements);
  });
});

describe('removeRestedSession and startSession (N31; HS-29)', () => {
  it('removes an unchecked rest and leaves a rest chosen from the check', async () => {
    test = await moveFixture({
      sessions: [
        { date: TUE, templateId: A, status: 'rested', preCheck: null },
        { date: TUE, templateId: 'seed:session-beach-walk', status: 'rested' },
      ],
    });
    const [first, second] = await sessionRows(test);
    const unchecked = [first, second].find((r) => r?.preCheck === null);
    const checked = [first, second].find((r) => r?.preCheck !== null);
    expect(await removeRestedSession(test.storage, unchecked?.id ?? '')).toBe(true);
    expect(await removeRestedSession(test.storage, checked?.id ?? '')).toBe(false);
    expect((await sessionRows(test)).map((r) => r.id)).toEqual([checked?.id]);
  });

  it('two quick starts in one tab write one row; the second is refused as changed', async () => {
    test = await moveFixture();
    const ctx = await screenContext(test);
    const results = await Promise.allSettled([
      startSession(test.storage, data, choose(ctx, 'planned')),
      startSession(test.storage, data, choose(ctx, 'planned')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await sessionRows(test)).map((r) => r.status)).toEqual(['planned']);
  });

  it('two tabs choosing at once write one row: the planned session never joins a lighter one from a yes', async () => {
    test = await moveFixture();
    // A second tab: its own connection to the same records, and its own copy of the module.
    other = await openTestDb({ deps: test.deps, env: test.env });
    vi.resetModules();
    const otherTab = await import('./sessionWrites');
    const ctx = await screenContext(test);
    const results = await Promise.allSettled([
      startSession(test.storage, data, choose(ctx, 'planned')),
      otherTab.startSession(other.storage, data, choose(ctx, 'lighter', 'painOrInjury')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await sessionRows(test)).toHaveLength(1);
  });

  it('a start from a screen that has not seen another tab’s yes today is refused (item 26 earlier-yes)', async () => {
    test = await moveFixture({ weeklyPattern: pattern({ 2: [A, WALK], 5: ['seed:session-b'] }) });
    const ctx = await screenContext(test, pattern({ 2: [A, WALK], 5: ['seed:session-b'] }));
    await writeSession(
      test.storage,
      data,
      null,
      restedSessionDraft({ today: TUE, templateId: WALK, preCheck: checkWith('painOrInjury') }),
    );
    await expect(startSession(test.storage, data, choose(ctx, 'planned'))).rejects.toEqual(
      refused('changed'),
    );
    expect(await sessionRows(test)).toHaveLength(1);
  });

  it('a choice tapped just after midnight writes nothing for the day before', async () => {
    test = await moveFixture();
    const ctx = await screenContext(test);
    test.env.set('2000-01-18T11:00:30.000Z'); // 00:00:30 on Wednesday in Auckland
    await expect(startSession(test.storage, data, choose(ctx, 'planned'))).rejects.toEqual(
      refused('changed'),
    );
    await expect(startSession(test.storage, data, choose(ctx, 'rest'))).rejects.toEqual(
      refused('changed'),
    );
    expect(await sessionRows(test)).toEqual([]);
  });

  it('ruling 9: "planned" asked while a stop sign holds writes the lighter session', async () => {
    test = await moveFixture();
    const ctx = { ...(await screenContext(test)), stopSignOn: '2000-01-17' };
    await startSession(test.storage, data, choose(ctx, 'planned'));
    const squat = (await sessionRows(test))[0]?.movements.find(
      (m) => m.exerciseId === 'seed:ex-squat',
    );
    expect(squat).toMatchObject({ variant: 'easier' });
  });

  it.each([
    [new MoveWriteRefused('no-pre-check'), moveScreen.errors.noCheck],
    [new MoveWriteRefused('lighter-only'), moveScreen.errors.lighterOnly],
    [new MoveWriteRefused('changed'), moveScreen.errors.changed],
    [new RangeError('max-sets'), moveScreen.session.maxSets],
    [new StorageFullError(), privacy.storageFull],
  ])('moveSaveMessage(%s)', (error, message) => {
    expect(moveSaveMessage(error)).toBe(message);
  });
});
