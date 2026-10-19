/**
 * Importing a rescue copy record by record (storage spec sections 9.5 and 10.6; D22, D23; the
 * data-loss and health-rules reviews). A rescue copy is made exactly when something does not
 * validate, so it is read as far as it safely can, with these limits:
 *
 * - Kickstart history (kickstart_periods, kickstart_checks) is never set aside: an incomplete
 *   history would count as less Kickstart and reopen the 42-day and 3-extension caps or an offer
 *   after a stop sign (D27, D28). A rescue copy whose Kickstart history fails is refused whole.
 * - A profile, targets or settings row that fails has only its failing fields repaired, and they
 *   are listed: put back to the app's default, or to the cautious value where the default would
 *   loosen something (Kickstart choice off; allergens keep every entry that can be read). A
 *   missing or failing safety setting (the C50 bounds: energy floor, deficits, carb ceilings,
 *   protein, saturated-fat budget, rapid-loss bounds; and the diet mode and alcohol figures), a row
 *   that is not an object, or a store without exactly one row refuses the file.
 * - Other cross-record rules set aside the offending rows in a fixed order and list them; the
 *   Kickstart rules still refuse.
 * - On the phone, a rescue import never makes a safety setting less cautious than the phone or the
 *   file had, and keeps every allergen either side lists (cautiousSafetyMerge, applied by the app
 *   when it plans the write). A phone value that fails its own validator is ignored.
 */
import { cardTrigger } from '../cards';
import type { InvariantRule } from '../invariants';
import { RAPID_LOSS_THRESHOLD_G_PER_WEEK, RAPID_LOSS_WEEKS } from '../limits';
import {
  isFailure,
  isPlainObject,
  type ObjectValidator,
  type TableSpecs,
  type Validator,
} from '../primitives';
import type { ProfileRecord, SettingsRecord, TargetsRecord } from '../records';
import { primaryKeyString, stableStringify, TABLES } from '../tables';
import { checkRow } from '../validate';

/** Stores a rescue import never sets a row aside from (D27, D28). */
export const KICKSTART_HISTORY_TABLES: readonly string[] = Object.freeze([
  'kickstart_periods',
  'kickstart_checks',
]);

export type SingletonTable = 'profile' | 'targets' | 'settings';

/**
 * The safety settings of section 10.6 step 8 (C50), with the diet mode and the alcohol guidance
 * figures (health-rules review). In a rescue copy a missing or failing one refuses the file
 * instead of being put back to its default, which is the least cautious value.
 */
export const SAFETY_SETTING_FIELDS: Readonly<Record<SingletonTable, readonly string[]>> =
  Object.freeze({
    profile: Object.freeze(['dietMode']),
    targets: Object.freeze([
      'proteinRangeG',
      'netCarbCeilingG',
      'moderateNetCarbCeilingG',
      'saturatedFatBudgetPct',
      'kickstartDeficitPct',
      'steadyDeficitPct',
      'energyFloorKj',
    ]),
    settings: Object.freeze([
      'rapidLossThresholdGPerWeek',
      'rapidLossConsecutiveWeeks',
      'rapidLossExplanationReadAt',
      'alcoholGuidanceSet',
    ]),
  });

const isSafetyField = (table: string, field: string): boolean =>
  (table === 'profile' || table === 'targets' || table === 'settings') &&
  SAFETY_SETTING_FIELDS[table].includes(field);

/** The validator of one top-level field of a store, if the spec has it. */
function fieldValidator(
  specs: TableSpecs,
  table: string,
  field: string,
): Validator<unknown> | null {
  const row = specs[table]?.row as ObjectValidator<Record<string, unknown>> | undefined;
  const fields = row?.fields as Readonly<Record<string, Validator<unknown>>> | undefined;
  return fields !== undefined && Object.hasOwn(fields, field) ? (fields[field] ?? null) : null;
}

/** Whether `value` passes the field validator of `table.field` on its own. */
export function fieldValid(
  table: string,
  field: string,
  value: unknown,
  specs: TableSpecs = TABLES,
): boolean {
  const validator = fieldValidator(specs, table, field);
  return validator !== null && !isFailure(validator.check(value, field));
}

/** The entries of an allergen list that can be read, each once, in order (HS-24). */
function readableAllergens(value: unknown, specs: TableSpecs): unknown[] {
  if (!Array.isArray(value)) return [];
  const out: unknown[] = [];
  for (const item of value as unknown[]) {
    if (!out.includes(item) && fieldValid('profile', 'allergens', [...out, item], specs)) {
      out.push(item);
    }
  }
  return out;
}

