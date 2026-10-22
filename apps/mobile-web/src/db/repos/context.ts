/**
 * What every repository shares (storage spec section 8): the database, the environment, the write
 * gate and the app's hooks; and the guard every write goes through.
 */
import {
  BACKUP_TABLES,
  defaultProfile,
  defaultSettings,
  defaultTargets,
  findInvariantViolation,
  INSTANT_MIN,
  type InvariantRule,
  type InvariantSnapshot,
  type SettingsRecord,
  type Snapshot,
  type StoreName,
} from '@diet/core';
import type { DietDb } from '../db';
import type { StorageEnv } from '../env';
import { mapWriteError } from '../errors';
import type { WriteGate } from '../gate';

export interface RepoHooks {
  /** settings.onboardingCompletedAt was set for the first time (section 12.1; PWA-06). */
  readonly onOnboardingCompleted?: () => void;
}

export interface RepoContext {
  readonly db: DietDb;
  readonly env: StorageEnv;
  readonly gate: WriteGate;
  readonly hooks: RepoHooks;
}

export type KeyOfStore<K extends StoreName> = K extends 'card_state' ? [string, string] : string;

/**
 * Runs a write: the gate first (StorageClosedError before Dexie is touched; section 7.5), then the
 * transaction. Errors are mapped here, outside the transaction scope (section 8.5 rule 2): a full
 * phone becomes StorageFullError (section 7.6).
 */
export async function guardedWrite<T>(ctx: RepoContext, run: () => PromiseLike<T>): Promise<T> {
  ctx.gate.assertOpen();
  try {
    return await run();
  } catch (error) {
    throw mapWriteError(error);
  }
}

/**
 * The first section 5 rule that `stores` break, with every other store empty and default
 * singletons (the settings row when given, for its home zone). Repositories call it inside their
 * read-write transaction with the rows the write would leave, so the write path checks the same
 * rules, in the same code, as import and the export self-check.
 */
export function storesViolation(
  stores: Partial<InvariantSnapshot>,
  settings?: SettingsRecord,
): InvariantRule | null {
  const empty = Object.fromEntries(BACKUP_TABLES.map((name) => [name, []])) as unknown as Snapshot;
  return findInvariantViolation({
    ...empty,
    profile: [defaultProfile(INSTANT_MIN)],
    targets: [defaultTargets(INSTANT_MIN)],
    settings: [settings ?? defaultSettings()],
    ...stores,
  });
}
