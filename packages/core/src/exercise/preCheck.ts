/**
 * The pre-session check before every session (HEALTH_SAFETY.md section 6: any yes offers the
 * lighter variant or rest; section 3: a heavy work day, and never insisting on a fast; HS-29).
 * All six answers are required before the choice is shown (move.preCheck.mustAnswer).
 */
import type { PreCheck } from '../storage/records';

/** The six questions, in display order (move.preCheck.questions). */
export const PRE_CHECK_KEYS = Object.freeze([
  'painOrInjury',
  'backOrLegSymptoms',
  'tiredOrPoorSleep',
  'heatOrSun',
  'notHydrated',
  'heavyWorkDay',
] as const satisfies readonly (keyof PreCheck)[]);

export type SessionChoice = 'planned' | 'lighter' | 'rest';
export type PreCheckNote =
  'recentStopSign' | 'overCeiling' | 'allNo' | 'anyYes' | 'painFirst' | 'heavyWork' | 'fasted';

export interface PreCheckOutcome {
  /** Display order; the first is the suggestion. Rest is always a choice. */
  readonly choices: readonly SessionChoice[];
  /** Leave out pain-free-only movements (the hip hinge). */
  readonly dropPainFreeOnly: boolean;
  /**
   * Keys of move.preCheck, in this order; move.preCheck.eatFirst always follows 'fasted', and
   * recentStopSign is filled with the day of that answer ({day}).
   */
  readonly notes: readonly PreCheckNote[];
}

/**
 * True when any answer is yes; null (no check) is false. Anything but exactly 'no' counts as yes,
 * so a value that is not a stored answer can never open the planned session.
 */
export function anyYes(check: PreCheck | null): boolean {
  return check !== null && PRE_CHECK_KEYS.some((key) => check[key] !== 'no');
}

/** Pain or injury, or back or leg symptoms: rest comes first and the hinge is left out. */
export function painAnswered(check: PreCheck): boolean {
  return check.painOrInjury !== 'no' || check.backOrLegSymptoms !== 'no';
}

export interface PreCheckContext {
  /** !gates.fastingGated, a fast is running and it is not past 24 hours. */
  readonly fastingNow: boolean;
  /**
   * A Kickstart stop-sign answer (a stored check, or today's held "yes" before a start) in the
   * last 336 hours (item 14). Cross-item ruling 9.
   */
  readonly recentStopSign: boolean;
  /** A running fast past 24 hours (item 15). Cross-item ruling 9. */
  readonly fastOverCeiling: boolean;
}

/**
 * What the choice screen offers. All no: the planned session first (the lighter one first while a
 * fast runs). Any yes: only the lighter session or rest, never the planned one; with pain or back
 * or leg symptoms, rest first. `fastingNow` is false whenever a readiness answer switches fasting
 * off, so the fasted note never contradicts that gate.
 *
 * A recent Kickstart stop sign or a fast past 24 hours (ruling 9) also takes the planned session
 * away, lighter first (rest first after pain, as above), and drops the all-no line, whose "Nothing
 * you have told the app rules this out" would be untrue. Their notes come first; over the ceiling
 * the over-24-hours note replaces the fasted one. Both are read cautiously: anything but exactly
 * false counts.
 */
export function preCheckOutcome(check: PreCheck, ctx: PreCheckContext): PreCheckOutcome {
  const stopSign = (ctx.recentStopSign as unknown) !== false;
  const overCeiling = (ctx.fastOverCeiling as unknown) !== false;
  const caution: PreCheckNote[] = [
    ...(stopSign ? (['recentStopSign'] as const) : []),
    ...(overCeiling ? (['overCeiling'] as const) : []),
  ];
  const fasted: PreCheckNote[] = ctx.fastingNow && !overCeiling ? ['fasted'] : [];
  const yes = anyYes(check);
  if (!yes && caution.length === 0) {
    return Object.freeze({
      choices: Object.freeze<SessionChoice[]>(
        ctx.fastingNow ? ['lighter', 'planned', 'rest'] : ['planned', 'lighter', 'rest'],
      ),
      dropPainFreeOnly: false,
      notes: Object.freeze<PreCheckNote[]>(['allNo', ...fasted]),
    });
  }
  const pain = painAnswered(check);
  const heavyWork: PreCheckNote[] = check.heavyWorkDay !== 'no' ? ['heavyWork'] : [];
  return Object.freeze({
    choices: Object.freeze<SessionChoice[]>(pain ? ['rest', 'lighter'] : ['lighter', 'rest']),
    dropPainFreeOnly: pain,
    notes: Object.freeze<PreCheckNote[]>([
      ...caution,
      ...(yes ? (['anyYes'] as const) : []),
      ...(pain ? (['painFirst'] as const) : []),
      ...heavyWork,
      ...fasted,
    ]),
  });
}
