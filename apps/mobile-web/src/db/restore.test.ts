// @vitest-environment node
// What a restore keeps from the phone (storage spec section 10.6 steps 9 and 10; D27; full review
// F1, F3, F12, F13, F15, F16 and the pre-start answer of F6 and F18), through the real database
// and the real Kickstart actions. Real Dexie over fake-indexeddb; synthetic records only.
import {
  createBackupFile,
  createRescueFile,
  type Instant,
  PRE_START_STOP_SIGN_CARD,
  preStartTrigger,
  recentPreStartStopSignDay,
  type Snapshot,
  weightOverview,
} from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import {
  onDay,
  scenarioInstant,
  SCENARIO_DAY1,
  snapshotV1,
  WEIGHT_SCENARIOS,
  weightScenario,
} from '@diet/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import {
  endKickstart,
  endKickstartIfConditionsFail,
  startKickstart,
} from '../screens/weight/kickstartActions';
import { endLatchStore } from '../screens/weight/stores';
import {
  currentWeightEnv,
  overviewInputFrom,
  readWeightInputs,
} from '../screens/weight/useWeightView';
import { createExport } from './exportBackup';
import {
  decodeImport,
  type ImportChoices,
  type ImportPlan,
  planImport,
  writeImport,
  type WriteDeps,
} from './importBackup';
import { replaceAll } from './snapshot';
import { backupSnapshot, openTestDb, type TestDb, testEnv } from './testKit';
import type { AppStorage } from './runtime';

const at = (day: number, time = '09:00'): Instant => scenarioInstant(SCENARIO_DAY1, day, time);
const PALPITATIONS = {
  dizzyOnStanding: 'no',
  palpitations: 'yes',
  crampsNotSettling: 'no',
  faintAtWork: 'no',
} as const;

const opened: TestDb[] = [];
afterEach(() => {
  endLatchStore.set(new Map());
  for (const test of opened.splice(0)) test.db.shutDown();
});

const writeDeps = (): WriteDeps => ({
  postGate: () => undefined,
  locks: null,
  requestPersistentStorage: () => Promise.resolve(),
  reload: () => undefined,
});

/**
 * A phone on scenario day 1 that chose Kickstart at setup and has not started one. `firstId` sets
 * where its new record ids start, so two phones never make the same id.
 */
async function pendingPhone(firstId = 70_000): Promise<TestDb> {
  const test = await openTestDb({ env: testEnv(at(1), 'Pacific/Auckland', firstId) });
  await replaceAll(test.db, weightScenario(onDay(WEIGHT_SCENARIOS.PENDING, 1)));
  opened.push(test);
  return test;
}

async function exportNow(test: TestDb): Promise<string> {
  const outcome = await createExport(test.db, test.env, null);
  if (!outcome.ok) throw outcome.error;
  return outcome.file.text;
}

async function plan(test: TestDb, text: string): Promise<ImportPlan> {
  const decoded = await decodeImport({ text, sizeBytes: text.length }, null, test.env);
  return planImport(test.db, decoded);
}

/** Restores `text` into the phone of `test`, then opens the records again as the reload would. */
async function restore(test: TestDb, text: string, choices: ImportChoices = {}): Promise<TestDb> {
  const outcome = await writeImport(
    test.db,
    await plan(test, text),
    test.env,
    writeDeps(),
    choices,
  );
  expect(outcome).toEqual({ ok: true });
  test.db.shutDown();
  const after = await openTestDb({ deps: test.deps, env: test.env });
  opened.push(after);
  return after;
}

/** What the phone shows and allows about Kickstart now. */
async function kickstartPicture(storage: AppStorage) {
  const inputs = await readWeightInputs(storage);
  const overview = weightOverview(overviewInputFrom(inputs, currentWeightEnv(storage)));
  return {
    phase: overview.phase,
    start: overview.kickstart.start,
    endNeeded: overview.kickstart.endNeeded,
    stopSigns: overview.cards.stopSigns,
    extensionOffer: overview.cards.extensionOffer,
    periods: inputs.periods,
    checks: inputs.checks,
  };
}

