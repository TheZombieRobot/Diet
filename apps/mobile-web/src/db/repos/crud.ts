/**
 * The generic repository (storage spec sections 8.2 to 8.4; D46). One per store, limited to the
 * operations TABLES[store].ops lists: anything else is refused with StorageOperationError.
 *
 * - create(input) assigns the id and the repository-maintained timestamps, and uses `add`, so a
 *   duplicate key fails.
 * - update(key, patch) reads, merges, prepares and puts, in one read-write transaction. The key and
 *   createdAt always come from the stored row.
 * - Rules that span records (section 5) are checked inside the same transaction, with the rows the
 *   write would leave.
 * Every write prepares its row synchronously (prepare.ts) and goes through the write gate.
 */
import {
  duplicateOnSave,
  type GenericOp,
  parseInstant,
  StorageInvariantError,
  type StoreName,
  type StoreRecords,
  TABLES,
} from '@diet/core';
import Dexie, { type IndexableType, type Table } from 'dexie';
import type { DietDb } from '../db';
import type { StorageEnv } from '../env';
import { StorageOperationError, StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { ALCOHOL_ACCESS_STORES, type AlcoholStore, checkAlcoholAccess } from './alcoholAccess';
import { guardedWrite, type KeyOfStore, type RepoContext, storesViolation } from './context';

/**
 * A store's table by its name. Kept in this file, which may reach any store (item 19's
 * device-only scan, DEVICE_ONLY_ALLOWED_FILES), and not exported: every other file names its
 * store through a repository.
 */
function tableOf<K extends StoreName>(db: DietDb, name: K): Table<StoreRecords[K], KeyOfStore<K>> {
  return db.table<StoreRecords[K], KeyOfStore<K>>(name);
}

/** Fields the repository always sets itself (section 8.4); callers never pass them. */
interface AssignedFields {
  profile: 'id' | 'createdAt' | 'updatedAt';
  readiness: 'wordingVersion' | 'answeredAt';
  targets: 'id' | 'updatedAt';
  settings: 'id';
  kickstart_periods: 'startedAt' | 'timeZone' | 'endedAt' | 'endedTimeZone';
  kickstart_checks: 'askedAt' | 'timeZone' | 'outcome';
  weights: never;
  fasts: never;
  symptom_log: never;
  water_log: never;
  steps_log: 'updatedAt';
  ingredients: 'createdAt' | 'updatedAt';
  ingredient_overrides: 'createdAt' | 'updatedAt';
  recipes: 'createdAt' | 'updatedAt';
  plan_days: 'updatedAt';
  food_log: never;
  garden: 'updatedAt';
  garden_photos: never;
  pantry: 'updatedAt';
  sessions: 'completedAt' | 'timeZone';
  beverages: 'createdAt' | 'updatedAt';
  drinks_log: 'stdDrinksPerServe' | 'stdSource' | 'kcalPerServe';
  alcohol_day_notes: 'enteredAt' | 'timeZone' | 'updatedAt';
  alcohol_milestones: 'createdAt';
  grocery_lists: 'createdAt' | 'updatedAt' | 'version';
  transfer_pairings: never;
  card_state: never;
  audit: never;
}

/** Fields the repository fills in when the caller leaves them out (the id; "at and timeZone when left to the repository"). */
interface DefaultedFields {
  profile: never;
  readiness: never;
  targets: never;
  settings: never;
  kickstart_periods: 'id';
  kickstart_checks: 'id';
  weights: 'id' | 'at' | 'timeZone';
  fasts: 'id';
  symptom_log: 'id' | 'at' | 'timeZone';
  water_log: 'id' | 'at' | 'timeZone';
  steps_log: never;
  ingredients: 'id';
  ingredient_overrides: never;
  recipes: 'id';
  plan_days: never;
  food_log: 'id' | 'at' | 'timeZone';
  garden: 'id';
  garden_photos: never;
  pantry: 'id';
  sessions: 'id';
  beverages: 'id';
  drinks_log: 'id' | 'at' | 'timeZone';
  alcohol_day_notes: never;
  alcohol_milestones: 'id';
  grocery_lists: 'id';
  transfer_pairings: never;
  card_state: never;
  audit: 'id' | 'at' | 'timeZone';
}

/** The primary-key fields of each store (section 4.2). */
interface KeyFields {
  profile: 'id';
  readiness: 'questionId';
  targets: 'id';
  settings: 'id';
  kickstart_periods: 'id';
  kickstart_checks: 'id';
  weights: 'id';
  fasts: 'id';
  symptom_log: 'id';
  water_log: 'id';
  steps_log: 'date';
  ingredients: 'id';
  ingredient_overrides: 'seedId';
  recipes: 'id';
  plan_days: 'date';
  food_log: 'id';
  garden: 'id';
  garden_photos: 'gardenId';
  pantry: 'id';
  sessions: 'id';
  beverages: 'id';
  drinks_log: 'id';
  alcohol_day_notes: 'date';
  alcohol_milestones: 'id';
  grocery_lists: 'id';
  transfer_pairings: 'id';
  card_state: 'cardId' | 'trigger';
  audit: 'id';
}

export type CreateInput<K extends StoreName> = Omit<
  StoreRecords[K],
  AssignedFields[K] | DefaultedFields[K]
> &
  Partial<Pick<StoreRecords[K], DefaultedFields[K] & keyof StoreRecords[K]>>;

export type UpdatePatch<K extends StoreName> = Partial<
  Omit<StoreRecords[K], AssignedFields[K] | KeyFields[K]>
>;

export interface CrudRepo<K extends StoreName> {
  readonly create: (input: CreateInput<K>) => Promise<StoreRecords[K]>;
  readonly get: (key: KeyOfStore<K>) => Promise<StoreRecords[K] | undefined>;
  readonly list: () => Promise<StoreRecords[K][]>;
  /** Rows whose `index` lies in [lower, upper], in index order. */
  readonly listByIndex: (
    index: string,
    lower: IndexableType,
    upper: IndexableType,
  ) => Promise<StoreRecords[K][]>;
  readonly update: (key: KeyOfStore<K>, patch: UpdatePatch<K>) => Promise<StoreRecords[K]>;
  readonly remove: (key: KeyOfStore<K>) => Promise<void>;
}

type Row = Record<string, unknown>;

const AT_STORES: ReadonlySet<string> = new Set([
  'weights',
  'symptom_log',
  'water_log',
  'food_log',
  'drinks_log',
  'audit',
]);
const UPDATED_AT_STORES: ReadonlySet<string> = new Set([
  'profile',
  'targets',
  'steps_log',
  'ingredients',
  'ingredient_overrides',
  'recipes',
  'plan_days',
  'garden',
  'pantry',
  'beverages',
  'alcohol_day_notes',
  'grocery_lists',
]);
const CREATED_AT_STORES: ReadonlySet<string> = new Set([
  'ingredients',
  'ingredient_overrides',
  'recipes',
  'beverages',
  'alcohol_milestones',
  'grocery_lists',
]);

/** The repository-maintained fields of a new row (section 8.4). */
export function stampCreate(table: StoreName, input: Row, env: StorageEnv): Row {
  const now = env.now();
  const row: Row = { ...input };
  const [key] = TABLES[table].key;
  if (key === 'id' && row['id'] === undefined) row['id'] = env.randomId();
  if (AT_STORES.has(table)) {
    if (row['at'] === undefined) row['at'] = now;
    if (row['timeZone'] === undefined) row['timeZone'] = env.timeZone();
  }
  if (CREATED_AT_STORES.has(table)) row['createdAt'] = now;
  if (UPDATED_AT_STORES.has(table)) row['updatedAt'] = now;
  if (table === 'grocery_lists') row['version'] = 1;
  if (table === 'alcohol_day_notes') {
    row['enteredAt'] = now;
    row['timeZone'] = env.timeZone();
  }
  if (table === 'sessions') stampSession(row, null, env);
  return row;
}

/** completedAt and its zone are set when the status becomes done, and cleared otherwise. */
function stampSession(row: Row, previous: Row | null, env: StorageEnv): void {
  if (row['status'] !== 'done') {
    row['completedAt'] = null;
    row['timeZone'] = null;
  } else if (previous?.['status'] !== 'done') {
    row['completedAt'] = env.now();
    row['timeZone'] = env.timeZone();
  }
}

/** The merged row of an update, with the repository-maintained fields (section 8.4). */
export function stampUpdate(table: StoreName, previous: Row, patch: Row, env: StorageEnv): Row {
  const row: Row = { ...previous, ...patch };
  for (const key of TABLES[table].key) row[key] = previous[key];
  if (Object.hasOwn(previous, 'createdAt')) row['createdAt'] = previous['createdAt'];
  if (UPDATED_AT_STORES.has(table)) row['updatedAt'] = env.now();
  if (table === 'grocery_lists') {
    row['version'] = Number(previous['version']) + 1;
    // A list's last change never moves backwards, even with the clock set back: it is the time
    // garden and pantry stock is re-checked against (item 24 J34; item 19 G18).
    if (parseInstant(String(row['updatedAt'])) < parseInstant(String(previous['updatedAt']))) {
      row['updatedAt'] = previous['updatedAt'];
    }
  }
  if (table === 'alcohol_day_notes') {
    row['enteredAt'] = previous['enteredAt'];
    row['timeZone'] = previous['timeZone'];
  }
  if (table === 'sessions') stampSession(row, previous, env);
  // A new time with no zone of its own takes the current device zone (section 3.1).
  const zoneOf: readonly (readonly [string, string])[] = [
    ['at', 'timeZone'],
    ['startedAt', 'timeZone'],
    ['endedAt', 'endedTimeZone'],
  ];
  for (const [time, zone] of zoneOf) {
    if (Object.hasOwn(patch, time) && !Object.hasOwn(patch, zone) && Object.hasOwn(row, zone)) {
      row[zone] = row[time] === null ? null : env.timeZone();
    }
  }
  return row;
}

/**
 * Store-specific rules for the generic repository. Their check and onRemove run inside the write
 * transaction, reached through STORE_RULES at run time, so each carries @transactionScope for the
 * transaction-scope scan (tools/scans/txScope.ts).
 */
export interface StoreRules {
  /** Other stores the write transactions must include. */
  readonly with?: readonly StoreName[];
  /** Checks the row a write would leave, inside the transaction; throws to abort. */
  readonly check?: (ctx: RepoContext, row: Row) => PromiseLike<unknown>;
  /** Further requests when a row is removed (garden: its photo). */
  readonly onRemove?: (ctx: RepoContext, key: unknown) => PromiseLike<unknown>;
}

/** Section 5 rule 4: at most one onboarding weight. */
const weightRules: StoreRules = {
  /** @transactionScope */
  check: ({ db }, row) =>
    db.weights.toArray().then((rows) => {
      if (row['source'] !== 'onboarding') return;
      if (rows.some((w) => w.id !== row['id'] && w.source === 'onboarding')) {
        throw new StorageInvariantError('weight-onboarding');
      }
    }),
};

/** Section 5 rule 3: at most one running fast, the latest, and no overlap. */
const fastRules: StoreRules = {
  /** @transactionScope */
  check: ({ db }, row) =>
    db.fasts.toArray().then((rows) => {
      const fasts = [
        ...rows.filter((f) => f.id !== row['id']),
        row as unknown as StoreRecords['fasts'],
      ];
      const rule = storesViolation({ fasts });
      if (rule !== null) throw new StorageInvariantError(rule);
    }),
};

/**
 * Item 19 (G17): one row per crop and one per pantry item, by food or by name, whoever writes. A
 * new row, or an edit that changes the name or the link, is refused when it would make a pair; a
 * pair that exists already (an old backup) stays editable. `rows` still holds the stored version
 * of an edited row, since the check runs before the put.
 */
function refuseDuplicate(
  table: 'garden' | 'pantry',
  rows: readonly StoreRecords['garden' | 'pantry'][],
  row: Row,
): void {
  const candidate = row as unknown as StoreRecords['garden' | 'pantry'];
  const previous = rows.find((r) => r.id === candidate.id) ?? null;
  if (duplicateOnSave(rows, candidate, previous) !== null) {
    throw new StorageRuleError(table, 'duplicate');
  }
}

/** Removing a garden row removes its photo in the same transaction (section 8.2). */
const gardenRules: StoreRules = {
  with: ['garden_photos'],
  /** @transactionScope */
  check: ({ db }, row) =>
    db.garden.toArray().then((rows) => {
      refuseDuplicate('garden', rows, row);
    }),
  /** @transactionScope */
  onRemove: ({ db }, key) => db.garden_photos.delete(String(key)),
};

const pantryRules: StoreRules = {
  /** @transactionScope */
  check: ({ db }, row) =>
    db.pantry.toArray().then((rows) => {
      refuseDuplicate('pantry', rows, row);
    }),
};

/**
 * Item 28 (HS-20, RD-01; design 5.3): no milestone before the alcohol notice or while alcohol
 * logging is off, and no preset or next-day note before the notice. Removing is never checked.
 */
const alcoholRules = (table: AlcoholStore, rule: 'notice' | 'notice-and-age'): StoreRules => ({
  with: ALCOHOL_ACCESS_STORES,
  /** @transactionScope */
  check: (ctx) => checkAlcoholAccess(ctx, table, rule),
});

export const STORE_RULES: Partial<Record<StoreName, StoreRules>> = {
  weights: weightRules,
  fasts: fastRules,
  garden: gardenRules,
  pantry: pantryRules,
  beverages: alcoholRules('beverages', 'notice'),
  alcohol_day_notes: alcoholRules('alcohol_day_notes', 'notice'),
  alcohol_milestones: alcoholRules('alcohol_milestones', 'notice-and-age'),
};

export function assertOp(table: StoreName, op: GenericOp): void {
  if (!TABLES[table].ops.includes(op)) throw new StorageOperationError(table, op);
}

const noCheck = (): PromiseLike<unknown> => Dexie.Promise.resolve();

export function crudRepo<K extends StoreName>(ctx: RepoContext, table: K): CrudRepo<K> {
  const { db, env } = ctx;
  const rules: StoreRules = STORE_RULES[table] ?? {};
  const stores = [table, ...(rules.with ?? [])];
  /** @transactionScope The store's own rule (tagged where STORE_RULES declares it), or none. */
  const check = rules.check ?? noCheck;
  const spec = TABLES[table];

  return {
    create: (input) => {
      assertOp(table, 'create');
      return guardedWrite(ctx, () => {
        const row = prepare(
          table,
          stampCreate(table, input as unknown as Row, env),
          env,
        ) as unknown as Row;
        return db.transaction('rw', stores, () =>
          Dexie.Promise.all([check(ctx, row)])
            .then(() => db.table(table).add(row))
            .then(() => row as unknown as StoreRecords[K]),
        );
      });
    },
    get: (key) => {
      assertOp(table, 'get');
      return tableOf(db, table).get(key);
    },
    list: () => {
      assertOp(table, 'list');
      return tableOf(db, table).toArray();
    },
    listByIndex: (index, lower, upper) => {
      assertOp(table, 'list');
      if (!spec.indexes.includes(index) && !spec.key.includes(index)) {
        throw new StorageOperationError(table, `a query on ${index}`);
      }
      return tableOf(db, table).where(index).between(lower, upper, true, true).toArray();
    },
    update: (key, patch) => {
      assertOp(table, 'update');
      return guardedWrite(ctx, () =>
        db.transaction('rw', stores, () =>
          db
            .table(table)
            .get(key)
            .then((stored: Row | undefined) => {
              if (stored === undefined) throw new StorageRuleError(table, 'not-found');
              const row = prepare(
                table,
                stampUpdate(table, stored, patch as Row, env),
                env,
                stored,
              );
              return Dexie.Promise.all([check(ctx, row as unknown as Row)])
                .then(() => db.table(table).put(row))
                .then(() => row);
            }),
        ),
      );
    },
    remove: (key) => {
      assertOp(table, 'remove');
      return guardedWrite(ctx, () =>
        db.transaction('rw', stores, () =>
          db
            .table(table)
            .delete(key)
            .then(() => (rules.onRemove === undefined ? undefined : rules.onRemove(ctx, key))),
        ),
      ).then(() => undefined);
    },
  };
}
