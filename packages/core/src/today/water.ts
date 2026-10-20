/**
 * The day's water and electrolyte tick (item 16 design section 2.2; UX_SCREENS section 2, card 4;
 * DATA_MODEL water_log; storage spec sections 3.2 and 4.6). A row belongs to the local date of
 * its instant in its own recorded zone (D6); an unknown zone falls back to the home zone. The
 * electrolyte tick is a 0 mL row with `electrolyte` set (the validator's "ml > 0 or electrolyte").
 */
import { recordLocalDate } from '../storage/kickstart';
import type { Id, TimeZone } from '../storage/primitives';
import type { WaterRecord } from '../storage/records';
import type { LocalDate } from '../util/time';

/** One tap of "Add 250 mL" (UX card 4). */
export const WATER_TAP_ML = 250;

export interface WaterDay {
  readonly totalMl: number;
  /** Any row on the day carries the electrolyte tick. */
  readonly electrolyte: boolean;
  /** Rows on the day with water in them (the tick alone is not an entry). */
  readonly entries: number;
}

type WaterTimes = Pick<WaterRecord, 'at' | 'timeZone'>;

const onDay = (row: WaterTimes, day: LocalDate, homeTimeZone: TimeZone): boolean =>
  recordLocalDate(row.at, row.timeZone, homeTimeZone) === day;

export function waterForDay(
  rows: readonly Pick<WaterRecord, 'at' | 'timeZone' | 'ml' | 'electrolyte'>[],
  day: LocalDate,
  homeTimeZone: TimeZone,
): WaterDay {
  let totalMl = 0;
  let electrolyte = false;
  let entries = 0;
  for (const row of rows) {
    if (!onDay(row, day, homeTimeZone)) continue;
    totalMl += row.ml;
    if (row.electrolyte) electrolyte = true;
    if (row.ml > 0) entries += 1;
  }
  return { totalMl, electrolyte, entries };
}

/** The writes that make the day's electrolyte tick read `on`. */
export interface ElectrolyteChange {
  /** Add one { ml: 0, electrolyte: true } row. */
  readonly create: boolean;
  /** The day's tick-only rows, to delete. */
  readonly remove: readonly Id[];
  /** The day's water rows that carry the tick, to update with { electrolyte: false }. */
  readonly clear: readonly Id[];
}

/** Never lists a row of another day; turning the tick on when it is already on writes nothing. */
export function electrolyteToggle(
  rows: readonly Pick<WaterRecord, 'id' | 'at' | 'timeZone' | 'ml' | 'electrolyte'>[],
  day: LocalDate,
  homeTimeZone: TimeZone,
  on: boolean,
): ElectrolyteChange {
  const ticked = rows.filter((row) => row.electrolyte && onDay(row, day, homeTimeZone));
  if (on) return { create: ticked.length === 0, remove: [], clear: [] };
  return {
    create: false,
    remove: ticked.filter((row) => row.ml === 0).map((row) => row.id),
    clear: ticked.filter((row) => row.ml > 0).map((row) => row.id),
  };
}
