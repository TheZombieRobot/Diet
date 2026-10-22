/**
 * What the Drinks views show (item 28 design 3.8), worked out from one live read, item 13's live
 * gates and the clock by core functions only. Pure: the screens format it with drinksText.ts.
 *
 * The figures compared with the guidance are the shown 2-decimal totals (C94); the help card's
 * triggers use the trigger totals, which never count a mistyped low label figure low (A39). With
 * readiness answer 2 "yes" or unanswered no guidance figure is shown or compared (guidanceShown;
 * full review F30); the help card still counts against the stricter set's weekly figure.
 */
import {
  activeHelpTriggers,
  addDays,
  type AlcoholAccess,
  alcoholAccess,
  alcoholDaysOfPlaced,
  type AlcoholDayNoteRecord,
  alcoholFreeDays,
  type AlcoholHelpTrigger,
  type AlcoholMilestoneRecord,
  type BeverageRecord,
  type CardStateRecord,
  type DailyPoint,
  dailySeries,
  type DrinkingDayContext,
  type DrinkLogRecord,
  guidanceFor,
  type GuidanceShown,
  guidanceShown,
  helpTriggerWeeklyGuidance,
  instantMs,
  isAboveGuidance,
  type LocalDate,
  type PeriodTotals,
  placeDrinks,
  type ReadinessGates,
  totalsOfPlaced,
  trackingStartOf,
  type TimeZone,
  type WeekPoint,
  weekStartOf,
  weeklySeries,
} from '@diet/core';
import type { DrinksData } from './load';

export interface DrinksClock {
  readonly now: string;
  readonly deviceZone: TimeZone;
  /** The current drinking day (A33). */
  readonly today: LocalDate;
  /** Today's calendar date in the device zone (the next-day notes are keyed by it). */
  readonly noteToday: LocalDate;
}

export interface DrinksView {
  readonly access: AlcoholAccess;
  /** The set that applies, for the help card's double-guidance trigger and the guidance card. */
  readonly guidance: ReturnType<typeof guidanceFor>;
  /** What the screens show as guidance: the set's line, or the pregnancy line with no figures. */
  readonly shown: GuidanceShown;
  /** Any drink, note or milestone in the records read, so "Your earlier entries are kept." is true. */
  readonly hasRecords: boolean;
  readonly ctx: DrinkingDayContext;
  readonly today: LocalDate;
  readonly noteToday: LocalDate;
  readonly trackingStart: LocalDate | null;
  /** Not hidden, by sortOrder then createdAt. */
  readonly presets: readonly BeverageRecord[];
  readonly hiddenPresets: readonly BeverageRecord[];
  /** Every drink read (11 weeks), for the Trends day rows. */
  readonly drinks: readonly DrinkLogRecord[];
  /** The current drinking day's entries, newest first. */
  readonly todayEntries: readonly DrinkLogRecord[];
  readonly todayTotals: PeriodTotals;
  readonly weekTotals: PeriodTotals;
  readonly weekFree: { readonly count: number; readonly countedDays: number };
  readonly todayAbove: boolean;
  readonly weekAbove: boolean;
  readonly daily: readonly DailyPoint[];
  readonly weekly: readonly WeekPoint[];
  /** Newest start first. */
  readonly milestones: readonly AlcoholMilestoneRecord[];
  readonly notes: readonly AlcoholDayNoteRecord[];
  /** The help card's active triggers; the card itself decides, at its own render, which show. */
  readonly helpActive: readonly AlcoholHelpTrigger[];
  readonly cardRows: Readonly<Partial<Record<AlcoholHelpTrigger, CardStateRecord>>>;
}

const byOrder = (a: BeverageRecord, b: BeverageRecord): number =>
  a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

export function buildDrinksView(
  data: DrinksData,
  gates: ReadinessGates,
  clock: DrinksClock,
): DrinksView {
  const { settings, profile } = data;
  const ctx: DrinkingDayContext = {
    homeTimeZone: settings.homeTimeZone,
    cutoverMinutes: settings.drinkingDayCutoverMinutes,
  };
  const { today, noteToday } = clock;
  const guidance = guidanceFor(profile.sex, settings.alcoholGuidanceSet);
  const shown = guidanceShown(profile.sex, settings.alcoholGuidanceSet, gates);
  const figuresShown = shown.kind === 'guidance';
  const trackingStart = trackingStartOf(settings.alcoholNoticeAckAt, ctx);
  const weekStart = weekStartOf(today);
  const placed = placeDrinks(data.drinks, ctx);
  const todayTotals = totalsOfPlaced(placed, today, today);
  const weekTotals = totalsOfPlaced(placed, weekStart, today);
  const weekAlcohol = new Set(alcoholDaysOfPlaced(placed, weekStart, today).map((d) => d.day));
  const todayEntries = placed
    .filter((p) => p.day === today)
    .map((p) => p.row)
    .sort((a, b) => instantMs(b.at) - instantMs(a.at));
  return {
    access: alcoholAccess({ alcoholNoticeAckAt: settings.alcoholNoticeAckAt, gates }),
    guidance,
    shown,
    hasRecords: data.drinks.length > 0 || data.notes.length > 0 || data.milestones.length > 0,
    ctx,
    today,
    noteToday,
    trackingStart,
    presets: data.beverages.filter((b) => !b.archived).sort(byOrder),
    hiddenPresets: data.beverages.filter((b) => b.archived).sort(byOrder),
    drinks: data.drinks,
    todayEntries,
    todayTotals,
    weekTotals,
    weekFree: alcoholFreeDays(weekAlcohol, weekStart, today, trackingStart, today),
    todayAbove: figuresShown && isAboveGuidance(todayTotals.std, guidance.perDay),
    weekAbove: figuresShown && isAboveGuidance(weekTotals.std, guidance.perWeek),
    daily: dailySeries(data.drinks, ctx, today, trackingStart),
    weekly: weeklySeries(data.drinks, ctx, today, trackingStart, data.milestones),
    milestones: [...data.milestones].sort((a, b) =>
      a.fromDate === b.fromDate
        ? b.createdAt.localeCompare(a.createdAt)
        : b.fromDate.localeCompare(a.fromDate),
    ),
    notes: data.notes,
    helpActive: activeHelpTriggers({
      now: clock.now,
      deviceZone: clock.deviceZone,
      ctx,
      rows: data.drinks,
      weeklyGuidance: helpTriggerWeeklyGuidance(profile.sex, settings.alcoholGuidanceSet, gates),
      withdrawalTickDates: data.notes.filter((n) => n.withdrawalTick).map((n) => n.date),
      noteToday,
      q7Gated: gates.alcoholHelpCardFromDayOne,
    }),
    cardRows: data.cardRows,
  };
}

/** The next-day notes dated within the last 30 calendar days, newest first (design 2.10). */
export function recentNotes(view: DrinksView): readonly AlcoholDayNoteRecord[] {
  const first = addDays(view.noteToday, -29);
  return view.notes
    .filter((n) => n.date >= first && n.date <= view.noteToday)
    .sort((a, b) => b.date.localeCompare(a.date));
}
