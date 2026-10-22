/**
 * The label form (item 23 design 2.2; C01, C11, C31, C68, NU-01, HS-32, HS-R23): what the owner
 * typed from a food label, turned into an own label food stored per 100 g, in kJ, with available
 * carbohydrate. The figures always come from the owner's label; nothing here fills one in.
 *
 * - Every figure field is required except fibre ("not on label") and the package size, and is read
 *   with parseOptionalNumber (no commas, signs or units).
 * - Per serve needs the serving size; kcal is converted to kJ (C31); an overseas label's
 *   carbohydrate includes fibre, so fibre is required and taken out (C01). Fibre is never taken
 *   out of an NZ/AU figure.
 * - Figures over the stored per-100 g limits, and a macronutrient sum above 104 g per 100 g, are
 *   refused: no label rounding explains them.
 * - An energy far from the FSANZ factors, saturated fat over fat, sugars over carbohydrate, a name
 *   that sounds like an alcoholic drink (adults only) and a name used before need a tick.
 * - While alcohol logging is switched off (answer 1 yes or unanswered, or a birth year that may be
 *   under 18) a drink-like name is a problem no tick clears (HS-32).
 * The repository runs this again inside its transaction, so no caller can skip a rule.
 */
import { matchKey } from '../foods/names';
import { toAvailableCarbsG } from '../nutrition/netCarbs';
import { type CarbBasis, kcalToKj, kjToKcal, type Nutrients } from '../nutrition/nutrients';
import { NUTRIENT_LIMITS_PER_100G } from '../storage/limits';
import { type Id, type Instant, isText, type RefId } from '../storage/primitives';
import type { IngredientRecord, NutrientBasis, NutrientKey } from '../storage/records';
import { parseOptionalNumber } from '../util/parse';
import { roundTo } from '../util/round';
import {
  OWN_FOOD_DEFAULT_AISLE,
  LABEL_DRINK_EXEMPT,
  LABEL_DRINK_WORDS,
  LABEL_ENERGY_CHECK,
  LABEL_ENERGY_KJ_PER_G,
  LABEL_FORM_DECIMALS,
  LABEL_MACRO_SUM_MAX_G,
  LABEL_NAME_MAX,
  LABEL_PART_TOLERANCE_G,
  PACK_SIZE_MAX_G,
  SERVING_SIZE_MAX_G,
} from './constants';

export type LabelPer = '100g' | 'serve';
export type EnergyUnit = 'kJ' | 'kcal';
export type LabelCheckKind =
  | 'energy-mismatch'
  | 'sat-fat-over-fat'
  | 'sugars-over-carbs'
  | 'sounds-like-alcohol'
  | 'same-name';

export interface LabelFormInput {
  readonly name: string;
  readonly describes: NutrientBasis | null;
  readonly per: LabelPer;
  readonly servingSizeG: string;
  readonly energy: string;
  readonly energyUnit: EnergyUnit;
  readonly proteinG: string;
  readonly fatG: string;
  readonly saturatedFatG: string;
  readonly carbsG: string;
  readonly overseas: boolean;
  readonly sugarsG: string;
  readonly fibreG: string;
  readonly fibreNotOnLabel: boolean;
  readonly sodiumMg: string;
  readonly packSizeG: string;
  /** The boxes the owner ticked. */
  readonly confirmed: readonly LabelCheckKind[];
}

export interface LabelFormContext {
  /** Item 13's gate: false under 18 (by answer or birth year) or with answer 1 yes or unanswered. */
  readonly alcoholLoggingAvailable: boolean;
  readonly otherLabelFoods: readonly { readonly id: RefId; readonly name: string }[];
  /** The food being changed, left out of the same-name check. */
  readonly editingId: RefId | null;
}

export type LabelField =
  | 'name'
  | 'describes'
  | 'servingSizeG'
  | 'energy'
  | 'proteinG'
  | 'fatG'
  | 'saturatedFatG'
  | 'carbsG'
  | 'sugarsG'
  | 'fibreG'
  | 'sodiumMg'
  | 'packSizeG'
  | 'form';

export type LabelProblem =
  | 'required'
  | 'not-number'
  | 'too-high'
  | 'energy-too-high'
  | 'sodium-too-high'
  | 'name-required'
  | 'name-too-long'
  | 'name-characters'
  | 'alcohol-name'
  | 'choose'
  | 'serving-needed'
  | 'serving-range'
  | 'sum-over'
  | 'fibre-needed-overseas'
  | 'pack-range';

