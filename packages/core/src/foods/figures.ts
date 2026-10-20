/**
 * Showing nutrient figures, known or not (HS-37; item 18 design 3.3; item 18–20 contract 3 to 6).
 * Every screen that shows a figure uses these functions and the foods.figures words, never its own
 * rounding or wording:
 * - a single food's unknown figure is "not known", never 0 and never filled in;
 * - a sum with some parts missing is "at least" the known part, rounded down, and "not known" when
 *   that rounds to 0;
 * - a difference or ratio that uses an incomplete figure is "not known" (never "at least");
 * - an average over days with gaps is "at least", with the number of such days;
 * - energy is always rounded down, so a shown figure is never above what a floor check compared;
 * - a figure that is not known has no badge, and the footer names a database only when a figure on
 *   the screen comes from an approved one (C97).
 * No path here prints a digit for an unknown figure.
 */
import { foods } from '../copy/health';
import { fillTemplate, joinList } from '../copy/template';
import type { Confidence } from '../nutrition/confidence';
import { NUTRIENT_KEYS, type Nutrients } from '../nutrition/nutrients';
import type { IngredientView } from '../storage/overrides';
import type { NutrientKey } from '../storage/records';
import { APPROVED_NUTRIENT_SOURCES } from './approval';
import type { AttributionMap, DatabaseSource } from './types';
import { displaySource, sortSources } from './view';

export type NutrientUnit = 'kJ' | 'g' | 'mg';

export const NUTRIENT_UNITS: Readonly<Record<NutrientKey, NutrientUnit>> = Object.freeze({
  energyKj: 'kJ',
  proteinG: 'g',
  fatG: 'g',
  saturatedFatG: 'g',
  carbsG: 'g',
  sugarsG: 'g',
  fibreG: 'g',
  sodiumMg: 'mg',
});

const UNIT_TEMPLATES: Readonly<Record<NutrientUnit, string>> = {
  kJ: foods.figures.kj,
  g: foods.figures.g,
  mg: foods.figures.mg,
};

export type FigureShown =
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'at-least'; readonly value: number }
  | { readonly kind: 'not-known' };

