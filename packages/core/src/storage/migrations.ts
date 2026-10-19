/**
 * Schema versions and the migration chain (storage spec section 9; D12–D14).
 *
 * Policy (section 9.2):
 * 1. A released version is never edited; each later change adds a step with its own frozen
 *    specs/vN.ts. Import validates a file against its own version's specs first (section 10.6).
 * 2. Any change to fields, types, enums, ranges, intra-record rules, registries, indexes, the
 *    store lists, a constant a validator reads, or the behaviour of a core function a validator
 *    calls or restates, needs a new version. SPEC_FINGERPRINTS and GOLDEN_VECTORS guard this.
 * 3. Widening and adding are free; narrowing must map. A step fills defaults, maps renamed values
 *    and drops removed fields; it never invents a health value. Narrowing a safety range moves each
 *    value to the nearest value on the safe side and records a MigrationChange, which becomes an
 *    audit row and an update-notice card (D13).
 * 4. One chain, two consumers: Dexie runs it on the phone (runUpgrade, item 12 app) and import runs
 *    it on older files (migrateSnapshot). Steps tolerate missing device-only stores.
 * 5. Import accepts every version from 1 to SCHEMA_VERSION for ever, so the chain is never pruned.
 * 6. No downgrades: a newer database is never touched (section 7.1).
 */
import { type Beverage, drinkEnergy, standardDrinks } from '../alcohol/standardDrinks';
import { type EatingWindow, windowLength } from '../fasting/eatingWindow';
import {
  type Confidence,
  confidenceOf,
  type NutritionSource,
  recipeConfidence,
} from '../nutrition/confidence';
import { kjToKcal } from '../nutrition/nutrients';
import { updateNoticeTrigger } from './cards';
import type { FieldTree, Id, Instant, TableSpecs, TimeZone } from './primitives';
import { BACKUP_TABLES_V1, DEVICE_ONLY_TABLES_V1, STORES_V1, TABLES_V1 } from './specs/v1';

/** Every store as plain arrays; device-only stores may be absent (a backup). */
export type LooseSnapshot = Record<string, unknown[]>;

export interface MigrationEnv {
  readonly now: Instant;
  readonly timeZone: TimeZone;
  randomId(): Id;
}

/** One stored value a step changed (section 9.2), listed on the import confirmation and kept as an audit row. */
export interface MigrationChange {
  readonly table: string;
  readonly recordId: string;
  readonly field: string;
  /** Plain-English reason, from the privacy.migrationChange template in health.ts. */
  readonly reason: string;
}

export interface MigrationResult {
  readonly snapshot: LooseSnapshot;
  readonly changes: readonly MigrationChange[];
}

export interface Migration {
  /** The version this step produces. */
  readonly version: number;
  /** Dexie stores delta; null deletes a store. */
  readonly stores: Readonly<Record<string, string | null>>;
  /** Changes to the store lists: backed-up stores added and removed, device-only stores added. */
  readonly backup: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly deviceOnly: readonly string[];
  };
  /** This version's complete, frozen field specs. */
  readonly specs: TableSpecs;
  /** Stores the step needs to see. */
  readonly reads: readonly string[];
  /** Stores whose rows the step may change ([] for version 1). runUpgrade rewrites only these. */
  readonly rewrites: readonly string[];
  /** Pure and synchronous; null only for version 1; identity when no rows change. */
  readonly upgrade: ((snapshot: LooseSnapshot, env: MigrationEnv) => MigrationResult) | null;
}

/** The released chain. Version 1 is frozen at the item-12 commit. */
export const MIGRATIONS: readonly Migration[] = Object.freeze([
  Object.freeze({
    version: 1,
    stores: STORES_V1,
    backup: { added: BACKUP_TABLES_V1, removed: [], deviceOnly: DEVICE_ONLY_TABLES_V1 },
    specs: TABLES_V1,
    reads: [],
    rewrites: [],
    upgrade: null,
  }),
]);

/** The current schema version (the last entry of MIGRATIONS; a test checks they agree). Dexie stores n × 10. */
export const SCHEMA_VERSION = 1;

