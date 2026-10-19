/**
 * Importing a rescue copy record by record (storage spec sections 9.5 and 10.6; D22, D23; the
 * data-loss and health-rules reviews). A rescue copy is made exactly when something does not
 * validate, so it is read as far as it safely can, with these limits:
 *
 * - Kickstart history (kickstart_periods, kickstart_checks) is never set aside: an incomplete
 *   history would count as less Kickstart and reopen the 42-day and 3-extension caps or an offer
 *   after a stop sign (D27, D28). A rescue copy whose Kickstart history fails is refused whole.
 * - A profile, targets or settings row that fails has only its failing fields put back to the
 *   app's defaults, and they are listed. A failing safety setting (the C50 bounds: energy floor,
 *   deficits, carb ceilings, protein, saturated-fat budget, rapid-loss bounds) refuses the file.
 * - Other cross-record rules set aside the offending rows in a fixed order and list them; the
 *   Kickstart rules still refuse.
 * - On the phone, a rescue import never makes a safety setting less cautious than the phone or the
 *   file had (cautiousSafetyMerge, applied by the app when it plans the write).
 */
import { cardTrigger } from '../cards';
import type { InvariantRule } from '../invariants';
import { isPlainObject, type TableSpecs } from '../primitives';
import type { SettingsRecord, TargetsRecord } from '../records';
import { primaryKeyString, stableStringify, TABLES } from '../tables';
import { checkRow } from '../validate';
import { futureBookkeepingField } from '../bookkeeping';

/** Stores a rescue import never sets a row aside from (D27, D28). */
export const KICKSTART_HISTORY_TABLES: readonly string[] = Object.freeze([
  'kickstart_periods',
  'kickstart_checks',
]);

/**
 * The safety settings of section 10.6 step 8 (C50). In a rescue copy a failing one refuses the
 * file instead of being put back to its default.
 */
export const SAFETY_SETTING_FIELDS: Readonly<Record<'targets' | 'settings', readonly string[]>> =
  Object.freeze({
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
    ]),
  });

const isSafetyField = (table: string, field: string): boolean =>
  (table === 'targets' || table === 'settings') && SAFETY_SETTING_FIELDS[table].includes(field);

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
 * A singleton row of a rescue copy, with each failing field put back to its default (`defaults`,
 * stamped at the file's export time). Refused when a safety setting fails, or when the row still
 * fails after every other field is back to its default. `futureLimitMs` is the latest acceptable
 * bookkeeping instant (bookkeeping.ts), or null to skip that check.
 */
export function repairSingleton(
  table: string,
  value: unknown,
  specs: TableSpecs,
  defaults: Readonly<Record<string, unknown>>,
  futureLimitMs: number | null,
): SingletonRepair {
  const spec = specs[table];
  const fields = Object.keys(
    ((spec?.row.desc ?? {}) as { fields?: Record<string, unknown> }).fields ?? {},
  );
  const replaced = new Set<string>();
  const candidate: Record<string, unknown> = {};
  const source = isPlainObject(value) ? value : null;
  for (const field of fields) {
    if (source !== null && Object.hasOwn(source, field)) candidate[field] = source[field];
    else {
      candidate[field] = defaults[field];
      replaced.add(field);
    }
  }
  // Keys the spec does not name are left out (pickByTree already drops them on export).
  let resetAll = false;
  for (let attempt = 0; attempt <= fields.length + 1; attempt++) {
    const result = checkRow(table, candidate, specs);
    const future =
      result.ok && futureLimitMs !== null
        ? futureBookkeepingField(table, result.row, futureLimitMs)
        : null;
    if (result.ok && future === null) {
      return { ok: true, row: result.row, replaced: fields.filter((f) => replaced.has(f)) };
    }
    const failing = result.ok ? (future ?? '') : topField(result.field);
    const rule = result.ok ? 'future' : result.rule;
    const allowed = result.ok ? null : result.allowed;
    if (failing === '' || isSafetyField(table, failing)) {
      return { ok: false, field: result.ok ? failing : result.field, rule, allowed };
    }
    if (stableStringify(candidate[failing]) !== stableStringify(defaults[failing])) {
      candidate[failing] = defaults[failing];
      replaced.add(failing);
      continue;
    }
    // A rule across fields still fails with this field at its default: put every field that is
    // not a safety setting back to its default once, then give up.
    if (resetAll) return { ok: false, field: result.ok ? failing : result.field, rule, allowed };
    resetAll = true;
    for (const field of fields) {
      if (isSafetyField(table, field)) continue;
      if (stableStringify(candidate[field]) !== stableStringify(defaults[field])) {
        candidate[field] = defaults[field];
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
  readonly table: 'targets' | 'settings';
  readonly field: string;
}

const lower = (a: number, b: number) => Math.min(a, b);
const higher = (a: number, b: number) => Math.max(a, b);

/**
 * The safety settings a rescue import writes: for each one, the more cautious of the file's value
 * (already put back to the default if the copy could not keep it) and the phone's (health-rules
 * review; orchestrator ruling). Higher energy floor; lower Kickstart and Steady deficits; lower
 * saturated-fat budget; lower rapid-loss threshold and fewer weeks (more sensitive), with the
 * explanation time that allows them; the women's alcohol figures if either side chose them.
 * Carb ceilings and protein have no one safe direction, so the file's values stay.
 */
export function cautiousSafetyMerge(
  file: { readonly targets: TargetsRecord; readonly settings: SettingsRecord },
  phone: { readonly targets: TargetsRecord; readonly settings: SettingsRecord },
): { targets: TargetsRecord; settings: SettingsRecord; kept: KeptStricter[] } {
  const kept: KeptStricter[] = [];
  const pick = (
    table: 'targets' | 'settings',
    name: string,
    choose: (a: number, b: number) => number,
  ): number => {
    const a = (file[table] as unknown as Record<string, number>)[name] ?? 0;
    const b = (phone[table] as unknown as Record<string, number>)[name] ?? 0;
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
  const threshold = pick('settings', 'rapidLossThresholdGPerWeek', lower);
  const weeks = pick('settings', 'rapidLossConsecutiveWeeks', lower) as 2 | 3;
  const tookFromPhone = kept.some(
    (k) => k.field === 'rapidLossThresholdGPerWeek' || k.field === 'rapidLossConsecutiveWeeks',
  );
  const readTimes = [
    file.settings.rapidLossExplanationReadAt,
    phone.settings.rapidLossExplanationReadAt,
  ]
    .filter((t): t is string => t !== null)
    .sort();
  const guidanceStricter =
    file.settings.alcoholGuidanceSet !== 'nz-women' &&
    phone.settings.alcoholGuidanceSet === 'nz-women';
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
  return { targets, settings, kept };
}