/**
 * What a failing singleton field of a rescue copy becomes (health-rules review): the app's
 * default, except where the default would loosen something. A failing Kickstart choice becomes
 * "no" (the default is "yes"), and a failing allergen list keeps every entry that can be read,
 * never [] (HS-24).
 */
function repairedValue(
  table: string,
  field: string,
  value: unknown,
  fallback: unknown,
  specs: TableSpecs,
): unknown {
  if (table === 'profile' && field === 'kickstartOptIn') return false;
  if (table === 'profile' && field === 'allergens') return readableAllergens(value, specs);
  return fallback;
}

export type SingletonRepair =
  | { readonly ok: true; readonly row: unknown; readonly replaced: readonly string[] }
  | {
      readonly ok: false;
      readonly field: string;
      readonly rule: string;
      readonly allowed: string | null;
    };

const topField = (path: string): string => path.split(/[.[]/)[0] ?? '';

/**
 * A singleton row of a rescue copy, with each failing field repaired (repairedValue; `defaults`
 * stamped at the file's export time). Refused when the row is not an object, when a safety
 * setting is missing or fails, or when the row still fails after every other field is repaired.
 * Bookkeeping times dated ahead were already put back to the import limit (bookkeeping.ts).
 */
export function repairSingleton(
  table: string,
  value: unknown,
  specs: TableSpecs,
  defaults: Readonly<Record<string, unknown>>,
): SingletonRepair {
  const spec = specs[table];
  const fields = Object.keys(
    ((spec?.row.desc ?? {}) as { fields?: Record<string, unknown> }).fields ?? {},
  );
  if (!isPlainObject(value)) return { ok: false, field: '', rule: 'type', allowed: null };
  const missing = fields.find((f) => isSafetyField(table, f) && !Object.hasOwn(value, f));
  if (missing !== undefined) return { ok: false, field: missing, rule: 'missing', allowed: null };
  const replaced = new Set<string>();
  const candidate: Record<string, unknown> = {};
  for (const field of fields) {
    if (Object.hasOwn(value, field)) candidate[field] = value[field];
    else {
      candidate[field] = repairedValue(table, field, undefined, defaults[field], specs);
      replaced.add(field);
    }
  }
  // Keys the spec does not name are left out (pickByTree already drops them on export).
  let resetAll = false;
  for (let attempt = 0; attempt <= fields.length + 1; attempt++) {
    const result = checkRow(table, candidate, specs);
    if (result.ok) {
      return { ok: true, row: result.row, replaced: fields.filter((f) => replaced.has(f)) };
    }
    const failing = topField(result.field);
    if (failing === '' || isSafetyField(table, failing)) {
      return { ok: false, field: result.field, rule: result.rule, allowed: result.allowed };
    }
    const repair = repairedValue(table, failing, candidate[failing], defaults[failing], specs);
    if (stableStringify(candidate[failing]) !== stableStringify(repair)) {
      candidate[failing] = repair;
      replaced.add(failing);
      continue;
    }
    // A rule across fields still fails with this field repaired: repair every field that is not
    // a safety setting once, then give up.
    if (resetAll) {
      return { ok: false, field: result.field, rule: result.rule, allowed: result.allowed };
    }
    resetAll = true;
    for (const field of fields) {
      if (isSafetyField(table, field)) continue;
      const next = repairedValue(table, field, candidate[field], defaults[field], specs);
      if (stableStringify(candidate[field]) !== stableStringify(next)) {
        candidate[field] = next;
        replaced.add(field);
      }
    }
  }
  return { ok: false, field: '', rule: 'type', allowed: null };
}

/** A row a rescue import sets aside because of a cross-record rule (section 5). */
export interface InvariantSetAside {
  readonly table: string;
  /** Position in the table given to resolveRescueInvariants. */
  readonly position: number;
  readonly rule: InvariantRule;
}

type Rows = readonly unknown[];

const field = (row: unknown, name: string): unknown => (isPlainObject(row) ? row[name] : undefined);
const text = (row: unknown, name: string): string => {
  const v = field(row, name);
  return typeof v === 'string' ? v : '';
};
const byTime =
  (name: string) =>
  (a: { row: unknown }, b: { row: unknown }): number => {
    const x = `${text(a.row, name)}|${text(a.row, 'id')}`;
    const y = `${text(b.row, name)}|${text(b.row, 'id')}`;
    return x < y ? -1 : x > y ? 1 : 0;
  };

/**
 * Sets aside, in a fixed order, the rows of a rescue copy that break a cross-record rule other
 * than Kickstart's (section 5): later rows with a duplicate key; every running fast but the
 * latest, and that one too if a later fast exists; fasts overlapping an earlier kept fast; every
 * onboarding weigh-in but the first; and reminder card rows this app does not know. A duplicate
 * key in the Kickstart history is not resolved here: the caller refuses the file.
 */
export function resolveRescueInvariants(tables: Readonly<Record<string, Rows>>): {
  readonly tables: Record<string, unknown[]>;
  readonly setAside: readonly InvariantSetAside[];
} {
  const setAside: InvariantSetAside[] = [];
  const gone = new Map<string, Set<number>>();
  const drop = (table: string, position: number, rule: InvariantRule): void => {
    const set = gone.get(table) ?? new Set<number>();
    if (set.has(position)) return;
    set.add(position);
    gone.set(table, set);
    setAside.push({ table, position, rule });
  };
  const live = (table: string) =>
    (tables[table] ?? [])
      .map((row, position) => ({ row, position }))
      .filter(({ position }) => !(gone.get(table)?.has(position) ?? false));

  // 1. Unique keys: the first row of a key is kept.
  for (const [table, rows] of Object.entries(tables)) {
    if (KICKSTART_HISTORY_TABLES.includes(table) || !Object.hasOwn(TABLES, table)) continue;
    const spec = TABLES[table as keyof typeof TABLES];
    const seen = new Set<string>();
    rows.forEach((row, position) => {
      const key = primaryKeyString(spec, row);
      if (seen.has(key)) drop(table, position, 'unique-key');
      seen.add(key);
    });
  }

  // 2. Running fasts: only the latest running fast is kept, and only if no fast starts after it.
  const fasts = live('fasts').sort(byTime('startedAt'));
  const running = fasts.filter(({ row }) => field(row, 'endedAt') === null);
  for (const extra of running.slice(0, -1)) drop('fasts', extra.position, 'fast-running');
  const latestRunning = running.at(-1);
  if (latestRunning !== undefined && fasts.at(-1)?.position !== latestRunning.position) {
    drop('fasts', latestRunning.position, 'fast-running');
  }

  // 3. Overlapping fasts: a fast that starts before the previous kept fast ended is set aside.
  let previousEnd: string | null = null;
  for (const fast of live('fasts').sort(byTime('startedAt'))) {
    const start = text(fast.row, 'startedAt');
    if (previousEnd !== null && start < previousEnd) {
      drop('fasts', fast.position, 'fast-overlap');
      continue;
    }
    const end = field(fast.row, 'endedAt');
    previousEnd = typeof end === 'string' ? end : null;
  }

  // 4. Only the first onboarding weigh-in is kept.
  const onboarding = live('weights')
    .filter(({ row }) => field(row, 'source') === 'onboarding')
    .sort(byTime('at'));
  for (const extra of onboarding.slice(1)) drop('weights', extra.position, 'weight-onboarding');

  // 5. Reminder cards this app does not know.
  for (const card of live('card_state')) {
    if (cardTrigger(text(card.row, 'cardId'), text(card.row, 'trigger')) === null) {
      drop('card_state', card.position, 'card-trigger');
    }
  }

  const out: Record<string, unknown[]> = {};
  for (const [table, rows] of Object.entries(tables)) {
    out[table] = rows.filter((_, position) => !(gone.get(table)?.has(position) ?? false));
  }
  return { tables: out, setAside };
}

/** A safety setting the merge kept from the phone because it was the more cautious one. */
export interface KeptStricter {
  readonly table: SingletonTable;
  readonly field: string;
}

/** The singletons of one side of a rescue import. */
export interface SafetySide {
  readonly profile: ProfileRecord;
  readonly targets: TargetsRecord;
  readonly settings: SettingsRecord;
}

const lower = (a: number, b: number) => Math.min(a, b);
const higher = (a: number, b: number) => Math.max(a, b);

/**
 * The safety settings a rescue import writes: for each one, the more cautious of the file's value
 * (already repaired if the copy could not keep it) and the phone's (health-rules review;
 * orchestrator ruling). Higher energy floor; lower Kickstart and Steady deficits; lower
 * saturated-fat budget; lower rapid-loss threshold and fewer weeks (more sensitive), with the
 * explanation time that allows them; the women's alcohol figures if either side chose them; and
 * every allergen either side lists (HS-24). Carb ceilings, protein and the diet mode have no one
 * safe direction, so the file's values stay.
 *
 * `phone` is read straight from the phone's database, which may itself be damaged (that is when
 * a rescue copy is made), so each phone value is checked with its own field validator first, and
 * a value that fails is ignored: the file's value is used, never a stand-in such as 0. The
 * phone's rapid-loss bounds count only as a valid set, with an explanation time that allows them.
 */
export function cautiousSafetyMerge(
  file: SafetySide,
  phone: SafetySide,
): SafetySide & { kept: KeptStricter[] } {
  const kept: KeptStricter[] = [];
  const phoneValue = (table: SingletonTable, name: string): unknown => {
    const value = (phone[table] as unknown as Record<string, unknown>)[name];
    return fieldValid(table, name, value) ? value : undefined;
  };
  const pick = (
    table: 'targets' | 'settings',
    name: string,
    choose: (a: number, b: number) => number,
    usable = true,
  ): number => {
    const a = (file[table] as unknown as Record<string, number>)[name] as number;
    const b = usable ? phoneValue(table, name) : undefined;
    if (typeof b !== 'number') return a;
    const chosen = choose(a, b);
    if (chosen !== a) kept.push({ table, field: name });
    return chosen;
  };
  const targets: TargetsRecord = {
    ...file.targets,
    energyFloorKj: pick('targets', 'energyFloorKj', higher),
    kickstartDeficitPct: pick('targets', 'kickstartDeficitPct', lower),
    steadyDeficitPct: pick('targets', 'steadyDeficitPct', lower),
    saturatedFatBudgetPct: pick('targets', 'saturatedFatBudgetPct', lower),
  };
  // The phone's rapid-loss bounds are usable only as a valid set (the C46 "read first" rule).
  const phoneThreshold = phoneValue('settings', 'rapidLossThresholdGPerWeek');
  const phoneWeeks = phoneValue('settings', 'rapidLossConsecutiveWeeks');
  const phoneRead = phoneValue('settings', 'rapidLossExplanationReadAt');
  const phoneBoundsUsable =
    phoneThreshold !== undefined &&
    phoneWeeks !== undefined &&
    phoneRead !== undefined &&
    (phoneRead !== null ||
      (phoneThreshold === RAPID_LOSS_THRESHOLD_G_PER_WEEK.default &&
        phoneWeeks === RAPID_LOSS_WEEKS.default));
  const threshold = pick('settings', 'rapidLossThresholdGPerWeek', lower, phoneBoundsUsable);
  const weeks = pick('settings', 'rapidLossConsecutiveWeeks', lower, phoneBoundsUsable) as 2 | 3;
  const tookFromPhone = kept.some(
    (k) => k.field === 'rapidLossThresholdGPerWeek' || k.field === 'rapidLossConsecutiveWeeks',
  );
  const readTimes = [file.settings.rapidLossExplanationReadAt, phoneRead]
    .filter((t): t is string => typeof t === 'string')
    .sort();
  const guidanceStricter =
    file.settings.alcoholGuidanceSet !== 'nz-women' &&
    phoneValue('settings', 'alcoholGuidanceSet') === 'nz-women';
  if (guidanceStricter) kept.push({ table: 'settings', field: 'alcoholGuidanceSet' });
  const settings: SettingsRecord = {
    ...file.settings,
    rapidLossThresholdGPerWeek: threshold,
    rapidLossConsecutiveWeeks: weeks,
    rapidLossExplanationReadAt: tookFromPhone
      ? (readTimes.at(-1) ?? null)
      : file.settings.rapidLossExplanationReadAt,
    alcoholGuidanceSet: guidanceStricter ? 'nz-women' : file.settings.alcoholGuidanceSet,
  };
  const fileAllergens: readonly unknown[] = file.profile.allergens;
  const added = readableAllergens(
    (phone.profile as unknown as Record<string, unknown>)['allergens'],
    TABLES,
  ).filter((a) => !fileAllergens.includes(a));
  if (added.length > 0) kept.push({ table: 'profile', field: 'allergens' });
  const profile: ProfileRecord = {
    ...file.profile,
    allergens: [...fileAllergens, ...added] as ProfileRecord['allergens'],
  };
  return { profile, targets, settings, kept };
}
