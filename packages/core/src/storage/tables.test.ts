import { describe, expect, it } from 'vitest';
import * as limits from './limits';
import {
  DEFAULT_BEVERAGE_NAME,
  DEFAULT_GARDEN_NAME,
  defaultSnapshot,
  populateRows,
} from './defaults';
import { checkInvariants } from './invariants';
import { chainInfo, MIGRATIONS, SCHEMA_VERSION } from './migrations';
import {
  BACKUP_FIELDS,
  BACKUP_FIELDS_BY_VERSION,
  BACKUP_TABLES,
  BACKUP_TABLES_BY_VERSION,
  comparePrimaryKeys,
  DB_NAME,
  DEVICE_ONLY_TABLES,
  DEVICE_ONLY_TABLES_BY_VERSION,
  primaryKeyOf,
  sortByPrimaryKey,
  STORE_NAMES,
  TABLES,
  TABLES_BY_VERSION,
  VALIDATOR_CONSTANTS,
} from './tables';
import { validateRow, validateSnapshot } from './validate';

let n = 0;
const env = {
  now: '2000-01-01T00:00:00.000Z',
  randomId: () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`,
};

describe('the store registry (sections 4.1 and 8.4; section 16 test 18)', () => {
  it('one database named diet with 28 stores, 26 backed up (D1)', () => {
    expect(DB_NAME).toBe('diet');
    expect(STORE_NAMES).toHaveLength(28);
    expect(BACKUP_TABLES).toHaveLength(26);
    expect(DEVICE_ONLY_TABLES).toEqual(['garden_photos', 'transfer_pairings']);
  });

  it('for every version, the backed-up and device-only lists together are exactly the store names, with no overlap', () => {
    const info = chainInfo(MIGRATIONS);
    for (const version of Object.keys(TABLES_BY_VERSION).map(Number)) {
      const backup = BACKUP_TABLES_BY_VERSION[version] ?? [];
      const deviceOnly = DEVICE_ONLY_TABLES_BY_VERSION[version] ?? [];
      expect(backup.filter((name) => deviceOnly.includes(name))).toEqual([]);
      expect([...backup, ...deviceOnly].sort()).toEqual(
        [...(info.storeNamesByVersion[version] ?? [])].sort(),
      );
      expect(Object.keys(TABLES_BY_VERSION[version] ?? {}).sort()).toEqual(
        [...backup, ...deviceOnly].sort(),
      );
    }
  });

  it('every store has a spec, and every backed-up store an allow-list with every field in spec order', () => {
    for (const name of STORE_NAMES) expect(TABLES[name], name).toBeDefined();
    expect(Object.keys(BACKUP_FIELDS)).toEqual([...BACKUP_TABLES]);
    expect(BACKUP_FIELDS_BY_VERSION[SCHEMA_VERSION]).toBe(BACKUP_FIELDS);
    expect(Object.keys(BACKUP_FIELDS['weights'] ?? {})).toEqual([
      'id',
      'at',
      'timeZone',
      'kg',
      'source',
      'note',
    ]);
    expect(BACKUP_FIELDS['beverages']?.['label']).toEqual({
      volumeMl: null,
      abvPercent: null,
      standardDrinks: null,
      kcal: null,
      energyAsEntered: { value: null, unit: null },
      origin: null,
    });
    expect(Object.keys(BACKUP_FIELDS['ingredient_overrides']?.['changes'] ?? {})).toEqual([
      'field',
      'value',
    ]);
  });

  it('records the generic operations of section 8.4', () => {
    expect(TABLES.drinks_log.ops).toEqual(['get', 'list']);
    expect(TABLES.kickstart_periods.ops).toEqual(['get', 'list']);
    expect(TABLES.kickstart_checks.ops).toEqual(['get', 'list']);
    expect(TABLES.fasts.ops).toEqual(['get', 'list', 'update', 'remove']);
    expect(TABLES.profile.ops).toEqual(['get', 'update']);
    expect(TABLES.readiness.ops).toEqual(['list']);
    expect(TABLES.card_state.ops).toEqual(['get']);
    expect(TABLES.audit.ops).toEqual(['create', 'get', 'list']);
    expect(TABLES.garden_photos.ops).toEqual([]);
    expect(TABLES.transfer_pairings.ops).toEqual([]);
    expect(TABLES.weights.ops).toEqual(['create', 'get', 'list', 'update', 'remove']);
  });

  it('primary keys sort in IndexedDB string order, compound keys element by element', () => {
    expect(primaryKeyOf(TABLES.card_state, { cardId: 'rapid-loss', trigger: 'steady' })).toEqual([
      'rapid-loss',
      'steady',
    ]);
    expect(comparePrimaryKeys(['a', 'b'], ['a', 'c'])).toBe(-1);
    expect(comparePrimaryKeys(['B'], ['a'])).toBe(-1);
    expect(
      sortByPrimaryKey(TABLES.steps_log, [{ date: '2000-01-02' }, { date: '2000-01-01' }]),
    ).toEqual([{ date: '2000-01-01' }, { date: '2000-01-02' }]);
  });

  it('VALIDATOR_CONSTANTS holds everything in limits.ts and the core constants the validators read', () => {
    for (const name of Object.keys(limits))
      expect(Object.hasOwn(VALIDATOR_CONSTANTS, name), name).toBe(true);
    for (const name of [
      'WEIGHT_LIMITS_KG',
      'KJ_PER_KCAL',
      'MIN_EATING_MINUTES',
      'FASTING_PRESETS',
      'NUTRIENT_KEYS',
      'ALLERGENS',
    ]) {
      expect(Object.hasOwn(VALIDATOR_CONSTANTS, name), name).toBe(true);
    }
  });
});

describe('seeds (section 6)', () => {
  it('populate rows pass validation: 3 singletons, the premix preset and silverbeet with no amount', () => {
    const rows = populateRows(env);
    for (const [table, list] of Object.entries(rows)) {
      for (const row of list) expect(validateRow(table, row, TABLES)).toEqual(row);
    }
    expect(rows.beverages[0]).toMatchObject({
      name: DEFAULT_BEVERAGE_NAME,
      volumeMl: 330,
      abvPercent: 5,
    });
    expect(rows.beverages[0].label).toMatchObject({
      standardDrinks: null,
      kcal: 94,
      origin: 'preset-default',
    });
    expect(rows.garden[0]).toMatchObject({
      name: DEFAULT_GARDEN_NAME,
      ingredientId: 'seed:silverbeet',
      amount: null,
      unit: null,
    });
    expect(rows.profile[0]).toMatchObject({
      sex: null,
      heightCm: null,
      birthYear: null,
      goalKg: null,
      kickstartOptIn: true,
    });
    expect(rows.targets[0]).toMatchObject({
      fastingPreset: null,
      eatingWindow: null,
      energyFloorKj: 5000,
      kickstartDeficitPct: 30,
    });
    expect(rows.settings[0]).toMatchObject({
      drinkingDayCutoverMinutes: 300,
      rapidLossThresholdGPerWeek: 1000,
      hiddenSeedIds: [],
    });
  });

  it('a fresh database passes every check, with no readiness rows, card state or milestones', () => {
    const snapshot = defaultSnapshot(env);
    expect(validateSnapshot(snapshot)).toEqual(snapshot);
    checkInvariants(snapshot);
    expect(snapshot.readiness).toEqual([]);
    expect(snapshot.card_state).toEqual([]);
    expect(snapshot.alcohol_milestones).toEqual([]);
  });
});
