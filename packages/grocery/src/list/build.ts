/**
 * The whole list (design 2.7; GL-01 to GL-04, GL-09, NN-04, NN-06). One generated line per need
 * of the plan, with garden and pantry taken off before pack rounding, a pack suggested and a
 * substitute hinted. An update keeps the owner's own lines, carries ids, ticks and prices under
 * the laptop's rules, and keeps a Buy anyway choice (J32); a new list carries nothing (C111).
 * Line text comes only from food, pack, aisle, amount, garden, pantry, recipe and store data: the
 * profile's allergens and dislikes only filter substitutes (item 31 rule 4). Nothing is truncated,
 * split or written past the validator's limits (J43).
 */
import {
  fillTemplate,
  type GroceryItem,
  type GroceryListRecord,
  type Id,
  OTHER_AISLE,
  readyGardenIngredientIds,
  type RefId,
  stockByIngredient,
  type StockView,
} from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import { type Need, planNeeds } from './aggregate';
import { sortLines } from './order';
import { needQuantity, packInfoOf, packSuggestion } from './packs';
import { foodWordsOf, isBoughtAnyway, lineNote, stockAtBuild, type StockOutcome } from './stock';
import { manualSubstituteHint, substituteHint } from './substitutes';
import {
  type AuditDraft,
  type DatedMeal,
  type ListFoods,
  MAX_LINE_AMOUNT,
  MAX_LIST_ITEMS,
  type ResolvedRecipe,
  type StockContext,
  type SubstituteProfile,
} from './types';

export interface BuildInput {
  readonly meals: readonly DatedMeal[];
  readonly recipeOf: (id: RefId) => ResolvedRecipe | null;
  readonly foods: ListFoods;
  readonly profile: SubstituteProfile;
  readonly stock: StockView;
  readonly ctx: StockContext;
  /** The list being updated; null for a new list. */
  readonly previous: GroceryListRecord | null;
  readonly randomId: () => Id;
}

export type BuildResult =
  | {
      readonly ok: true;
      readonly items: GroceryItem[];
      readonly audits: readonly AuditDraft[];
      readonly mealCount: number;
      readonly skippedMeals: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'too-many-lines';
      readonly mealCount: number;
      readonly skippedMeals: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'amount-too-large';
      readonly item: string;
      readonly mealCount: number;
      readonly skippedMeals: number;
    };

const MAX_TEXT = 100;

/** The line's item text: the food's name; for a food no longer in the app, the plan's words (J38). */
function lineText(need: Need, foods: ListFoods): string {
  const first = need.sources[0];
  if (need.kind === 'unknown-food') {
    const own = first?.line.displayAs ?? null;
    if (own !== null && own.trim() !== '') return own.trim().slice(0, MAX_TEXT);
    const text = fillTemplate(grocery.line.unknownFood, { recipe: first?.recipeTitle ?? '' });
    return text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1)}…`;
  }
  const view =
    foods.resolve(need.ingredientId) ??
    (first === undefined ? null : foods.resolve(first.line.ingredientId));
  return view?.name ?? need.ingredientId;
}

const NO_STOCK = (quantity: number): StockOutcome => ({
  section: 'to-buy',
  quantity,
  fromGardenG: null,
  fromPantryG: null,
  gardenAmountUnknown: false,
  notes: [],
  audits: [],
});

export function buildGroceryList(input: BuildInput): BuildResult {
  const { foods, profile, ctx, previous } = input;
  const { needs, mealCount, skippedMeals } = planNeeds(input.meals, input.recipeOf, foods);
  const counts = { mealCount, skippedMeals };
  const stockOf = stockByIngredient(input.stock);
  const gardenIds = readyGardenIngredientIds(input.stock, ctx.now);
  const earlier = (previous?.items ?? []).filter((item) => item.origin === 'generated');
  const matched = new Set<Id>();
  const items: GroceryItem[] = [];
  const audits: AuditDraft[] = [];

  for (const need of needs) {
    const text = lineText(need, foods);
    const { quantity, unit } = needQuantity(need);
    const match = earlier.find(
      (p) =>
        !matched.has(p.id) &&
        p.ingredientId === need.ingredientId &&
        (p.quantity === null) === (quantity === null),
    );
    if (match !== undefined) matched.add(match.id);
    const known = need.kind === 'grams' || need.kind === 'eggs';
    let outcome: StockOutcome | null = null;
    if (quantity !== null && unit !== null) {
      outcome =
        !known || (match !== undefined && isBoughtAnyway(match))
          ? NO_STOCK(quantity)
          : stockAtBuild(
              { quantity, unit },
              stockOf.get(need.ingredientId) ?? [],
              foodWordsOf({ ingredientId: need.ingredientId, text }, foods),
              ctx,
            );
    }
    if (
      outcome !== null &&
      Math.max(outcome.quantity, outcome.fromGardenG ?? 0, outcome.fromPantryG ?? 0) >
        MAX_LINE_AMOUNT
    ) {
      return { ok: false, reason: 'amount-too-large', item: text, ...counts };
    }
    const keptAnyway = match !== undefined && known && isBoughtAnyway(match);
    const section = outcome?.section ?? 'to-buy';
    const info = known ? packInfoOf(need.ingredientId, foods) : null;
    const line: GroceryItem = {
      id: match?.id ?? input.randomId(),
      origin: 'generated',
      ingredientId: need.ingredientId,
      text,
      quantity: outcome?.quantity ?? null,
      unit: outcome === null ? null : unit,
      packSuggestion:
        outcome !== null && section === 'to-buy' && info !== null && unit !== null
          ? packSuggestion({ amount: outcome.quantity, unit }, info)
          : null,
      aisle:
        need.kind === 'unknown-food'
          ? OTHER_AISLE
          : (foods.resolve(need.ingredientId)?.aisle ?? OTHER_AISLE),
      substituteHint: known ? substituteHint(need.sources, foods, profile, gardenIds) : null,
      section,
      fromGardenG: outcome?.fromGardenG ?? null,
      gardenAmountUnknown: outcome?.gardenAmountUnknown ?? false,
      fromPantryG: outcome?.fromPantryG ?? null,
      auditNote: keptAnyway ? grocery.line.boughtAnyway : lineNote(outcome?.notes ?? []),
      price: null,
      ticked: false,
    };
    if (match !== undefined) {
      const same = (keys: readonly (keyof GroceryItem)[]) =>
        keys.every((k) => match[k] === line[k]);
      const amountSame = same(['quantity', 'unit', 'packSuggestion']);
      if (same(['text', 'section']) && amountSame) line.ticked = match.ticked;
      if (match.price !== null && same(['text']) && (match.price.basis !== 'line' || amountSame)) {
        line.price = match.price;
      }
    }
    items.push(line);
    audits.push(...(outcome?.audits ?? []));
  }

  const manual = (previous?.items ?? [])
    .filter((item) => item.origin === 'manual')
    .map((item) =>
      item.ingredientId === null
        ? item
        : {
            ...item,
            substituteHint: manualSubstituteHint(item.ingredientId, foods, profile, gardenIds),
          },
    );
  const all = [...items, ...manual];
  if (all.length > MAX_LIST_ITEMS) return { ok: false, reason: 'too-many-lines', ...counts };
  return { ok: true, items: sortLines(all), audits, ...counts };
}
