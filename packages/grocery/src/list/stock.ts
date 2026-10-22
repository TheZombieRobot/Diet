/**
 * Garden and pantry, at build time and on the line (design 2.5; GL-02, NN-06, C57, C110, item 19
 * G9 to G18). Read only: nothing here changes a garden or pantry row.
 *
 * - The build takes off only weighed amounts the owner changed since the current list last
 *   changed (and within 7 days), before pack rounding, each with an audit row. Weighed amounts go
 *   first and a garden amount not entered second, so row order never changes the result (J44).
 * - Garden produce needed in grams that is "available, amount not entered" goes under Already
 *   have with the need stated and Buy anyway (C57); anything else uncertain (an old amount, a
 *   count, a pantry amount not measured, a garden amount not entered for eggs or an own food) is
 *   bought by default and offered as a one-tap question on the line (J7, J29).
 * - Nothing is ever converted between a count and grams (C110, N11). The only "{grams} from
 *   garden" texts are reached from a `grams` stock line; one worked out from the owner's count
 *   and grams per item, and every shortened total that may include one, says "about" (C57, G11).
 */
import {
  amountText,
  calendarDateText,
  fillTemplate,
  type GroceryItem,
  type GroceryListRecord,
  type Id,
  type Instant,
  localDateOf,
  needsRecheck,
  parseInstant,
  type RefId,
  type StockLine,
  type StockSource,
} from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import { sortLines } from './order';
import { type PackInfo, packSuggestion } from './packs';
import { displayName, needText } from './text';
import type { AuditDraft, FoodWords, ListFoods, StockContext, StockFood } from './types';

/** Seed groups that count as garden produce for C57's automatic move (J29). */
export const GARDEN_PRODUCE_GROUPS = Object.freeze([
  'leafy-green',
  'vegetable',
  'starchy-vegetable',
  'herb',
  'fruit',
] as const);

const AUDIT_MAX = 500;
const NOTE_MAX = 200;

/** Item 18's gardenFlag, or a produce group. An own food is never garden produce (J29). */
export function isGardenProduce(ingredientId: RefId, foods: Pick<ListFoods, 'data'>): boolean {
  const seed = foods.data.seedById.get(ingredientId);
  if (seed === undefined) return false;
  return seed.gardenFlag || (GARDEN_PRODUCE_GROUPS as readonly string[]).includes(seed.group);
}

/** The words for a line's food: the food's name when it resolves, else the line's own text. */
export function foodWordsOf(
  line: Pick<GroceryItem, 'ingredientId' | 'text'>,
  foods: Pick<ListFoods, 'resolve' | 'data'> | null,
): StockFood {
  const id = line.ingredientId;
  const view = foods === null || id === null ? null : foods.resolve(id);
  if (foods === null || id === null || view === null) {
    return { name: displayName(line.text), countWord: null, gardenProduce: false };
  }
  return {
    name: displayName(view.name),
    countWord: foods.data.seedById.get(id)?.countWord ?? null,
    gardenProduce: isGardenProduce(id, foods),
  };
}

/** Item 19's re-check, or a row dated after the phone's clock (J34). */
export function needsRecheckNow(line: { readonly updatedAt: string }, ctx: StockContext): boolean {
  return (
    parseInstant(line.updatedAt) > parseInstant(ctx.now) ||
    needsRecheck(line, { now: ctx.now, previousListAt: ctx.previousListAt })
  );
}

/** The whole recipe need: an already-have line stores it; a to-buy line what is left (J31). */
export function wholeNeed(
  line: Pick<GroceryItem, 'section' | 'quantity' | 'fromGardenG' | 'fromPantryG'>,
): number | null {
  if (line.quantity === null) return null;
  if (line.section === 'already-have') return line.quantity;
  return line.quantity + (line.fromGardenG ?? 0) + (line.fromPantryG ?? 0);
}

/** A generated to-buy line the owner chose to buy anyway (its note is exactly that sentence). */
export function isBoughtAnyway(
  line: Pick<GroceryItem, 'origin' | 'section' | 'auditNote'>,
): boolean {
  return (
    line.origin === 'generated' &&
    line.section === 'to-buy' &&
    line.auditNote === grocery.line.boughtAnyway
  );
}

