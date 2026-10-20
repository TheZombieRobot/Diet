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
 */
import {
  type Confidence,
  type DayIntake,
  type DayTargetsView,
  type DietMode,
  type FoodLogRecord,
  fillTemplate,
  fillFraction,
  limitState,
  type NutrientKey,
  shownAmount,
} from '@diet/core';
import { alcohol, targets as copy } from '@diet/core/copy/health';
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
  readonly tag: { readonly tone: 'teal' | 'neutral' | 'amber'; readonly text: string };
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

/** "9,360", or "at least 9,360" for a lower bound (D35). */
function figure(value: number, unit: 'kj' | 'g', complete: boolean): string {
  const text = formatWhole(shownAmount(value, unit, complete));
  return complete ? text : fillTemplate(copy.today.atLeast, { eaten: text });
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
): NutritionTodayViewModel {
  const t = view.targets;
  const { plainFigures, pregnancyNote } = view.display;
  const alcoholShown = view.gates.alcoholLoggingAvailable;
  const { food, unknownCounts, alcohol: drinks } = intake;
  const complete = (key: NutrientKey) => unknownCounts[key] === 0;
  const grams = (key: NutrientKey) => figure(food[key], 'g', complete(key));

  // Energy: food, plus known alcohol as its own part where alcohol is shown (C11).
  const energyKj = food.energyKj + (alcoholShown ? drinks.knownKj : 0);
  const energyComplete = alcoholShown ? !intake.totalIncomplete : !intake.foodEnergyIncomplete;
  const energyText = figure(energyKj, 'kj', energyComplete);
  const energyTarget =
    t.energy.kind === 'target' && !plainFigures && !pregnancyNote ? t.energy.targetKj : null;
  const energy: MeterBarProps =
    energyTarget === null
      ? {
          label: copy.today.energy,
          value: fillTemplate(copy.today.energyOnly, { eaten: energyText }),
          segments: null,
        }
      : {
          label: copy.today.energy,
          value: fillTemplate(copy.today.energyOf, {
            eaten: energyText,
            target: formatWhole(energyTarget),
          }),
          segments: [
            { fraction: fillFraction(food.energyKj, energyTarget), tone: 'ink' },
            ...(alcoholShown
              ? [{ fraction: fillFraction(drinks.knownKj, energyTarget), tone: 'alcohol' as const }]
              : []),
          ],
          state: 'normal',
        };

  const protein: MeterBarProps = plainFigures
    ? {
        label: copy.today.protein,
        value: fillTemplate(copy.today.gramsOnly, { eaten: grams('proteinG') }),
        segments: null,
      }
    : {
        label: copy.today.protein,
        value:
          t.figures === 'kickstart'
            ? fillTemplate(copy.today.proteinOf, {
                eaten: grams('proteinG'),
                target: t.protein.checkTargetG,
              })
            : fillTemplate(copy.today.proteinOfRange, {
                eaten: grams('proteinG'),
                min: t.protein.rangeG.min,
                max: t.protein.rangeG.max,
              }),
        segments: [{ fraction: fillFraction(food.proteinG, t.protein.rangeG.max), tone: 'teal' }],
        state: 'normal',
      };

  const fibre: MeterBarProps = plainFigures
    ? {
        label: copy.today.fibre,
        value: fillTemplate(copy.today.gramsOnly, { eaten: grams('fibreG') }),
        segments: null,
      }
    : {
        label: copy.today.fibre,
        value: fillTemplate(copy.today.fibreOf, { eaten: grams('fibreG'), guide: t.fibre.grams }),
        segments: [{ fraction: fillFraction(food.fibreG, t.fibre.grams), tone: 'teal' }],
        state: 'normal',
      };

  /** A half-width limit bar: a ceiling or budget with its state, or the grams alone. */
  const limit = (label: string, key: NutrientKey, limitG: number | null): MeterBarProps =>
    limitG === null || plainFigures
      ? {
          label,
          value: fillTemplate(copy.today.gramsOnly, { eaten: grams(key) }),
          segments: null,
          size: 'half',
        }
      : {
          label,
          value: fillTemplate(copy.today.ofCeiling, { eaten: grams(key), ceiling: limitG }),
          segments: [{ fraction: fillFraction(food[key], limitG), tone: 'soft' }],
          state: limitState(food[key], unknownCounts[key], limitG),
          size: 'half',
        };

  const notes: NutritionNote[] = [];
  // By count: a logged drink is never "nothing logged", whatever is known of its energy.
  const drinksLogged = alcoholShown && drinks.count > 0;
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
    // Energy unknown only when no drink's energy is known; a known 0 (a 0% drink) is shown as 0.
    const part =
      drinks.unknownCount < drinks.count
        ? fillTemplate(alcohol.dayEnergy.segment, { kj: formatWhole(drinks.knownKj) })
        : alcohol.dayEnergy.segmentUnknown;
    const foodPart = fillTemplate(copy.today.food, {
      kj: figure(food.energyKj, 'kj', !intake.foodEnergyIncomplete),
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
    entries: entries.map((entry) => ({
      key: entry.id,
      time: formatLocalTime(entry.at, entry.timeZone),
      name: entry.name,
      tag: { tone: TAG_TONES[entry.confidence], text: copy.today.confidence[entry.confidence] },
    })),
  };
}
