/**
 * The one read of garden and pantry stock for the planner (item 22) and the grocery list (item 24)
 * (checklist item 19; design 2.5; C57, C110, C111; G9, G10, G11, G18). Read only: nothing here
 * changes an amount, and the consumers never write these stores.
 *
 * - A row is counted exactly when the garden screen says so (rows.ts), so they cannot disagree.
 * - Grams come only from the owner's own figures: a weight, or a count times the owner's own grams
 *   per item or bunch (rounded down, and marked `fromCount` so list and audit text keep "about"
 *   and the count). A dataset weight per item is never applied to a garden row.
 * - An amount not entered stays `amount-unknown` (garden) or `unmeasured` (pantry): no weight.
 * - Every line carries `updatedAt`, so item 24 can ask "Still have this?" before deducting a line
 *   the owner has not changed since the previous list, or for more than 7 days.
 * Stock never changes a target; item 22 may use ready garden foods only as a tie-break among
 * recipes that already pass every safety filter (design 2.5, item 22 contract).
 */
import type { Id, Instant, RefId } from '../storage/primitives';
import type { GardenRecord, PantryRecord } from '../storage/records';
import { type LocalDate, parseInstant } from '../util/time';
import type { GardenUnit } from './cropForm';
import type { PantryUnit } from './pantryForm';
import { gardenRowStatus, type NotCountedReason, pantryRowStatus } from './rows';

export type StockSource = 'garden' | 'pantry';

export type StockQuantity =
  /** Whole grams, rounded down; `fromCount` when worked out from the owner's count and grams per unit. */
  | {
      readonly kind: 'grams';
      readonly grams: number;
      readonly fromCount: {
        readonly amount: number;
        readonly unit: 'each' | 'bunch';
        readonly gramsPerUnit: number;
      } | null;
    }
  /** A count or a volume with no gram weight from the owner: never converted silently (C110). */
  | { readonly kind: 'count'; readonly amount: number; readonly unit: 'each' | 'bunch' | 'ml' }
  /** Garden only (C57): available, amount not entered. */
  | { readonly kind: 'amount-unknown' }
  /** Pantry only: some, not measured. */
  | { readonly kind: 'unmeasured' };

export interface StockLine {
  readonly source: StockSource;
  /** garden.id or pantry.id: what an audit row's recordId names (item 24). */
  readonly recordId: Id;
  /** Counted lines are always linked to a food. */
  readonly ingredientId: RefId;
  /** The owner's name, for display and audit wording. */
  readonly name: string;
  readonly quantity: StockQuantity;
  readonly asEntered: {
    readonly amount: number | null;
    readonly unit: GardenUnit | PantryUnit | null;
    readonly gramsPerUnit: number | null;
  };
  /** Null for pantry. */
  readonly harvestedAt: LocalDate | null;
  /** Null for pantry. */
  readonly daysLeft: number | null;
  /** When the owner last changed the row. */
  readonly updatedAt: Instant;
}

export interface NotCounted {
  readonly source: StockSource;
  readonly recordId: Id;
  readonly name: string;
  readonly reason: NotCountedReason;
  readonly updatedAt: Instant;
}

export interface StockView {
  readonly lines: readonly StockLine[];
  readonly notCounted: readonly NotCounted[];
}

/** Days after which item 24 asks "Still have this?" before counting a line again. */
export const STOCK_RECHECK_DAYS = 7;
const DAY_MS = 86_400_000;

const byName = (a: { readonly name: string }, b: { readonly name: string }): number =>
  a.name.localeCompare(b.name, 'en-NZ', { sensitivity: 'base' });

function gardenQuantity(row: GardenRecord): StockQuantity {
  if (row.amount === null || row.unit === null) return { kind: 'amount-unknown' };
  if (row.unit === 'g') return { kind: 'grams', grams: Math.floor(row.amount), fromCount: null };
  if (row.gramsPerUnit === null) return { kind: 'count', amount: row.amount, unit: row.unit };
  return {
    kind: 'grams',
    grams: Math.floor(row.amount * row.gramsPerUnit),
    fromCount: { amount: row.amount, unit: row.unit, gramsPerUnit: row.gramsPerUnit },
  };
}

