/**
 * Two of Today's reminders (item 16 design section 2.4; HEALTH_SAFETY section 4; DOC_REVIEW C72,
 * C109; TEST_PLAN NU-08). Pure: callers pass `now` and the stored rows.
 *
 * The cholesterol check-in (C109): the lipid test at the end of setup, then check-ins once 56 and
 * 84 days have passed since the first low-carb day (profile.firstLowCarbAt, set once and never
 * reset), or since the profile was made when there was none. A "Hide this reminder" counts only
 * for the reference it was made under, so when low-carb eating first starts after a balanced
 * start, the lipid test and both check-ins are counted again once, from that day.
 *
 * The electrolyte reminder (C72): daily during Kickstart and for the first 14 days of a keto
 * carb-ceiling period, and only while the keto ceiling is available in keto mode, so a stale
 * Kickstart, a closed gate or a switch to balanced or moderate ends it at once. "Hide for today"
 * collapses it until calendar midnight in the zone of the dismissal.
 */
import { cardHidden, type CardStateTimes, cardTrigger, type CardDismissal } from '../storage/cards';
import { elapsedStartAt } from '../storage/clock';
import { type Instant, instantMs } from '../storage/primitives';
import type { ReadinessGates } from '../storage/readiness';
import type { CardStateRecord, DietMode } from '../storage/records';

const DAY_MS = 86_400_000;

export type CholesterolTrigger = 'day-1' | 'day-56' | 'day-84';

/** Days after the reference at which each trigger falls due (C109). */
export const CHOLESTEROL_OFFSET_DAYS: Readonly<Record<CholesterolTrigger, number>> = Object.freeze({
  'day-1': 0,
  'day-56': 56,
  'day-84': 84,
});

export interface CholesterolCheckinInput {
  readonly now: Instant;
  readonly onboardingCompletedAt: Instant | null;
  readonly firstLowCarbAt: Instant | null;
  readonly profileCreatedAt: Instant;
  /** The card_state rows of 'cholesterol-checkin', by trigger. */
  readonly rows: Readonly<
    Partial<Record<CholesterolTrigger, Pick<CardStateRecord, 'dismissedAt' | 'doneAt'>>>
  >;
}

const at = (instant: Instant): number => instantMs(instant);

/**
 * The instant the check-ins count from: the first low-carb day, else the profile's creation. When
 * that is dated ahead of the clock (a clock that ran ahead and was put right), the earliest of the
 * stored setup times, which errs towards an earlier reminder.
 */
export function cholesterolReference(input: CholesterolCheckinInput): Instant {
  const raw = input.firstLowCarbAt ?? input.profileCreatedAt;
  if (at(raw) <= at(input.now)) return raw;
  const stored = [input.firstLowCarbAt, input.onboardingCompletedAt, input.profileCreatedAt].filter(
    (t): t is Instant => t !== null,
  );
  return stored.reduce((earliest, t) => (at(t) < at(earliest) ? t : earliest));
}

/** The check-in to show now, or null. Only the latest due trigger shows. */
export function cholesterolCheckinDue(input: CholesterolCheckinInput): CholesterolTrigger | null {
  if (input.onboardingCompletedAt === null) return null;
  const nowMs = at(input.now);
  const reference = at(cholesterolReference(input));
  /** A hide or done time of the trigger in [fromMs, now]; one dated ahead hides nothing. */
  const hidden = (trigger: CholesterolTrigger, fromMs: number): boolean => {
    const row = input.rows[trigger];
    return [row?.dismissedAt ?? null, row?.doneAt ?? null].some(
      (t) => t !== null && at(t) >= fromMs && at(t) <= nowMs,
    );
  };
  if (reference > nowMs) return hidden('day-1', -Infinity) ? null : 'day-1';
  const elapsed = nowMs - reference;
  const trigger: CholesterolTrigger =
    elapsed >= CHOLESTEROL_OFFSET_DAYS['day-84'] * DAY_MS
      ? 'day-84'
      : elapsed >= CHOLESTEROL_OFFSET_DAYS['day-56'] * DAY_MS
        ? 'day-56'
        : 'day-1';
  return hidden(trigger, reference + CHOLESTEROL_OFFSET_DAYS[trigger] * DAY_MS) ? null : trigger;
}

/** The carb-ceiling part of the electrolyte reminder lasts this many days (C72). */
export const ELECTROLYTE_CEILING_DAYS = 14;

export interface ElectrolyteReminderInput {
  readonly now: Instant;
  readonly gates: Pick<ReadinessGates, 'ketoCeilingAvailable' | 'kickstartAvailable'>;
  readonly dietMode: DietMode;
  /** Item 14's isKickstartDay(...) today. */
  readonly kickstartToday: boolean;
  readonly carbCeilingStartedAt: Instant | null;
  /** The card_state row of 'electrolyte-reminder' / 'daily'. */
  readonly row: CardStateTimes | null | undefined;
}

const COLLAPSED_MIDNIGHT: CardDismissal = { kind: 'collapsed', boundary: 'calendar-midnight' };

export function electrolyteReminderDue(input: ElectrolyteReminderInput): boolean {
  const { gates } = input;
  if (!gates.ketoCeilingAvailable || input.dietMode !== 'keto') return false;
  const kickstart = input.kickstartToday && gates.kickstartAvailable;
  // A start dated ahead of the clock reads as now, so it is inside the 14 days.
  const start = elapsedStartAt(input.carbCeilingStartedAt, input.now);
  const ceiling = start !== null && at(input.now) - at(start) < ELECTROLYTE_CEILING_DAYS * DAY_MS;
  if (!kickstart && !ceiling) return false;
  return !cardHidden({
    now: input.now,
    row: input.row,
    dismissal: cardTrigger('electrolyte-reminder', 'daily')?.dismissal ?? COLLAPSED_MIDNIGHT,
    drinkingDayCutoverMinutes: 0,
  });
}
