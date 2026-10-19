/**
 * Row and snapshot validation (storage spec section 2.3; D10, D11).
 *
 * validateRow is a pure function of the value and the code version: it never reads the clock,
 * configuration, Intl's time-zone data, the seed datasets or other records. The database
 * middleware, populate, runUpgrade, import (once with the file's own version's specs and once with
 * the current specs) and the export self-check all use it. Passing TABLES_BY_VERSION[n] validates
 * against that frozen version.
 *
 * Errors carry no values and no record keys, and have no cause: a StorageValidationError has
 * exactly { table, field, rule }, and its message is built only from the table name, the field
 * path, the rule and spec constants (for example "must be 20–400").
 */
import { isFailure, isPlainObject, type StorageRule, type TableSpecs } from './primitives';
import type { StoreName, StoreRecords } from './records';
import { TABLES } from './tables';

export class StorageValidationError extends Error {
  readonly table: string;
  /** A path inside the row, such as "beverage.label.kcal" ("" for the row itself). */
  readonly field: string;
  readonly rule: StorageRule;

  constructor(table: string, field: string, rule: StorageRule, allowed: string | null = null) {
    const where = field === '' ? table : `${table}.${field}`;
    super(`${where} failed ${rule}${allowed === null ? '' : ` (must be ${allowed})`}`);
    this.table = table;
    this.field = field;
    this.rule = rule;
  }
}
StorageValidationError.prototype.name = 'StorageValidationError';

export type RowCheck =
  | { readonly ok: true; readonly row: unknown }
  | {
      readonly ok: false;
      readonly field: string;
      readonly rule: StorageRule;
      readonly allowed: string | null;
    };

/** validateRow without throwing: the new row, or the failing field, rule and allowed range. */
export function checkRow(table: string, value: unknown, specs: TableSpecs = TABLES): RowCheck {
  const spec = Object.hasOwn(specs, table) ? specs[table] : undefined;
  if (spec === undefined) return { ok: false, field: '', rule: 'enum', allowed: null };
  const result = spec.row.check(value, '');
  if (isFailure(result))
    return { ok: false, field: result.field, rule: result.rule, allowed: result.allowed };
  return { ok: true, row: result };
}

/**
 * Structural and safety rules of one row (types, formats, ranges, enums and the rules inside one
 * record). Returns a new row built from the allowed fields only, in spec order, or throws a
 * StorageValidationError.
 */
export function validateRow<T extends StoreName>(table: T, value: unknown): StoreRecords[T];
export function validateRow(table: string, value: unknown, specs: TableSpecs): unknown;
export function validateRow(table: string, value: unknown, specs: TableSpecs = TABLES): unknown {
  const result = checkRow(table, value, specs);
  if (!result.ok)
    throw new StorageValidationError(table, result.field, result.rule, result.allowed);
  return result.row;
}

/**
 * Validates every row of every table in `tables` (each must be a store in `specs` and an array),
 * and returns a new snapshot of the validated rows. Throws on the first failure. Which tables must
 * be present is the caller's rule (import checks the key set first; section 10.6 step 5).
 */
export function validateSnapshot(
  tables: Readonly<Record<string, unknown>>,
  specs: TableSpecs = TABLES,
): Record<string, unknown[]> {
  if (!isPlainObject(tables)) throw new StorageValidationError('(snapshot)', '', 'type');
  const out: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(tables)) {
    if (!Object.hasOwn(specs, name)) throw new StorageValidationError('(unknown)', '', 'extra-key');
    if (!Array.isArray(rows)) throw new StorageValidationError(name, '', 'type');
    out[name] = (rows as unknown[]).map((row) => validateRow(name, row, specs));
  }
  return out;
}

/**
 * Repository normalisation before validating (section 2.3; D11): every -0 becomes 0; in a Text
 * field line breaks and tabs become one space, other control characters are removed and the
 * result is trimmed; in a Note field Windows line endings become \n, tabs a space, other control
 * characters except \n are removed, the result is trimmed, and an empty note becomes null. Never
 * throws. Import never normalises: a file holding such values is refused.
 */
export function normalizeRow(table: string, value: unknown, specs: TableSpecs = TABLES): unknown {
  const spec = Object.hasOwn(specs, table) ? specs[table] : undefined;
  return spec === undefined ? value : spec.row.normalize(value);
}
