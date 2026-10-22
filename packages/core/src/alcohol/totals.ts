/**
 * Drinking days, period totals and alcohol-free days (C21, C94, C105, NN-01, AL-05; item 28 design
 * 3.5, A5, A6, A39, A40, A43). Every row is placed on its drinking day in its own recorded zone
 * (storage spec sections 3.3 and 3.4), and every total is rounded once, so the total shown is the
 * total compared with the guidance (C94). Energy comes only from a label figure for the drink's own
 * measure; an unknown or implausibly low one is counted, never filled in or shown as 0 (NN-01, C11).
 *
 * Nothing here is read by the energy floor, the meal checks or the planner (C11; the
 * alcoholStructure scan): a food-day total needs its own calendar-date sum.
 */
import { KJ_PER_KCAL } from '../nutrition/nutrients';
import { DEFAULT_HOME_TIME_ZONE, drinkingDayOf, resolveZone } from '../storage/dates';
import { shownStdDrinksPerServe } from '../storage/derived';
import { type Instant, instantMs, type TimeZone } from '../storage/primitives';
import type { DrinkLogRecord } from '../storage/records';
import { roundTo } from '../util/round';
import { addDays, daysBetween, type LocalDate } from '../util/time';
import {
  countedKcalPerServe,
  drinkEnergy,
  standardDrinks,
  totalStandardDrinks,
} from './standardDrinks';

export interface DrinkingDayContext {
  /** settings.homeTimeZone. */
  readonly homeTimeZone: TimeZone;
  /** settings.drinkingDayCutoverMinutes. */
  readonly cutoverMinutes: number;
}

/** The drinking day of a row, read in its own zone through resolveZone (sections 3.3, 3.4; D6). */
export function drinkingDayOfRow(
  row: Pick<DrinkLogRecord, 'at' | 'timeZone'>,
  ctx: DrinkingDayContext,
): { readonly day: LocalDate; readonly zone: TimeZone; readonly fallback: boolean } {
  const { timeZone, fallback } = resolveZone(
    row.timeZone,
    ctx.homeTimeZone,
    DEFAULT_HOME_TIME_ZONE,
  );
  return { day: drinkingDayOf(row.at, timeZone, ctx.cutoverMinutes), zone: timeZone, fallback };
}

/** A row's figures per serve: shown, for the help card, and its energy when known. */
interface RowFigures {
  /** shownStdDrinksPerServe: a corrupted low calculated figure never counts low (section 4.10). */
  readonly shown: number;
  /**
   * The figure the help card counts (A39): for a label row the larger of the label figure and the
   * calculation, however small the gap, so a low or mistyped label can never hide the card; for a
   * calculated row the shown figure. Never shown.
   */
  readonly trigger: number;
  /** The calculation, when a label figure is used and disagrees with it (A39). */
  readonly labelDiffersFrom: number | null;
  /** countedKcalPerServe: label kcal per serve when known and plausible (A40), else null. */
  readonly kcal: number | null;
  readonly kcalLooksLow: boolean;
}

function rowFigures(row: DrinkLogRecord): RowFigures {
  const shown = shownStdDrinksPerServe(row);
  const std = standardDrinks(row.beverage);
  const calculated = standardDrinks({
    volumeMl: row.beverage.volumeMl,
    abvPercent: row.beverage.abvPercent,
  }).exact;
  const labelUsed = row.stdSource === 'label';
  const disagrees = labelUsed && std.labelDisagrees;
  return {
    shown,
    trigger: labelUsed ? Math.max(shown, calculated) : shown,
    labelDiffersFrom: disagrees ? roundTo(calculated, 2) : null,
    kcal: countedKcalPerServe(row.kcalPerServe, row.beverage),
    kcalLooksLow: drinkEnergy(row.beverage).labelImplausible,
  };
}

export interface EntryFigures {
  /** The entry's total: totalStandardDrinks([{ exact: shown, count }]), 2 dp (A43). */
  readonly std: number;
  /** The entry's energy, Math.round(kcal per serve × count); null when unknown or implausibly low. */
  readonly kcal: number | null;
  /** The calculation per serve, 2 dp, when a label figure is used and disagrees with it (A39). */
  readonly labelDiffersFrom: number | null;
  readonly kcalLooksLow: boolean;
}