function pantryQuantity(row: PantryRecord): StockQuantity {
  if (row.amount === null || row.unit === null) return { kind: 'unmeasured' };
  if (row.unit === 'g') return { kind: 'grams', grams: Math.floor(row.amount), fromCount: null };
  return { kind: 'count', amount: row.amount, unit: row.unit };
}

/** Counted lines (garden first, soonest to use first; then the pantry by name) and the rest with a reason. */
export function readStock(input: {
  readonly garden: readonly GardenRecord[];
  readonly pantry: readonly PantryRecord[];
  readonly today: LocalDate;
}): StockView {
  const gardenLines: StockLine[] = [];
  const gardenOut: NotCounted[] = [];
  for (const row of input.garden) {
    const status = gardenRowStatus(row, input.today);
    if (status.reason !== null || row.ingredientId === null) {
      gardenOut.push({
        source: 'garden',
        recordId: row.id,
        name: row.name,
        reason: status.reason ?? 'not-linked',
        updatedAt: row.updatedAt,
      });
      continue;
    }
    gardenLines.push({
      source: 'garden',
      recordId: row.id,
      ingredientId: row.ingredientId,
      name: row.name,
      quantity: gardenQuantity(row),
      asEntered: { amount: row.amount, unit: row.unit, gramsPerUnit: row.gramsPerUnit },
      harvestedAt: row.harvestedAt,
      daysLeft: status.daysLeft,
      updatedAt: row.updatedAt,
    });
  }
  const pantryLines: StockLine[] = [];
  const pantryOut: NotCounted[] = [];
  for (const row of input.pantry) {
    const status = pantryRowStatus(row);
    if (status.reason !== null || row.ingredientId === null) {
      pantryOut.push({
        source: 'pantry',
        recordId: row.id,
        name: row.name,
        reason: status.reason ?? 'not-linked',
        updatedAt: row.updatedAt,
      });
      continue;
    }
    pantryLines.push({
      source: 'pantry',
      recordId: row.id,
      ingredientId: row.ingredientId,
      name: row.name,
      quantity: pantryQuantity(row),
      asEntered: { amount: row.amount, unit: row.unit, gramsPerUnit: null },
      harvestedAt: null,
      daysLeft: null,
      updatedAt: row.updatedAt,
    });
  }
  gardenLines.sort(
    (a, b) =>
      (a.daysLeft ?? Number.POSITIVE_INFINITY) - (b.daysLeft ?? Number.POSITIVE_INFINITY) ||
      byName(a, b),
  );
  pantryLines.sort(byName);
  gardenOut.sort(byName);
  pantryOut.sort(byName);
  return { lines: [...gardenLines, ...pantryLines], notCounted: [...gardenOut, ...pantryOut] };
}

/** Counted lines grouped by food, in `lines` order. Two rows of one food both appear; item 24 adds them. */
export function stockByIngredient(view: StockView): ReadonlyMap<RefId, readonly StockLine[]> {
  const groups = new Map<RefId, StockLine[]>();
  for (const line of view.lines) {
    const group = groups.get(line.ingredientId);
    if (group === undefined) groups.set(line.ingredientId, [line]);
    else group.push(line);
  }
  return groups;
}

/** True when the owner has not changed the row since the previous list was built, or for more than 7 days (G18). */
export function needsRecheck(
  line: { readonly updatedAt: Instant },
  at: { readonly now: Instant; readonly previousListAt: Instant | null },
): boolean {
  const updated = parseInstant(line.updatedAt);
  if (at.previousListAt !== null && updated < parseInstant(at.previousListAt)) return true;
  return parseInstant(at.now) - updated > STOCK_RECHECK_DAYS * DAY_MS;
}

/** Foods of counted garden lines (any quantity) changed within STOCK_RECHECK_DAYS: item 22's tie-break. */
export function readyGardenIngredientIds(view: StockView, now: Instant): ReadonlySet<RefId> {
  return new Set(
    view.lines
      .filter(
        (line) => line.source === 'garden' && !needsRecheck(line, { now, previousListAt: null }),
      )
      .map((line) => line.ingredientId),
  );
}