function assertFigure(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be a finite number of at least 0`);
}

/**
 * How a figure shows: known → its value; missing with a known part above 0 → "at least" it;
 * missing with nothing known → "not known". A known 0 stays a value (an oil can have 0 g fibre).
 */
export function figureShown(value: number, missing: boolean): FigureShown {
  assertFigure('A figure', value);
  if (!missing) return { kind: 'value', value };
  return value > 0 ? { kind: 'at-least', value } : { kind: 'not-known' };
}

/**
 * The figure as shown: energy always rounded down to a whole kJ; sodium to a whole mg; grams to
 * one decimal below 10 g and to a whole gram from 10 g. A complete value rounds to nearest (half
 * up); a lower bound is floored at that precision, so "at least" never overstates.
 */
export function roundForDisplay(key: NutrientKey, value: number, complete: boolean): number {
  assertFigure('A figure', value);
  const f = NUTRIENT_UNITS[key] === 'g' && value < 10 ? 10 : 1;
  // The 1e-9 keeps 2.3 g at 2.3 (not 2.2) and 0.15 g at 0.2 through floating-point error.
  const down = key === 'energyKj' || !complete;
  return (down ? Math.floor(value * f + 1e-9) : Math.round(value * f + 1e-9)) / f;
}

/** "19", "9.9", "5,000": a comma every three digits from 1,000, never the device's locale. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('A number to show must be finite');
  const [whole = '', fraction] = String(Math.abs(n)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = fraction === undefined || /^0+$/.test(fraction) ? grouped : `${grouped}.${fraction}`;
  return n < 0 ? `-${text}` : text;
}

/** "393 kJ", "at least 17 g", "not known". */
export function figureText(key: NutrientKey, shown: FigureShown): string {
  const unit = UNIT_TEMPLATES[NUTRIENT_UNITS[key]];
  switch (shown.kind) {
    case 'value':
      return fillTemplate(unit, { value: formatNumber(roundForDisplay(key, shown.value, true)) });
    case 'at-least': {
      const rounded = roundForDisplay(key, shown.value, false);
      if (rounded === 0) return foods.figures.notKnown;
      return fillTemplate(foods.figures.atLeast, {
        value: fillTemplate(unit, { value: formatNumber(rounded) }),
      });
    }
    case 'not-known':
      return foods.figures.notKnown;
  }
}

/** A single food's figure per 100 g, or null when it is not known. App code reads figures only through this. */
export function knownFigure(
  food: Pick<IngredientView, 'nutrientsPer100g' | 'unknownNutrients'>,
  key: NutrientKey,
): number | null {
  return food.unknownNutrients.includes(key) ? null : food.nutrientsPer100g[key];
}

export interface NutrientRowView {
  readonly key: NutrientKey;
  readonly label: string;
  readonly text: string;
  /** False when the figure is not fully known ("not known" or "at least"). */
  readonly known: boolean;
}

function rowsOf(shownOf: (key: NutrientKey) => FigureShown): NutrientRowView[] {
  return NUTRIENT_KEYS.map((key) => {
    const shown = shownOf(key);
    return {
      key,
      label: foods.nutrientNames[key],
      text: figureText(key, shown),
      known: shown.kind === 'value',
    };
  });
}

/** One food's eight figures per 100 g: an unknown figure is "not known", never "at least". */
export function per100gRows(
  food: Pick<IngredientView, 'nutrientsPer100g' | 'unknownNutrients'>,
): NutrientRowView[] {
  return rowsOf((key) => {
    const value = knownFigure(food, key);
    return value === null ? { kind: 'not-known' } : figureShown(value, false);
  });
}

/** A total's eight figures: a figure any part lacks is "at least" the known part, or "not known". */
export function totalRows(
  nutrients: Nutrients,
  unknown: readonly NutrientKey[],
): NutrientRowView[] {
  return rowsOf((key) => figureShown(nutrients[key], unknown.includes(key)));
}

/** The order the missing-figure lines are listed in. */
const MISSING_ORDER: readonly NutrientKey[] = Object.freeze([
  'energyKj',
  'proteinG',
  'carbsG',
  'saturatedFatG',
  'fibreG',
  'fatG',
  'sugarsG',
  'sodiumMg',
]);

/**
 * One line per figure some ingredients lack ("2 ingredients have no carbohydrate figure yet, …");
 * only foods.totals.noneLoaded when no line has any figure.
 */
export function ingredientMissingLines(
  lines: readonly { readonly unknownNutrients: readonly NutrientKey[] }[],
): string[] {
  if (lines.every((line) => NUTRIENT_KEYS.every((k) => line.unknownNutrients.includes(k))))
    return [foods.totals.noneLoaded];
  return MISSING_ORDER.flatMap((key) => {
    const count = lines.filter((line) => line.unknownNutrients.includes(key)).length;
    if (count === 0) return [];
    const nutrient = foods.nutrientNamesLower[key];
    return [
      count === 1
        ? fillTemplate(foods.totals.someMissingOne, { nutrient })
        : fillTemplate(foods.totals.someMissingMany, { count, nutrient }),
    ];
  });
}

// ---- Derived figures: differences, ratios and averages (C11, C100) ----

export interface FigureInput {
  readonly value: number;
  readonly complete: boolean;
}

export type DerivedShown =
  { readonly kind: 'value'; readonly value: number } | { readonly kind: 'not-known' };

function assertFinite(inputs: readonly FigureInput[]): void {
  for (const input of inputs) {
    if (!Number.isFinite(input.value)) throw new RangeError('A derived figure needs finite inputs');
  }
}

/**
 * a − b, which may be negative (an energy surplus). Not known when either side is incomplete:
 * an estimate minus a lower bound would overstate a deficit, so "at least" would point the wrong way.
 */
export function differenceShown(a: FigureInput, b: FigureInput): DerivedShown {
  assertFinite([a, b]);
  if (!a.complete || !b.complete) return { kind: 'not-known' };
  return { kind: 'value', value: a.value - b.value };
}

/** n ÷ d. Not known when either side is incomplete (a ratio of lower bounds has no direction) or d ≤ 0. */
export function ratioShown(numerator: FigureInput, denominator: FigureInput): DerivedShown {
  assertFinite([numerator, denominator]);
  if (!numerator.complete || !denominator.complete || denominator.value <= 0)
    return { kind: 'not-known' };
  return { kind: 'value', value: numerator.value / denominator.value };
}

/** The mean over days: "at least" when any day is incomplete, with the number of such days. */
export function averageShown(days: readonly FigureInput[]): {
  readonly shown: FigureShown;
  readonly daysMissing: number;
} {
  assertFinite(days);
  if (days.length === 0) return { shown: { kind: 'not-known' }, daysMissing: 0 };
  const mean = days.reduce((sum, d) => sum + d.value, 0) / days.length;
  const daysMissing = days.filter((d) => !d.complete).length;
  return { shown: figureShown(mean, daysMissing > 0), daysMissing };
}

// ---- Badges and the footer ----

/**
 * The badge an entry shows: none when every figure it shows is "not known" (all eight unknown and
 * every value 0), since a badge belongs to a number (X4); otherwise its own confidence. A recipe
 * with some lines loaded keeps its Estimate badge beside its "at least" figures.
 */
export function foodBadge(entry: {
  readonly confidence: Confidence;
  readonly nutrients: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
}): Confidence | null {
  const nothingShown = NUTRIENT_KEYS.every(
    (k) => entry.unknownNutrients.includes(k) && entry.nutrients[k] === 0,
  );
  return nothingShown ? null : entry.confidence;
}

export interface FooterInput {
  readonly sources: readonly DatabaseSource[];
  readonly databaseShown: boolean;
}

/** The footer for a screen of foods or recipes: the approved databases its views' figures come from. */
export function footerForViews(
  views: readonly Pick<IngredientView, 'source'>[],
  approved: readonly DatabaseSource[] = APPROVED_NUTRIENT_SOURCES,
): FooterInput {
  const sources = sortSources(
    views
      .map((view) => displaySource(view, approved))
      .filter((s): s is DatabaseSource => s === 'nz-fcdb' || s === 'usda'),
  );
  return { sources, databaseShown: sources.length > 0 };
}

/**
 * The footer for a screen of log entries. An entry does not record which database it came from,
 * and an approved source is never removed, so every approved source is named when one is shown.
 */
export function footerForEntries(
  entries: readonly { readonly confidence: Confidence }[],
  approved: readonly DatabaseSource[] = APPROVED_NUTRIENT_SOURCES,
): FooterInput {
  const databaseShown = entries.some((e) => e.confidence === 'database');
  return { sources: databaseShown ? [...approved] : [], databaseShown };
}

/** The footer text (HEALTH_SAFETY section 4; C97): it names a database only when one is shown. */
export function nutritionFooter(
  input: FooterInput,
  attributions: AttributionMap = foods.attribution,
): string {
  if (!input.databaseShown) return foods.footer.noDatabase;
  if (input.sources.length === 0) return foods.footer.databaseUnnamed;
  const names = input.sources.map((s) => {
    const name = attributions[s]?.name;
    if (name === undefined || name === '')
      throw new RangeError('An approved source has no attribution');
    return name;
  });
  return fillTemplate(foods.footer.withDatabase, {
    sources: joinList(names, foods.listComma, foods.listAnd),
  });
}
