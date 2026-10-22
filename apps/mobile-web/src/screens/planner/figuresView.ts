/**
 * The Planned food card's rows and notes (item 22 design 2.12; NU-05, HS-09, HS-23, HS-R18, T25,
 * T26): core's planDayDisplay as item 21's MeterBar props, worded with item 18's figure functions,
 * so an incomplete figure reads "at least …" (rounded down), one that rounds down to 0 reads "not
 * known", an over-budget fill turns amber with no word, and nothing unknown reads as within.
 */
import {
  displayedFigure,
  fillFraction,
  figureShown,
  fillTemplate,
  formatNumber,
  type NutrientKey,
  type PlanDayDisplay,
  sourcesInUse,
  type FoodDataOk,
} from '@diet/core';
import { foods, planner, targets as copy } from '@diet/core/copy/health';
import type { MeterBarProps } from '@diet/ui';
import { energyNotKnownMessage } from '../../foods/floorMessage';
import { formatAboutKcal } from '../../format';

function figure(key: NutrientKey, value: number, complete: boolean): string | null {
  const shown = displayedFigure(key, figureShown(value, !complete));
  if (shown.kind === 'not-known') return null;
  return shown.kind === 'value'
    ? formatNumber(shown.value)
    : fillTemplate(foods.figures.atLeast, { value: formatNumber(shown.value) });
}

const valueText = (
  eaten: string | null,
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string =>
  eaten === null ? foods.figures.notKnown : fillTemplate(template, { ...values, eaten });

export interface PlannedFoodView {
  readonly energy: MeterBarProps;
  readonly protein: MeterBarProps;
  readonly netCarbs: MeterBarProps;
  readonly satFat: MeterBarProps;
  readonly notes: readonly string[];
}

export function plannedFoodView(
  d: PlanDayDisplay,
  options: {
    readonly plainFigures: boolean;
    readonly pregnancyNote: boolean;
    readonly foods: FoodDataOk;
  },
): PlannedFoodView {
  const energyText = figure('energyKj', d.energy.known, d.energy.complete);
  const proteinText = figure('proteinG', d.protein.known, d.protein.complete);
  const energy: MeterBarProps =
    d.energy.targetKj === null
      ? {
          label: copy.today.energy,
          value: valueText(energyText, copy.today.energyOnly),
          segments: null,
        }
      : {
          label: copy.today.energy,
          value: valueText(energyText, copy.today.energyOf, {
            target: formatNumber(d.energy.targetKj),
          }),
          segments: d.energy.complete
            ? [{ fraction: fillFraction(d.energy.known, d.energy.targetKj), tone: 'ink' }]
            : [],
          state: d.energy.complete ? 'normal' : 'incomplete',
        };
  const check = d.protein.check;
  const protein: MeterBarProps =
    check === null
      ? {
          label: copy.today.protein,
          value: valueText(proteinText, copy.today.gramsOnly),
          segments: null,
        }
      : {
          label: copy.today.protein,
          value:
            check.kind === 'target'
              ? valueText(proteinText, copy.today.proteinOf, { target: check.g })
              : valueText(proteinText, copy.today.proteinOfRange, {
                  min: check.min,
                  max: check.max,
                }),
          segments: d.protein.complete
            ? [
                {
                  fraction: fillFraction(
                    d.protein.known,
                    check.kind === 'target' ? check.g : check.max,
                  ),
                  tone: 'teal',
                },
              ]
            : [],
          state: d.protein.complete ? 'normal' : 'incomplete',
        };
  const limit = (
    label: string,
    key: NutrientKey,
    line: PlanDayDisplay['netCarbs'] | PlanDayDisplay['satFat'],
    limitG: number | null,
  ): MeterBarProps => {
    const grams = figure(key, line.known, line.complete);
    return limitG === null || line.state === null
      ? { label, value: valueText(grams, copy.today.gramsOnly), segments: null, size: 'half' }
      : {
          label,
          value: valueText(grams, copy.today.ofCeiling, { ceiling: limitG }),
          segments: [{ fraction: fillFraction(line.known, limitG), tone: 'soft' }],
          state: line.state,
          size: 'half',
        };
  };
  const notes: string[] = [];
  const floor = d.floorNote;
  if (floor?.kind === 'below-floor') {
    notes.push(
      fillTemplate(copy.plannerFloor.manualBelow, {
        floorKj: formatNumber(floor.floorKj),
        floorKcal: formatAboutKcal(floor.floorKj),
      }),
    );
  } else if (floor?.kind === 'energy-not-known') {
    notes.push(
      energyNotKnownMessage({ ok: true, note: 'energy-not-known', floorKj: floor.floorKj }) ?? '',
    );
  }
  if (sourcesInUse(options.foods).length === 0 && !d.energy.complete) {
    notes.push(options.plainFigures ? planner.figures.notLoadedPlain : planner.figures.notLoaded);
  } else {
    for (const { key, count } of d.missing) {
      const nutrient = foods.nutrientNamesLower[key];
      notes.push(
        count === 1
          ? fillTemplate(copy.today.missingOne, { nutrient })
          : fillTemplate(copy.today.missingMany, { nutrient, count }),
      );
    }
  }
  if (options.plainFigures) notes.push(copy.today.plainNote);
  else if (options.pregnancyNote) notes.push(copy.energy.pregnancyNote);
  return {
    energy,
    protein,
    netCarbs: limit(copy.today.netCarbs, 'carbsG', d.netCarbs, d.netCarbs.ceilingG),
    satFat: limit(copy.today.satFat, 'saturatedFatG', d.satFat, d.satFat.budgetG),
    notes,
  };
}
