// The diet-mode switch on real records (item 21 design section 6.2, D0 to D7): FL-04, C56, C72,
// C109; T14, T35. Real Dexie over fake-indexeddb; synthetic weight scenarios and snapshotV1.
import { dayTargetsFromRecords, localDateOf, runningKickstartPeriod } from '@diet/core';
import {
  onDay,
  SCENARIO_ZONE,
  snapshotV1,
  SNAPSHOT_V1_EXPORTED_AT,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { switchDietMode } from '../../screens/targets/dietModeActions';
import { endKickstartIfConditionsFail } from '../../screens/weight/kickstartActions';
import { endLatchStore } from '../../screens/weight/stores';
import { readWeightInputs } from '../../screens/weight/useWeightView';
import { StorageClosedError, StorageRuleError } from '../errors';
import type { AppStorage } from '../runtime';
import { backupSnapshot, failingWrite, openSnapshotDb, openTestDb, type TestDb } from '../testKit';
import { replaceAll } from '../snapshot';

let test: TestDb | undefined;

afterEach(() => {
  endLatchStore.set(new Map());
  test?.db.shutDown();
  test = undefined;
});

async function seed(options: WeightScenarioOptions, day: number): Promise<TestDb> {
  const seen = onDay(options, day);
  test = await openSnapshotDb(weightScenario(seen), seen.now);
  return test;
}

const { K10 } = WEIGHT_SCENARIOS;

/** The figures the engine gives now, from the stored records. */
async function figuresNow(storage: AppStorage) {
  const at = storage.env.now();
  const records = await readWeightInputs(storage);
  return dayTargetsFromRecords(records, {
    at,
    today: localDateOf(at, SCENARIO_ZONE),
    deviceZone: SCENARIO_ZONE,
    endsPending: endLatchStore.get(),
  }).targets;
}

const confirmNeeded = { rule: 'kickstart-confirm-needed' };

describe('one writer of the diet mode (T35; D0)', () => {
  it('profile.update refuses a dietMode patch and writes nothing; other profile fields still save', async () => {
    const db = await seed(K10, 10);
    const before = await db.repos.profile.get();
    await expect(db.repos.profile.update({ dietMode: 'balanced' })).rejects.toMatchObject({
      rule: 'diet-mode-switch-only',
    });
    await expect(db.repos.profile.update({ dietMode: 'balanced' })).rejects.toBeInstanceOf(
      StorageRuleError,
    );
    expect(await db.repos.profile.get()).toEqual(before);
    await db.repos.profile.update({ activityLevel: 'moderate' });
    expect((await db.repos.profile.get()).activityLevel).toBe('moderate');
  });
});

describe('FL-04: switching never deletes anything (D1)', () => {
  it('keto → balanced → keto leaves every store but the profile as it was', async () => {
    test = await openSnapshotDb(snapshotV1, SNAPSHOT_V1_EXPORTED_AT);
    const before = await backupSnapshot(test.db);
    expect(
      runningKickstartPeriod(
        before.kickstart_periods,
        before.kickstart_checks,
        SNAPSHOT_V1_EXPORTED_AT,
        'Pacific/Auckland',
        'Pacific/Auckland',
      ),
    ).toBeNull();
    await switchDietMode(test.storage, 'balanced', { endKickstart: false });
    test.env.advanceDays(1);
    await switchDietMode(test.storage, 'keto', { endKickstart: false });
    const after = await backupSnapshot(test.db);
    for (const store of Object.keys(before) as (keyof typeof before)[]) {
      if (store !== 'profile') expect(after[store], store).toEqual(before[store]);
    }
    // The profile differs only in the switch's bookkeeping, and is back in keto.
    const [profile] = after.profile;
    expect(profile).toEqual({
      ...before.profile[0],
      carbCeilingStartedAt: test.env.now(),
      firstLowCarbAt: profile?.firstLowCarbAt,
      updatedAt: profile?.updatedAt,
    });
    expect(profile?.dietMode).toBe('keto');
  });
});

describe('FL-04, C56: leaving keto while a Kickstart runs (D2 to D2d, D5)', () => {
  it('D2b: without the owner’s confirmation the repository refuses and writes nothing', async () => {
    const db = await seed(K10, 10);
    const before = await backupSnapshot(db.db);
    await expect(
      db.repos.dietMode.switchTo('balanced', { endKickstart: false }),
    ).rejects.toMatchObject(confirmNeeded);
    await expect(
      switchDietMode(db.storage, 'moderate-low-carb', { endKickstart: false }),
    ).rejects.toMatchObject(confirmNeeded);
    expect(await backupSnapshot(db.db)).toEqual(before);
  });

  it('D2: confirmed, the period ends as left-keto now; back in keto, no new period and no 20 g', async () => {
    const db = await seed(K10, 10);
    const result = await switchDietMode(db.storage, 'balanced', { endKickstart: true });
    expect(result).toEqual({ changed: true, ended: 'left-keto' });
    const [period] = await db.repos.kickstart.listPeriods();
    expect(period).toMatchObject({
      endReason: 'left-keto',
      endedAt: db.env.now(),
      endedTimeZone: SCENARIO_ZONE,
    });
    db.env.advanceDays(1);
    await switchDietMode(db.storage, 'keto', { endKickstart: false });
    expect(await db.repos.kickstart.listPeriods()).toHaveLength(1);
    expect(await figuresNow(db.storage)).toMatchObject({
      figures: 'steady',
      netCarbs: { grams: 30, basis: 'keto' },
    });
  });

  it('D2c: an imported running period in balanced mode ends on any switch, with no confirmation', async () => {
    const db = await seed({ ...K10, dietMode: 'balanced' }, 10);
    expect(await switchDietMode(db.storage, 'keto', { endKickstart: false })).toEqual({
      changed: true,
      ended: 'left-keto',
    });
    expect(await figuresNow(db.storage)).toMatchObject({
      figures: 'steady',
      netCarbs: { grams: 30 },
    });
    const moderate = await seed({ ...K10, dietMode: 'moderate-low-carb' }, 10);
    expect(await switchDietMode(moderate.storage, 'balanced', { endKickstart: false })).toEqual({
      changed: true,
      ended: 'left-keto',
    });
  });

  it('D2d: a confirmation when nothing runs any more just switches', async () => {
    const db = await seed(WEIGHT_SCENARIOS.K42, 30);
    expect(await switchDietMode(db.storage, 'balanced', { endKickstart: true })).toEqual({
      changed: true,
      ended: null,
    });
  });

  it('D5: a failed end is latched, the figures read Steady at once, and the next try ends it', async () => {
    const db = await seed(K10, 10);
    const storage: AppStorage = {
      ...db.storage,
      repos: {
        ...db.repos,
        kickstart: {
          ...db.repos.kickstart,
          endPeriod: () => Promise.reject(new Error('Synthetic failure')),
        },
      },
    };
    expect(await switchDietMode(storage, 'balanced', { endKickstart: true })).toEqual({
      changed: true,
      ended: null,
    });
    expect((await db.repos.kickstart.listPeriods())[0]?.endReason).toBeNull();
    expect(endLatchStore.get().size).toBe(1);
    expect((await figuresNow(db.storage)).figures).toBe('steady');
    expect(await endKickstartIfConditionsFail(db.storage)).toBe('left-keto');
  });

  it('D5: a failed profile write changes nothing and ends nothing', async () => {
    const seen = onDay(K10, 10);
    const failing = failingWrite('profile', 'put', () => new Error('Synthetic failure'));
    test = await openTestDb({ extraMiddleware: [failing.middleware] });
    test.env.set(seen.now);
    test.env.setZone(SCENARIO_ZONE);
    await replaceAll(test.db, weightScenario(seen));
    const before = await backupSnapshot(test.db);
    failing.arm();
    await expect(switchDietMode(test.storage, 'balanced', { endKickstart: true })).rejects.toThrow(
      'Synthetic failure',
    );
    expect(await backupSnapshot(test.db)).toEqual(before);
  });
});

describe('the carb-ceiling clock and the first low-carb time (C72, C109; D3, D4)', () => {
  it('every switch into keto writes a new carbCeilingStartedAt; firstLowCarbAt is set once', async () => {
    const db = await seed({ ...WEIGHT_SCENARIOS.K42, dietMode: 'balanced', periods: [] }, 30);
    expect((await db.repos.profile.get()).firstLowCarbAt).toBeNull();
    await switchDietMode(db.storage, 'moderate-low-carb', { endKickstart: false });
    const first = (await db.repos.profile.get()).firstLowCarbAt;
    expect(first).toBe(db.env.now());
    db.env.advanceDays(1);
    await switchDietMode(db.storage, 'keto', { endKickstart: false });
    const keto1 = await db.repos.profile.get();
    expect(keto1.carbCeilingStartedAt).toBe(db.env.now());
    db.env.advanceDays(1);
    await switchDietMode(db.storage, 'balanced', { endKickstart: false });
    db.env.advanceDays(1);
    await switchDietMode(db.storage, 'keto', { endKickstart: false });
    const keto2 = await db.repos.profile.get();
    expect(keto2.carbCeilingStartedAt).toBe(db.env.now());
    expect(keto2.carbCeilingStartedAt).not.toBe(keto1.carbCeilingStartedAt);
    expect(keto2.firstLowCarbAt).toBe(first);
  });

  it('leaving keto with no first low-carb time sets it; with the keto ceiling closed it stays unset', async () => {
    const open = await seed(
      { ...WEIGHT_SCENARIOS.K42, periods: [], profile: { firstLowCarbAt: null } },
      30,
    );
    await switchDietMode(open.storage, 'balanced', { endKickstart: false });
    expect((await open.repos.profile.get()).firstLowCarbAt).toBe(open.env.now());
    const closed = await seed(
      {
        ...WEIGHT_SCENARIOS.K42,
        periods: [],
        readiness: { q2: 'yes' },
        profile: { firstLowCarbAt: null },
      },
      30,
    );
    await switchDietMode(closed.storage, 'balanced', { endKickstart: false });
    expect((await closed.repos.profile.get()).firstLowCarbAt).toBeNull();
  });

  it('D4: the stored mode again changes nothing and writes nothing', async () => {
    const db = await seed(K10, 10);
    const before = await backupSnapshot(db.db);
    db.env.advanceDays(1);
    expect(await switchDietMode(db.storage, 'keto', { endKickstart: false })).toEqual({
      changed: false,
      ended: null,
    });
    expect(await backupSnapshot(db.db)).toEqual(before);
  });

  it('D6: with the write gate closed, the switch is refused before anything is read', async () => {
    const db = await seed(K10, 10);
    db.db.gate.close();
    await expect(
      db.repos.dietMode.switchTo('balanced', { endKickstart: true }),
    ).rejects.toBeInstanceOf(StorageClosedError);
  });
});