/** One log entry's own totals, for the status line and the entry rows (A43). */
export function entryFigures(row: DrinkLogRecord): EntryFigures {
  const f = rowFigures(row);
  return {
    std: totalStandardDrinks([{ exact: f.shown, count: row.count }]),
    kcal: f.kcal === null ? null : Math.round(f.kcal * row.count),
    labelDiffersFrom: f.labelDiffersFrom,
    kcalLooksLow: f.kcalLooksLow,
  };
}

/** A row placed on its drinking day, with its figures, worked out once for every period. */
export interface PlacedDrink {
  readonly row: DrinkLogRecord;
  readonly day: LocalDate;
  readonly zone: TimeZone;
  readonly fallback: boolean;
  readonly figures: RowFigures;
}

/** Places every row on its drinking day (one Intl read per row, however many periods follow). */
export function placeDrinks(
  rows: readonly DrinkLogRecord[],
  ctx: DrinkingDayContext,
): readonly PlacedDrink[] {
  return rows.map((row) => ({ row, ...drinkingDayOfRow(row, ctx), figures: rowFigures(row) }));
}

export interface PeriodTotals {
  /** Σ count, including 0% drinks (C105 "drinks"). */
  readonly drinks: number;
  /** Σ shown figure × count, unrounded. */
  readonly exactStd: number;
  /** totalStandardDrinks over the shown figures: rounded once, 2 dp (C94). Shown, and compared with the guidance. */
  readonly std: number;
  /** As std, with every label row counted at the larger of its label figure and the calculation (A39). For the help card only. */
  readonly triggerStd: number;
  /** The label energy of the rows whose energy is known and plausible (NN-01, C11, A40). */
  readonly knownKcal: number;
  /** Drinks with no label energy, or an implausibly low one: counted, never filled in. */
  readonly unknownKcalDrinks: number;
  /** Grouped by name and volume; most first, then name. */
  readonly breakdown: readonly {
    readonly name: string;
    readonly volumeMl: number;
    readonly count: number;
  }[];
  /** Any row read in a fallback zone (D6). */
  readonly zoneFallback: boolean;
}

/** The totals of the placed rows whose drinking day lies in [from, to]. */
export function totalsOfPlaced(
  placed: readonly PlacedDrink[],
  from: LocalDate,
  to: LocalDate,
): PeriodTotals {
  const inPeriod = placed.filter((p) => p.day >= from && p.day <= to);
  let drinks = 0;
  let exactStd = 0;
  let knownKcal = 0;
  let unknownKcalDrinks = 0;
  const groups = new Map<string, { name: string; volumeMl: number; count: number }>();
  for (const { row, figures } of inPeriod) {
    drinks += row.count;
    exactStd += figures.shown * row.count;
    if (figures.kcal === null) unknownKcalDrinks += row.count;
    else knownKcal += figures.kcal * row.count;
    const key = `${row.name}\u0000${row.beverage.volumeMl}`;
    const group = groups.get(key) ?? { name: row.name, volumeMl: row.beverage.volumeMl, count: 0 };
    group.count += row.count;
    groups.set(key, group);
  }
  return {
    drinks,
    exactStd,
    std: totalStandardDrinks(inPeriod.map((p) => ({ exact: p.figures.shown, count: p.row.count }))),
    triggerStd: totalStandardDrinks(
      inPeriod.map((p) => ({ exact: p.figures.trigger, count: p.row.count })),
    ),
    knownKcal,
    unknownKcalDrinks,
    breakdown: [...groups.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name) || a.volumeMl - b.volumeMl,
    ),
    zoneFallback: inPeriod.some((p) => p.fallback),
  };
}

/** Totals of the rows whose drinking day lies in [from, to]. */
export function periodTotals(
  rows: readonly DrinkLogRecord[],
  ctx: DrinkingDayContext,
  from: LocalDate,
  to: LocalDate,
): PeriodTotals {
  return totalsOfPlaced(placeDrinks(rows, ctx), from, to);
}

/** A drinking day with alcohol, for the consecutive-days rule (D8). */
export interface AlcoholDay {
  readonly day: LocalDate;
  /** The earliest drink with alcohol that day, and its zone. */
  readonly firstAt: Instant;
  readonly firstZone: TimeZone;
  /** The zone of the latest drink with alcohol that day. */
  readonly lastZone: TimeZone;
}