/** One part of a line's note, with the short form and the grams it stands for. */
export interface NotePart {
  readonly full: string;
  readonly short: string;
  /** From the owner's count, or an older note that may be: a total including it says "about". */
  readonly estimated: boolean;
  /** Null: both sources, or none. */
  readonly source: StockSource | null;
  /** Grams taken off; 0 for a part that took nothing (C57, "you said you have enough"). */
  readonly takenG: number;
}

export interface StockOutcome {
  readonly section: 'to-buy' | 'already-have';
  /** To buy: what is left; already have: the whole need (J31). */
  readonly quantity: number;
  readonly fromGardenG: number | null;
  readonly fromPantryG: number | null;
  readonly gardenAmountUnknown: boolean;
  readonly notes: readonly NotePart[];
  readonly audits: readonly AuditDraft[];
}

const fit = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const dateOf = (line: StockLine, ctx: StockContext): string =>
  calendarDateText(localDateOf(line.updatedAt, ctx.timeZone), ctx.today);

/** "300 g", "2 bunches", "6 each": the stock line in the owner's own unit. */
const enteredText = (line: StockLine): string =>
  amountText({ ...line.asEntered, harvestReady: true }, line.source);

/** The note part and audit row for grams taken from one weighed stock line. */
function takenPart(
  line: StockLine & { readonly quantity: { readonly kind: 'grams' } },
  take: number,
  food: FoodWords,
  ctx: StockContext,
): { readonly part: NotePart; readonly audit: AuditDraft } {
  const amount = needText(take, 'g');
  const date = dateOf(line, ctx);
  const counted = line.quantity.fromCount !== null;
  const garden = line.source === 'garden';
  const words = grocery.line;
  const values = { amount, date, entered: enteredText(line), food: food.name };
  const full = counted
    ? fillTemplate(words.fromGardenAbout, values)
    : fillTemplate(garden ? words.fromGarden : words.fromPantry, values);
  const short = counted
    ? fillTemplate(words.short.fromGardenAbout, values)
    : fillTemplate(garden ? words.short.fromGarden : words.short.fromPantry, values);
  const reason = counted
    ? fillTemplate(grocery.audit.fromGardenAbout, values)
    : fillTemplate(garden ? grocery.audit.fromGarden : grocery.audit.fromPantry, values);
  return {
    part: { full, short, estimated: counted, source: line.source, takenG: take },
    audit: { table: line.source, recordId: line.recordId, reason: fit(reason, AUDIT_MAX) },
  };
}

/** C57's part: "recipes need 500 g; garden amount not entered" (or "… 200 g more; …"). */
function gardenUnknownPart(amount: string, more: boolean): NotePart {
  const text = fillTemplate(more ? grocery.line.gardenUnknownMore : grocery.line.gardenUnknown, {
    amount,
  });
  return { full: text, short: text, estimated: false, source: 'garden', takenG: 0 };
}

function gardenUnknownAudit(line: StockLine, food: FoodWords): AuditDraft {
  return {
    table: 'garden',
    recordId: line.recordId,
    reason: fit(fillTemplate(grocery.audit.gardenUnknown, { food: food.name }), AUDIT_MAX),
  };
}

/** What the build takes off a need, in two passes: weighed amounts, then C57 (J44). */
export function stockAtBuild(
  need: { readonly quantity: number; readonly unit: 'g' | 'each' },
  stock: readonly StockLine[],
  food: StockFood,
  ctx: StockContext,
): StockOutcome {
  let left = need.quantity;
  let fromGardenG: number | null = null;
  let fromPantryG: number | null = null;
  let gardenAmountUnknown = false;
  const notes: NotePart[] = [];
  const audits: AuditDraft[] = [];
  if (need.unit === 'g') {
    for (const line of stock) {
      if (left <= 0 || line.quantity.kind !== 'grams' || needsRecheckNow(line, ctx)) continue;
      const take = Math.min(left, line.quantity.grams);
      if (take <= 0) continue;
      left -= take;
      if (line.source === 'garden') fromGardenG = (fromGardenG ?? 0) + take;
      else fromPantryG = (fromPantryG ?? 0) + take;
      const { part, audit } = takenPart({ ...line, quantity: line.quantity }, take, food, ctx);
      notes.push(part);
      audits.push(audit);
    }
    if (left > 0 && food.gardenProduce) {
      const unknown = stock.find(
        (line) => line.quantity.kind === 'amount-unknown' && !needsRecheckNow(line, ctx),
      );
      if (unknown !== undefined) {
        gardenAmountUnknown = true;
        notes.push(gardenUnknownPart(needText(left, 'g'), notes.length > 0));
        audits.push(gardenUnknownAudit(unknown, food));
      }
    }
  }
  const covered = left <= 0 || gardenAmountUnknown;
  return {
    section: covered ? 'already-have' : 'to-buy',
    quantity: covered ? need.quantity : left,
    fromGardenG,
    fromPantryG,
    gardenAmountUnknown,
    notes,
    audits,
  };
}

