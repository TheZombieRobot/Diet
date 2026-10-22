/**
 * What the food log's panels share (item 23 design 1.2 and 1.3): the shown date and clock, the
 * day's rows and the food data, the time field's rule, and the empty form states.
 */
import {
  type Catalogue,
  type DatabaseSource,
  entryInstant,
  type FoodDataOk,
  type Instant,
  type LabelFormInput,
  type LocalDate,
  type NutrientBasis,
  type RecipeData,
  type RecipeFoods,
  type TimeZone,
} from '@diet/core';
import type { AppStorage } from '../../db/runtime';
import { timeProblemText } from './text';
import type { FoodLogDayRows } from './useFoodLogDay';

/** What every panel reads: the shown date, the clock, the day's rows and the food data. */
export interface LogContext {
  readonly storage: AppStorage;
  readonly date: LocalDate;
  readonly today: LocalDate;
  readonly now: Instant;
  readonly deviceZone: TimeZone;
  readonly home: TimeZone;
  readonly rows: Pick<
    FoodLogDayRows,
    'entries' | 'recent' | 'planDay' | 'recentPlans' | 'recipeRows'
  >;
  /** Null while item 18's food data or item 20's recipes load or failed. */
  readonly recipeFoods: RecipeFoods | null;
  readonly recipes: RecipeData | null;
  readonly approved: readonly DatabaseSource[];
  readonly catalogue: Catalogue | null;
  readonly foodData: FoodDataOk | null;
  readonly writable: boolean;
  /** Item 13's gate; null until the answers are read. */
  readonly alcoholLoggingAvailable: boolean | null;
  /** Item 21's protein target for the large-protein check, null while it loads. */
  readonly proteinTargetG: number | null;
}

/** The instant of the time field: none for "now" on today; a past day needs one. */
export function timeOf(
  ctx: Pick<LogContext, 'date' | 'today' | 'deviceZone' | 'now'>,
  text: string,
):
  | { readonly ok: true; readonly at: Instant | undefined }
  | { readonly ok: false; readonly error: string } {
  if (ctx.date === ctx.today && text.trim() === '') return { ok: true, at: undefined };
  const r = entryInstant(ctx.date, text, ctx.deviceZone, ctx.now);
  return r.ok ? { ok: true, at: r.at } : { ok: false, error: timeProblemText(r.problem) };
}

export const EMPTY_LABEL_FORM: LabelFormInput = {
  name: '',
  describes: null,
  per: '100g',
  servingSizeG: '',
  energy: '',
  energyUnit: 'kJ',
  proteinG: '',
  fatG: '',
  saturatedFatG: '',
  carbsG: '',
  overseas: false,
  sugarsG: '',
  fibreG: '',
  fibreNotOnLabel: false,
  sodiumMg: '',
  packSizeG: '',
  confirmed: [],
};

export interface AmountInput {
  readonly by: 'grams' | 'serves';
  readonly grams: string;
  readonly weighed: NutrientBasis | null;
  readonly before: string;
  readonly serves: string;
}

export const EMPTY_AMOUNT: AmountInput = {
  by: 'grams',
  grams: '',
  weighed: null,
  before: '',
  serves: '',
};