describe('a restore never lowers the Kickstart history (D27; full review F1)', () => {
  it.each([21, 23])(
    'a backup made on day 5 of a Kickstart, restored on day %i after a palpitations "yes" and End on day 20: the check, the end, the card and the refusals all stay',
    async (restoreDay) => {
      const phone = await pendingPhone();
      expect(await startKickstart(phone.storage)).toMatchObject({ ok: true });
      phone.env.set(at(5));
      const dayFive = await exportNow(phone);
      phone.env.set(at(20));
      expect((await phone.repos.kickstart.recordCheck(PALPITATIONS)).outcome).toBe('stop-sign');
      phone.env.set(at(20, '09:05'));
      await endKickstart(phone.storage, 'user-ended');
      phone.env.set(at(restoreDay));
      const before = await kickstartPicture(phone.storage);
      expect(before.start).toEqual({ available: false, reason: 'recent-stop-sign' });

      const planned = await plan(phone, dayFive);
      expect(planned.keptKickstart).toBe(true);
      const after = await restore(phone, dayFive);
      expect(await kickstartPicture(after.storage)).toEqual(before);
    },
  );

  it('F12: a stop-sign check saved in another tab after the confirmation stops the write, and the confirmation worked out again keeps it', async () => {
    const phone = await pendingPhone();
    expect(await startKickstart(phone.storage)).toMatchObject({ ok: true });
    phone.env.set(at(5));
    const dayFive = await exportNow(phone);
    phone.env.set(at(20));
    const shown = await plan(phone, dayFive);
    expect(shown.keptKickstart).toBe(false);

    // The other tab: the same records, through a second connection.
    const otherTab = await openTestDb({ deps: phone.deps, env: phone.env });
    opened.push(otherTab);
    await otherTab.repos.kickstart.recordCheck(PALPITATIONS);
    const saved = await backupSnapshot(phone.db);
    const before = await kickstartPicture(phone.storage);
    expect(before.stopSigns).toMatchObject({ forced: true });

    const outcome = await writeImport(phone.db, shown, phone.env, writeDeps());
    expect(outcome).toMatchObject({ ok: false, blocked: false, changed: true });
    expect(await backupSnapshot(phone.db)).toStrictEqual(saved);

    const again = await plan(phone, dayFive);
    expect(again.keptKickstart).toBe(true);
    expect(await writeImport(phone.db, again, phone.env, writeDeps())).toEqual({ ok: true });
    phone.db.shutDown();
    const after = await openTestDb({ deps: phone.deps, env: phone.env });
    opened.push(after);
    expect(await kickstartPicture(after.storage)).toEqual(before);
  });

  it('two unrelated histories that overlap (a backup from before delete-all, a Kickstart started since) refuse the file: neither side is dropped', async () => {
    const old = await pendingPhone();
    expect(await startKickstart(old.storage)).toMatchObject({ ok: true });
    old.env.set(at(5));
    const dayFive = await exportNow(old);
    const fresh = await pendingPhone(90_000);
    fresh.env.set(at(10));
    expect(await startKickstart(fresh.storage)).toMatchObject({ ok: true });
    const before = await backupSnapshot(fresh.db);
    await expect(plan(fresh, dayFive)).rejects.toMatchObject({
      code: 'inconsistent',
      message: privacy.kickstartMerge,
    });
    expect(await backupSnapshot(fresh.db)).toStrictEqual(before);
  });
});

describe('a Kickstart running on the phone keeps running through a restore (full review F13)', () => {
  it('a backup made before the start: the diet mode, keto start and 23:1 default come from the phone, and nothing ends it', async () => {
    const phone = await pendingPhone();
    const beforeStart = await exportNow(phone);
    phone.env.set(at(2));
    expect(await startKickstart(phone.storage)).toMatchObject({ ok: true });
    phone.env.set(at(6));
    const kept = await phone.repos.profile.get();

    const planned = await plan(phone, beforeStart);
    expect(planned).toMatchObject({
      keptKickstart: true,
      keptKickstartSettings: true,
      kickstartEnds: false,
    });
    const after = await restore(phone, beforeStart);
    expect(await after.repos.profile.get()).toMatchObject({
      dietMode: kept.dietMode,
      carbCeilingStartedAt: kept.carbCeilingStartedAt,
    });
    expect(await after.repos.targets.get()).toMatchObject({
      fastingPreset: '23:1',
      presetChosenBy: 'kickstart-default',
    });
    const picture = await kickstartPicture(after.storage);
    expect(picture.phase).toMatchObject({ kind: 'kickstart', day: 5 });
    expect(picture.endNeeded).toBeNull();
    expect(await endKickstartIfConditionsFail(after.storage)).toBeNull();
  });

  it('a file whose answers switch Kickstart off: the confirmation says the running Kickstart will end', async () => {
    const phone = await pendingPhone();
    expect(await startKickstart(phone.storage)).toMatchObject({ ok: true });
    phone.env.set(at(3));
    const tables = await backupSnapshot(phone.db);
    const pregnant: Snapshot = {
      ...tables,
      readiness: tables.readiness.map((r) =>
        r.questionId === 'q2' ? { ...r, answer: 'yes' as const } : r,
      ),
    };
    const file = await createBackupFile({
      tables: pregnant,
      exportedAt: phone.env.now(),
      appVersion: '0.1.0',
      password: null,
    });
    expect((await plan(phone, file.text)).kickstartEnds).toBe(true);
  });
});

