import { describe, expect, it } from 'vitest';
import { defaultSnapshot } from './defaults';
import {
  chainInfo,
  computeGoldenVectors,
  GOLDEN_VECTORS,
  type Migration,
  MIGRATIONS,
  migrateSnapshot,
  SCHEMA_VERSION,
  SPEC_FINGERPRINTS,
} from './migrations';
import type { Desc } from './primitives';
import { STORES_V1 } from './specs/v1';
import { specDescription, specFingerprint, VALIDATOR_CONSTANTS } from './tables';

const env = {
  now: '2000-01-01T00:00:00.000Z',
  timeZone: 'UTC',
  randomId: () => '00000000-0000-4000-8000-000000000001',
};

describe('the migration chain (section 9; section 16 test 17)', () => {
  it('runs 1, 2, 3, … with no gaps, and SCHEMA_VERSION is the last entry', () => {
    MIGRATIONS.forEach((m, i) => {
      expect(m.version).toBe(i + 1);
    });
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.at(-1)?.version);
    expect(MIGRATIONS[0]?.upgrade).toBeNull();
    expect(MIGRATIONS[0]?.rewrites).toEqual([]);
  });

  it('a chain with a gap, or with specs that disagree with its store lists, is refused', () => {
    const v1 = MIGRATIONS[0] as Migration;
    expect(() => chainInfo([{ ...v1, version: 2 }])).toThrow(RangeError);
    expect(() => chainInfo([{ ...v1, backup: { ...v1.backup, deviceOnly: [] } }])).toThrow(
      RangeError,
    );
    expect(() => chainInfo([])).toThrow(RangeError);
  });

  it('version 1 declares the stores of section 4.2 exactly', () => {
    expect(STORES_V1).toEqual({
      profile: 'id',
      readiness: 'questionId',
      targets: 'id',
      settings: 'id',
      kickstart_periods: 'id, startedAt',
      kickstart_checks: 'id, periodId, askedAt',
      weights: 'id, at',
      fasts: 'id, startedAt',
      symptom_log: 'id, at',
      water_log: 'id, at',
      steps_log: 'date',
      ingredients: 'id, name',
      ingredient_overrides: 'seedId',
      recipes: 'id, title',
      plan_days: 'date',
      food_log: 'id, at',
      garden: 'id, ingredientId',
      garden_photos: 'gardenId',
      pantry: 'id, ingredientId',
      sessions: 'id, date',
      beverages: 'id, sortOrder',
      drinks_log: 'id, at',
      alcohol_day_notes: 'date',
      alcohol_milestones: 'id, fromDate',
      grocery_lists: 'id, createdAt',
      transfer_pairings: 'id',
      card_state: '[cardId+trigger]',
      audit: 'id, at, [table+recordId]',
    });
  });

  it('migrating a current-version snapshot changes nothing and adds no audit row', () => {
    const snapshot = defaultSnapshot(env) as unknown as Record<string, unknown[]>;
    const result = migrateSnapshot(SCHEMA_VERSION, snapshot, env);
    expect(result.changes).toEqual([]);
    expect(result.updateNotice).toBeNull();
    expect(result.snapshot).toEqual(snapshot);
    expect(() => migrateSnapshot(0, snapshot, env)).toThrow(RangeError);
    expect(() => migrateSnapshot(SCHEMA_VERSION + 1, snapshot, env)).toThrow(RangeError);
  });
});

describe('the guards against an unversioned schema change (section 9.2; D12)', () => {
  it('SPEC_FINGERPRINTS[SCHEMA_VERSION] matches the specs, registries, store lists and validator constants', async () => {
    expect(await specFingerprint()).toBe(SPEC_FINGERPRINTS[SCHEMA_VERSION]);
  });

  it('the fingerprint changes when any validator constant changes', async () => {
    const original = await specFingerprint();
    const bump = (value: Desc): Desc => {
      if (typeof value === 'number') return value + 1;
      if (typeof value === 'string') return `${value}x`;
      if (Array.isArray(value)) return [...(value as Desc[]), 'extra'];
      if (value !== null && typeof value === 'object') {
        return { ...(value as Record<string, Desc>), extra: 1 };
      }
      return 'changed';
    };
    for (const [name, value] of Object.entries(VALIDATOR_CONSTANTS)) {
      const changed = { ...VALIDATOR_CONSTANTS, [name]: bump(value) };
      expect(await specFingerprint(SCHEMA_VERSION, changed), name).not.toBe(original);
    }
  });

  it('the description covers every store, its key, indexes, backup flag, operations and validators', () => {
    const description = JSON.parse(specDescription()) as {
      tables: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(description.tables).sort()).toEqual(Object.keys(STORES_V1).sort());
    expect(description.tables['audit']).toMatchObject({
      key: ['id'],
      indexes: ['at', '[table+recordId]'],
      backup: true,
      ops: ['create', 'get', 'list'],
    });
    expect(description.tables['card_state']).toMatchObject({
      key: ['cardId', 'trigger'],
      ops: ['get'],
    });
    expect(description.tables['garden_photos']).toMatchObject({ backup: false, ops: [] });
  });

  it('GOLDEN_VECTORS[SCHEMA_VERSION] matches the live outputs of the core functions the validators rely on', () => {
    const pinned = GOLDEN_VECTORS[SCHEMA_VERSION];
    if (pinned === undefined) throw new Error('no golden vectors');
    expect(computeGoldenVectors(pinned)).toEqual(pinned);
    expect(pinned.windowLength.length).toBeGreaterThanOrEqual(5 + 2);
    expect(pinned.drinkLabel.map((v) => v.name)).toEqual([
      'label applies',
      'volume edited',
      'ABV edited',
      'printed figure null',
    ]);
  });
});
