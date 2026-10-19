/**
 * Populate and runUpgrade, the two scopes Dexie runs in its versionchange transaction (storage
 * spec sections 6, 9.3 and 8.5; D14, D15). The validation middleware skips that transaction, so
 * both validate explicitly. Both are synchronous scopes: they issue Dexie requests in order and
 * return them, chaining only on Dexie requests, with no await, try or catch (the txScope scan,
 * tools/scans/txScope.ts, checks this). An error thrown inside aborts the versionchange
 * transaction, so the database stays at its old version, untouched.
 */
import {
  chainInfo,
  checkInvariants,
  checkMigrationResult,
  checkRow,
  type InvariantSnapshot,
  type LooseSnapshot,
  type Migration,
  migrationAuditRow,
  type MigrationEnv,
  populateRows,
  primaryKeyOf,
  type TableSpecs,
  updateNoticeTrigger,
  validateRow,
} from '@diet/core';
import Dexie, { type Transaction } from 'dexie';
import type { StorageEnv } from './env';

/**
 * The rows of a new database (section 6), validated against the chain's last specs before
 * writing. It also runs again after delete-all, when the fresh database is created.
 *
 * @transactionScope
 */
export function populate(tx: Transaction, env: StorageEnv, specs: TableSpecs): unknown {
  const rows = populateRows({ now: env.now(), randomId: () => env.randomId() });
  const writes = Object.entries(rows).map(([name, list]) =>
    tx.table(name).bulkAdd(list.map((row: unknown) => validateRow(name, row, specs))),
  );
  return Dexie.Promise.all(writes);
}

export interface UpgradeOptions {
  /** The step to run (Dexie calls this for each version above the installed one). */
  readonly step: Migration;
  /** The whole chain, so the last step knows the current version's specs and store lists. */
  readonly chain: readonly Migration[];
  readonly env: MigrationEnv;
}

/**
 * One migration step inside Dexie's upgrade transaction (section 9.3):
 * 1. Read the step's reads and rewrites (on the last step, every store of the new version).
 * 2. Apply the pure, synchronous step, and check its result (checkMigrationResult): every store
 *    it rewrites, and on the last step every backed-up store, must come back; no store may lose
 *    rows the step does not declare it removes; a store it does not rewrite must come back as it
 *    was. A step that breaks this throws, so a bug can never empty a store (upgrade-failed). Each
 *    MigrationChange becomes an audit row (kind 'migration'), and the update-notice card is
 *    marked shown for the new version.
 * 3. On the last step only: validate every backed-up row against the current specs and check the
 *    invariants; a failing backed-up row throws, so the upgrade fails and nothing changes
 *    (upgrade-failed). A failing device-only row is deleted instead: the pairing or photo can be
 *    made again, and blocking the app over one would do more harm.
 * 4. Write back only the stores the step rewrites (clear, then bulkAdd; structured clone keeps
 *    CryptoKeys and ArrayBuffers), the new audit rows and the device-only deletions.
 *
 * @transactionScope
 */
export function runUpgrade(tx: Transaction, options: UpgradeOptions): Promise<unknown> {
  const { step, chain, env } = options;
  const info = chainInfo(chain);
  const isLast = step.version === info.schemaVersion;
  const stores = info.storeNamesByVersion[step.version] ?? [];
  const names = isLast ? stores : [...new Set([...step.reads, ...step.rewrites])];
  return Dexie.Promise.all(names.map((name) => tx.table(name).toArray())).then((lists) => {
    const read: LooseSnapshot = Object.fromEntries(names.map((name, i) => [name, lists[i] ?? []]));
    const result =
      step.upgrade === null ? { snapshot: read, changes: [] } : step.upgrade(read, env);
    checkMigrationResult(
      step,
      read,
      result,
      isLast ? (info.backupTablesByVersion[step.version] ?? []) : [],
    );
    const auditRows = result.changes.map((change) => migrationAuditRow(change, env));
    const noticeRows = result.changes.length > 0 ? [updateNoticeRow(info.schemaVersion, env)] : [];
    const deviceOnlyDeletes = isLast
      ? lastStepCheck(
          result.snapshot,
          auditRows,
          noticeRows,
          info.specsByVersion[step.version] ?? {},
          {
            backup: info.backupTablesByVersion[step.version] ?? [],
            deviceOnly: info.deviceOnlyTablesByVersion[step.version] ?? [],
          },
        )
      : [];
    const writes: Promise<unknown>[] = [];
    for (const name of step.rewrites) {
      writes.push(
        tx.table(name).clear(),
        tx.table(name).bulkAdd(result.snapshot[name] as unknown[]),
      );
    }
    if (auditRows.length > 0) writes.push(tx.table('audit').bulkAdd(auditRows));
    if (noticeRows.length > 0) writes.push(tx.table('card_state').bulkPut(noticeRows));
    for (const { table, keys } of deviceOnlyDeletes) writes.push(tx.table(table).bulkDelete(keys));
    return Dexie.Promise.all(writes);
  });
}

/** The update-notice card, marked shown, after an upgrade that changed stored values (section 9.2). */
function updateNoticeRow(version: number, env: MigrationEnv): Record<string, unknown> {
  return {
    cardId: 'update-notice',
    trigger: updateNoticeTrigger(version),
    firstShownAt: env.now,
    dismissedAt: null,
    dismissedTimeZone: null,
    doneAt: null,
  };
}

const sameCard = (a: unknown, b: unknown): boolean =>
  (a as { cardId: unknown }).cardId === (b as { cardId: unknown }).cardId &&
  (a as { trigger: unknown }).trigger === (b as { trigger: unknown }).trigger;

/**
 * Step 3 of runUpgrade, pure: throws on a failing backed-up row or invariant, and returns the
 * primary keys of device-only rows to delete (a failing row, or a photo whose garden row is gone).
 */
function lastStepCheck(
  snapshot: LooseSnapshot,
  auditRows: readonly unknown[],
  noticeRows: readonly unknown[],
  specs: TableSpecs,
  lists: { readonly backup: readonly string[]; readonly deviceOnly: readonly string[] },
): { table: string; keys: unknown[] }[] {
  const checked: Record<string, unknown[]> = {};
  for (const name of lists.backup) {
    const extra = name === 'audit' ? auditRows : [];
    const rows = [...(snapshot[name] ?? []), ...extra];
    checked[name] = rows.map((row) => validateRow(name, row, specs));
  }
  if (noticeRows.length > 0) {
    // An earlier step of the same upgrade may already have written the notice.
    const cards = (checked['card_state'] ?? []).filter(
      (c) => !noticeRows.some((n) => sameCard(c, n)),
    );
    checked['card_state'] = [
      ...cards,
      ...noticeRows.map((row) => validateRow('card_state', row, specs)),
    ];
  }
  checkInvariants(checked as unknown as InvariantSnapshot);
  const gardenIds = new Set((checked['garden'] ?? []).map((row) => (row as { id: unknown }).id));
  const deletes: { table: string; keys: unknown[] }[] = [];
  for (const name of lists.deviceOnly) {
    const spec = specs[name];
    if (spec === undefined) continue;
    const keys = (snapshot[name] ?? [])
      .filter((row) => {
        if (!checkRow(name, row, specs).ok) return true;
        return name === 'garden_photos' && !gardenIds.has((row as { gardenId: unknown }).gardenId);
      })
      .map((row) => primaryKeyOf(spec, row)[0]);
    if (keys.length > 0) deletes.push({ table: name, keys });
  }
  return deletes;
}
