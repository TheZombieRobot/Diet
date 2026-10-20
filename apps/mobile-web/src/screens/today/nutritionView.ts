/**
 * The Nutrition today card's view, built purely from the engine output and the day's intake (item
 * 21 design sections 2.3 and 5.4; C11, D35, HS-09, T11, T16, T23, T25, T26, T33). Every number comes
 * from the engine; nothing here does target arithmetic (scan targetsHome).
 *
 * - Energy never shows an "over" colour (T23); only the net-carb and saturated-fat bars change
 *   colour, and the amount is always in the text, so colour is never the only signal (HS-09).
 * - A total with a missing figure reads "at least …" and its bar is never "within" (D35).
 * - Alcohol energy shows as its own part only where alcohol logging is available, and an unknown
 *   drink is never shown as 0 (C11, NN-01).
 * - Plain figures (answer 1, an under-18 birth year, answer 5): numbers only, no target, no bar,
 *   no state (T25). The pregnancy note (answer 2): energy shown plain (T26).
 * - Item 18 (HS-37; its design 1.4): every figure goes through item 18's display rules, so a total
 *   whose known part rounds to 0 reads "not known" (never "at least 0" or "Food 0 kJ"), grams show
 *   one decimal below 10 g, and a bar with a missing figure is never shown as complete. An entry
 *   whose every figure is unknown has no badge, the badge words are foods.badges, a Database
 *   entry while no database is approved (a restored backup) is tagged Estimate (entryConfidence),
 *   and the footer names a food database only when one is approved and shown.
 */
import {
  APPROVED_NUTRIENT_SOURCES,
  type AttributionMap,
  type Confidence,
  type DatabaseSource,
  type DayIntake,
  type DayTargetsView,
  displayedFigure,
  type DietMode,
  entryConfidence,
  type FoodLogRecord,
  fillTemplate,
  fillFraction,
  figureShown,
  foodBadge,
  foodData,
  footerForEntries,
  formatNumber,
  limitState,
  type NutrientKey,
  nutritionFooter,
  roundForDisplay,
  sourcesInUse,
} from '@diet/core';
import { alcohol, foods, targets as copy } from '@diet/core/copy/health';
import type { MeterBarProps } from '@diet/ui';
import { formatLocalTime, formatWhole } from '../../format';

export interface NutritionNote {
  readonly text: string;
  /** 'alcohol' marks the alcohol lines, so a test can scan exactly those (K9). */
  readonly part?: 'alcohol';
}

export interface NutritionEntryView {
  readonly key: string;
  readonly time: string;
  readonly name: string;
  /** Null when the entry shows no number: every figure is not known (item 18, X4). */
  readonly tag: { readonly tone: 'teal' | 'neutral' | 'amber'; readonly text: string } | null;
}

/** What item 18's bundled food data says about today's figures (its FoodDataContext in the app). */
export interface FoodFigures {
  /** Whether any approved food database's figures are in the app (sourcesInUse). */
  readonly loaded: boolean;
  readonly approved: readonly DatabaseSource[];
  readonly attributions: AttributionMap;
}

export interface NutritionTodayViewModel {
  /**
   * The diet mode's name, at the right of the card label; null while the readiness answers switch
   * every carb ceiling off, so Today never says "Keto-preferred" while keto is off (item 16 design
   * section 1.1).
   */
  readonly modeName: string | null;
  /** Energy, protein and fibre (full width). */
  readonly rows: readonly MeterBarProps[];
  /** Net carbs and saturated fat (half width, side by side). */
  readonly pair: readonly MeterBarProps[];
  readonly notes: readonly NutritionNote[];
  /** The screen where a missing or out-of-range rough-guide input is fixed (T32). */
  readonly fixLink: 'profile' | 'weight' | null;
  readonly entries: readonly NutritionEntryView[];
  /** Item 18: under the energy row while no food figures are loaded and today's food energy is incomplete. */
  readonly energyNote: string | null;
  /** Item 18: the attribution footer (HEALTH_SAFETY section 4; NU-09, C97). */
  readonly footer: string;
}

const MISSING_ORDER: readonly NutrientKey[] = [
  'energyKj',
  'proteinG',
  'carbsG',
  'saturatedFatG',
  'fibreG',
];

const TAG_TONES: Readonly<Record<Confidence, 'teal' | 'neutral' | 'amber'>> = {
  label: 'teal',
  database: 'neutral',
  estimate: 'amber',
};

/**
 * "9,360" or "17.5", "at least 17" for a lower bound (rounded down), or null when nothing is known
 * (a lower bound that rounds to 0): item 18's figureShown and displayedFigure (HS-37, D35).
 */
