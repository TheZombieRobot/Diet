/**
 * What a garden or pantry row says, and whether the plan and the grocery list count it (checklist
 * item 19; design 2.3; C57, C110; G9, G12, G15, G19, G33). One function per idea, used by the
 * garden screen, item 13's setup step and the stock read (stock.ts), so they cannot disagree.
 *
 * - An amount the owner has not entered is never shown as a weight, and no gram figure is made up
 *   (REQUIREMENTS 3D, C57). Amounts stay in the owner's units: never converted to kilograms (G19).
 * - Keep days are the owner's own figure, reported back and never judged (no food-safety claim).
 * - A picked date later than today counts as today, so days left never exceed the keep days (G15).
 */
import { garden, gardenScreen } from '../copy/health';
import { fillTemplate } from '../copy/template';
import type { Instant } from '../storage/primitives';
import type { GardenRecord, PantryRecord } from '../storage/records';
import { addDays, daysBetween, type LocalDate, localDateOf, parseLocalDate } from '../util/time';
import type { GardenUnit } from './cropForm';
import type { PantryUnit } from './pantryForm';

export type NotCountedReason = 'not-ready' | 'past-keeps' | 'not-linked' | 'none-left';

/** perishabilityDays − max(0, days since picking) when both are set, else null. Day 0 is the last counted day. */
export function gardenDaysLeft(
  row: Pick<GardenRecord, 'harvestedAt' | 'perishabilityDays'>,
  today: LocalDate,
): number | null {
  if (row.harvestedAt === null || row.perishabilityDays === null) return null;
  return row.perishabilityDays - Math.max(0, daysBetween(row.harvestedAt, today));
}

/**
 * Whether the plan and the list count a crop (G9), first reason that applies: not ready, past its
 * keep days, not linked to a food. Usable means ready and within its keep days, whatever the link.
 */
export function gardenRowStatus(
  row: GardenRecord,
  today: LocalDate,
): {
  readonly counted: boolean;
  readonly usable: boolean;
  readonly reason: NotCountedReason | null;
  readonly daysLeft: number | null;
} {
  const daysLeft = gardenDaysLeft(row, today);
  const past = daysLeft !== null && daysLeft < 0;
  const reason: NotCountedReason | null = !row.harvestReady
    ? 'not-ready'
    : past
      ? 'past-keeps'
      : row.ingredientId === null
        ? 'not-linked'
        : null;
  return { counted: reason === null, usable: row.harvestReady && !past, reason, daysLeft };
}

/** Whether the list counts a pantry item: none left, or not linked to a food, leaves it out. */
export function pantryRowStatus(row: PantryRecord): {
  readonly counted: boolean;
  readonly reason: NotCountedReason | null;
} {
  const reason: NotCountedReason | null =
    row.amount === 0 ? 'none-left' : row.ingredientId === null ? 'not-linked' : null;
  return { counted: reason === null, reason };
}

const numbers = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 2 });
const small = new Intl.NumberFormat('en-NZ', { maximumSignificantDigits: 2 });

/**
 * "1,200", "2.5". New figures have at most two decimal places (cropForm readFigure); a smaller
 * one from an imported file reads "0.001", never "0", since it is counted.
 */
const numberText = (value: number): string =>
  value > 0 && value < 0.005 ? small.format(value) : numbers.format(value);

/** An amount in the owner's own unit: "1,200 g", "2 each, about 250 g per item", "1 bunch". */
export function amountText(
  row: {
    readonly amount: number | null;
    readonly unit: GardenUnit | PantryUnit | null;
    readonly gramsPerUnit?: number | null;
    readonly harvestReady?: boolean;
  },
  source: 'garden' | 'pantry',
): string {
  const words = gardenScreen.amount;
  if (row.amount === null || row.unit === null) {
    if (source === 'pantry') return words.someNotMeasured;
    return row.harvestReady === true ? garden.available : words.notEnteredNotReady;
  }
  if (source === 'pantry' && row.amount === 0) return words.noneLeft;
  const amount = numberText(row.amount);
  const grams = row.gramsPerUnit ?? null;
  const values = { amount, grams: grams === null ? '' : numberText(grams) };
  switch (row.unit) {
    case 'g':
      return fillTemplate(words.grams, values);
    case 'ml':
      return fillTemplate(words.millilitres, values);
    case 'each':
      return fillTemplate(grams === null ? words.each : words.eachWithGrams, values);
    case 'bunch': {
      const one = row.amount === 1;
      const template =
        grams === null
          ? one
            ? words.bunchOne
            : words.bunchMany
          : one
            ? words.bunchOneWithGrams
            : words.bunchManyWithGrams;
      return fillTemplate(template, values);
    }
  }
}

const dayMonth = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const dayMonthYear = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "17 October", with the year when it is not this year's ("17 October 2000"). */
export function calendarDateText(date: LocalDate, today: LocalDate): string {
  const format = date.slice(0, 4) === today.slice(0, 4) ? dayMonth : dayMonthYear;
  return format.format(parseLocalDate(date));
}

