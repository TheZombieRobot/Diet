/**
 * Steps typed in by hand (item 16 design section 2.3; UX_SCREENS section 2, card 5; DATA_MODEL
 * steps_log). No goal or target is ever attached to the figure (REQUIREMENTS section 2).
 */
import type { StepsRecord } from '../storage/records';

/** The steps_log validator bound (specs/v1.ts int(0, 100000)); a test ties the two. */
export const MAX_DAILY_STEPS = 100_000;

export type StepCountParse =
  | { readonly ok: true; readonly steps: number }
  | { readonly ok: false; readonly reason: 'empty' | 'format' | 'too-many' };

const PLAIN = /^\d+$/;
/** Thousands grouped in threes with commas or spaces: "12,000", "12 000". */
const GROUPED = /^\d{1,3}(?:[ ,]\d{3})+$/;

/**
 * A count typed in the steps field: ASCII digits only, plain (leading zeros allowed) or grouped in
 * threes. "-5", "1.5", "12,00", "1e3" and full-width digits are format errors.
 */
export function parseStepCount(text: string): StepCountParse {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (!PLAIN.test(trimmed) && !GROUPED.test(trimmed)) return { ok: false, reason: 'format' };
  const steps = Number(trimmed.replace(/[ ,]/g, ''));
  if (steps > MAX_DAILY_STEPS) return { ok: false, reason: 'too-many' };
  return { ok: true, steps };
}

/**
 * Yesterday's count for the one-tap "Same as yesterday": only when today has no entry, so it never
 * overwrites one (UX card 5; design T9).
 */
export function stepsRepeatOffer(
  todayRow: Pick<StepsRecord, 'steps'> | null | undefined,
  yesterdayRow: Pick<StepsRecord, 'steps'> | null | undefined,
): number | null {
  if (todayRow !== null && todayRow !== undefined) return null;
  return yesterdayRow?.steps ?? null;
}
