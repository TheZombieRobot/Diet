/**
 * The long-term goal and the next milestone (HEALTH_SAFETY section 2; HS-01, HS-21; WT-01, WT-02;
 * DECISIONS weight goals row, C04; storage D50; item 14 design section 3.2).
 *
 * - The long-term goal must be below the current weight and at or above BMI 18.5 for the height,
 *   judged by item 13's meetsBmiFloor (goal rounded down, height up), so items 13 and 14 always
 *   agree. It may be more than 20% below the current weight.
 * - The next milestone is worked out, never entered: no more than 20% below the current weight,
 *   rounded up to 0.1 kg, and never below the goal, so never below the floor either.
 * - Goal and milestone are hidden while readiness closes goal setting or the deficit; the stored
 *   goal is kept (RD-06). A stored goal that now fails the floor is shown as needing an update,
 *   never as a number (D50).
 */
import type { ReadinessGates } from '../storage/readiness';
import { parseOptionalNumber } from '../util/parse';
import { roundTo } from '../util/round';
import { meetsBmiFloor } from './bmi';
import { WEIGHT_LIMITS_KG } from './trend';

/** The milestone is never more than this fraction below the current weight (DECISIONS weight goals; C04). */
export const MILESTONE_MAX_FRACTION_BELOW = 0.2;

/** Goal entry and display are allowed (W4): goal setting open and a deficit allowed. Item 13's profile form uses it too. */
export function goalVisible(
  gates: Pick<ReadinessGates, 'goalSettingAvailable' | 'deficitAllowed'>,
): boolean {
  return gates.goalSettingAvailable && gates.deficitAllowed;
}

export type WeightInput =
  | { readonly ok: true; readonly kg: number }
  | { readonly ok: false; readonly reason: 'not-a-number' | 'out-of-range' };

/** A typed weight: a plain number (parseOptionalNumber), from 20 to 400 kg, rounded to 0.1 kg. Blank is not a number. */
export function parseWeightInput(text: string): WeightInput {
  let value: number | undefined;
  try {
    value = parseOptionalNumber(text);
  } catch {
    return { ok: false, reason: 'not-a-number' };
  }
  if (value === undefined) return { ok: false, reason: 'not-a-number' };
  if (value < WEIGHT_LIMITS_KG.min || value > WEIGHT_LIMITS_KG.max) {
    return { ok: false, reason: 'out-of-range' };
  }
  return { ok: true, kg: roundTo(value, 1) };
}

/** A height the BMI check can use (the profile's 120–230 cm); anything else counts as missing. */
const usableHeight = (heightCm: number | null): heightCm is number =>
  heightCm !== null && heightCm >= 120 && heightCm <= 230;

export type GoalCheck =
  | { readonly ok: true; readonly goalKg: number }
  | {
      readonly ok: false;
      readonly reason:
        'out-of-range' | 'needs-height' | 'needs-weigh-in' | 'not-below-weight' | 'below-bmi-floor';
    };

/**
 * A long-term goal as typed, in order: 20–400 kg; a height; a current weight (goalReferenceKgFor);
 * below the current weight; at or above BMI 18.5 for the height. No 20% limit here: that applies
 * to the milestone.
 */
export function checkLongTermGoal(
  goalKg: number,
  heightCm: number | null,
  currentKg: number | null,
): GoalCheck {
  if (!(goalKg >= WEIGHT_LIMITS_KG.min && goalKg <= WEIGHT_LIMITS_KG.max)) {
    return { ok: false, reason: 'out-of-range' };
  }
  if (!usableHeight(heightCm)) return { ok: false, reason: 'needs-height' };
  if (currentKg === null) return { ok: false, reason: 'needs-weigh-in' };
  if (goalKg >= currentKg) return { ok: false, reason: 'not-below-weight' };
  if (!meetsBmiFloor(goalKg, heightCm)) return { ok: false, reason: 'below-bmi-floor' };
  return { ok: true, goalKg };
}

/**
 * The next milestone: null when the goal is at or above the reference; otherwise the goal, or
 * (1 − 0.2) × reference rounded up to 0.1 kg when that is higher. Never below 0.8 × reference.
 */
export function nearerMilestoneKg(goalKg: number, referenceKg: number): number | null {
  if (goalKg >= referenceKg) return null;
  const step = Math.ceil(roundTo((1 - MILESTONE_MAX_FRACTION_BELOW) * referenceKg * 10, 6)) / 10;
  return Math.max(goalKg, step);
}

export type GoalMilestone =
  | { readonly kind: 'milestone'; readonly kg: number }
  | { readonly kind: 'is-goal' }
  | { readonly kind: 'needs-weigh-in' }
  | { readonly kind: 'none' };

export type GoalView =
  | { readonly status: 'gated' }
  | { readonly status: 'none' }
  | { readonly status: 'needs-height' }
  | { readonly status: 'needs-update' }
  | { readonly status: 'set'; readonly goalKg: number; readonly milestone: GoalMilestone };

/**
 * What the goal displays show, in order: hidden by readiness; no goal; no usable height; a stored
 * goal now below the floor (D50); otherwise the goal and its milestone (needs a weigh-in from the
 * last 14 days; none when the goal is at or above the reference). Only 'set' carries a number.
 */
export function goalView(input: {
  readonly goalKg: number | null;
  readonly heightCm: number | null;
  /** milestoneReferenceKg */
  readonly referenceKg: number | null;
  readonly gates: Pick<ReadinessGates, 'goalSettingAvailable' | 'deficitAllowed'>;
}): GoalView {
  const { goalKg, heightCm, referenceKg } = input;
  if (!goalVisible(input.gates)) return { status: 'gated' };
  if (goalKg === null) return { status: 'none' };
  if (!usableHeight(heightCm)) return { status: 'needs-height' };
  if (!meetsBmiFloor(goalKg, heightCm)) return { status: 'needs-update' };
  if (referenceKg === null) return { status: 'set', goalKg, milestone: { kind: 'needs-weigh-in' } };
  const kg = nearerMilestoneKg(goalKg, referenceKg);
  if (kg === null) return { status: 'set', goalKg, milestone: { kind: 'none' } };
  return {
    status: 'set',
    goalKg,
    milestone: kg === goalKg ? { kind: 'is-goal' } : { kind: 'milestone', kg },
  };
}