/**
 * A line's note from its parts (the auditNote limit is 200 characters): the full texts, else the
 * short ones, else the grams taken as one total ("about" whenever any part is estimated) followed
 * by the parts that took nothing.
 */
export function lineNote(parts: readonly NotePart[]): string | null {
  if (parts.length === 0) return null;
  const join = grocery.line.notesJoin;
  const full = parts.map((p) => p.full).join(join);
  if (full.length <= NOTE_MAX) return full;
  const short = parts.map((p) => p.short).join(join);
  if (short.length <= NOTE_MAX) return short;
  const taken = parts.filter((p) => p.takenG > 0);
  const rest = parts.filter((p) => p.takenG <= 0).map((p) => p.full);
  if (taken.length === 0) return fit(rest.join(join), NOTE_MAX);
  const total = taken.reduce((sum, p) => sum + p.takenG, 0);
  const garden = taken.some((p) => p.source !== 'pantry');
  const pantry = taken.some((p) => p.source !== 'garden');
  const estimated = taken.some((p) => p.estimated);
  const words = grocery.line.short;
  const template =
    garden && pantry
      ? estimated
        ? words.fromHomeAbout
        : words.fromHome
      : garden
        ? estimated
          ? words.fromGardenAbout
          : words.fromGarden
        : words.fromPantry;
  return fit(
    [fillTemplate(template, { amount: needText(total, 'g') }), ...rest].join(join),
    NOTE_MAX,
  );
}

export type OfferKind = 'use' | 'use-unknown' | 'enough' | 'enough-unmeasured' | 'buy-full';

export interface Offer {
  readonly kind: OfferKind;
  readonly source: StockSource;
  readonly recordId: Id | null;
  /** The stock row's last change as the offer showed it (null for Buy the full amount). */
  readonly rowUpdatedAt: Instant | null;
  readonly recheck: boolean;
  /** Filled wording (design 1.7). */
  readonly prompt: string;
  readonly action: string;
}

const offers = grocery.offers;

function listedPrompt(line: StockLine, ctx: StockContext): string {
  return fillTemplate(offers.listed, {
    place: offers.place[line.source],
    amount: enteredText(line),
    date: dateOf(line, ctx),
  });
}

const withRecheck = (prompt: string, recheck: boolean): string =>
  recheck ? `${prompt} ${offers.stillHave}` : prompt;

/**
 * The questions a generated to-buy line offers, worked out from the live stock on every render
 * and never stored (design 1.7): Buy the full amount for a source lowered or removed after it was
 * taken (J33), then each stock line of a source this line has taken nothing from (J10).
 */
