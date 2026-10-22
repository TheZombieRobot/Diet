/**
 * The drinks wording put together from health.ts and the app's number formats (item 28 design
 * 2.3 to 2.8, 2.18). Pure. Energy is written only from what energyDisplay says: never 0 for an
 * unknown drink, and never worked out from the ABV (NN-01, C11, A4).
 */
import {
  type BeverageRecord,
  type DrinkLogRecord,
  type EnergyDisplay,
  entryFigures,
  fillTemplate,
  type PeriodTotals,
  presetSummary,
} from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import {
  formatClockMinutes,
  formatLocalTime,
  formatMeasure,
  formatStd1,
  formatStd2,
  formatWhole,
} from '../../format';

const a = alcohol;

/** "1 drink", "4 drinks" (C105: drinks, never cans). */
export function drinksCount(count: number): string {
  return count === 1 ? a.summary.oneDrink : fillTemplate(a.summary.drinks, { count });
}

/** "1 alcohol-free day", "2 alcohol-free days". */
export function freeDaysText(count: number): string {
  return count === 1 ? a.summary.freeOne : fillTemplate(a.summary.freeMany, { count });
}

/** "Zero-sugar premix 330 mL, 5%, 94 kcal, 1.3 std" (UX 5a). */
export function presetSummaryText(
  b: Pick<BeverageRecord, 'name' | 'volumeMl' | 'abvPercent' | 'label'>,
): string {
  const summary = presetSummary(b);
  return fillTemplate(a.log.presetSummary, {
    name: b.name,
    volume: formatMeasure(b.volumeMl),
    abv: formatMeasure(b.abvPercent),
    energy:
      summary.kcal === null
        ? a.log.kcalUnknown
        : fillTemplate(a.log.kcal, { kcal: formatWhole(summary.kcal) }),
    std: formatStd1(summary.std1dp),
  });
}

/**
 * A period's energy: "94 kcal (393 kJ)" (or "94 kcal" with `kj` false, on Today's tiles), "at least
 * …; N drinks with kcal unknown", or "kcal unknown". Null when there are no drinks.
 */
export function energyText(energy: EnergyDisplay, kj: boolean): string | null {
  if (energy.kind === 'none') return null;
  if (energy.kind === 'unknown') return a.summary.allUnknown;
  const known = kj
    ? fillTemplate(a.summary.kcalKj, { kcal: formatWhole(energy.kcal), kj: formatWhole(energy.kj) })
    : fillTemplate(a.summary.kcal, { kcal: formatWhole(energy.kcal) });
  if (energy.kind === 'known') return known;
  return fillTemplate(a.summary.atLeast, {
    energy: fillTemplate(a.summary.unknownPart, {
      energy: known,
      drinks: drinksCount(energy.unknownDrinks),
    }),
  });
}

/** "1 drink · 1.30 std" on screen, and "1 drink, 1.30 standard drinks" for screen readers. */
export function totalsText(t: Pick<PeriodTotals, 'drinks' | 'std'>): {
  readonly shown: string;
  readonly spoken: string;
} {
  const values = { drinks: drinksCount(t.drinks), std: formatStd2(t.std) };
  return {
    shown: fillTemplate(a.summary.totals, values),
    spoken: fillTemplate(a.summary.totalsSpoken, values),
  };
}

/** An entry with its own totals (A43): "1:05 pm: 3 × Zero-sugar premix, 3.91 std, 282 kcal". */
export function entryText(row: DrinkLogRecord): string {
  const f = entryFigures(row);
  return fillTemplate(a.log.entry, {
    time: formatLocalTime(row.at, row.timeZone),
    count: row.count,
    name: row.name,
    std: formatStd2(f.std),
    energy:
      f.kcal === null ? a.log.kcalUnknown : fillTemplate(a.log.kcal, { kcal: formatWhole(f.kcal) }),
  });
}

/** The muted notes under a preset or an entry: a label figure that differs (A39), low energy (A40). */
export function figureNotes(f: {
  readonly labelDiffersFrom: number | null;
  readonly kcalLooksLow: boolean;
}): string[] {
  const notes: string[] = [];
  if (f.labelDiffersFrom !== null) {
    notes.push(fillTemplate(a.log.labelDiffers, { calculated: formatStd2(f.labelDiffersFrom) }));
  }
  if (f.kcalLooksLow) notes.push(a.log.kcalLooksLow);
  return notes;
}

/** A cut-over as the Settings option and the drinking-day line read it: "midnight", "5:00 am". */
export function cutoverText(minutes: number): string {
  return minutes === 0 ? a.settings.midnight : formatClockMinutes(minutes);
}

/** "A drinking day runs from 5:00 am to 5:00 am the next day. …" */
export function drinkingDayText(cutoverMinutes: number): string {
  return fillTemplate(a.summary.drinkingDay, { time: cutoverText(cutoverMinutes) });
}
