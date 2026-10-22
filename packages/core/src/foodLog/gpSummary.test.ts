import { describe, expect, expectTypeOf, it } from 'vitest';
import { NUTRIENT_KEYS, type Nutrients } from '../nutrition/nutrients';
import type { FoodLogRecord } from '../storage/records';
import {
  gpSummary,
  type GpSummaryInput,
  gpSummaryCsv,
  gpSummaryLines,
  gpSummaryRange,
  gpSummaryText,
} from './gpSummary';

const n = (patch: Partial<Nutrients>): Nutrients => ({
  energyKj: 0,
  proteinG: 0,
  fatG: 0,
  saturatedFatG: 0,
  carbsG: 0,
  sugarsG: 0,
  fibreG: 0,
  sodiumMg: 0,
  ...patch,
});
let next = 0;
/** An entry at 12:30 or 18:30 in Auckland on a date (NZDT, UTC+13). */
const entry = (
  date: string,
  evening: boolean,
  patch: Partial<FoodLogRecord>,
): GpSummaryInput['rows'][number] => {
  next += 1;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d, evening ? 5 : -1, 30)).toISOString();
  return {
    id: `00000000-0000-4000-8000-${next.toString(16).padStart(12, '0')}`,
    at,
    timeZone: 'Pacific/Auckland',
    sourceKind: 'recipe',
    nutrients: n({}),
    unknownNutrients: [],
    confidence: 'database',
    ...patch,
  };
};
const db = (date: string, evening: boolean, satFat: number, energy: number, carbs: number) =>
  entry(date, evening, {
    nutrients: n({ saturatedFatG: satFat, energyKj: energy, carbsG: carbs }),
  });

/** The fixture week of design 2.7 (H23a). */
const WEEK = [
  entry('2026-10-13', false, {
    nutrients: n({}),
    unknownNutrients: [...NUTRIENT_KEYS],
    confidence: 'estimate',
  }),
  entry('2026-10-13', true, {
    sourceKind: 'label',
    confidence: 'label',
    nutrients: n({
      energyKj: 2000,
      proteinG: 40,
      fatG: 32,
      saturatedFatG: 6,
      carbsG: 10,
      sugarsG: 2,
      fibreG: 2,
      sodiumMg: 400,
    }),
  }),
  db('2026-10-14', false, 8, 4000, 8),
  db('2026-10-14', true, 12, 5000, 12),
  db('2026-10-15', false, 8, 4000, 8),
  db('2026-10-15', true, 10, 5000, 12),
  db('2026-10-16', false, 10, 4000, 8),
  db('2026-10-16', true, 12, 5000, 12),
  db('2026-10-17', false, 6, 4000, 8),
  db('2026-10-17', true, 10, 5000, 12),
  db('2026-10-18', true, 24, 9000, 20),
];
const FOOTER =
  'Database figures are averages from Example database. Label figures are as you typed them, and Estimates are approximate. Your plate will differ.';
const range = {
  from: '2026-10-12',
  to: '2026-10-18',
  home: 'Pacific/Auckland',
  approved: ['usda'] as const,
};
const linesOf = (rows: GpSummaryInput['rows']) =>
  gpSummaryLines(gpSummary({ rows, ...range }), { formatDate: (d) => d, footer: FOOTER });