export function lineOffers(
  line: GroceryItem,
  stock: readonly StockLine[],
  ctx: StockContext,
  resolves: boolean,
): readonly Offer[] {
  if (
    line.origin !== 'generated' ||
    line.section !== 'to-buy' ||
    line.ingredientId === null ||
    line.quantity === null ||
    !resolves
  ) {
    return [];
  }
  const result: Offer[] = [];
  for (const source of ['garden', 'pantry'] as const) {
    const taken = source === 'garden' ? line.fromGardenG : line.fromPantryG;
    if (taken === null || taken <= 0) continue;
    const lines = stock.filter((s) => s.source === source);
    const available = lines.reduce(
      (sum, s) => sum + (s.quantity.kind === 'grams' ? s.quantity.grams : 0),
      0,
    );
    if (available >= taken) continue;
    result.push({
      kind: 'buy-full',
      source,
      recordId: null,
      rowUpdatedAt: null,
      recheck: false,
      prompt:
        lines.length > 0
          ? fillTemplate(offers.lowered, {
              place: offers.placeLower[source],
              amount: needText(taken, 'g'),
            })
          : fillTemplate(offers.gone, { place: offers.placeLower[source] }),
      action: offers.buyFull,
    });
  }
  for (const s of stock) {
    if (s.source === 'garden' && (line.fromGardenG !== null || line.gardenAmountUnknown)) continue;
    if (s.source === 'pantry' && line.fromPantryG !== null) continue;
    const recheck = needsRecheckNow(s, ctx);
    const base = { source: s.source, recordId: s.recordId, rowUpdatedAt: s.updatedAt, recheck };
    const q = s.quantity;
    if (q.kind === 'grams' && line.unit === 'g') {
      if (q.grams <= 0) continue;
      result.push({
        ...base,
        kind: 'use',
        prompt: withRecheck(listedPrompt(s, ctx), recheck),
        action: recheck ? offers.yesUseIt : offers.useIt,
      });
    } else if (q.kind === 'amount-unknown') {
      if (isBoughtAnyway(line)) continue;
      result.push({
        ...base,
        kind: 'use-unknown',
        prompt: withRecheck(fillTemplate(offers.listedUnknown, { date: dateOf(s, ctx) }), recheck),
        action: offers.enough,
      });
    } else if (q.kind === 'count' || (q.kind === 'grams' && line.unit === 'each')) {
      result.push({
        ...base,
        kind: 'enough',
        prompt: withRecheck(listedPrompt(s, ctx), recheck),
        action: offers.enough,
      });
    } else if (q.kind === 'unmeasured') {
      result.push({
        ...base,
        kind: 'enough-unmeasured',
        prompt: offers.unmeasured,
        action: offers.enough,
      });
    }
  }
  return result;
}

/** The same question about the same row, unchanged since it was shown (design 1.7). */
const sameOffer = (a: Offer, b: Offer): boolean =>
  a.kind === b.kind &&
  a.source === b.source &&
  a.recordId === b.recordId &&
  a.rowUpdatedAt === b.rowUpdatedAt;

/** The line's earlier note as an opaque part: it may hold a count-derived amount (C57). */
function earlierPart(line: GroceryItem): NotePart[] {
  if (line.auditNote === null) return [];
  const garden = (line.fromGardenG ?? 0) > 0;
  const pantry = (line.fromPantryG ?? 0) > 0;
  return [
    {
      full: line.auditNote,
      short: line.auditNote,
      estimated: true,
      source: garden && !pantry ? 'garden' : pantry && !garden ? 'pantry' : null,
      takenG: (line.fromGardenG ?? 0) + (line.fromPantryG ?? 0),
    },
  ];
}

const replaced = (list: GroceryListRecord, line: GroceryItem): GroceryItem[] =>
  sortLines(list.items.map((item) => (item.id === line.id ? line : item)));

const lineAuditId = (list: GroceryListRecord, line: GroceryItem): string => `${list.id}#${line.id}`;

function backToBuy(
  list: GroceryListRecord,
  line: GroceryItem,
  info: PackInfo | null,
  reason: string,
): { readonly items: GroceryItem[]; readonly audit: AuditDraft } | null {
  const whole = wholeNeed(line);
  if (whole === null || line.unit === null) return null;
  const unit = line.unit === 'each' ? 'each' : 'g';
  const next: GroceryItem = {
    ...line,
    section: 'to-buy',
    quantity: whole,
    fromGardenG: null,
    fromPantryG: null,
    gardenAmountUnknown: false,
    packSuggestion: info === null ? null : packSuggestion({ amount: whole, unit }, info),
    auditNote: grocery.line.boughtAnyway,
    ticked: false,
  };
  return {
    items: replaced(list, next),
    audit: {
      table: 'grocery_lists',
      recordId: lineAuditId(list, line),
      reason: fit(reason, AUDIT_MAX),
    },
  };
}

/**
 * Applies a tapped offer to the list as read inside the write (design 1.7): only when an offer of
 * the same kind, source and stock row is still offered for that line and the row has not changed
 * since it was shown; the wording follows the prompt the owner saw (the tapped offer's `recheck`).
 * Null when it no longer applies.
 */
