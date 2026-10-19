/**
 * The validation middleware (storage spec section 7.3; D10, D28). A DBCore middleware that runs
 * validateRow on every value of every `add` and `put`, so even a raw `db.weights.put(bad)` fails.
 * It is defence in depth: repositories already prepare and validate every row.
 *
 * - A `put` must carry full values: Dexie 4 can send partial updates (Table.update,
 *   Collection.modify, Table.upsert), and repositories never use them, so any such put is refused.
 * - kickstart_checks allows only `add` and an unbounded `deleteRange` (a clear, used by import and
 *   upgrade), so checks are append-only even for raw writes. kickstart_periods refuses a keyed
 *   `delete` and a bounded `deleteRange`.
 * - Requests in a `versionchange` transaction are skipped: migration steps write intermediate
 *   shapes, and runUpgrade and populate validate explicitly instead (section 9).
 * - It is synchronous and never checks the write gate, because import, upgrade and delete-all must
 *   still run after the gate has closed.
 */
import { type TableSpecs, validateRow } from '@diet/core';
import type { DBCore, DBCoreMutateRequest, DBCoreRangeType, DBCoreTable, Middleware } from 'dexie';
import { StorageOperationError } from './errors';

/** DBCoreRangeType.Any: the range a Table.clear() sends (a const enum, so written as its value). */
const RANGE_ANY = 3 as DBCoreRangeType;

const inVersionChange = (request: DBCoreMutateRequest): boolean =>
  (request.trans as unknown as { mode?: unknown }).mode === 'versionchange';

/** Why the request is refused, or null when it may go ahead. Throws a StorageValidationError for a bad row. */
export function refusal(
  table: string,
  request: DBCoreMutateRequest,
  specs: TableSpecs,
): Error | null {
  if (request.type === 'put') {
    // Dexie sends changeSpec as an object, or false for a function modify.
    const changeSpec: unknown = request.changeSpec;
    const partial =
      request.updates !== undefined ||
      (changeSpec !== undefined && changeSpec !== null) ||
      request.criteria !== undefined;
    if (partial) return new StorageOperationError(table, 'a partial update');
  }
  if (table === 'kickstart_checks') {
    const clear = request.type === 'deleteRange' && request.range.type === RANGE_ANY;
    if (request.type !== 'add' && !clear) return new StorageOperationError(table, request.type);
  }
  if (table === 'kickstart_periods') {
    if (request.type === 'delete') return new StorageOperationError(table, 'delete');
    if (request.type === 'deleteRange' && request.range.type !== RANGE_ANY) {
      return new StorageOperationError(table, 'deleteRange');
    }
  }
  if (request.type === 'add' || request.type === 'put') {
    for (const value of request.values) validateRow(table, value, specs);
  }
  return null;
}

function validatingTable(table: DBCoreTable, specs: TableSpecs): DBCoreTable {
  return {
    ...table,
    mutate: (request) => {
      if (inVersionChange(request)) return table.mutate(request);
      let refused: Error | null;
      try {
        refused = refusal(table.name, request, specs);
      } catch (error) {
        refused = error instanceof Error ? error : new StorageOperationError(table.name, 'a write');
      }
      return refused === null ? table.mutate(request) : Promise.reject(refused);
    },
  };
}

/** The middleware, validating against `specs` (the current version's, or a test chain's last). */
export function validationMiddleware(specs: TableSpecs): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'diet-validation',
    create: (down) => ({
      ...down,
      table: (name) => validatingTable(down.table(name), specs),
    }),
  };
}
