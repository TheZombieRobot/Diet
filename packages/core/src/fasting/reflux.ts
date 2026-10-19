/**
 * Reflux options and the GP nudge (item 15; HEALTH_SAFETY.md section 3; DOC_REVIEW C47, C104;
 * FL-11, FL-15, FL-16). The app does not diagnose: these rules only decide when to show the
 * earlier-dinner and split-meal options and when to suggest seeing a GP.
 */
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import type { TimeZone } from '../storage/primitives';
import type { SymptomRecord } from '../storage/records';
import { addDays, type LocalDate, localDateOf } from '../util/time';

/** Symptoms on this many distinct days in the window bring the GP nudge (C47). */
export const REFLUX_NUDGE_DAYS = 3;

/** The window the nudge looks at, in local days, today included. */
export const REFLUX_NUDGE_WINDOW_DAYS = 14;

/** A symptom's local date, in the zone it was logged in (falling back to the home zone). */
export function symptomDate(
  row: Pick<SymptomRecord, 'at' | 'timeZone'>,
  homeTimeZone: TimeZone,
): LocalDate {
  return localDateOf(
    row.at,
    resolveZone(row.timeZone, homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone,
  );
}

/**
 * Which reflux options to offer. A symptom logged today or yesterday shows both (the symptom day
 * and the next day; consecutive symptom days keep them showing, C104); otherwise each follows its
 * switch.
 */
export function refluxOptionsVisible(input: {
  readonly symptoms: readonly Pick<SymptomRecord, 'at' | 'timeZone'>[];
  readonly today: LocalDate;
  readonly homeTimeZone: TimeZone;
  readonly preferEarlier: boolean;
  readonly preferSplit: boolean;
}): { earlier: boolean; split: boolean; symptomTriggered: boolean } {
  const yesterday = addDays(input.today, -1);
  const symptomTriggered = input.symptoms.some((row) => {
    const date = symptomDate(row, input.homeTimeZone);
    return date === input.today || date === yesterday;
  });
  return {
    earlier: input.preferEarlier || symptomTriggered,
    split: input.preferSplit || symptomTriggered,
    symptomTriggered,
  };
}

export interface RefluxNudge {
  readonly due: boolean;
  /** Distinct symptom days in the last 14 local days. */
  readonly days: number;
  /** This week's strongest rating is above last week's, both weeks rated. */
  readonly stronger: boolean;
}

/**
 * The GP nudge (C47; a judgement call for the owner's item-42 review): symptoms on 3 or more
 * distinct days in the last 14, or stronger this week than the week before.
 */
export function refluxNudge(
  symptoms: readonly Pick<SymptomRecord, 'at' | 'timeZone' | 'severity'>[],
  today: LocalDate,
  homeTimeZone: TimeZone,
): RefluxNudge {
  const dated = symptoms.map((row) => ({
    date: symptomDate(row, homeTimeZone),
    severity: row.severity,
  }));
  const from = addDays(today, -(REFLUX_NUDGE_WINDOW_DAYS - 1));
  const days = new Set(dated.filter((s) => s.date >= from && s.date <= today).map((s) => s.date))
    .size;
  const strongest = (low: LocalDate, high: LocalDate): number | null => {
    const ratings = dated
      .filter((s) => s.date >= low && s.date <= high && s.severity !== null)
      .map((s) => s.severity ?? 0);
    return ratings.length === 0 ? null : Math.max(...ratings);
  };
  const thisWeek = strongest(addDays(today, -6), today);
  const lastWeek = strongest(from, addDays(today, -7));
  const stronger = thisWeek !== null && lastWeek !== null && thisWeek > lastWeek;
  return { due: days >= REFLUX_NUDGE_DAYS || stronger, days, stronger };
}
