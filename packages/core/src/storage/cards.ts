/**
 * The card registry and day boundaries for card dismissals (storage spec sections 3.5 and 4.12;
 * C44, C21, C46, C47, C55, C59, C73, C109; D9, D26, D43).
 *
 * card_state holds one row per card and trigger. A dismissal applies only to its own trigger
 * (C44). A later item that adds a card, a trigger or a dismissal rule edits the registry, which is
 * a validator change and so needs a new schema version (section 9.2).
 */
import { addDays, localWallClockOf, zonedWallTimeToInstant } from '../util/time';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from './dates';
import { type Instant, isId, isLocalDate, type TimeZone } from './primitives';

/** Where a "collapsed for the day" dismissal ends (section 3.5). */
export type CardBoundary = 'calendar-midnight' | 'drinking-day-cutover';

export type CardDismissal =
  /** The backup reminder's own snooze (section 12.2; BK-03). */
  | { readonly kind: 'backup-snooze' }
  /** Hidden for this many hours of elapsed time, then shown again while the condition holds. */
  | { readonly kind: 'returns-after'; readonly hours: number }
  /** Hidden until collapsedUntil(...) and shown again afterwards while the condition holds. */
  | { readonly kind: 'collapsed'; readonly boundary: CardBoundary }
  /** A dismissal or done hides that trigger for good. */
  | { readonly kind: 'final' };

export type CardTrigger = {
  /** A literal trigger, or one of the patterns 'period:<Id>', 'period:<Id>:<n>', 'date:<LocalDate>', 'v<N>'. */
  readonly pattern: string;
  readonly dismissal: CardDismissal;
};

export const CARD_IDS = Object.freeze([
  'backup-reminder',
  'alcohol-help',
  'cholesterol-checkin',
  'electrolyte-reminder',
  'rapid-loss',
  'weight-fluctuation-explainer',
  'steady-explainer',
  'kickstart-stop-signs',
  'kickstart-extension',
  'reflux-gp-nudge',
  'single-meal-snack',
  'update-notice',
] as const);
export type CardId = (typeof CARD_IDS)[number];

export type CardRegistry = { readonly [K in CardId]: readonly CardTrigger[] };

const final: CardDismissal = { kind: 'final' };
const collapsedMidnight: CardDismissal = { kind: 'collapsed', boundary: 'calendar-midnight' };
const collapsedDrinkingDay: CardDismissal = { kind: 'collapsed', boundary: 'drinking-day-cutover' };

/** Version 1 of the registry (section 4.12). Frozen with schema version 1. */
export const CARD_REGISTRY_V1: CardRegistry = Object.freeze({
  // Section 12.2 (item 12).
  'backup-reminder': [{ pattern: 'weekly', dismissal: { kind: 'backup-snooze' } }],
  'alcohol-help': [
    // Q7 yes or unanswered: returns 30 × 24 h after dismissal (C21 point 3, C58).
    { pattern: 'readiness-q7', dismissal: { kind: 'returns-after', hours: 720 } },
    // The HS-06 conditions: back the next drinking day while the condition holds (C44). The
    // withdrawal tick follows C44 rather than C05's "monthly", which shows the card more often (D43).
    { pattern: 'consecutive-days', dismissal: collapsedDrinkingDay },
    { pattern: 'double-guidance', dismissal: collapsedDrinkingDay },
    { pattern: 'withdrawal-tick', dismissal: collapsedDrinkingDay },
  ],
  // C109: first run, then 56 and 84 elapsed days after firstLowCarbAt; final per trigger.
  'cholesterol-checkin': [
    { pattern: 'day-1', dismissal: final },
    { pattern: 'day-56', dismissal: final },
    { pattern: 'day-84', dismissal: final },
  ],
  'electrolyte-reminder': [{ pattern: 'daily', dismissal: collapsedMidnight }],
  // HS-11 as changed by C08, C46 and D27. It can never be turned off (C46); a dismissal never
  // hides it for longer than the day.
  'rapid-loss': [{ pattern: 'steady', dismissal: collapsedMidnight }],
  'weight-fluctuation-explainer': [{ pattern: 'once', dismissal: final }],
  // The day that period flips to Steady (WT-08); carries the C55 "keep 23:1" button.
  'steady-explainer': [{ pattern: 'period:<Id>', dismissal: final }],
  // Every day of that Kickstart period (HS section 2, HS-27 per C17, C59, C102).
  'kickstart-stop-signs': [{ pattern: 'period:<Id>', dismissal: collapsedMidnight }],
  // n = extensions already in that period; only while an extension is still allowed (C59, D27, D28).
  'kickstart-extension': [{ pattern: 'period:<Id>:<n>', dismissal: final }],
  // Symptoms on 3 or more days in any 14, or rising severity (C47): back after 7 × 24 h.
  'reflux-gp-nudge': [{ pattern: 'rolling', dismissal: { kind: 'returns-after', hours: 168 } }],
  // The 23:1 "Add the 5 pm snack?" offer for that planned day (FL-12, C73).
  'single-meal-snack': [{ pattern: 'date:<LocalDate>', dismissal: final }],
  // After an upgrade or import whose migration changed stored values (section 9.2).
  'update-notice': [{ pattern: 'v<N>', dismissal: final }],
});

