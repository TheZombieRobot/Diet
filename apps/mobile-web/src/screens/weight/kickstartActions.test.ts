// The Kickstart actions, the reconciler and the preset moves on real records (item 14 design
// section 6.5, T1 to T4, T6, T8; section 2.10). Real Dexie over fake-indexeddb; readiness rows go
// through item 13's gate function.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  addDays,
  type KickstartPeriodRecord,
  localDateOf,
  StorageInvariantError,
  weightOverview,
} from '@diet/core';
import { privacy, weight } from '@diet/core/copy/health';
import {
  onDay,
  scenarioInstant,
  SCENARIO_DAY1,
  WEIGHT_SCENARIOS,
  type WeightScenarioOptions,
  weightScenario,
} from '@diet/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';
import type { AppStorage } from '../../db/runtime';
import { openSnapshotDb, type TestDb } from '../../db/testKit';
import {
  endKickstartIfConditionsFail,
  reconcileKickstart,
  startKickstart,
} from './kickstartActions';
import { endLatchStore } from './stores';
import { currentWeightEnv, overviewInputFrom, readWeightInputs } from './useWeightView';
import { weightWriteMessage } from './writeErrors';

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

const overviewNow = async (storage: AppStorage) =>
  weightOverview(overviewInputFrom(await readWeightInputs(storage), currentWeightEnv(storage)));

const reconcile = async (storage: AppStorage) => {
  await reconcileKickstart(storage, await overviewNow(storage));
};

const UNTOUCHED_22 = {
  fastingPreset: '22:2',
  eatingWindow: { start: '17:00', end: '19:00' },
  presetChosenBy: 'default',
};
const KICKSTART_23 = {
  fastingPreset: '23:1',
  eatingWindow: { start: '18:00', end: '19:00' },
  presetChosenBy: 'kickstart-default',
};

describe('T1: the 23:1 → 22:2 move outside Kickstart (C55, WT-08)', () => {
  it('moves once on day 22, in one transaction; a second call finds nothing to do', async () => {
    const db = await seed(WEIGHT_SCENARIOS.K42, 22);
    expect(await db.repos.phase.applyPresetMove()).toEqual(UNTOUCHED_22);
    expect(await db.repos.targets.get()).toMatchObject(UNTOUCHED_22);
    expect(await db.repos.phase.applyPresetMove()).toBeNull();
  });

  it('leaves a chosen preset, a running Kickstart and a gated fast alone; moves the untouched choice of someone not started', async () => {
    const own = {
      fastingPreset: '23:1' as const,
      eatingWindow: { start: '18:00', end: '19:00' },
      presetChosenBy: 'user' as const,
    };
    expect(
      await (
        await seed({ ...WEIGHT_SCENARIOS.K42, targets: own }, 22)
      ).repos.phase.applyPresetMove(),
    ).toBeNull();
    test?.db.shutDown();
    expect(await (await seed(WEIGHT_SCENARIOS.K42, 10)).repos.phase.applyPresetMove()).toBeNull();
    test?.db.shutDown();
    const q3 = await seed({ ...WEIGHT_SCENARIOS.K42, readiness: { q3: 'yes' } }, 22);
    expect(await q3.repos.phase.applyPresetMove()).toBeNull();
    expect(await q3.repos.targets.get()).toMatchObject(KICKSTART_23);
    test?.db.shutDown();
    expect(await (await seed(WEIGHT_SCENARIOS.PENDING, 1)).repos.phase.applyPresetMove()).toEqual(
      UNTOUCHED_22,
    );
  });
});

describe('T2: the 22:2 → 23:1 move at a Kickstart start (C55, C07)', () => {
  const noPeriod = { ...WEIGHT_SCENARIOS.PENDING, targets: {} };

  it('moves an untouched default only', async () => {
    const db = await seed(noPeriod, 1);
    expect(await db.repos.phase.applyKickstartStartPreset()).toEqual(KICKSTART_23);
    expect(await db.repos.phase.applyKickstartStartPreset()).toBeNull();
    test?.db.shutDown();
    const own = {
      fastingPreset: '22:2' as const,
      eatingWindow: { start: '17:00', end: '19:00' },
      presetChosenBy: 'user' as const,
    };
    const user = await seed({ ...noPeriod, targets: own }, 1);
    expect(await user.repos.phase.applyKickstartStartPreset()).toBeNull();
    expect(await user.repos.targets.get()).toMatchObject(own);
  });

  it('C07: never for readiness answer 4 "yes": a start leaves that owner on 22:2', async () => {
    const db = await seed({ ...noPeriod, readiness: { q4: 'yes' } }, 1);
    expect(await startKickstart(db.storage)).toEqual({ ok: true, presetSet: false });
    expect(await db.repos.targets.get()).toMatchObject(UNTOUCHED_22);
  });

  it('C07: a 23:1 Kickstart default stored before answer 4 turned yes is not reported as set at a start (it is read as 22:2)', async () => {
    const targets = {
      fastingPreset: '23:1',
      eatingWindow: { start: '18:00', end: '19:00' },
      presetChosenBy: 'kickstart-default',
    } as const;
    const db = await seed({ ...noPeriod, targets, readiness: { q4: 'yes' } }, 1);
    expect(await startKickstart(db.storage)).toEqual({ ok: true, presetSet: false });
  });
});