/** Everything a chain implies, version by version (section 9.3). */
export interface ChainInfo {
  readonly schemaVersion: number;
  readonly specsByVersion: Readonly<Record<number, TableSpecs>>;
  readonly storeNamesByVersion: Readonly<Record<number, readonly string[]>>;
  readonly backupTablesByVersion: Readonly<Record<number, readonly string[]>>;
  readonly deviceOnlyTablesByVersion: Readonly<Record<number, readonly string[]>>;
  /** The allow-list of each backed-up store (C49; section 10.3). */
  readonly backupFieldsByVersion: Readonly<Record<number, Readonly<Record<string, FieldTree>>>>;
}

const chainInfos = new WeakMap<readonly Migration[], ChainInfo>();

/**
 * Derives the per-version store lists, specs and allow-lists from a chain, checking its shape:
 * versions consecutive from 1, and each version's specs covering exactly its stores.
 */
export function chainInfo(chain: readonly Migration[] = MIGRATIONS): ChainInfo {
  const cached = chainInfos.get(chain);
  if (cached) return cached;
  const specsByVersion: Record<number, TableSpecs> = {};
  const storeNamesByVersion: Record<number, readonly string[]> = {};
  const backupTablesByVersion: Record<number, readonly string[]> = {};
  const deviceOnlyTablesByVersion: Record<number, readonly string[]> = {};
  const backupFieldsByVersion: Record<number, Readonly<Record<string, FieldTree>>> = {};
  let stores: string[] = [];
  let backup: string[] = [];
  let deviceOnly: string[] = [];
  chain.forEach((step, i) => {
    if (step.version !== i + 1)
      throw new RangeError('Migration versions must run 1, 2, 3, … with no gaps');
    const deleted = Object.entries(step.stores)
      .filter(([, s]) => s === null)
      .map(([name]) => name);
    const kept = (list: readonly string[]) => list.filter((name) => !deleted.includes(name));
    stores = kept([
      ...stores,
      ...Object.keys(step.stores).filter((name) => !stores.includes(name)),
    ]);
    backup = kept([
      ...backup.filter((name) => !step.backup.removed.includes(name)),
      ...step.backup.added,
    ]);
    deviceOnly = kept([
      ...deviceOnly,
      ...step.backup.deviceOnly.filter((name) => !deviceOnly.includes(name)),
    ]);
    const specNames = Object.keys(step.specs).sort();
    const listed = [...backup, ...deviceOnly].sort();
    if (specNames.join() !== listed.join() || [...stores].sort().join() !== listed.join()) {
      throw new RangeError(
        `Version ${step.version}: the specs, stores and store lists must name the same stores`,
      );
    }
    for (const name of specNames) {
      if (step.specs[name]?.backup !== backup.includes(name)) {
        throw new RangeError(
          `Version ${step.version}: a spec's backup flag disagrees with the store lists`,
        );
      }
    }
    specsByVersion[step.version] = step.specs;
    storeNamesByVersion[step.version] = Object.freeze([...stores]);
    backupTablesByVersion[step.version] = Object.freeze([...backup]);
    deviceOnlyTablesByVersion[step.version] = Object.freeze([...deviceOnly]);
    backupFieldsByVersion[step.version] = Object.freeze(
      Object.fromEntries(backup.map((name) => [name, step.specs[name]?.row.tree ?? {}])),
    );
  });
  const last = chain.at(-1);
  if (last === undefined) throw new RangeError('The migration chain is empty');
  const info: ChainInfo = Object.freeze({
    schemaVersion: last.version,
    specsByVersion,
    storeNamesByVersion,
    backupTablesByVersion,
    deviceOnlyTablesByVersion,
    backupFieldsByVersion,
  });
  chainInfos.set(chain, info);
  return info;
}

/** The audit row a migration change becomes (kind 'migration'; D13, D44). */
export function migrationAuditRow(
  change: MigrationChange,
  env: MigrationEnv,
): Record<string, unknown> {
  return {
    id: env.randomId(),
    at: env.now,
    timeZone: env.timeZone,
    kind: 'migration',
    table: change.table,
    recordId: change.recordId,
    reason: change.reason,
  };
}