export type LabelFormCheck =
  | {
      readonly kind: 'energy-mismatch';
      /** In the unit and measure the owner typed, rounded down to whole units. */
      readonly computed: number;
      readonly entered: number;
      readonly unit: EnergyUnit;
      readonly per: LabelPer;
    }
  | { readonly kind: 'sat-fat-over-fat' | 'sugars-over-carbs' | 'sounds-like-alcohol' }
  | { readonly kind: 'same-name'; readonly otherId: RefId; readonly otherName: string };

/** What is stored on the own ingredient (per 100 g, available carbohydrate, kJ). */
export interface LabelFood {
  readonly name: string;
  readonly nutrientBasis: NutrientBasis;
  readonly nutrientsPer100g: Nutrients;
  readonly unknownNutrients: NutrientKey[];
  readonly carbBasisAsEntered: CarbBasis;
  readonly servingSizeG: number | null;
  readonly packSizesG: number[];
}

export type LabelFormResult =
  | { readonly ok: true; readonly food: LabelFood }
  | {
      readonly ok: false;
      readonly problems: Readonly<Partial<Record<LabelField, LabelProblem>>>;
      /** Checks the owner has not yet confirmed (only when there is no problem). */
      readonly checks: readonly LabelFormCheck[];
    };

/** The FSANZ energy of a label's macronutrients, kJ (fibre unknown counts as none). */
export function labelEnergyKj(f: {
  readonly proteinG: number;
  readonly fatG: number;
  readonly carbsAvailableG: number;
  readonly fibreG: number | null;
}): number {
  const k = LABEL_ENERGY_KJ_PER_G;
  return (
    k.protein * f.proteinG +
    k.fat * f.fatG +
    k.carbs * f.carbsAvailableG +
    k.fibre * (f.fibreG ?? 0)
  );
}

/** A name that sounds like an alcoholic drink (C11); vinegars, ginger beer and root beer are not. */
export function labelNameSoundsLikeDrink(name: string): boolean {
  return LABEL_DRINK_WORDS.test(name.replace(LABEL_DRINK_EXEMPT, ' '));
}

/**
 * Whether a stored label food may be logged now (HS-32, HS-40): a drink-like name only while alcohol
 * logging is available. The gate can close after the food was stored (answer 1 changed to yes, or a
 * birth year that may be under 18), so every label log asks again.
 */
export function labelFoodLoggable(
  food: { readonly name: string },
  alcoholLoggingAvailable: boolean,
): boolean {
  return alcoholLoggingAvailable || !labelNameSoundsLikeDrink(food.name);
}

const FIGURE_FIELDS = [
  'energy',
  'proteinG',
  'fatG',
  'saturatedFatG',
  'carbsG',
  'sugarsG',
  'fibreG',
  'sodiumMg',
] as const;
type FigureField = (typeof FIGURE_FIELDS)[number];