/**
 * Days in [from, to] with at least one drink whose ABV is above 0, oldest first (A5). The label
 * figure plays no part, so a label of 0 standard drinks never makes a drinking day alcohol-free.
 */
export function alcoholDaysOfPlaced(
  placed: readonly PlacedDrink[],
  from: LocalDate,
  to: LocalDate,
): readonly AlcoholDay[] {
  const byDay = new Map<LocalDate, { first: PlacedDrink; last: PlacedDrink }>();
  for (const p of placed) {
    if (p.day < from || p.day > to || !(p.row.beverage.abvPercent > 0)) continue;
    const seen = byDay.get(p.day);
    const at = instantMs(p.row.at);
    if (seen === undefined) byDay.set(p.day, { first: p, last: p });
    else {
      if (at < instantMs(seen.first.row.at)) seen.first = p;
      if (at >= instantMs(seen.last.row.at)) seen.last = p;
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, { first, last }]) => ({
      day,
      firstAt: first.row.at,
      firstZone: first.zone,
      lastZone: last.zone,
    }));
}

export function alcoholDays(
  rows: readonly DrinkLogRecord[],
  ctx: DrinkingDayContext,
  from: LocalDate,
  to: LocalDate,
): readonly AlcoholDay[] {
  return alcoholDaysOfPlaced(placeDrinks(rows, ctx), from, to);
}

/**
 * The drinking day the alcohol notice was acknowledged: the first day alcohol-free days can count
 * (A6). The acknowledgement has no zone of its own, so the home zone is used.
 */
export function trackingStartOf(
  alcoholNoticeAckAt: Instant | null,
  ctx: DrinkingDayContext,
): LocalDate | null {
  if (alcoholNoticeAckAt === null) return null;
  const home = resolveZone(ctx.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  return drinkingDayOf(alcoholNoticeAckAt, home, ctx.cutoverMinutes);
}

/**
 * Alcohol-free days in [from, to], counting only days on or after trackingStart and before
 * `today` (today's drinking day is not over, so it never counts). Days with nothing logged count
 * (C21 point 4). No streak is ever worked out from them (HEALTH_SAFETY section 5).
 */
export function alcoholFreeDays(
  daysWithAlcohol: ReadonlySet<LocalDate>,
  from: LocalDate,
  to: LocalDate,
  trackingStart: LocalDate | null,
  today: LocalDate,
): { readonly count: number; readonly countedDays: number } {
  if (trackingStart === null) return { count: 0, countedDays: 0 };
  const lo = from > trackingStart ? from : trackingStart;
  const yesterday = addDays(today, -1);
  const hi = to < yesterday ? to : yesterday;
  if (lo > hi) return { count: 0, countedDays: 0 };
  const countedDays = daysBetween(lo, hi) + 1;
  let count = 0;
  for (let i = 0; i < countedDays; i++) if (!daysWithAlcohol.has(addDays(lo, i))) count += 1;
  return { count, countedDays };
}

export type EnergyDisplay =
  | { readonly kind: 'none' }
  | { readonly kind: 'known'; readonly kcal: number; readonly kj: number }
  | {
      readonly kind: 'partial';
      readonly kcal: number;
      readonly kj: number;
      readonly unknownDrinks: number;
    }
  | { readonly kind: 'unknown'; readonly unknownDrinks: number };

/** How a period's energy reads: never inferred from the ABV, and never 0 for unknown drinks (C11). */
export function energyDisplay(
  t: Pick<PeriodTotals, 'drinks' | 'knownKcal' | 'unknownKcalDrinks'>,
): EnergyDisplay {
  if (t.drinks === 0) return { kind: 'none' };
  if (t.unknownKcalDrinks >= t.drinks)
    return { kind: 'unknown', unknownDrinks: t.unknownKcalDrinks };
  const kcal = Math.round(t.knownKcal);
  const kj = Math.round(t.knownKcal * KJ_PER_KCAL);
  return t.unknownKcalDrinks > 0
    ? { kind: 'partial', kcal, kj, unknownDrinks: t.unknownKcalDrinks }
    : { kind: 'known', kcal, kj };
}
