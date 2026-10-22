/**
 * The day's water entries and the water guide (item 23 design 2.6; cross-item ruling 12; item 21
 * T25, T26). The guide is item 21's water guide plus item 27's heat water for the day; there is no
 * guide under plain figures (T25), and the NRV guide is not shown under the pregnancy note (T26),
 * where it would understate the need, though an owner-set target still shows.
 */
import { recordLocalDate } from '../storage/kickstart';
import type { TimeZone } from '../storage/primitives';
import type { WaterRecord } from '../storage/records';
import type { TargetDisplay } from '../targets/display';
import { parseOptionalNumber } from '../util/parse';
import type { LocalDate } from '../util/time';
import { WATER_ENTRY_ML } from './constants';

export type WaterParse =
  | { readonly ok: true; readonly ml: number }
  | { readonly ok: false; readonly problem: 'required' | 'not-number' | 'range' };

/** Whole millilitres from 1 to 3,000. */
export function parseWaterMl(text: string): WaterParse {
  let value: number | undefined;
  try {
    value = parseOptionalNumber(text);
  } catch {
    return { ok: false, problem: 'not-number' };
  }
  if (value === undefined) return { ok: false, problem: 'required' };
  if (!Number.isInteger(value)) return { ok: false, problem: 'not-number' };
  if (value < WATER_ENTRY_ML.min || value > WATER_ENTRY_ML.max)
    return { ok: false, problem: 'range' };
  return { ok: true, ml: value };
}

/** The rows on a date in their own zone (waterForDay's rule), by time. */
export function waterRowsOn<T extends Pick<WaterRecord, 'at' | 'timeZone'>>(
  rows: readonly T[],
  date: LocalDate,
  home: TimeZone,
): T[] {
  return rows
    .filter((row) => recordLocalDate(row.at, row.timeZone, home) === date)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export interface WaterGuideShown {
  readonly totalMl: number;
  readonly baseMl: number;
  readonly heatExtraMl: number;
}

export interface WaterGuideView {
  readonly guide: WaterGuideShown | null;
  /** The midwife-or-GP line in place of an NRV guide (T26). */
  readonly pregnancyLine: boolean;
}

export function waterGuideView(
  base: { readonly ml: number; readonly source: 'owner' | 'nrv' } | null,
  heatExtraMl: number,
  display: Pick<TargetDisplay, 'plainFigures' | 'pregnancyNote'>,
): WaterGuideView {
  if (!Number.isFinite(heatExtraMl) || heatExtraMl < 0)
    throw new RangeError('The heat water must be a finite number of at least 0');
  const pregnancyLine =
    (display.pregnancyNote as unknown) !== false &&
    (display.plainFigures as unknown) === false &&
    base?.source !== 'owner';
  const hidden =
    (display.plainFigures as unknown) !== false ||
    base === null ||
    ((display.pregnancyNote as unknown) !== false && base.source === 'nrv');
  return {
    guide: hidden ? null : { totalMl: base.ml + heatExtraMl, baseMl: base.ml, heatExtraMl },
    pregnancyLine,
  };
}