describe('item 15: a preset move takes the per-day windows it no longer fits with it (C30)', () => {
  it('the 23:1 → 22:2 move removes an earlier window that does not widen 22:2 and keeps one that does', async () => {
    const db = await seed(WEIGHT_SCENARIOS.K42, 22);
    const today = localDateOf(db.env.now(), db.env.timeZone());
    const tomorrow = addDays(today, 1);
    await db.repos.planDays.setWindows([
      { date: today, window: { start: '16:00', end: '18:00' } },
      { date: tomorrow, window: { start: '16:00', end: '19:00' } },
    ]);
    await reconcile(db.storage);
    expect(await db.repos.targets.get()).toMatchObject(UNTOUCHED_22);
    expect(await db.repos.planDays.get(today)).toBeUndefined();
    expect((await db.repos.planDays.get(tomorrow))?.eatingWindow).toEqual({
      start: '16:00',
      end: '19:00',
    });
  });

  it('the 22:2 → 23:1 move at a Kickstart start removes an earlier window that does not widen 23:1 and keeps one that does (item 15 review)', async () => {
    const db = await seed({ ...WEIGHT_SCENARIOS.PENDING, targets: {} }, 1);
    const today = localDateOf(db.env.now(), db.env.timeZone());
    const tomorrow = addDays(today, 1);
    await db.repos.planDays.setWindows([
      { date: today, window: { start: '16:00', end: '18:00' } },
      { date: tomorrow, window: { start: '16:00', end: '19:00' } },
    ]);
    expect(await startKickstart(db.storage)).toEqual({ ok: true, presetSet: true });
    expect(await db.repos.planDays.get(today)).toBeUndefined();
    expect((await db.repos.planDays.get(tomorrow))?.eatingWindow).toEqual({
      start: '16:00',
      end: '19:00',
    });
  });
});

describe('T3, T4: the reconciler ends what is due and never starts anything (C56, W13, W14)', () => {
  it('T3: no combination of due writes adds a period', async () => {
    for (const [options, day] of [
      [WEIGHT_SCENARIOS.PENDING, 1],
      [{ ...WEIGHT_SCENARIOS.K42, readiness: { q5: 'yes' } }, 10],
      [{ ...WEIGHT_SCENARIOS.K42, dietMode: 'balanced' }, 10],
      [WEIGHT_SCENARIOS.K42, 22],
    ] as const) {
      const db = await seed(options, day);
      const before = await db.repos.kickstart.listPeriods();
      await reconcile(db.storage);
      await endKickstartIfConditionsFail(db.storage);
      expect((await db.repos.kickstart.listPeriods()).length).toBe(before.length);
      db.db.shutDown();
    }
  });

  it('T4: ends a running Kickstart once, readiness-gated before left-keto; a concurrent second call shares the result', async () => {
    const gated = await seed(
      { ...WEIGHT_SCENARIOS.K10, readiness: { q3: 'yes' }, dietMode: 'balanced' },
      10,
    );
    const both = await Promise.all([
      endKickstartIfConditionsFail(gated.storage),
      endKickstartIfConditionsFail(gated.storage),
    ]);
    expect(both).toEqual(['readiness-gated', 'readiness-gated']);
    expect(await gated.repos.kickstart.listPeriods()).toMatchObject([
      { endReason: 'readiness-gated' },
    ]);
    expect(await endKickstartIfConditionsFail(gated.storage)).toBeNull();
    test?.db.shutDown();
    const left = await seed({ ...WEIGHT_SCENARIOS.K10, dietMode: 'moderate-low-carb' }, 10);
    await reconcile(left.storage);
    expect(await left.repos.kickstart.listPeriods()).toMatchObject([{ endReason: 'left-keto' }]);
  });

  it('a call made while an earlier check runs checks again when that one found nothing to end (the same-action end)', async () => {
    const db = await seed(WEIGHT_SCENARIOS.K10, 10);
    // The first check reads the records before the answer is written; the second is the action's
    // own call after its write, and must not take the first one's "nothing to end".
    const first = endKickstartIfConditionsFail(db.storage);
    const write = db.repos.readiness.answer('q5', 'yes');
    const second = endKickstartIfConditionsFail(db.storage);
    await write;
    expect(await first).toBeNull();
    expect(await second).toBe('readiness-gated');
    expect(await db.repos.kickstart.listPeriods()).toMatchObject([
      { endReason: 'readiness-gated' },
    ]);
  });

  it('item 21 T7: a keto run broken and re-entered (a later carbCeilingStartedAt) ends the period as left-keto', async () => {
    const db = await seed(
      {
        ...WEIGHT_SCENARIOS.K10,
        profile: { carbCeilingStartedAt: scenarioInstant(SCENARIO_DAY1, 6, '10:00') },
      },
      10,
    );
    expect(await endKickstartIfConditionsFail(db.storage)).toBe('left-keto');
  });
});

