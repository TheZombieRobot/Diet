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
import { failingWrite, onboardForTests, openTestDb, type TestDb } from '../db/testKit';
import {
  acknowledgeNotice,
  answerReadiness,
  finishGarden,
  FlowStaleError,
  reanswerAfterChange,
  saveProfile,
  saveSchedule,
} from './actions';
import { gateInputOf, latestWeightKg, readOnboardingState } from './state';

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
      saveSchedule(test.storage, {
        choice: '23:1',
        window: { start: '18:00', end: '19:00' },
        reflux: false,
      }),
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

  it('A1 HS-32 / HS-35: the schedule is refused when the saved birth year may be under 18, or the weight is low', async () => {
    const refused = () =>
      expect(
        saveSchedule(test.storage, {
          choice: '22:2',
          window: { start: '17:00', end: '19:00' },
          reflux: false,
        }),
      ).rejects.toBeInstanceOf(FlowStaleError);
    await answerAllNo();
    await saveProfile(
      test.storage,
      { ...PROFILE, birthYear: 1990, goal: { write: false }, kickstartOptIn: false },
      'onboarding',
    );
    await refused();
    await saveProfile(test.storage, PROFILE, 'onboarding');
    const [weight] = await test.repos.weights.list();
    await test.repos.weights.update(weight?.id ?? '', { kg: 55 });
    await refused();
    expect((await test.repos.settings.get()).scheduleConfirmedAt).toBeNull();
  });

  it("C07 / E49: with answer 4 the schedule saved is recorded as the owner's, even when it equals the default", async () => {
    await answerAllNo();
    await test.repos.readiness.answer('q4', 'yes');
    await saveProfile(test.storage, PROFILE, 'onboarding');
    await saveSchedule(test.storage, {
      choice: '23:1',
      window: { start: '18:00', end: '19:00' },
      reflux: false,
    });
    expect((await test.repos.targets.get()).presetChosenBy).toBe('user');
  });

  it("F8: the setup step's reflux switch sets both preferences; a save without it (Settings) leaves them", async () => {
    await answerAllNo();
    await saveProfile(test.storage, PROFILE, 'onboarding');
    const oneMeal = { start: '18:00', end: '19:00' };
    await saveSchedule(test.storage, { choice: '23:1', window: oneMeal, reflux: true });
    expect(await test.repos.targets.get()).toMatchObject({
      refluxPreferEarlier: true,
      refluxPreferSplit: true,
    });
    await test.repos.targets.update({ refluxPreferSplit: false });
    const snack = { start: '17:00', end: '19:00' };
    await saveSchedule(test.storage, { choice: '22:2', window: snack, reflux: null });
    expect(await test.repos.targets.get()).toMatchObject({
      fastingPreset: '22:2',
      refluxPreferEarlier: true,
      refluxPreferSplit: false,
    });
  });
});

describe('"I understand" and finishing setup (HS-20; section 6.2 steps 0 and 1)', () => {
  beforeEach(async () => {
    test = await openTestDb();
  });

  it('a second "I understand" keeps the first time', async () => {
    await acknowledgeNotice(test.storage);
    const first = (await test.repos.settings.get()).alcoholNoticeAckAt;
    test.env.advanceDays(1);
    await acknowledgeNotice(test.storage);
    expect((await test.repos.settings.get()).alcoholNoticeAckAt).toBe(first);
  });

  it('the garden step does not complete setup while the schedule step is still owed', async () => {
    await answerAllNo();
    await saveProfile(test.storage, PROFILE, 'onboarding');
    expect(await finishGarden(test.storage)).toEqual({ completed: false });
    expect((await test.repos.settings.get()).onboardingCompletedAt).toBeNull();
  });

  it('C07: finishing clears a pattern left stored while fasting is gated (an interrupted gate change)', async () => {
    await answerAllNo();
    await saveProfile(test.storage, PROFILE, 'onboarding');
    await saveSchedule(test.storage, {
      choice: '23:1',
      window: { start: '18:00', end: '19:00' },
      reflux: false,
    });
    // Answer 5 written with no gate effects, as an interruption would leave it.
    await test.repos.readiness.answer('q5', 'yes');
    expect(await finishGarden(test.storage)).toEqual({ completed: true });
    expect((await test.repos.targets.get()).fastingPreset).toBeNull();
  });

  it('C07 / E49: finishing clears a default the app chose before answer 4 turned yes, and asks for the schedule again', async () => {
    await answerAllNo();
    await saveProfile(test.storage, PROFILE, 'onboarding');
    await saveSchedule(test.storage, {
      choice: '23:1',
      window: { start: '18:00', end: '19:00' },
      reflux: false,
    });
    await test.repos.readiness.answer('q4', 'yes');
    expect(await finishGarden(test.storage)).toEqual({ completed: false });
    expect((await test.repos.targets.get()).fastingPreset).toBeNull();
    expect((await test.repos.settings.get()).scheduleConfirmedAt).toBeNull();
  });
});