describe('a fast running when the backup was made (full review F3)', () => {
  async function fastingFile(): Promise<{ phone: TestDb; text: string; exportedAt: Instant }> {
    const phone = await pendingPhone();
    phone.env.set(at(1, '18:00'));
    const fast = await phone.repos.fasts.start();
    phone.env.set(at(2, '09:00'));
    const text = await exportNow(phone);
    const exportedAt = phone.env.now();
    phone.env.set(at(2, '17:00'));
    await phone.repos.fasts.end(fast.id);
    phone.env.set(at(5, '14:00'));
    return { phone, text, exportedAt };
  }

  it('is named on the confirmation and comes back running unless the owner ends it at the backup time', async () => {
    const { phone, text } = await fastingFile();
    const planned = await plan(phone, text);
    expect(planned.runningFast?.startedAt).toBe(at(1, '18:00'));
    const after = await restore(phone, text);
    expect((await after.repos.fasts.list()).at(-1)?.endedAt).toBeNull();
  });

  it('"End that fast" ends it at the time the backup was made, in the zone it started in', async () => {
    const { phone, text, exportedAt } = await fastingFile();
    const after = await restore(phone, text, { endRunningFast: true });
    const fast = (await after.repos.fasts.list()).at(-1);
    expect(fast).toMatchObject({ endedAt: exportedAt, endedTimeZone: fast?.timeZone });
  });
});

describe('the pre-start stop-sign answer is a record (full review F6, F8, F18)', () => {
  it('a "yes" before a start holds in a second tab, counts for 336 hours, goes into a backup and is kept by a restore of an older file', async () => {
    const phone = await pendingPhone();
    const older = await exportNow(phone);
    phone.env.set(at(1, '10:00'));
    await phone.repos.cardState.reopen(PRE_START_STOP_SIGN_CARD, preStartTrigger('2000-02-01'));

    const otherTab = await openTestDb({ deps: phone.deps, env: phone.env });
    opened.push(otherTab);
    expect((await kickstartPicture(otherTab.storage)).start).toEqual({
      available: false,
      reason: 'stop-sign-today',
    });
    otherTab.db.shutDown();

    const backup = await exportNow(phone);
    expect(backup).toContain(preStartTrigger('2000-02-01'));
    const after = await restore(phone, older);
    const rows = await after.db.card_state.toArray();
    after.env.set(at(14, '09:00'));
    expect(recentPreStartStopSignDay(rows, after.env.now())).toBe('2000-02-01');
    after.env.set(at(15, '10:00'));
    expect(recentPreStartStopSignDay(rows, after.env.now())).toBeNull();
  });
});

describe('the export check and rescue copies (full review F15, F16)', () => {
  it('a Kickstart started with the clock 2 days ahead and ended once it was corrected never ran: the backup is made and restores', async () => {
    const phone = await pendingPhone();
    const right = phone.env.now();
    phone.env.set(at(3));
    const period = await phone.repos.kickstart.startPeriod();
    phone.env.set(right);
    const ended = await phone.repos.kickstart.endPeriod('user-ended');
    expect(Date.parse(ended.endedAt ?? '') - Date.parse(period.startedAt)).toBe(1);
    const text = await exportNow(phone);
    const fresh = await openTestDb({ env: phone.env });
    opened.push(fresh);
    const after = await restore(fresh, text);
    expect(await after.repos.kickstart.listPeriods()).toEqual([ended]);
  });

  it('a rescue copy restored on a new phone keeps its own safety settings: the untouched defaults are not "more cautious"', async () => {
    const tables = structuredClone(snapshotV1);
    Object.assign(tables.targets[0] ?? {}, { steadyDeficitPct: 18 });
    const file = await createRescueFile({
      tables,
      exportedAt: '2000-03-01T00:00:00.000Z',
      appVersion: '0.1.0',
      password: null,
      schemaVersion: 1,
    });
    const fresh = await openTestDb();
    opened.push(fresh);
    await fresh.repos.settings.update({ alcoholNoticeAckAt: fresh.env.now() });
    const planned = await plan(fresh, file.text);
    expect(planned.keptStricter).toEqual([]);
    expect(planned.snapshot.targets[0]?.steadyDeficitPct).toBe(18);
    expect(planned.confirmation.phoneHasOwnRecords).toBe(false);
  });
});