describe('T8: a failed end is retried and never lets Kickstart resume (W13)', () => {
  it('fails twice, then lands; between the tries the phase reads Steady even with the gates open again', async () => {
    const db = await seed(WEIGHT_SCENARIOS.K10, 10);
    let failures = 2;
    const endPeriod = db.repos.kickstart.endPeriod;
    const storage: AppStorage = {
      ...db.storage,
      repos: {
        ...db.repos,
        kickstart: {
          ...db.repos.kickstart,
          endPeriod: (reason) =>
            failures-- > 0 ? Promise.reject(new Error('Synthetic failure')) : endPeriod(reason),
        },
      },
    };
    await db.repos.readiness.answer('q5', 'yes');
    expect(await endKickstartIfConditionsFail(storage)).toBeNull();
    const [period] = await db.repos.kickstart.listPeriods();
    expect(endLatchStore.get().get((period as KickstartPeriodRecord).id)).toBe('readiness-gated');
    await db.repos.readiness.answer('q5', 'no');
    const latched = await overviewNow(storage);
    expect(latched.phase.kind).toBe('steady');
    expect(latched.kickstart.endNeeded).toBe('readiness-gated');
    await reconcile(storage);
    expect((await db.repos.kickstart.listPeriods())[0]?.endReason).toBeNull();
    await reconcile(storage);
    expect(await db.repos.kickstart.listPeriods()).toMatchObject([
      { endReason: 'readiness-gated' },
    ]);
    expect(endLatchStore.get().size).toBe(0);
    expect((await overviewNow(storage)).phase.kind).toBe('steady');
  });
});

describe('T6: the Kickstart writes have one caller each (bypass guard)', () => {
  const root = join(import.meta.dirname, '../..');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(?:ts|tsx)$/.test(name) && !/\.test\.(?:ts|tsx)$/.test(name) ? [path] : [];
    });
  const callersOf = (call: string) =>
    sources(root)
      .filter((path) => readFileSync(path, 'utf8').includes(`${call}(`))
      .map((path) => relative(root, path))
      .sort();

  it('recordCheck only from the check panel; startPeriod and endPeriod only from the actions (and the repository)', () => {
    expect(callersOf('recordCheck')).toEqual([
      'db/repos/kickstart.ts',
      'screens/weight/KickstartCheckPanel.tsx',
    ]);
    expect(callersOf('startPeriod')).toEqual([
      'db/repos/kickstart.ts',
      'screens/weight/kickstartActions.ts',
    ]);
    expect(callersOf('endPeriod')).toEqual([
      'db/repos/kickstart.ts',
      'screens/weight/kickstartActions.ts',
    ]);
  });
});

describe('what a failed weight write says (section 2.10, W35)', () => {
  it('a full phone, closed records and each refusal get their own line; anything else says try again', () => {
    expect(weightWriteMessage(new StorageFullError(), 'entry').text).toBe(privacy.storageFull);
    expect(weightWriteMessage(new StorageClosedError(), 'goal')).toEqual({
      text: privacy.backupCard.closed,
      tone: 'alert',
      reload: true,
    });
    expect(weightWriteMessage(new StorageInvariantError('kickstart-overlap'), 'start').text).toBe(
      weight.start.unavailableToday,
    );
    expect(weightWriteMessage(new StorageInvariantError('kickstart-days'), 'start').text).toBe(
      weight.start.unavailableCap,
    );
    expect(
      weightWriteMessage(new StorageInvariantError('kickstart-check-window'), 'extension').text,
    ).toBe(weight.extension.refusedWindow);
    expect(
      weightWriteMessage(new StorageInvariantError('kickstart-stop-sign'), 'extension').text,
    ).toBe(weight.extension.refusedStopSign);
    expect(weightWriteMessage(new StorageInvariantError('kickstart-end'), 'end').text).toBe(
      weight.end.alreadyEnded,
    );
    expect(
      weightWriteMessage(new StorageRuleError('kickstart_periods', 'not-found'), 'end').text,
    ).toBe(weight.end.alreadyEnded);
    expect(weightWriteMessage(new Error('Synthetic failure'), 'delete').text).toBe(
      weight.list.deleteFailed,
    );
  });
});