export function parseLabelForm(input: LabelFormInput, context: LabelFormContext): LabelFormResult {
  const problems: Partial<Record<LabelField, LabelProblem>> = {};

  // 1. Name.
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (name === '') problems.name = 'name-required';
  else if (name.length > LABEL_NAME_MAX) problems.name = 'name-too-long';
  else if (!isText(name, 1, LABEL_NAME_MAX)) problems.name = 'name-characters';
  else if (!context.alcoholLoggingAvailable && labelNameSoundsLikeDrink(name))
    problems.name = 'alcohol-name';

  // 2. What the label describes: never preselected.
  if (input.describes === null) problems.describes = 'choose';

  // 3. Numbers.
  const read = (field: LabelField, text: string, required: boolean): number | null => {
    let value: number | undefined;
    try {
      value = parseOptionalNumber(text);
    } catch {
      problems[field] = 'not-number';
      return null;
    }
    if (value === undefined) {
      if (required) problems[field] = 'required';
      return null;
    }
    return value;
  };
  const figures: Partial<Record<FigureField, number | null>> = {};
  for (const field of FIGURE_FIELDS) {
    const required = field !== 'fibreG' || !input.fibreNotOnLabel;
    figures[field] =
      field === 'fibreG' && input.fibreNotOnLabel ? null : read(field, input[field], required);
  }

  // 4. Serving size.
  const serving = read('servingSizeG', input.servingSizeG, false);
  if (serving !== null && (serving <= 0 || serving > SERVING_SIZE_MAX_G))
    problems.servingSizeG = 'serving-range';
  else if (serving === null && input.per === 'serve' && problems.servingSizeG === undefined)
    problems.servingSizeG = 'serving-needed';

  // 9. Package size (checked here so every field problem is collected at once).
  const pack = read('packSizeG', input.packSizeG, false);
  if (pack !== null && (pack <= 0 || pack > PACK_SIZE_MAX_G)) problems.packSizeG = 'pack-range';

  // 6. Carbohydrate basis: an overseas label needs fibre.
  if (input.overseas && (figures.fibreG ?? null) === null && problems.fibreG === undefined)
    problems.fibreG = 'fibre-needed-overseas';

  if (Object.keys(problems).length > 0) return { ok: false, problems, checks: [] };

  // 5. To per 100 g, in kJ.
  const f = input.per === '100g' ? 1 : 100 / (serving as number);
  const typed = figures as Record<FigureField, number | null>;
  const energyTyped = typed.energy as number;
  const energyKjTyped = input.energyUnit === 'kcal' ? kcalToKj(energyTyped) : energyTyped;
  const carbsTyped = typed.carbsG as number;
  const fibreTyped = typed.fibreG;
  const carbsAvailableTyped = input.overseas
    ? toAvailableCarbsG({ carbsG: carbsTyped, fibreG: fibreTyped ?? 0, carbBasis: 'total' })
    : carbsTyped;
  const per100 = {
    energyKj: energyKjTyped * f,
    proteinG: (typed.proteinG as number) * f,
    fatG: (typed.fatG as number) * f,
    saturatedFatG: (typed.saturatedFatG as number) * f,
    carbsG: carbsAvailableTyped * f,
    sugarsG: (typed.sugarsG as number) * f,
    fibreG: fibreTyped === null ? 0 : fibreTyped * f,
    sodiumMg: (typed.sodiumMg as number) * f,
  };

  // 7. Limits per 100 g.
  const limits = NUTRIENT_LIMITS_PER_100G;
  if (per100.energyKj > limits.energyKj) problems.energy = 'energy-too-high';
  if (per100.sodiumMg > limits.sodiumMg) problems.sodiumMg = 'sodium-too-high';
  const grams: readonly [LabelField, number][] = [
    ['proteinG', per100.proteinG],
    ['fatG', per100.fatG],
    ['saturatedFatG', per100.saturatedFatG],
    ['carbsG', carbsTyped * f],
    ['sugarsG', per100.sugarsG],
    ['fibreG', per100.fibreG],
  ];
  for (const [field, value] of grams) if (value > 100) problems[field] = 'too-high';

  // 8. The macronutrient sum.
  if (
    Object.keys(problems).length === 0 &&
    per100.proteinG + per100.fatG + per100.carbsG + per100.fibreG > LABEL_MACRO_SUM_MAX_G
  )
    problems.form = 'sum-over';
  if (Object.keys(problems).length > 0) return { ok: false, problems, checks: [] };

  // 10. Checks, each pending until its box is ticked.
  const checks: LabelFormCheck[] = [];
  const computedKj = labelEnergyKj({
    proteinG: per100.proteinG,
    fatG: per100.fatG,
    carbsAvailableG: per100.carbsG,
    fibreG: fibreTyped === null ? null : per100.fibreG,
  });
  if (
    Math.abs(per100.energyKj - computedKj) >
    Math.max(LABEL_ENERGY_CHECK.minKj, LABEL_ENERGY_CHECK.fraction * computedKj)
  ) {
    // Shown in the unit and measure the owner typed.
    const asTyped = (kj: number) => {
      const measured = kj / f;
      return Math.floor((input.energyUnit === 'kcal' ? kjToKcal(measured) : measured) + 1e-9);
    };
    checks.push({
      kind: 'energy-mismatch',
      computed: asTyped(computedKj),
      entered: asTyped(per100.energyKj),
      unit: input.energyUnit,
      per: input.per,
    });
  }
  if ((typed.saturatedFatG as number) > (typed.fatG as number) + LABEL_PART_TOLERANCE_G)
    checks.push({ kind: 'sat-fat-over-fat' });
  if ((typed.sugarsG as number) > carbsTyped + LABEL_PART_TOLERANCE_G)
    checks.push({ kind: 'sugars-over-carbs' });
  if (context.alcoholLoggingAvailable && labelNameSoundsLikeDrink(name))
    checks.push({ kind: 'sounds-like-alcohol' });
  const key = matchKey(name);
  const same = context.otherLabelFoods.find(
    (other) => other.id !== context.editingId && matchKey(other.name) === key,
  );
  if (same !== undefined)
    checks.push({ kind: 'same-name', otherId: same.id, otherName: same.name });
  const pending = checks.filter((c) => !input.confirmed.includes(c.kind));
  if (pending.length > 0) return { ok: false, problems: {}, checks: pending };

  // 11. The stored food.
  return {
    ok: true,
    food: {
      name,
      nutrientBasis: input.describes as NutrientBasis,
      nutrientsPer100g: per100,
      unknownNutrients: fibreTyped === null ? ['fibreG'] : [],
      carbBasisAsEntered: input.overseas ? 'total' : 'available',
      servingSizeG: serving,
      packSizesG: pack === null ? [] : [pack],
    },
  };
}

