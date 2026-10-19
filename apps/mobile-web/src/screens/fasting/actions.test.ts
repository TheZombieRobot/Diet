// @vitest-environment node
// The fasting screens' writes (item 15 design 3.9, 6.3), over a real fake database.
import {
  parseClockTime,
  type Schedule,
  StorageInvariantError,
  StorageValidationError,
  zonedWallTimeToInstant,
} from '@diet/core';
import { fasting, privacy } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';
import { onboardForTests, openTestDb, type TestDb } from '../../db/testKit';
import {
  actionFailure,
  changeStart,
  editFast,
  endFast,
  saveNote,
  setRefluxPreference,
  startFast,
} from './actions';

const NZ = 'Pacific/Auckland';
const at = (date: string, time: string): number =>
  zonedWallTimeToInstant(date, parseClockTime(time), NZ);
const iso = (ms: number): string => new Date(ms).toISOString();
const ONE_MEAL: Schedule = {
  standing: { start: '18:00', end: '19:00' },
  switchTo: null,
  overrides: {},
};
const clockAt = (test: TestDb, ms: number) => {
  test.env.set(iso(ms));
};
/** A database whose readiness answers leave fasting open. */
async function openOpen(): Promise<TestDb> {
  const test = await openTestDb();
  await onboardForTests(test, { weightKg: null });
  return test;
}
const value = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) throw new Error('the action failed');
  return result.value;
};

describe('what a failed action says (design 3.9)', () => {
  it.each([
    [new StorageInvariantError('fast-running'), fasting.card.alreadyRunning, false],
    [new StorageInvariantError('fast-overlap'), fasting.history.overlap, false],
    [new StorageRuleError('fasts', 'fasting-gated'), fasting.gated.refused, false],
    [new StorageRuleError('fasts', 'future-time'), fasting.history.future, false],
    [new StorageRuleError('fasts', 'already-ended'), fasting.card.alreadyEnded, false],
    [new StorageRuleError('fasts', 'not-latest'), fasting.card.notLatest, false],
    [new StorageRuleError('fasts', 'not-ended'), fasting.card.notEnded, false],
    [new StorageRuleError('fasts', 'undo-expired'), fasting.card.undoExpired, false],
    [new StorageRuleError('fasts', 'not-found'), fasting.card.notFound, false],
    [new StorageRuleError('fasts', 'reopen'), fasting.card.notLatest, false],
    [new StorageValidationError('fasts', 'note', 'pattern'), fasting.card.invalid, false],
    [new StorageFullError(), privacy.storageFull, true],
    [new StorageClosedError(), privacy.backupCard.closed, true],
    [new Error('anything else'), fasting.card.failed, true],
  ])('%s', (error, message, retry) => {
    expect(actionFailure(error)).toEqual({ message, retry });
  });
});

describe('fast actions (FS-01, FS-06, C30)', () => {
  it('Start plans from now to the next window; a start a minute after an end joins its span', async () => {
    const test = await openOpen();
    clockAt(test, at('2000-01-03', '19:00'));
    const first = value(await startFast(test.storage, [], ONE_MEAL));
    expect(first).toMatchObject({ plannedFastMinutes: 1380, dinnerTime: '19:00' });
    clockAt(test, at('2000-01-04', '18:50'));
    value(await endFast(test.storage, first.id));
    clockAt(test, at('2000-01-04', '18:51'));
    const again = value(await startFast(test.storage, await test.repos.fasts.list(), ONE_MEAL));
    expect(again).toMatchObject({ plannedFastMinutes: 9, snackTime: null, dinnerTime: null });
    const twice = await startFast(test.storage, await test.repos.fasts.list(), ONE_MEAL);
    expect(twice).toEqual({
      ok: false,
      failure: { message: fasting.card.alreadyRunning, retry: false },
    });
  });

  it("a running fast's new start recomputes its plan; a completed fast's new start clears it", async () => {
    const test = await openOpen();
    clockAt(test, at('2000-01-03', '19:00'));
    const running = value(await startFast(test.storage, [], ONE_MEAL));
    clockAt(test, at('2000-01-04', '09:00'));
    const moved = value(
      await changeStart(test.storage, running, iso(at('2000-01-04', '06:00')), [running], ONE_MEAL),
    );
    expect(moved).toMatchObject({ plannedFastMinutes: 720, dinnerTime: '19:00' });
    clockAt(test, at('2000-01-04', '10:00'));
    const ended = value(await endFast(test.storage, running.id));
    const edited = value(
      await editFast(test.storage, ended, {
        startedAt: iso(at('2000-01-04', '05:00')),
        endedAt: ended.endedAt ?? '',
        note: '  Felt fine  ',
      }),
    );
    expect(edited).toMatchObject({ plannedFastMinutes: null, note: 'Felt fine' });
    expect(value(await saveNote(test.storage, ended.id, '   ')).note).toBeNull();
  });

  it('the reflux switches write only their own field', async () => {
    const test = await openOpen();
    value(await setRefluxPreference(test.storage, 'refluxPreferSplit', true));
    expect(await test.repos.targets.get()).toMatchObject({
      refluxPreferEarlier: false,
      refluxPreferSplit: true,
    });
  });
});
