// Migration chain tests with TEST-ONLY version-2 chains, built here and never shipped (section 9.6;
// section 16 test 17): (a) an added field with a default and a renamed enum value; (b) a narrowed
// safety range that maps 20 to 18 and records a change; (c) an added backed-up store and an added
// device-only store. Each runs the version-1 fixture through backup import.
import {
  chainInfo,
  createBackupFile,
  decodeBackupText,
  fillTemplate,
  type LooseSnapshot,
  type Migration,
  MIGRATIONS,
  migrateSnapshot,
  type ObjectRule,
  type ProfileRecord,
  ROWS_V1,
  type SettingsRecord,
  specKit,
  STORES_V1,
  TABLES_V1,
  type TargetsRecord,
} from '@diet/core';
import { privacy } from '@diet/core/copy/health';
import { describe, expect, it } from 'vitest';
import { fixtureEnv } from './env';

const { bool, enumOf, id, int, object, table } = specKit;
import { SNAPSHOT_V1_APP_VERSION, snapshotV1 } from './snapshotV1';

const V1 = MIGRATIONS[0] as Migration;
type Rows = Record<string, unknown>[];

// (a) profile gains compactView (default false); settings.textSize 'largest' becomes 'extra-large'.
type ProfileV2 = ProfileRecord & { compactView: boolean };
type SettingsV2 = Omit<SettingsRecord, 'textSize'> & {
  textSize: 'standard' | 'large' | 'extra-large';
};
const chainA: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: {},
    backup: { added: [], removed: [], deviceOnly: [] },
    specs: {
      ...TABLES_V1,
      profile: table(
        STORES_V1.profile,
        true,
        TABLES_V1.profile.ops,
        object<ProfileV2>({ ...ROWS_V1.profile.fields, compactView: bool }, ROWS_V1.profile.rules),
      ),
      settings: table(
        STORES_V1.settings,
        true,
        TABLES_V1.settings.ops,
        object<SettingsV2>(
          { ...ROWS_V1.settings.fields, textSize: enumOf(['standard', 'large', 'extra-large']) },
          ROWS_V1.settings.rules as unknown as ObjectRule<SettingsV2>[],
        ),
      ),
    },
    reads: ['profile', 'settings'],
    rewrites: ['profile', 'settings'],
    upgrade: (s) => ({
      snapshot: {
        ...s,
        profile: (s.profile as Rows).map((p) => ({ ...p, compactView: false })),
        settings: (s.settings as Rows).map((x) => ({
          ...x,
          textSize: x.textSize === 'largest' ? 'extra-large' : x.textSize,
        })),
      },
      changes: [],
    }),
  },
];

// (b) steadyDeficitPct narrows from 15–20 to 15–18: 19 and 20 move to 18, the nearest safe value.
const chainB: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: {},
    backup: { added: [], removed: [], deviceOnly: [] },
    specs: {
      ...TABLES_V1,
      targets: table(
        STORES_V1.targets,
        true,
        TABLES_V1.targets.ops,
        object<TargetsRecord>(
          { ...ROWS_V1.targets.fields, steadyDeficitPct: int(15, 18) },
          ROWS_V1.targets.rules,
        ),
      ),
    },
    reads: ['targets'],
    rewrites: ['targets'],
    upgrade: (s) => {
      const changes = (s.targets as Rows)
        .filter((t) => (t.steadyDeficitPct as number) > 18)
        .map(() => ({
          table: 'targets',
          recordId: 'singleton',
          field: 'steadyDeficitPct',
          reason: fillTemplate(privacy.migrationChange, { field: 'Steady deficit', version: 2 }),
        }));
      const targets = (s.targets as Rows).map((t) => ({
        ...t,
        steadyDeficitPct: Math.min(18, t.steadyDeficitPct as number),
      }));
      return { snapshot: { ...s, targets }, changes };
    },
  },
];

// (c) a new backed-up store and a new device-only store.
const chainC: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: { example_notes: 'id', example_cache: 'id' },
    backup: { added: ['example_notes'], removed: [], deviceOnly: ['example_cache'] },
    specs: {
      ...TABLES_V1,
      example_notes: table(
        'id',
        true,
        ['create', 'get', 'list', 'update', 'remove'],
        object<{ id: string }>({ id }),
      ),
      example_cache: table('id', false, [], object<{ id: string }>({ id })),
    },
    reads: [],
    rewrites: [],
    upgrade: (s) => ({ snapshot: s, changes: [] }),
  },
];

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

  it('a newer file than the chain is refused as newer-version', async () => {
    const text = (await v1File()).replace('"schemaVersion":1', '"schemaVersion":2');
    await expect(decodeBackupText(text, { env: fixtureEnv() })).rejects.toMatchObject({
      code: 'newer-version',
    });
  });
});
