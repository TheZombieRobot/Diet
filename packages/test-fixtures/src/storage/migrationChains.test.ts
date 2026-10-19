// Migration chain tests with TEST-ONLY version-2 chains, built here and never shipped (section 9.6;
// section 16 test 17): (a) an added field with a default and a renamed enum value; (b) a narrowed
// safety range that maps 20 to 18 and records a change; (c) an added backed-up store and an added
// device-only store. Each runs the version-1 fixture through backup import.
import {
  chainInfo,
  createBackupFile,
  decodeBackupText,
  type LooseSnapshot,
  migrateSnapshot,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import { fixtureEnv } from './env';
import { SNAPSHOT_V1_APP_VERSION, snapshotV1 } from './snapshotV1';
import {
  chainA,
  chainB,
  chainC,
  chainDropsStore,
  chainInvariant,
  chainKickstartCap,
  chainLosesRows,
  type ProfileV2,
  type Rows,
  type SettingsV2,
} from './testChains';

async function v1File(
  patch: (tables: Record<string, Rows>) => void = () => undefined,
): Promise<string> {
  const tables = structuredClone(snapshotV1) as unknown as Record<string, Rows>;
  patch(tables);
  const file = await createBackupFile({
    tables,
    exportedAt: '2000-03-02T00:00:00.000Z',
    appVersion: SNAPSHOT_V1_APP_VERSION,
    password: null,
  });
  return file.text;
}

describe('test-only version-2 chains (section 9.6; section 16 test 17)', () => {
  it('(a) migrates the version-1 fixture: the new field gets its default, the renamed value maps, and v2 validators pass', async () => {
    const text = await v1File((t) => {
      t.settings = (t.settings ?? []).map((s) => ({ ...s, textSize: 'largest' }));
    });
    const decoded = await decodeBackupText(text, { env: fixtureEnv(), chain: chainA });
    expect(decoded.schemaVersion).toBe(1);
    const profile = decoded.snapshot.profile[0] as unknown as ProfileV2;
    expect(profile.compactView).toBe(false);
    expect((decoded.snapshot.settings[0] as unknown as SettingsV2).textSize).toBe('extra-large');
    expect(decoded.changes).toEqual([]);
    expect(decoded.updateNotice).toBeNull();
  });

  it('(b) maps a stored 20 to 18, records one change, which becomes a migration audit row and the v2 update notice', async () => {
    const text = await v1File((t) => {
      t.targets = (t.targets ?? []).map((x) => ({ ...x, steadyDeficitPct: 20 }));
    });
    const env = fixtureEnv();
    const decoded = await decodeBackupText(text, { env, chain: chainB });
    expect(decoded.snapshot.targets[0]?.steadyDeficitPct).toBe(18);
    expect(decoded.changes).toEqual([
      {
        table: 'targets',
        recordId: 'singleton',
        field: 'steadyDeficitPct',
        reason: 'Steady deficit was changed to fit the limits of app version 2.',
      },
    ]);
    const added = decoded.snapshot.audit.filter(
      (a) => !snapshotV1.audit.some((b) => b.id === a.id),
    );
    expect(added).toEqual([
      {
        id: expect.any(String) as string,
        at: env.now,
        timeZone: env.timeZone,
        kind: 'migration',
        table: 'targets',
        recordId: 'singleton',
        reason: 'Steady deficit was changed to fit the limits of app version 2.',
      },
    ]);
    expect(decoded.updateNotice).toBe('v2');
    // A value already inside the narrowed range is left alone and recorded nowhere.
    const untouched = await decodeBackupText(await v1File(), { env: fixtureEnv(), chain: chainB });
    expect(untouched.changes).toEqual([]);
    expect(untouched.updateNotice).toBeNull();
  });

  it('(c) imports a version-1 file with the new backed-up store empty, and never expects the device-only one', async () => {
    const info = chainInfo(chainC);
    expect(info.backupTablesByVersion[2]?.at(-1)).toBe('example_notes');
    expect(info.deviceOnlyTablesByVersion[2]).toEqual([
      'garden_photos',
      'transfer_pairings',
      'example_cache',
    ]);
    const decoded = await decodeBackupText(await v1File(), { env: fixtureEnv(), chain: chainC });
    const tables = decoded.snapshot as unknown as Record<string, unknown>;
    expect(tables.example_notes).toEqual([]);
    expect(Object.hasOwn(tables, 'example_cache')).toBe(false);
  });

  it('the pure step tolerates missing device-only stores and passes them through untouched', () => {
    const withoutDevice = structuredClone(snapshotV1) as unknown as LooseSnapshot;
    const result = migrateSnapshot(1, withoutDevice, fixtureEnv(), chainC);
    expect(Object.hasOwn(result.snapshot, 'example_cache')).toBe(false);
    expect(Object.hasOwn(result.snapshot, 'garden_photos')).toBe(false);
    const withDevice = { ...withoutDevice, garden_photos: [{ marker: 1 }] };
    expect(migrateSnapshot(1, withDevice, fixtureEnv(), chainC).snapshot.garden_photos).toEqual([
      { marker: 1 },
    ]);
  });

  it.each([
    ['leaves out a store it rewrites', chainDropsStore, 'invalid-record'],
    ['loses rows it does not declare it removes', chainLosesRows, 'invalid-record'],
    ['makes valid rows that break the cross-record rules', chainInvariant, 'inconsistent'],
    ['takes the Kickstart history past 42 days', chainKickstartCap, 'inconsistent'],
  ] as const)(
    'a version-1 file through a step that %s is refused, never imported with records missing (data-loss review)',
    async (_, chain, code) => {
      await expect(
        decodeBackupText(await v1File(), { env: fixtureEnv(), chain }),
      ).rejects.toMatchObject({ code });
    },
  );

  it('a newer file than the chain is refused as newer-version', async () => {
    const text = (await v1File()).replace('"schemaVersion":1', '"schemaVersion":2');
    await expect(decodeBackupText(text, { env: fixtureEnv() })).rejects.toMatchObject({
      code: 'newer-version',
    });
  });
});
