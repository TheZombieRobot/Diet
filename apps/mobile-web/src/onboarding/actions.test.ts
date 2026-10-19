// The first-run actions and the settings guard (item 13 design section 6.2; A1 to A4; E52, E62,
// E63). Real repositories over a fresh fake-indexeddb database; synthetic values only.
import {
  createBackupFile,
  type ProfileFormValue,
  READINESS_QUESTION_IDS,
  readinessGates,
} from '@diet/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageRuleError } from '../db/errors';
import { decodeImport, planImport, writeImport } from '../db/importBackup';
import { readBackupSnapshot } from '../db/snapshot';
import { onboardForTests, openTestDb, type TestDb } from '../db/testKit';
import { FlowStaleError, reanswerAfterChange, saveProfile, saveSchedule } from './actions';
import { gateInputOf, readOnboardingState } from './state';

let test: TestDb;
afterEach(() => {
  test.db.shutDown();
});

const PROFILE: ProfileFormValue = {
  heightCm: 175,
  birthYear: 1970,
  sex: 'female',
  weightKg: 90,
  goal: { write: true, goalKg: 70 },
  kickstartOptIn: true,
  activityLevel: 'active-job',
  equipmentBands: false,
  equipmentDumbbells: false,
  householdSize: 1,
  allergens: [],
  dislikeTerms: [],
  glutenFreeHousehold: false,
};

/** The acknowledgement and seven "no" answers, as the flow writes them. */
async function answerAllNo(): Promise<void> {
  await test.repos.settings.update({ alcoholNoticeAckAt: test.env.now() });
  for (const q of READINESS_QUESTION_IDS) await test.repos.readiness.answer(q, 'no');
}

async function gatesNow() {
  const read = await readOnboardingState(test.storage);
  if (!read.ok) throw new Error('unreadable');
  return readinessGates(gateInputOf(read.state, test.env));
}

describe('actions read the records fresh (E63)', () => {
  beforeEach(async () => {
    test = await openTestDb();
  });

  it('A1: the schedule is refused, writing nothing, when answer 5 turned yes after the form rendered', async () => {
    await answerAllNo();
    await saveProfile(test.storage, PROFILE, 'onboarding');
    await test.repos.readiness.answer('q5', 'yes');
    const before = await test.repos.targets.get();
    await expect(
      saveSchedule(
        test.storage,
        { choice: '23:1', window: { start: '18:00', end: '19:00' }, reflux: false },
        'onboarding',
      ),
    ).rejects.toBeInstanceOf(FlowStaleError);
    expect(await test.repos.targets.get()).toEqual(before);
    expect((await test.repos.settings.get()).scheduleConfirmedAt).toBeNull();
  });

  it('A2: Kickstart is stored off when the fresh records leave answer 3 open', async () => {
    await answerAllNo();
    await test.repos.readiness.answer('q3', 'yes');
    await saveProfile(test.storage, PROFILE, 'onboarding');
    expect((await test.repos.profile.get()).kickstartOptIn).toBe(false);
  });
});

describe('the settings guard (A3; E62; HS-20, C41)', () => {
  beforeEach(async () => {
    test = await openTestDb();
  });

  it('refuses to clear the acknowledgement, or to complete setup without it and all seven answers', async () => {
    await test.repos.settings.update({ alcoholNoticeAckAt: test.env.now() });
    const ack = (await test.repos.settings.get()).alcoholNoticeAckAt;
    await expect(test.repos.settings.update({ alcoholNoticeAckAt: null })).rejects.toMatchObject({
      table: 'settings',
      rule: 'onboarding-order',
    });
    expect((await test.repos.settings.get()).alcoholNoticeAckAt).toBe(ack);

    for (const q of READINESS_QUESTION_IDS.filter((q) => q !== 'q6')) {
      await test.repos.readiness.answer(q, 'no');
    }
    const complete = () => test.repos.settings.update({ onboardingCompletedAt: test.env.now() });
    await expect(complete()).rejects.toBeInstanceOf(StorageRuleError);
    expect((await test.repos.settings.get()).onboardingCompletedAt).toBeNull();

    await test.repos.readiness.answer('q6', 'no');
    const onOnboardingCompleted = vi.fn();
    test.db.shutDown();
    test = await openTestDb({ deps: test.deps, env: test.env, hooks: { onOnboardingCompleted } });
    await complete();
    expect(onOnboardingCompleted).toHaveBeenCalledOnce();
  });

  it('refuses completion before the acknowledgement, even with every answer', async () => {
    for (const q of READINESS_QUESTION_IDS) await test.repos.readiness.answer(q, 'no');
    await expect(
      test.repos.settings.update({ onboardingCompletedAt: test.env.now() }),
    ).rejects.toMatchObject({ rule: 'onboarding-order' });
  });

  it('an import of a finished setup with no readiness rows still succeeds (the flow asks again, RD-08)', async () => {
    const source = await openTestDb();
    await onboardForTests(source);
    await source.db.readiness.clear();
    const snapshot = await readBackupSnapshot(source.db);
    source.db.shutDown();
    const file = await createBackupFile({
      tables: snapshot,
      exportedAt: test.env.now(),
      appVersion: '0.1.0',
      password: null,
    });
    const decoded = await decodeImport(
      { text: file.text, sizeBytes: file.text.length },
      null,
      test.env,
    );
    const deps = {
      postGate: () => undefined,
      locks: null,
      requestPersistentStorage: () => Promise.resolve(),
      reload: () => undefined,
    };
    expect(await writeImport(test.db, await planImport(test.db, decoded), test.env, deps)).toEqual({
      ok: true,
    });
    test.db.shutDown();
    test = await openTestDb({ deps: test.deps, env: test.env });
    const imported = await readBackupSnapshot(test.db);
    expect(imported.settings[0]?.onboardingCompletedAt).not.toBeNull();
    expect(imported.readiness).toEqual([]);
  });
});

describe('"My medication or dose has changed" (A4; E52, E53)', () => {
  beforeEach(async () => {
    test = await openTestDb();
  });

  it('lapses the confirmation, gates fasting, turns Kickstart off and ends a running period', async () => {
    await onboardForTests(test, {
      answers: { q3: 'yes' },
      confirmations: ['prescriberAgreed'],
      profile: { kickstartOptIn: true },
    });
    expect((await gatesNow()).fastingGated).toBe(false);
    await test.repos.kickstart.startPeriod();
    test.env.set('2000-03-02T00:00:00.000Z');
    await reanswerAfterChange(test.storage, 'q3');
    const rows = await test.repos.readiness.list();
    expect(rows.find((r) => r.questionId === 'prescriberAgreed')).toBeUndefined();
    expect((await gatesNow()).fastingGated).toBe(true);
    expect((await test.repos.profile.get()).kickstartOptIn).toBe(false);
    const [period] = await test.repos.kickstart.listPeriods();
    expect(period?.endReason).toBe('readiness-gated');
  });
});