export function applyOffer(
  list: GroceryListRecord,
  lineId: Id,
  tapped: Offer,
  stock: readonly StockLine[],
  info: PackInfo | null,
  food: StockFood,
  ctx: StockContext,
): { readonly items: GroceryItem[]; readonly audit: AuditDraft } | null {
  const line = list.items.find((item) => item.id === lineId);
  if (line === undefined || line.section !== 'to-buy' || line.quantity === null) return null;
  if (!lineOffers(line, stock, ctx, true).some((offer) => sameOffer(offer, tapped))) return null;
  if (tapped.kind === 'buy-full') {
    return backToBuy(list, line, info, fillTemplate(grocery.audit.buyFull, { food: food.name }));
  }
  const s = stock.find((candidate) => candidate.recordId === tapped.recordId);
  if (s === undefined) return null;
  const whole = wholeNeed(line) ?? line.quantity;
  const alreadyTook = (line.fromGardenG ?? 0) + (line.fromPantryG ?? 0) > 0;
  const covered = {
    ...line,
    section: 'already-have' as const,
    quantity: whole,
    packSuggestion: null,
  };
  let next: GroceryItem;
  let part: NotePart;
  let reason: string;
  switch (tapped.kind) {
    case 'use': {
      if (s.quantity.kind !== 'grams') return null;
      const take = Math.min(line.quantity, s.quantity.grams);
      const taken = takenPart({ ...s, quantity: s.quantity }, take, food, ctx);
      part = tapped.recheck
        ? { ...taken.part, full: fillTemplate(grocery.line.stillHave, { note: taken.part.full }) }
        : taken.part;
      reason = tapped.recheck
        ? fillTemplate(grocery.audit.stillHave, { reason: taken.audit.reason })
        : taken.audit.reason;
      const grams = {
        fromGardenG: s.source === 'garden' ? (line.fromGardenG ?? 0) + take : line.fromGardenG,
        fromPantryG: s.source === 'pantry' ? (line.fromPantryG ?? 0) + take : line.fromPantryG,
      };
      const leftover = line.quantity - take;
      next =
        leftover <= 0
          ? { ...covered, ...grams }
          : {
              ...line,
              ...grams,
              quantity: leftover,
              packSuggestion:
                info === null ? null : packSuggestion({ amount: leftover, unit: 'g' }, info),
            };
      break;
    }
    case 'use-unknown': {
      const amount = needText(line.quantity, line.unit ?? 'g', food.countWord);
      const c57 = gardenUnknownPart(amount, alreadyTook);
      part = tapped.recheck
        ? { ...c57, full: fillTemplate(grocery.line.stillHave, { note: c57.full }) }
        : c57;
      const audit = gardenUnknownAudit(s, food).reason;
      reason = tapped.recheck ? fillTemplate(grocery.audit.stillHave, { reason: audit }) : audit;
      next = { ...covered, gardenAmountUnknown: true };
      break;
    }
    case 'enough': {
      const amount = enteredText(s);
      const text = fillTemplate(grocery.line.countEnough, {
        place: offers.place[s.source],
        amount,
      });
      part = { full: text, short: text, estimated: false, source: s.source, takenG: 0 };
      reason = fillTemplate(grocery.audit.countEnough, {
        food: food.name,
        place: offers.placeLower[s.source],
        amount,
      });
      next = covered;
      break;
    }
    case 'enough-unmeasured': {
      const text = grocery.line.pantryEnough;
      part = { full: text, short: text, estimated: false, source: 'pantry', takenG: 0 };
      reason = fillTemplate(grocery.audit.pantryEnough, { food: food.name });
      next = covered;
      break;
    }
  }
  return {
    items: replaced(list, {
      ...next,
      auditNote: lineNote([...earlierPart(line), part]),
      ticked: false,
    }),
    audit: { table: s.source, recordId: s.recordId, reason: fit(reason, AUDIT_MAX) },
  };
}

/**
 * Buy anyway (C57; J12, J13): an already-have line back to buy with its whole need, a recomputed
 * pack and no deductions, audited against the list line. Null unless it is a generated
 * already-have line with an amount.
 */
export function buyAnyway(
  list: GroceryListRecord,
  lineId: Id,
  info: PackInfo | null,
  food: FoodWords,
): { readonly items: GroceryItem[]; readonly audit: AuditDraft } | null {
  const line = list.items.find((item) => item.id === lineId);
  if (
    line === undefined ||
    line.origin !== 'generated' ||
    line.section !== 'already-have' ||
    line.quantity === null
  ) {
    return null;
  }
  return backToBuy(list, line, info, fillTemplate(grocery.audit.buyAnyway, { food: food.name }));
}