/** The current registry (part of the spec fingerprint). */
export const CARD_REGISTRY: CardRegistry = CARD_REGISTRY_V1;

const PERIOD_OFFER_RE = /^period:(.+):([0-2])$/;
const VERSION_RE = /^v([1-9]\d{0,3})$/;

/** Whether `trigger` is an occurrence of `pattern` (section 4.12 trigger patterns). */
export function triggerMatches(pattern: string, trigger: string): boolean {
  switch (pattern) {
    case 'period:<Id>':
      return trigger.startsWith('period:') && isId(trigger.slice('period:'.length));
    case 'period:<Id>:<n>': {
      const m = PERIOD_OFFER_RE.exec(trigger);
      return m !== null && isId(m[1]);
    }
    case 'date:<LocalDate>':
      return trigger.startsWith('date:') && isLocalDate(trigger.slice('date:'.length));
    case 'v<N>': {
      const m = VERSION_RE.exec(trigger);
      return m !== null && Number(m[1]) >= 2;
    }
    default:
      return pattern === trigger;
  }
}

/** The registry entry for a card and trigger, or null when the pair is not registered. */
export function cardTrigger(
  cardId: string,
  trigger: string,
  registry: CardRegistry = CARD_REGISTRY,
): CardTrigger | null {
  if (!Object.hasOwn(registry, cardId)) return null;
  return registry[cardId as CardId].find((t) => triggerMatches(t.pattern, trigger)) ?? null;
}

/** The update-notice trigger for a schema version (section 9.2). */
export function updateNoticeTrigger(version: number): string {
  return `v${version}`;
}

/** The kickstart-extension offer trigger for a period (n = extensions already in it). */
export function extensionOfferTrigger(periodId: string, extensions: number): string {
  return `period:${periodId}:${extensions}`;
}

/** Minutes after local midnight at which a collapsed card comes back (0, or the drinking-day cut-over). */
export function boundaryMinutes(boundary: CardBoundary, drinkingDayCutoverMinutes: number): number {
  return boundary === 'calendar-midnight' ? 0 : drinkingDayCutoverMinutes;
}

/**
 * End of a "collapsed for the day" dismissal, in milliseconds since the epoch: the first boundary
 * after dismissedAt, read in the zone the dismissal was made in (section 3.5; D9). The card is
 * collapsed while now < collapsedUntil(...). Because the end is a fixed instant, travelling cannot
 * stretch a one-day dismissal past about 25 hours.
 */
export function collapsedUntil(
  dismissedAt: Instant,
  dismissedTimeZone: TimeZone,
  boundary: number,
): number {
  const zone = resolveZone(dismissedTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  const { date, minutes } = localWallClockOf(dismissedAt, zone);
  return zonedWallTimeToInstant(minutes < boundary ? date : addDays(date, 1), boundary, zone);
}
