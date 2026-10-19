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
export type PreCheckNote = 'allNo' | 'anyYes' | 'painFirst' | 'heavyWork' | 'fasted';

export interface PreCheckOutcome {
  /** Display order; the first is the suggestion. Rest is always a choice. */
  readonly choices: readonly SessionChoice[];
  /** Leave out pain-free-only movements (the hip hinge). */
  readonly dropPainFreeOnly: boolean;
  /** Keys of move.preCheck, in this order; move.preCheck.eatFirst always follows 'fasted'. */
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

/**
 * What the choice screen offers. All no: the planned session first (the lighter one first while a
 * fast runs). Any yes: only the lighter session or rest, never the planned one; with pain or back
 * or leg symptoms, rest first. `fastingNow` is false whenever a readiness answer switches fasting
 * off, so the fasted note never contradicts that gate.
 */
export function preCheckOutcome(
  check: PreCheck,
  ctx: { readonly fastingNow: boolean },
): PreCheckOutcome {
  const fasted: PreCheckNote[] = ctx.fastingNow ? ['fasted'] : [];
  if (!anyYes(check)) {
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
      'anyYes',
      ...(pain ? (['painFirst'] as const) : []),
      ...heavyWork,
      ...fasted,
    ]),
  });
}