const formText = (n: number): string => String(roundTo(n, LABEL_FORM_DECIMALS));

/**
 * A stored label food as form text: per 100 g, kJ, at most two decimals. An overseas food reopens
 * as overseas with carbohydrate = available + fibre, so re-parsing gives the same available figure.
 */
export function labelFormFrom(
  record: Pick<
    IngredientRecord,
    | 'name'
    | 'nutrientBasis'
    | 'nutrientsPer100g'
    | 'unknownNutrients'
    | 'carbBasisAsEntered'
    | 'servingSizeG'
    | 'packSizesG'
  >,
): LabelFormInput {
  const n = record.nutrientsPer100g;
  const fibreUnknown = record.unknownNutrients.includes('fibreG');
  const overseas = record.carbBasisAsEntered === 'total';
  return {
    name: record.name,
    describes: record.nutrientBasis,
    per: '100g',
    servingSizeG: record.servingSizeG === null ? '' : formText(record.servingSizeG),
    energy: formText(n.energyKj),
    energyUnit: 'kJ',
    proteinG: formText(n.proteinG),
    fatG: formText(n.fatG),
    saturatedFatG: formText(n.saturatedFatG),
    carbsG: formText(overseas ? n.carbsG + n.fibreG : n.carbsG),
    overseas,
    sugarsG: formText(n.sugarsG),
    fibreG: fibreUnknown ? '' : formText(n.fibreG),
    fibreNotOnLabel: fibreUnknown,
    sodiumMg: formText(n.sodiumMg),
    packSizeG: record.packSizesG[0] === undefined ? '' : formText(record.packSizesG[0]),
    confirmed: [],
  };
}

/** A new own label food (STORAGE_DESIGN 4.7 defaults): allergens unknown (C43), aisle "Other". */
export function labelIngredient(food: LabelFood, id: Id, now: Instant): IngredientRecord {
  const pack = food.packSizesG.length > 0;
  return {
    id,
    name: food.name,
    aliases: [],
    aisle: OWN_FOOD_DEFAULT_AISLE,
    packSizesG: [...food.packSizesG],
    packSizeSource: pack ? 'owner' : null,
    packSizeEnteredAt: pack ? now : null,
    nutrientsPer100g: { ...food.nutrientsPer100g },
    unknownNutrients: [...food.unknownNutrients],
    carbBasisAsEntered: food.carbBasisAsEntered,
    nutrientBasis: food.nutrientBasis,
    cookedYield: null,
    yieldCitation: null,
    source: 'label',
    sourceCitation: null,
    allergens: null,
    gardenFlag: false,
    seasonMonths: [],
    substitutes: [],
    gramsPerEach: null,
    servingSizeG: food.servingSizeG,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The fields a change of label figures writes (design 2.2). The pack: the stored size kept keeps
 * its source and time; a new size is the owner's, entered now; no size clears all three.
 * Allergens, aliases and links are not touched.
 */
export function labelFoodChange(
  food: LabelFood,
  stored: Pick<IngredientRecord, 'packSizesG'>,
  now: Instant,
): Partial<IngredientRecord> {
  const pack = food.packSizesG[0];
  const packFields: Partial<IngredientRecord> =
    pack === stored.packSizesG[0]
      ? {}
      : pack === undefined
        ? { packSizesG: [], packSizeSource: null, packSizeEnteredAt: null }
        : { packSizesG: [pack], packSizeSource: 'owner', packSizeEnteredAt: now };
  return {
    name: food.name,
    nutrientBasis: food.nutrientBasis,
    nutrientsPer100g: { ...food.nutrientsPer100g },
    unknownNutrients: [...food.unknownNutrients],
    carbBasisAsEntered: food.carbBasisAsEntered,
    servingSizeG: food.servingSizeG,
    ...packFields,
  };
}
