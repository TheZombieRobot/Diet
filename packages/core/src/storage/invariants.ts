/**
 * Cross-record rules (storage spec section 5). Checked on import, after a migration and in the
 * export self-check; on write, the repository checks the affected rule inside its read-write
 * transaction. Pure. Rules inside one record are part of validateRow, not of this list.
 *
 * Soft references (beverageId, recipeId, ingredientId, refId, templateId, exerciseId,
 * dislikeIngredientIds, substitutes, derivedFromRecipeId, ingredient_overrides.seedId,
 * hiddenSeedIds, period:<Id> triggers and audit.recordId) are deliberately not checked: seed
 * datasets change between versions and presets can be deleted. Consumers treat a missing target as
 * unknown, and for allergens unknown is never safe.
 */
import { cardTrigger } from './cards';
import {
  effectiveDays,
  effectiveLastDay,
  extensionsOf,
  extensionWindow,
  inWindow,
  periodDay1,
  recordLocalDate,
  scheduledLastDay,
} from './kickstart';
import { KICKSTART_MAX_EXTENSIONS, KICKSTART_MAX_TOTAL_DAYS } from './limits';
import type {
  GardenPhotoRecord,
  KickstartCheckRecord,
  Snapshot,
  TransferPairingRecord,
} from './records';
import { primaryKeyString, TABLES } from './tables';

export const INVARIANT_RULES = Object.freeze([
  'singleton',
  'unique-key',
  'fast-running',
  'fast-overlap',
  'weight-onboarding',
  'kickstart-check-period',
  'kickstart-overlap',
  'kickstart-end',
  'kickstart-check-window',
  'kickstart-stop-sign',
  'kickstart-extensions',
  'kickstart-days',
  'card-trigger',
  'garden-photo',
] as const);
export type InvariantRule = (typeof INVARIANT_RULES)[number];

/** Carries only the rule id: no values, no record keys, no cause (section 2.3). */
export class StorageInvariantError extends Error {
  readonly rule: InvariantRule;

  constructor(rule: InvariantRule) {
    super(`The records do not fit together: ${rule}`);
    this.rule = rule;
  }
}
StorageInvariantError.prototype.name = 'StorageInvariantError';

/** A snapshot of the backed-up stores, with the device-only stores when the caller has them. */
export type InvariantSnapshot = Snapshot & {
  readonly garden_photos?: readonly GardenPhotoRecord[];
  readonly transfer_pairings?: readonly TransferPairingRecord[];
};

const byStart =
  <T extends { readonly id: string }>(at: (row: T) => string) =>
  (a: T, b: T) =>
    at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** The first section 5 rule the snapshot breaks, or null. */
