// Every sessions write goes through one helper (item 27 design section 5.2, A3; HS-29, item 26
// 3.7): refusals are made on the stored row merged with the change, and nothing is written.
import {
  getExerciseData,
  moveContext,
  readinessGates,
  restedSessionDraft,
  type SessionDraft,
} from '@diet/core';
import { moveScreen, privacy } from '@diet/core/copy/health';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageFullError } from '../../db/errors';
import { counts, type TestDb } from '../../db/testKit';
import { A, checkWith, done, moveFixture, MOVE_NOW, resetMove, sessionRows } from './moveTestKit';
import {
  MoveWriteRefused,
  moveSaveMessage,
  removeRestedSession,
  startSession,
  writeSession,
} from './sessionWrites';

const data = getExerciseData();
let test: TestDb | undefined;
afterEach(() => {
  resetMove(test);
  test = undefined;
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
    await expect(writeSession(test.storage, data, row?.id ?? '', patch)).rejects.toEqual(
      refused(code),
    );
    expect((await sessionRows(test))[0]).toEqual(row);
  });

  it('a harder version after a yes is refused as lighter-only', async () => {
    test = await moveFixture({
      sessions: [{ date: TUE, templateId: A, status: 'planned', preCheck: checkWith('heatOrSun') }],
    });
    const [row] = await sessionRows(test);
    const harder = { movements: [{ ...done('seed:ex-squat', 'harder', []), sets: 1, reps: 8 }] };
    await expect(writeSession(test.storage, data, row?.id ?? '', harder)).rejects.toEqual(
      refused('lighter-only'),
    );
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
    const update = vi.spyOn(test.repos.sessions, 'update');
    await writeSession(test.storage, data, rested.id, { status: 'planned' });
    expect(update).toHaveBeenCalledWith(rested.id, { status: 'planned' });
  });
});

describe('removeRestedSession, startSession and the messages', () => {
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

  it('two starts at once write one row; the second is refused as changed (N31)', async () => {
    test = await moveFixture();
    const profile = await test.repos.profile.get();
    const ctx = moveContext(
      data,
      {
        profile,
        weeklyPattern: null,
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
    const input = {
      ctx,
      templateId: A,
      check: checkWith(),
      choice: 'planned' as const,
      reopened: null,
    };
    const results = await Promise.allSettled([
      startSession(test.storage, data, input),
      startSession(test.storage, data, input),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await sessionRows(test)).map((r) => r.status)).toEqual(['planned']);
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
