/**
 * The "share with your GP" summary (item 23 design 2.7; C100; HEALTH_SAFETY section 4; HS-R18):
 * average daily saturated fat and net carbs, saturated fat as a share of food energy, the badge
 * mix and the days with one entry, over days ending yesterday. Local only: it is offered as a file
 * on the phone and never sent.
 *
 * - An average over days with an incomplete figure is "at least", with the number of such days;
 *   the share is "not known" whenever any logged day is incomplete for energy or saturated fat.
 * - Food energy only, with label energy capped as in the meal check (energyForChecks), so alcohol
 *   energy typed on a label never lowers the share; drinks and weight are not inputs (C100).
 * - No food names, times or weights in the file.
 */
import { foodLog as copy, foods, general } from '../copy/health';
import { fillTemplate } from '../copy/template';
import {
  averageShown,
  type DerivedShown,
  figureText,
  type FigureShown,
  formatNumber,
  ratioShown,
} from '../foods/figures';
import type { DatabaseSource } from '../foods/types';
import { APPROVED_NUTRIENT_SOURCES } from '../foods/approval';
import type { TimeZone } from '../storage/primitives';
import type { FoodLogRecord } from '../storage/records';
import { FAT_KJ_PER_G } from '../targets/constants';
import { addDays, daysBetween, type LocalDate } from '../util/time';
import { energyForChecks, entryBadge, entryLocalDate } from './day';

export interface GpSummaryInput {
  readonly rows: readonly Pick<
    FoodLogRecord,
    'id' | 'at' | 'timeZone' | 'sourceKind' | 'nutrients' | 'unknownNutrients' | 'confidence'
  >[];
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly home: TimeZone;
  readonly approved?: readonly DatabaseSource[];
}

export interface GpSummary {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly totalDays: number;
  readonly daysLogged: number;
  readonly singleEntryDays: number;
  readonly satFatG: { readonly shown: FigureShown; readonly daysMissing: number };
  /** A fraction, 0–1. */
  readonly satFatShare: DerivedShown;
  readonly netCarbsG: { readonly shown: FigureShown; readonly daysMissing: number };
  readonly mix: {
    readonly label: number;
    readonly database: number;
    readonly estimate: number;
    readonly noFigures: number;
  };
}

/** The longest range a summary covers. */
const MAX_DAYS = 366;

export function gpSummary(input: GpSummaryInput): GpSummary {
  const { from, to, home } = input;
  const totalDays = daysBetween(from, to) + 1;
  if (totalDays < 1 || totalDays > MAX_DAYS)
    throw new RangeError('A summary covers 1 to 366 days, from on or before to');
  const days = new Map<LocalDate, GpSummaryInput['rows'][number][]>();
  for (const row of input.rows) {
    const date = entryLocalDate(row, home);
    if (date < from || date > to) continue;
    days.set(date, [...(days.get(date) ?? []), row]);
  }
  const perDay = [...days.values()].map((rows) => ({
    satFat: rows.reduce((s, r) => s + r.nutrients.saturatedFatG, 0),
    satFatComplete: rows.every((r) => !r.unknownNutrients.includes('saturatedFatG')),
    carbs: rows.reduce((s, r) => s + r.nutrients.carbsG, 0),
    carbsComplete: rows.every((r) => !r.unknownNutrients.includes('carbsG')),
    energy: rows.reduce((s, r) => s + energyForChecks(r), 0),
    energyComplete: rows.every((r) => !r.unknownNutrients.includes('energyKj')),
  }));
  const mix = { label: 0, database: 0, estimate: 0, noFigures: 0 };
  for (const rows of days.values()) {
    for (const row of rows) {
      const badge = entryBadge(row, input.approved ?? APPROVED_NUTRIENT_SOURCES);
      if (badge === null) mix.noFigures += 1;
      else mix[badge] += 1;
    }
  }
  return {
    from,
    to,
    totalDays,
    daysLogged: days.size,
    singleEntryDays: [...days.values()].filter((rows) => rows.length === 1).length,
    satFatG: averageShown(perDay.map((d) => ({ value: d.satFat, complete: d.satFatComplete }))),
    satFatShare: ratioShown(
      {
        value: perDay.reduce((s, d) => s + d.satFat, 0) * FAT_KJ_PER_G,
        complete: perDay.every((d) => d.satFatComplete),
      },
      {
        value: perDay.reduce((s, d) => s + d.energy, 0),
        complete: perDay.every((d) => d.energyComplete),
      },
    ),
    netCarbsG: averageShown(perDay.map((d) => ({ value: d.carbs, complete: d.carbsComplete }))),
    mix,
  };
}

/** The first and last day of a range of `days` ending yesterday. */
export function gpSummaryRange(
  today: LocalDate,
  days: number,
): { readonly from: LocalDate; readonly to: LocalDate } {
  return { from: addDays(today, -days), to: addDays(today, -1) };
}