export function findInvariantViolation(snapshot: InvariantSnapshot): InvariantRule | null {
  // 1. Singletons.
  for (const rows of [snapshot.profile, snapshot.targets, snapshot.settings]) {
    if (rows.length !== 1 || rows[0]?.id !== 'singleton') return 'singleton';
  }

  // 2. Unique primary keys: a duplicate is refused, never "last copy wins".
  for (const [name, rows] of Object.entries(snapshot) as [
    keyof typeof TABLES,
    readonly unknown[] | undefined,
  ][]) {
    if (rows === undefined || !Object.hasOwn(TABLES, name)) continue;
    const keys = new Set(rows.map((row) => primaryKeyString(TABLES[name], row)));
    if (keys.size !== rows.length) return 'unique-key';
  }

  // 3. Fasts: at most one running, and it is the latest; no overlap.
  const fasts = [...snapshot.fasts].sort(byStart((f) => f.startedAt));
  const running = fasts.filter((f) => f.endedAt === null);
  if (running.length > 1 || (running.length === 1 && fasts.at(-1)?.endedAt !== null))
    return 'fast-running';
  for (let i = 1; i < fasts.length; i++) {
    const previousEnd = fasts[i - 1]?.endedAt ?? null;
    const start = fasts[i]?.startedAt ?? '';
    if (previousEnd !== null && start < previousEnd) return 'fast-overlap';
  }

  // 4. Weights: at most one onboarding row.
  if (snapshot.weights.filter((w) => w.source === 'onboarding').length > 1)
    return 'weight-onboarding';

  // 5. Kickstart (section 4.5).
  const home = snapshot.settings[0]?.homeTimeZone;
  const periods = [...snapshot.kickstart_periods].sort(byStart((p) => p.startedAt));
  const periodIds = new Set(periods.map((p) => p.id));
  if (snapshot.kickstart_checks.some((c) => !periodIds.has(c.periodId)))
    return 'kickstart-check-period';
  // Checks grouped by period once, so a large (or doctored) history stays linear to check.
  const checksByPeriod = new Map<string, KickstartCheckRecord[]>();
  for (const check of snapshot.kickstart_checks) {
    const list = checksByPeriod.get(check.periodId) ?? [];
    list.push(check);
    checksByPeriod.set(check.periodId, list);
  }
  const extensionCount = (periodId: string) =>
    extensionsOf(periodId, checksByPeriod.get(periodId) ?? []);
  let totalDays = 0;
  let totalExtensions = 0;
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    if (period === undefined) continue;
    const extensions = extensionCount(period.id);
    const previous = periods[i - 1];
    if (previous !== undefined) {
      const previousLast = effectiveLastDay(previous, extensionCount(previous.id), home);
      if (!(periodDay1(period, home) > previousLast)) return 'kickstart-overlap';
    }
    if (period.endedAt !== null) {
      // On or before the scheduled last day, read both where it ended and in its start zone, so
      // an end written after the natural end in either zone is refused (D27).
      const last = scheduledLastDay(period, extensions, home);
      const endedThere = recordLocalDate(period.endedAt, period.endedTimeZone, home);
      const endedAtStart = recordLocalDate(period.endedAt, period.timeZone, home);
      if (endedThere > last || endedAtStart > last) return 'kickstart-end';
    }
    const checks = [...(checksByPeriod.get(period.id) ?? [])].sort(byStart((c) => c.askedAt));
    let earlierExtensions = 0;
    for (let j = 0; j < checks.length; j++) {
      const check = checks[j];
      if (check === undefined) continue;
      const asked = recordLocalDate(check.askedAt, check.timeZone, home);
      if (!inWindow(asked, extensionWindow(period, earlierExtensions, home)))
        return 'kickstart-check-window';
      if (period.endedAt !== null && !(check.askedAt < period.endedAt))
        return 'kickstart-check-window';
      if (check.outcome === 'stop-sign' && j !== checks.length - 1) return 'kickstart-stop-sign';
      if (check.outcome === 'extended') earlierExtensions += 1;
    }
    totalExtensions += extensions;
    totalDays += effectiveDays(period, extensions, home);
  }
  if (totalExtensions > KICKSTART_MAX_EXTENSIONS) return 'kickstart-extensions';
  if (totalDays > KICKSTART_MAX_TOTAL_DAYS) return 'kickstart-days';

  // 6. Card state: every (cardId, trigger) pair is registered.
  if (snapshot.card_state.some((c) => cardTrigger(c.cardId, c.trigger) === null))
    return 'card-trigger';

  // 7. Garden photos (write path only; never imported): the garden row exists.
  if (snapshot.garden_photos !== undefined) {
    const gardenIds = new Set(snapshot.garden.map((g) => g.id));
    if (snapshot.garden_photos.some((p) => !gardenIds.has(p.gardenId))) return 'garden-photo';
  }
  return null;
}

/** Throws a StorageInvariantError naming the first rule the snapshot breaks. */
export function checkInvariants(snapshot: InvariantSnapshot): void {
  const rule = findInvariantViolation(snapshot);
  if (rule !== null) throw new StorageInvariantError(rule);
}
