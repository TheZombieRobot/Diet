/**
 * Small read-time derivations over stored rows (storage spec sections 4.7, 4.10 and 4.11; D4, D35,
 * D41, D42). Derived values are never stored.
 */
import { standardDrinks } from '../alcohol/standardDrinks';
import { NUTRIENT_KEYS } from '../nutrition/nutrients';
import { RELAY_TTL_MS } from './limits';
import { type Instant, instantMs } from './primitives';
import type { DrinkLogRecord, GroceryListRecord, NutrientKey } from './records';

/**
 * The standard-drinks figure per serve that is shown AND compared with the HS-05/HS-06 thresholds
 * (C94; section 4.10). For a 'label' row it is the stored label figure, even when lower than the
 * calculation (AL-02: the label value wins). For a 'calculated' row it is the larger of the stored
 * figure and the calculation from the stored measure, so a corrupted low figure can never hide a
 * help card. Sum these with totalStandardDrinks.
 */
export function shownStdDrinksPerServe(
  row: Pick<DrinkLogRecord, 'stdSource' | 'stdDrinksPerServe' | 'beverage'>,
): number {
  if (row.stdSource === 'label') return row.beverage.label?.standardDrinks ?? row.stdDrinksPerServe;
  const calculated = standardDrinks({
    volumeMl: row.beverage.volumeMl,
    abvPercent: row.beverage.abvPercent,
  }).exact;
  return Math.max(row.stdDrinksPerServe, calculated);
}

export type GroceryListStatus = 'draft' | 'waiting' | 'expired' | 'received' | 'edited-since-sent';

/**
 * A list's transfer status (C52; section 4.11): draft until sent; received when the verified
 * acknowledgement is for this version; edited-since-sent after an edit (the screen adds "the
 * laptop has an older copy" when an older version was received); otherwise waiting for up to
 * RELAY_TTL_MS after sending, then expired ("Expired, not received; send again").
 */
export function groceryListStatus(
  list: Pick<GroceryListRecord, 'version' | 'sentVersion' | 'sentAt' | 'receivedVersion'>,
  now: Instant,
): GroceryListStatus {
  if (list.sentVersion === null || list.sentAt === null) return 'draft';
  if (list.receivedVersion === list.version) return 'received';
  if (list.sentVersion < list.version) return 'edited-since-sent';
  return instantMs(now) - instantMs(list.sentAt) < RELAY_TTL_MS ? 'waiting' : 'expired';
}

/**
 * For a day's entries, how many lack each nutrient (D35): "2 entries without carbs". A total with
 * such entries is a lower bound: a carb or saturated-fat bar reads "at least N g" and never shows
 * the ceiling or budget as met.
 */
export function nutrientCompleteness(
  entries: readonly { readonly unknownNutrients: readonly NutrientKey[] }[],
): Record<NutrientKey, number> {
  const counts = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<
    NutrientKey,
    number
  >;
  for (const entry of entries) for (const key of new Set(entry.unknownNutrients)) counts[key] += 1;
  return counts;
}