describe('a failure part-way through an answer leaves nothing a second tap does not finish (item 13 review)', () => {
  /** Reopens the records without the failing middleware, as a reload or the next tap would. */
  async function reopen(): Promise<void> {
    test.db.shutDown();
    test = await openTestDb({ deps: test.deps, env: test.env });
  }
  const answerOf = async (q: string) =>
    (await test.repos.readiness.list()).find((r) => r.questionId === q)?.answer;

  it('the Kickstart choice is turned off before a yes to answer 3 is written', async () => {
    const failure = failingWrite('profile', 'put', () => new Error('synthetic failure'));
    test = await openTestDb({ extraMiddleware: [failure.middleware] });
    await onboardForTests(test, { profile: { kickstartOptIn: true } });
    failure.arm();
    await expect(answerReadiness(test.storage, 'q3', 'yes')).rejects.toThrow('synthetic failure');
    expect(await answerOf('q3')).toBe('no');
    await reopen();
    expect(await answerReadiness(test.storage, 'q3', 'yes')).toEqual({ written: true });
    expect(await answerOf('q3')).toBe('yes');
    expect((await test.repos.profile.get()).kickstartOptIn).toBe(false);
  });

  it('an answer stored before its effects failed: the second tap writes nothing new but runs them', async () => {
    const failure = failingWrite('settings', 'put', () => new Error('synthetic failure'));
    test = await openTestDb({ extraMiddleware: [failure.middleware] });
    await answerAllNo();
    await saveProfile(test.storage, PROFILE, 'onboarding');
    await saveSchedule(test.storage, {
      choice: '23:1',
      window: { start: '18:00', end: '19:00' },
      reflux: false,
    });
    failure.arm();
    await expect(answerReadiness(test.storage, 'q5', 'yes')).rejects.toThrow('synthetic failure');
    expect(await answerOf('q5')).toBe('yes');
    expect((await test.repos.targets.get()).fastingPreset).toBe('23:1');
    await reopen();
    expect(await answerReadiness(test.storage, 'q5', 'yes')).toEqual({ written: false });
    expect((await test.repos.targets.get()).fastingPreset).toBeNull();
    expect((await test.repos.settings.get()).scheduleConfirmedAt).toBeNull();
  });
});

describe('the weigh-in that prefills the setup form (latestWeightKg)', () => {
  it('is the latest by time, whatever the order of the rows', () => {
    const row = (at: string, kg: number) =>
      ({ at, kg }) as Parameters<typeof latestWeightKg>[0][number];
    expect(
      latestWeightKg([
        row('2000-03-02T00:00:00.000Z', 80),
        row('2000-03-05T00:00:00.000Z', 78),
        row('2000-03-01T00:00:00.000Z', 82),
      ]),
    ).toBe(78);
    expect(latestWeightKg([])).toBeNull();
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

  it('also ends a period whose start is dated ahead, which has not started yet (item 12: the clock was ahead)', async () => {
    await onboardForTests(test, {
      answers: { q3: 'yes' },
      confirmations: ['prescriberAgreed'],
      profile: { kickstartOptIn: true },
    });
    const corrected = test.env.now();
    test.env.advanceDays(3);
    await test.repos.kickstart.startPeriod();
    test.env.set(corrected);
    await reanswerAfterChange(test.storage, 'q3');
    const [period] = await test.repos.kickstart.listPeriods();
    expect(period?.endReason).toBe('readiness-gated');
  });

  it('HS-33: "My symptoms have changed" lapses the GP confirmation and closes exercise plans', async () => {
    await onboardForTests(test, { answers: { q6: 'yes' }, confirmations: ['gpExerciseDiscussed'] });
    expect((await gatesNow()).exercisePlansAvailable).toBe(true);
    test.env.advanceDays(1);
    await reanswerAfterChange(test.storage, 'q6');
    const rows = await test.repos.readiness.list();
    expect(rows.find((r) => r.questionId === 'gpExerciseDiscussed')).toBeUndefined();
    expect(rows.find((r) => r.questionId === 'q6')?.answeredAt).toBe(test.env.now());
    expect((await gatesNow()).exercisePlansAvailable).toBe(false);
  });
});