export interface MigrateSnapshotResult extends MigrationResult {
  /** The update-notice trigger ('v<N>') to show when any value changed, else null (section 9.2). */
  readonly updateNotice: string | null;
}

/**
 * Runs the chain from `fromVersion` to the chain's last version on a backup's tables (section 9.2
 * point 4; import step 7). Each step's backed-up stores added are filled with [] when absent and
 * its removed stores dropped; device-only stores that are absent stay absent. Every change is
 * returned and appended to `audit` as a migration row. The input is not modified.
 */
export function migrateSnapshot(
  fromVersion: number,
  snapshot: Readonly<LooseSnapshot>,
  env: MigrationEnv,
  chain: readonly Migration[] = MIGRATIONS,
): MigrateSnapshotResult {
  const { schemaVersion } = chainInfo(chain);
  if (!Number.isInteger(fromVersion) || fromVersion < 1 || fromVersion > schemaVersion) {
    throw new RangeError(`Cannot migrate from version ${fromVersion}`);
  }
  let tables: LooseSnapshot = { ...snapshot };
  const changes: MigrationChange[] = [];
  for (const step of chain) {
    if (step.version <= fromVersion) continue;
    if (step.upgrade !== null) {
      const result = step.upgrade(tables, env);
      tables = { ...result.snapshot };
      changes.push(...result.changes);
    }
    for (const name of step.backup.added) tables[name] ??= [];
    tables = Object.fromEntries(
      Object.entries(tables).filter(([name]) => !step.backup.removed.includes(name)),
    );
  }
  if (changes.length > 0) {
    tables.audit = [...(tables.audit ?? []), ...changes.map((c) => migrationAuditRow(c, env))];
  }
  return {
    snapshot: tables,
    changes,
    updateNotice: changes.length > 0 ? updateNoticeTrigger(schemaVersion) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Spec fingerprints and golden vectors (section 9.2 point 2)

/**
 * SHA-256 (hex) of specDescription(n) (tables.ts) for each released version. The test recomputes
 * the current version's; older ones stay as history.
 */
export const SPEC_FINGERPRINTS: Readonly<Record<number, string>> = Object.freeze({
  1: '9d291c4f17e47164d382beefd5e98e1d362eadcff1d38b5541133ddb76984ef5',
});

export type WindowLengthOutput =
  { eatingMinutes: number; fastingMinutes: number; ratio: string | null } | 'refused';

export interface GoldenVectors {
  readonly windowLength: readonly {
    readonly input: EatingWindow;
    readonly output: WindowLengthOutput;
  }[];
  readonly kjToKcal: readonly { readonly input: number; readonly output: number }[];
  readonly drinkLabel: readonly {
    readonly name: string;
    readonly input: Beverage;
    readonly output: { source: 'label' | 'calculated'; labelIgnored: boolean; kcalKnown: boolean };
  }[];
  readonly confidenceOf: readonly {
    readonly input: NutritionSource;
    readonly output: Confidence;
  }[];
  readonly recipeConfidence: readonly {
    readonly input: readonly NutritionSource[];
    readonly output: Confidence;
  }[];
}

/** The live outputs of the core functions validators call or restate, for the inputs of `vectors`. */
export function computeGoldenVectors(vectors: GoldenVectors): GoldenVectors {
  const length = (w: EatingWindow): WindowLengthOutput => {
    try {
      const { eatingMinutes, fastingMinutes, ratio } = windowLength(w);
      return { eatingMinutes, fastingMinutes, ratio };
    } catch {
      return 'refused';
    }
  };
  return {
    windowLength: vectors.windowLength.map(({ input }) => ({ input, output: length(input) })),
    kjToKcal: vectors.kjToKcal.map(({ input }) => ({ input, output: kjToKcal(input) })),
    drinkLabel: vectors.drinkLabel.map(({ name, input }) => {
      const s = standardDrinks(input);
      return {
        name,
        input,
        output: {
          source: s.source,
          labelIgnored: s.labelIgnored,
          kcalKnown: drinkEnergy(input).kcal !== null,
        },
      };
    }),
    confidenceOf: vectors.confidenceOf.map(({ input }) => ({ input, output: confidenceOf(input) })),
    recipeConfidence: vectors.recipeConfidence.map(({ input }) => ({
      input,
      output: recipeConfidence(input),
    })),
  };
}

const LABEL_330_5 = { volumeMl: 330, abvPercent: 5, standardDrinks: 1.3, kcal: 94 };

/**
 * GOLDEN_VECTORS[n] pins the outputs validators rely on: the eating-window rule (targets,
 * plan_days), the label-energy provenance rule (kJ to kcal), the drinks label rules, and the
 * confidence rules (recipes, food_log). A behaviour change fails the test until a new version is
 * added whose migration recomputes the derived fields it affects.
 */
export const GOLDEN_VECTORS: Readonly<Record<number, GoldenVectors>> = Object.freeze({
  1: {
    windowLength: [
      // Every preset window (FASTING_PRESETS), then the boundaries the validators rely on.
      {
        input: { start: '11:00', end: '19:00' },
        output: { eatingMinutes: 480, fastingMinutes: 960, ratio: '16:8' },
      },
      {
        input: { start: '13:00', end: '19:00' },
        output: { eatingMinutes: 360, fastingMinutes: 1080, ratio: '18:6' },
      },
      {
        input: { start: '15:00', end: '19:00' },
        output: { eatingMinutes: 240, fastingMinutes: 1200, ratio: '20:4' },
      },
      {
        input: { start: '17:00', end: '19:00' },
        output: { eatingMinutes: 120, fastingMinutes: 1320, ratio: '22:2' },
      },
      {
        input: { start: '18:00', end: '19:00' },
        output: { eatingMinutes: 60, fastingMinutes: 1380, ratio: '23:1' },
      },
      {
        input: { start: '00:01', end: '00:00' },
        output: { eatingMinutes: 1439, fastingMinutes: 1, ratio: null },
      },
      {
        input: { start: '23:00', end: '01:00' },
        output: { eatingMinutes: 120, fastingMinutes: 1320, ratio: '22:2' },
      },
      { input: { start: '18:01', end: '19:00' }, output: 'refused' },
      { input: { start: '19:00', end: '19:00' }, output: 'refused' },
    ],
    kjToKcal: [
      { input: 0, output: 0 },
      { input: 393, output: 93.92925430210325 },
      { input: 20920, output: 5000 },
    ],
    drinkLabel: [
      {
        name: 'label applies',
        input: { volumeMl: 330, abvPercent: 5, label: LABEL_330_5 },
        output: { source: 'label', labelIgnored: false, kcalKnown: true },
      },
      {
        name: 'volume edited',
        input: { volumeMl: 440, abvPercent: 5, label: LABEL_330_5 },
        output: { source: 'calculated', labelIgnored: true, kcalKnown: false },
      },
      {
        name: 'ABV edited',
        input: { volumeMl: 330, abvPercent: 4, label: LABEL_330_5 },
        output: { source: 'calculated', labelIgnored: true, kcalKnown: false },
      },
      {
        name: 'printed figure null',
        input: {
          volumeMl: 330,
          abvPercent: 5,
          label: { volumeMl: 330, abvPercent: 5, standardDrinks: null, kcal: 94 },
        },
        output: { source: 'calculated', labelIgnored: false, kcalKnown: true },
      },
    ],
    confidenceOf: [
      { input: 'label', output: 'label' },
      { input: 'nz-fcdb', output: 'database' },
      { input: 'usda', output: 'database' },
      { input: 'estimate', output: 'estimate' },
    ],
    recipeConfidence: [
      { input: ['label'], output: 'database' },
      { input: ['nz-fcdb'], output: 'database' },
      { input: ['usda'], output: 'database' },
      { input: ['estimate'], output: 'estimate' },
      { input: ['label', 'nz-fcdb', 'usda'], output: 'database' },
      { input: ['label', 'estimate'], output: 'estimate' },
      { input: ['usda', 'estimate', 'nz-fcdb'], output: 'estimate' },
    ],
  },
});
