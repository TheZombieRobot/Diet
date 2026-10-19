/**
 * The rapid-loss card (HEALTH_SAFETY section 2; HS-11 as changed by C08, C46 and D27; WT-03,
 * WT-04, WT-12; item 14 design section 3.4, W7, W8).
 *
 * The card shows on a day that is not one of the first 21 Kickstart days ever when the 7-day
 * average fell faster than the threshold (1 kg a week by default, strictly greater) in each of the
 * last 3 rolling weeks, or 2 when the owner chose that. It can only be made more sensitive (C46),
 * and it is never turned off: a dismissal hides it for the day only (the card registry).
 *
 * Each week's rate is item 4's centroid-corrected weeklyLossFromDaily: the drop of the 7-day
 * average ending that day from the 7-day average a week earlier. A counted week has no exempt day,
 * but its previous window may reach into them, which can only make that week read faster (the
 * more sensitive side; departs from C26, recorded in DECISIONS). A week with too few weigh-ins, or
 * any exempt day, breaks the run.
 */
import type { SettingsRecord } from '../storage/records';
import { RAPID_LOSS_THRESHOLD_G_PER_WEEK, RAPID_LOSS_WEEKS } from '../storage/limits';
import { roundTo } from '../util/round';
import { addDays, type LocalDate } from '../util/time';
import { weeklyLossFromDaily } from './trend';

export interface RapidLossSettingsInUse {
  readonly thresholdGPerWeek: number;
  readonly weeks: 2 | 3;
}

/**
 * The stored settings as used (C46; C50 "consumers clamp"): the threshold within 750–1000 g a week
 * and rounded down to a multiple of 50 (not a number gives 1000); weeks within 2–3 (not a whole
 * number gives 3). Stored garbage can only make the card more sensitive than the default.
 */
export function rapidLossSettingsInUse(
  stored: Pick<SettingsRecord, 'rapidLossThresholdGPerWeek' | 'rapidLossConsecutiveWeeks'>,
): RapidLossSettingsInUse {
  const { min, max, step } = RAPID_LOSS_THRESHOLD_G_PER_WEEK;
  const raw = stored.rapidLossThresholdGPerWeek;
  const threshold = Number.isFinite(raw)
    ? Math.floor(Math.min(max, Math.max(min, raw)) / step) * step
    : RAPID_LOSS_THRESHOLD_G_PER_WEEK.default;
  const weeksRaw: number = stored.rapidLossConsecutiveWeeks;
  const weeks = Number.isInteger(weeksRaw) ? (weeksRaw <= 2 ? 2 : 3) : RAPID_LOSS_WEEKS.default;
  return { thresholdGPerWeek: threshold, weeks };
}

export interface RapidLossWeek {
  /** The last day of the rolling week. */
  readonly end: LocalDate;
  /** kg a week, positive when the average went down; null with too few weigh-ins. */
  readonly rateKgPerWeek: number | null;
  /** None of the week's 7 dates is exempt. */
  readonly counted: boolean;
  readonly over: boolean;
}

export interface RapidLossStatus {
  readonly show: boolean;
  /** The week ending today first. */
  readonly weeks: readonly RapidLossWeek[];
  readonly settings: RapidLossSettingsInUse;
}

/** Faster than the threshold: compared in grams to 0.001, strictly greater (exactly 1.000 kg a week is not over). */
function overThreshold(rateKgPerWeek: number | null, settings: RapidLossSettingsInUse): boolean {
  return rateKgPerWeek !== null && roundTo(rateKgPerWeek * 1000, 3) > settings.thresholdGPerWeek;
}

/** Whether the card shows today, with each rolling week that decided it. */
export function rapidLossStatus(input: {
  readonly daily: ReadonlyMap<LocalDate, number>;
  readonly today: LocalDate;
  /** rapidLossExemptDates */
  readonly exempt: ReadonlySet<LocalDate>;
  readonly settings: RapidLossSettingsInUse;
}): RapidLossStatus {
  const weeks: RapidLossWeek[] = [];
  for (let k = 0; k < input.settings.weeks; k++) {
    const end = addDays(input.today, -7 * k);
    let counted = true;
    for (let back = 0; back < 7; back++) {
      if (input.exempt.has(addDays(end, -back))) counted = false;
    }
    const rateKgPerWeek = weeklyLossFromDaily(input.daily, end);
    weeks.push({
      end,
      rateKgPerWeek,
      counted,
      over: counted && overThreshold(rateKgPerWeek, input.settings),
    });
  }
  return { show: weeks.every((w) => w.over), weeks, settings: input.settings };
}

/** C08: the GP line inside the extension offer: the latest weekly rate (ending today) is over the threshold. Ignores exemption. */
export function rapidLineInOffer(
  daily: ReadonlyMap<LocalDate, number>,
  today: LocalDate,
  settings: RapidLossSettingsInUse,
): boolean {
  return overThreshold(weeklyLossFromDaily(daily, today), settings);
}