function figure(key: NutrientKey, value: number, complete: boolean): string | null {
  const shown = displayedFigure(key, figureShown(value, !complete));
  if (shown.kind === 'not-known') return null;
  return shown.kind === 'value'
    ? formatNumber(shown.value)
    : fillTemplate(foods.figures.atLeast, { value: formatNumber(shown.value) });
}

/** A value template filled with the eaten figure, or "not known" alone, with no "of …" (item 18). */
function valueText(
  eaten: string | null,
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return eaten === null ? foods.figures.notKnown : fillTemplate(template, { ...values, eaten });
}

/** The no-guide line and where it is fixed, for the reasons the owner can fix (never not-estimated). */
function noGuide(view: DayTargetsView): { line: string; link: 'profile' | 'weight' } | null {
  const { energy } = view.targets;
  if (energy.kind !== 'no-estimate') return null;
  const lines = copy.energy.unavailable;
  switch (energy.reason) {
    case 'missing-height':
      return { line: lines.missingHeight, link: 'profile' };
    case 'missing-birth-year':
      return { line: lines.missingBirthYear, link: 'profile' };
    case 'age-out-of-range':
      return { line: lines.ageOutOfRange, link: 'profile' };
    case 'height-out-of-range':
      return { line: lines.heightOutOfRange, link: 'profile' };
    case 'missing-weight':
      return { line: lines.missingWeight, link: 'weight' };
    case 'weight-out-of-range':
      return { line: lines.weightOutOfRange, link: 'weight' };
    case 'not-estimated':
      return null;
  }
}