export type GpSummaryLine =
  | {
      readonly kind: 'fact';
      readonly label: string;
      readonly value: string;
      readonly notes: readonly string[];
    }
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'heading'; readonly text: string };

/** The days-missing note: "at least" only under an "at least" figure, never under "not known". */
const missingNotes = (average: GpSummary['satFatG'], nutrient: string): string[] => {
  const { daysMissing } = average;
  if (daysMissing === 0) return [];
  const [one, many] =
    average.shown.kind === 'not-known'
      ? [copy.gp.daysMissingNotKnownOne, copy.gp.daysMissingNotKnownMany]
      : [foods.derived.daysMissingOne, foods.derived.daysMissingMany];
  return [
    daysMissing === 1
      ? fillTemplate(one, { nutrient })
      : fillTemplate(many, { count: daysMissing, nutrient }),
  ];
};

const entriesText = (count: number): string =>
  count === 1 ? copy.gp.entriesOne : fillTemplate(copy.gp.entriesMany, { count });

/** The summary as lines, in the order the screen and both files show them. */
export function gpSummaryLines(
  s: GpSummary,
  options: { readonly formatDate: (d: LocalDate) => string; readonly footer: string },
): readonly GpSummaryLine[] {
  const fact = (label: string, value: string, notes: readonly string[] = []): GpSummaryLine => ({
    kind: 'fact',
    label,
    value,
    notes,
  });
  const gp = copy.gp;
  const mixRows = (
    [
      ['label', foods.badges.label],
      ['database', foods.badges.database],
      ['estimate', foods.badges.estimate],
      ['noFigures', gp.mixNotKnown],
    ] as const
  ).flatMap(([kind, label]) => (s.mix[kind] > 0 ? [fact(label, entriesText(s.mix[kind]))] : []));
  return [
    fact(
      gp.dates,
      fillTemplate(gp.datesValue, {
        from: options.formatDate(s.from),
        to: options.formatDate(s.to),
      }),
    ),
    fact(
      gp.daysLogged,
      fillTemplate(gp.daysLoggedValue, { count: s.daysLogged, total: s.totalDays }),
    ),
    fact(
      gp.singleEntryDays,
      formatNumber(s.singleEntryDays),
      s.singleEntryDays > 0 ? [gp.singleEntryNote] : [],
    ),
    fact(
      gp.satFat,
      figureText('saturatedFatG', s.satFatG.shown),
      missingNotes(s.satFatG, foods.nutrientNamesLower.saturatedFatG),
    ),
    s.satFatShare.kind === 'value'
      ? fact(
          gp.satFatShare,
          fillTemplate(gp.shareValue, { pct: Math.round(s.satFatShare.value * 100) }),
        )
      : fact(gp.satFatShare, foods.figures.notKnown, [gp.shareNotKnownWhy]),
    fact(
      gp.netCarbs,
      figureText('carbsG', s.netCarbsG.shown),
      missingNotes(s.netCarbsG, foods.nutrientNamesLower.carbsG),
    ),
    { kind: 'note', text: gp.averageNote },
    { kind: 'heading', text: gp.mixTitle },
    ...mixRows,
    { kind: 'heading', text: gp.aboutTitle },
    { kind: 'note', text: gp.leftOut },
    { kind: 'note', text: options.footer },
    { kind: 'note', text: general.about },
  ];
}

/** Plain text: the heading, then each line; notes indented under their fact. */
export function gpSummaryText(lines: readonly GpSummaryLine[]): string {
  const out = [copy.gp.fileHeading, ''];
  for (const line of lines) {
    if (line.kind === 'fact') {
      out.push(`${line.label}: ${line.value}`, ...line.notes.map((n) => `  ${n}`));
    } else if (line.kind === 'note') {
      out.push(line.text);
    } else {
      out.push('', line.text);
    }
  }
  return `${out.join('\n')}\n`;
}

const csvField = (text: string): string => `"${text.replace(/"/g, '""')}"`;

/** CSV (RFC 4180): every field quoted, CRLF after every record. */
export function gpSummaryCsv(lines: readonly GpSummaryLine[]): string {
  const records: [string, string][] = [
    [copy.gp.csvItem, copy.gp.csvValue],
    [copy.gp.fileHeading, ''],
  ];
  for (const line of lines) {
    if (line.kind === 'fact') {
      records.push([line.label, line.value], ...line.notes.map((n): [string, string] => ['', n]));
    } else if (line.kind === 'note') {
      records.push(['', line.text]);
    } else {
      records.push([line.text, '']);
    }
  }
  return records.map(([a, b]) => `${csvField(a)},${csvField(b)}\r\n`).join('');
}