/** Days left, how long ago it was picked, or how long it keeps: from the owner's own figures only. */
export function freshnessText(row: GardenRecord, today: LocalDate): string | null {
  const words = gardenScreen.freshness;
  const keeps = row.perishabilityDays;
  if (row.harvestedAt !== null && keeps !== null) {
    const left = gardenDaysLeft(row, today) ?? 0;
    if (left > 1) return fillTemplate(words.daysLeftMany, { days: left });
    if (left === 1) return words.daysLeftOne;
    if (left === 0) return words.lastDay;
    return keeps === 1 ? words.pastKeepsOne : fillTemplate(words.pastKeepsMany, { days: keeps });
  }
  if (row.harvestedAt !== null) {
    const ago = daysBetween(row.harvestedAt, today);
    if (ago <= 0) return words.pickedToday;
    if (ago === 1) return words.pickedYesterday;
    return fillTemplate(words.pickedOn, { date: calendarDateText(row.harvestedAt, today) });
  }
  if (keeps !== null) {
    if (keeps === 0) return words.keepsForZero;
    return keeps === 1 ? garden.keepsForOne : fillTemplate(garden.keepsFor, { days: keeps });
  }
  return null;
}

/** "Updated today", "Updated yesterday" or "Updated 17 October" (G33), in the device's zone. */
export function updatedText(updatedAt: Instant, today: LocalDate, zone: string): string {
  const words = gardenScreen.updated;
  const day = localDateOf(updatedAt, zone);
  if (day === today) return words.today;
  if (day === addDays(today, -1)) return words.yesterday;
  return fillTemplate(words.on, { date: calendarDateText(day, today) });
}

export interface RowView {
  readonly value: string;
  readonly detail: string;
  readonly detailTone: 'plain' | 'amber';
  readonly note: string | null;
}

export interface GardenRowView extends RowView {
  /** The parts `detail` joins; item 13's setup step shows `value`, `readyText` and `freshness`. */
  readonly readyText: string;
  readonly freshness: string | null;
  readonly updated: string | null;
  readonly usable: boolean;
}

/**
 * Whether the meal plan (item 22) and the grocery list (item 24) exist. Until both do, no row says
 * what they count or leave out (item 19 review): the notes would describe screens that are not
 * built. Whichever of items 22 and 24 lands second sets this to true.
 */
export const PLAN_AND_LIST_BUILT = false;

export interface RowContext {
  readonly today: LocalDate;
  readonly zone: string;
  /** False until the ingredient dataset exists (item 18). */
  readonly hasDataset: boolean;
  /** PLAN_AND_LIST_BUILT on the screens; tests pass both. */
  readonly planAndListBuilt: boolean;
}

/**
 * Why a row is or is not counted, in words. Every note is about the plan and the list, so none
 * shows until they exist. Before the dataset exists an unlinked row has no note at all (G12): it
 * cannot be counted yet, so no sentence may suggest the plan or the list counts it, or would once
 * it is ready.
 */
function noteFor(
  reason: NotCountedReason | null,
  linked: boolean,
  at: RowContext,
  countedNote: string | null,
): string | null {
  if (!at.planAndListBuilt) return null;
  if (!linked && !at.hasDataset) return null;
  if (reason === null) return countedNote;
  return gardenScreen.notCounted[reason];
}

/** A crop row: its amount, "Ready to use · 4 days left", and at most one note. */
export function gardenRowView(row: GardenRecord, at: RowContext): GardenRowView {
  const status = gardenRowStatus(row, at.today);
  const readyText = row.harvestReady ? garden.ready : garden.notReady;
  const freshness = freshnessText(row, at.today);
  const updated = row.harvestedAt === null ? updatedText(row.updatedAt, at.today, at.zone) : null;
  return {
    value: amountText(row, 'garden'),
    detail: [readyText, freshness, updated].filter((p): p is string => p !== null).join(' · '),
    detailTone: status.reason === 'past-keeps' ? 'amber' : 'plain',
    note: noteFor(
      status.reason,
      row.ingredientId !== null,
      at,
      row.amount === null ? gardenScreen.amountUnknownNote : null,
    ),
    readyText,
    freshness,
    updated,
    usable: status.usable,
  };
}

/** A pantry row: its amount, "Updated today", and at most one note. */
export function pantryRowView(row: PantryRecord, at: RowContext): RowView {
  const status = pantryRowStatus(row);
  return {
    value: amountText(row, 'pantry'),
    detail: updatedText(row.updatedAt, at.today, at.zone),
    detailTone: 'plain',
    note: noteFor(
      status.reason,
      row.ingredientId !== null,
      at,
      row.amount === null ? gardenScreen.pantryUnmeasuredNote : null,
    ),
  };
}