export function nutritionTodayView(
  view: DayTargetsView,
  intake: DayIntake,
  entries: readonly FoodLogRecord[],
  dietMode: DietMode,
  foodFigures: FoodFigures = {
    loaded: sourcesInUse(foodData()).length > 0,
    approved: APPROVED_NUTRIENT_SOURCES,
    attributions: foods.attribution,
  },
): NutritionTodayViewModel {
  const t = view.targets;
  const { plainFigures, pregnancyNote } = view.display;
  const alcoholShown = view.gates.alcoholLoggingAvailable;
  const { food, unknownCounts, alcohol: drinks } = intake;
  const complete = (key: NutrientKey) => unknownCounts[key] === 0;
  const grams = (key: NutrientKey) => figure(key, food[key], complete(key));

  // Energy: food, plus known alcohol as its own part where alcohol is shown (C11). With food
  // energy incomplete and nothing of it known, the day's energy is not known: alcohol energy alone
  // is never presented as the day's intake (item 18 design 1.4).
  const foodIncomplete = intake.foodEnergyIncomplete;
  const foodText = figure('energyKj', food.energyKj, !foodIncomplete);
  const energyKj = food.energyKj + (alcoholShown ? drinks.knownKj : 0);
  const energyComplete = alcoholShown ? !intake.totalIncomplete : !foodIncomplete;
  const energyText = foodText === null ? null : figure('energyKj', energyKj, energyComplete);
  const energyTarget =
    t.energy.kind === 'target' && !plainFigures && !pregnancyNote ? t.energy.targetKj : null;
  const energy: MeterBarProps =
    energyTarget === null
      ? {
          label: copy.today.energy,
          value: valueText(energyText, copy.today.energyOnly),
          segments: null,
        }
      : {
          label: copy.today.energy,
          value: valueText(energyText, copy.today.energyOf, { target: formatWhole(energyTarget) }),
          // An incomplete energy row draws no food or alcohol part (item 18 design 1.4).
          segments: foodIncomplete
            ? []
            : [
                { fraction: fillFraction(food.energyKj, energyTarget), tone: 'ink' },
                ...(alcoholShown
                  ? [
                      {
                        fraction: fillFraction(drinks.knownKj, energyTarget),
                        tone: 'alcohol' as const,
                      },
                    ]
                  : []),
              ],
          state: foodIncomplete ? 'incomplete' : 'normal',
        };

  const protein: MeterBarProps = plainFigures
    ? {
        label: copy.today.protein,
        value: valueText(grams('proteinG'), copy.today.gramsOnly),
        segments: null,
      }
    : {
        label: copy.today.protein,
        value:
          t.figures === 'kickstart'
            ? valueText(grams('proteinG'), copy.today.proteinOf, {
                target: t.protein.checkTargetG,
              })
            : valueText(grams('proteinG'), copy.today.proteinOfRange, {
                min: t.protein.rangeG.min,
                max: t.protein.rangeG.max,
              }),
        segments: [{ fraction: fillFraction(food.proteinG, t.protein.rangeG.max), tone: 'teal' }],
        state: complete('proteinG') ? 'normal' : 'incomplete',
      };

  const fibre: MeterBarProps = plainFigures
    ? {
        label: copy.today.fibre,
        value: valueText(grams('fibreG'), copy.today.gramsOnly),
        segments: null,
      }
    : {
        label: copy.today.fibre,
        value: valueText(grams('fibreG'), copy.today.fibreOf, { guide: t.fibre.grams }),
        segments: [{ fraction: fillFraction(food.fibreG, t.fibre.grams), tone: 'teal' }],
        state: complete('fibreG') ? 'normal' : 'incomplete',
      };

  /** A half-width limit bar: a ceiling or budget with its state, or the grams alone. */
  const limit = (label: string, key: NutrientKey, limitG: number | null): MeterBarProps =>
    limitG === null || plainFigures
      ? {
          label,
          value: valueText(grams(key), copy.today.gramsOnly),
          segments: null,
          size: 'half',
        }
      : {
          label,
          value: valueText(grams(key), copy.today.ofCeiling, { ceiling: limitG }),
          segments: [{ fraction: fillFraction(food[key], limitG), tone: 'soft' }],
          state: limitState(food[key], unknownCounts[key], limitG),
          size: 'half',
        };

  const notes: NutritionNote[] = [];
  const drinksLogged = alcoholShown && (drinks.knownKj > 0 || drinks.unknownCount > 0);
  if (intake.entryCount === 0 && !drinksLogged) notes.push({ text: copy.today.nothingLogged });
  for (const key of MISSING_ORDER) {
    const count = unknownCounts[key];
    if (count === 0) continue;
    const nutrient = copy.today.nutrientNames[key as keyof typeof copy.today.nutrientNames];
    notes.push({
      text:
        count === 1
          ? fillTemplate(copy.today.missingOne, { nutrient })
          : fillTemplate(copy.today.missingMany, { nutrient, count }),
    });
  }
  if (drinksLogged) {
    const part =
      drinks.knownKj > 0
        ? fillTemplate(alcohol.dayEnergy.segment, { kj: formatWhole(drinks.knownKj) })
        : alcohol.dayEnergy.segmentUnknown;
    // "Food: not known" or "Food: at least 7,000 kJ" while any entry lacks energy (item 18).
    const foodPart = !foodIncomplete
      ? fillTemplate(copy.today.food, { kj: foodText ?? '' })
      : foodText === null
        ? foods.today.foodNotKnown
        : fillTemplate(foods.today.foodAtLeast, {
            value: fillTemplate(foods.figures.kj, {
              value: formatNumber(roundForDisplay('energyKj', food.energyKj, false)),
            }),
          });
    notes.push({ text: `${foodPart} · ${part}`, part: 'alcohol' });
    if (drinks.unknownCount > 0) {
      notes.push({
        text:
          drinks.unknownCount === 1
            ? alcohol.dayEnergy.unknownOne
            : fillTemplate(alcohol.dayEnergy.unknownMany, { count: drinks.unknownCount }),
        part: 'alcohol',
      });
    }
  }
  if (t.energy.kind === 'target' && t.energy.clampedToFloor && !plainFigures) {
    notes.push({
      text: fillTemplate(copy.today.floorDay, { floorKj: formatWhole(t.energy.floorKj) }),
    });
  }
  const fix = plainFigures ? null : noGuide(view);
  if (fix !== null) notes.push({ text: fix.line });
  if (pregnancyNote) notes.push({ text: copy.energy.pregnancyNote });
  if (plainFigures) notes.push({ text: copy.today.plainNote });

  return {
    modeName:
      t.netCarbs.kind === 'none' && t.netCarbs.basis === 'readiness'
        ? null
        : copy.dietMode.names[dietMode],
    rows: [energy, protein, fibre],
    pair: [
      limit(copy.today.netCarbs, 'carbsG', t.netCarbs.kind === 'ceiling' ? t.netCarbs.grams : null),
      limit(
        copy.today.satFat,
        'saturatedFatG',
        t.saturatedFat.kind === 'budget' ? t.saturatedFat.grams : null,
      ),
    ],
    notes,
    fixLink: fix?.link ?? null,
    entries: entries.map((entry) => {
      const badge = foodBadge({
        confidence: entryConfidence(entry, foodFigures.approved),
        nutrients: entry.nutrients,
        unknownNutrients: entry.unknownNutrients,
      });
      return {
        key: entry.id,
        time: formatLocalTime(entry.at, entry.timeZone),
        name: entry.name,
        tag: badge === null ? null : { tone: TAG_TONES[badge], text: foods.badges[badge] },
      };
    }),
    energyNote:
      !plainFigures && foodIncomplete && !foodFigures.loaded ? foods.today.figuresNotLoaded : null,
    footer: nutritionFooter(
      footerForEntries(entries, foodFigures.approved),
      foodFigures.attributions,
    ),
  };
}
