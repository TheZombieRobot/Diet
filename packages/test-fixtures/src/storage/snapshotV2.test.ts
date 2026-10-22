import {
  checkInvariants,
  createBackupFile,
  decodeBackupText,
  MIGRATIONS,
  migrateSnapshot,
  sha256Hex,
  TABLES_BY_VERSION,
  validateSnapshot,
} from '@diet/core';
import { describe, expect, it } from 'vitest';
import { fixtureEnv } from './env';
import { SNAPSHOT_V1_APP_VERSION, snapshotV1 } from './snapshotV1';
import { SNAPSHOT_V2_ADDED, snapshotV2 } from './snapshotV2';

/** Pinned when version 2 was released; a released fixture is never edited (section 9.4). */
const SNAPSHOT_V2_SHA256 = '9dcec0f29b20340d418afe103f62e7c4007bf0ad33434c74646fbe6210f3d289';

const tables = snapshotV2 as unknown as Record<string, readonly unknown[]>;

describe('the version-2 fixture (section 9.4; item 23)', () => {
  it('passes the version-2 specs unchanged and the cross-record invariants', () => {
    const validated = validateSnapshot(tables, TABLES_BY_VERSION[2]);
    expect(JSON.stringify(validated)).toBe(JSON.stringify(snapshotV2));
    expect(() => {
      checkInvariants(snapshotV2);
    }).not.toThrow();
  });

  it('holds rows version 1 refuses: each added row lists all eight figures as unknown', () => {
    expect(() => validateSnapshot(tables, TABLES_BY_VERSION[1])).toThrow(/unknownNutrients/);
    for (const row of [...SNAPSHOT_V2_ADDED.food_log, ...SNAPSHOT_V2_ADDED.recipes]) {
      expect(row.unknownNutrients).toHaveLength(8);
      expect(() =>
        validateSnapshot(
          {
            ...snapshotV1,
            food_log: [],
            recipes: [],
            [row === SNAPSHOT_V2_ADDED.recipes[0] ? 'recipes' : 'food_log']: [row],
          },
          TABLES_BY_VERSION[1],
        ),
      ).toThrow(/unknownNutrients/);
    }
  });

  it('the version-1 fixture reaches version 2 unchanged, through the pure chain and through backup import', async () => {
    const env = fixtureEnv();
    const pure = migrateSnapshot(1, structuredClone(snapshotV1) as never, env);
    expect(pure).toEqual({ snapshot: snapshotV1, changes: [], updateNotice: null });
    const file = await createBackupFile({
      tables: structuredClone(snapshotV1),
      exportedAt: '2000-03-02T00:00:00.000Z',
      appVersion: SNAPSHOT_V1_APP_VERSION,
      password: null,
      chain: MIGRATIONS.slice(0, 1),
    });
    expect(file.schemaVersion).toBe(1);
    const decoded = await decodeBackupText(file.text, { env: fixtureEnv() });
    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.changes).toEqual([]);
    expect(decoded.snapshot.food_log).toEqual(snapshotV1.food_log);
    expect(decoded.snapshot.recipes).toEqual(snapshotV1.recipes);
  });

  it('is pinned: a released fixture cannot be edited', async () => {
    expect(await sha256Hex(JSON.stringify(snapshotV2))).toBe(SNAPSHOT_V2_SHA256);
  });
});