describe('the summary for a GP (C100, H23a, HS-R18)', () => {
  it('U21*: the fixture week gives exactly the golden text and CSV', () => {
    const lines = linesOf(WEEK);
    expect(gpSummaryText(lines)).toBe(`Food log summary for a GP check-in

Dates: 2026-10-12 to 2026-10-18
Days with food logged: 6 of 7
Days with one entry: 1
  A day with one entry may be a day with one meal, or a day not fully logged.
Saturated fat, average a day: at least 17 g
  1 day has entries with no saturated fat figure, so the average is at least what is shown.
Saturated fat, share of food energy: not known
  Shown as not known because some days have entries with no energy or saturated fat figure.
Net carbs, average a day: at least 18 g
  1 day has entries with no carbohydrate figure, so the average is at least what is shown.
Only food you logged is counted, so a day with a meal not logged reads lower than you ate.

Where the figures came from
Label: 1 entry
Database: 9 entries
No figures: 1 entry

About these figures
It leaves out weight and anything logged as a drink.
${FOOTER}
The app is a personal logbook and planner. It is not a medical device, does not diagnose, and does not replace your GP, a dietitian, or an addiction service.
`);
    expect(gpSummaryCsv(lines).split('\r\n')).toEqual([
      '"Item","Value"',
      '"Food log summary for a GP check-in",""',
      '"Dates","2026-10-12 to 2026-10-18"',
      '"Days with food logged","6 of 7"',
      '"Days with one entry","1"',
      '"","A day with one entry may be a day with one meal, or a day not fully logged."',
      '"Saturated fat, average a day","at least 17 g"',
      '"","1 day has entries with no saturated fat figure, so the average is at least what is shown."',
      '"Saturated fat, share of food energy","not known"',
      '"","Shown as not known because some days have entries with no energy or saturated fat figure."',
      '"Net carbs, average a day","at least 18 g"',
      '"","1 day has entries with no carbohydrate figure, so the average is at least what is shown."',
      '"","Only food you logged is counted, so a day with a meal not logged reads lower than you ate."',
      '"Where the figures came from",""',
      '"Label","1 entry"',
      '"Database","9 entries"',
      '"No figures","1 entry"',
      '"About these figures",""',
      '"","It leaves out weight and anything logged as a drink."',
      `"","${FOOTER}"`,
      '"","The app is a personal logbook and planner. It is not a medical device, does not diagnose, and does not replace your GP, a dietitian, or an addiction service."',
      '',
    ]);
  });

  it('U21*: a complete week shows the share; a label’s energy counts as at most its macronutrients’', () => {
    const complete = WEEK.slice(2);
    const s = gpSummary({ rows: complete, ...range });
    expect(s.satFatG).toEqual({ shown: { kind: 'value', value: 20 }, daysMissing: 0 });
    // 100 g × 37 kJ / 45,000 kJ.
    expect(gpSummaryText(linesOf(complete))).toContain('Saturated fat, share of food energy: 8%');
    // Alcohol energy typed on a label never lowers the share.
    const beer = entry('2026-10-18', false, {
      sourceKind: 'label',
      confidence: 'label',
      nutrients: n({ energyKj: 9000, carbsG: 10 }),
    });
    const withBeer = gpSummary({ rows: [...complete, beer], ...range });
    expect(withBeer.satFatShare).toEqual({ kind: 'value', value: (100 * 37) / (45000 + 170) });
    // One day lacking only saturated fat, or only energy, makes the share not known.
    for (const missing of ['saturatedFatG', 'energyKj'] as const) {
      const gap = entry('2026-10-18', false, {
        nutrients: n({ energyKj: 1000, saturatedFatG: missing === 'saturatedFatG' ? 0 : 3 }),
        unknownNutrients: [missing],
        confidence: 'estimate',
      });
      expect(gpSummary({ rows: [...complete, gap], ...range }).satFatShare, missing).toEqual({
        kind: 'not-known',
      });
    }
    expectTypeOf<keyof GpSummaryInput>().toEqualTypeOf<
      'rows' | 'from' | 'to' | 'home' | 'approved'
    >();
  });

  it('HS-37 (review): an average shown as not known has no "at least" note, in the text or the CSV', () => {
    const unknown = (date: string) =>
      entry(date, true, {
        sourceKind: 'plan',
        unknownNutrients: [...NUTRIENT_KEYS],
        confidence: 'estimate',
      });
    const lines = linesOf([unknown('2026-10-13'), unknown('2026-10-14')]);
    const text = gpSummaryText(lines);
    expect(text).toContain(`Saturated fat, average a day: not known
  2 days have entries with no saturated fat figure, so the average is not known.`);
    expect(text).toContain(`Net carbs, average a day: not known
  2 days have entries with no carbohydrate figure, so the average is not known.`);
    expect(text).not.toContain('at least');
    expect(gpSummaryCsv(lines)).not.toContain('at least');
  });

  it('only the dates asked for count: a row after the last day (today) is left out', () => {
    const todayRow = db('2026-10-19', false, 50, 4000, 50);
    expect(gpSummary({ rows: [...WEEK.slice(2), todayRow], ...range })).toEqual(
      gpSummary({ rows: WEEK.slice(2), ...range }),
    );
  });

  it('a range of 28 days ends yesterday and covers exactly 28 days', () => {
    expect(gpSummaryRange('2026-10-22', 28)).toEqual({ from: '2026-09-24', to: '2026-10-21' });
  });

  it('CSV quotes a value with a comma and a quote (RFC 4180)', () => {
    expect(gpSummaryCsv([{ kind: 'fact', label: 'A, "b"', value: 'c', notes: [] }])).toContain(
      '"A, ""b""","c"\r\n',
    );
  });
});
