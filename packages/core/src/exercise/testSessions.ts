/**
 * Synthetic session rows for the exercise tests, with fixed ids so the id tie-break is the same on
 * every run. Imported only by test files and not exported from the module index. Dates are in
 * January and February 2000; nothing here describes anyone.
 */
import type { PreCheck, SessionMovement, SessionRecord } from '../storage/records';
import type { SeedId } from '../storage/primitives';
import { PRE_CHECK_KEYS } from './preCheck';
import type { VariantKey } from './types';

/** A pre-session check with the named answers yes and every other answer no. */
export function check(...yes: (keyof PreCheck)[]): PreCheck {
  const answers = Object.fromEntries(
    PRE_CHECK_KEYS.map((key) => [key, yes.includes(key) ? 'yes' : 'no']),
  );
  return answers as unknown as PreCheck;
}

export const ALL_NO: PreCheck = Object.freeze(check());

/** One movement with these ticked sets (reps by default, or seconds). */
export function movement(
  exerciseId: SeedId,
  variant: VariantKey,
  done: readonly number[],
  opts: { readonly unit?: 'reps' | 'seconds'; readonly planned?: number } = {},
): SessionMovement {
  const seconds = opts.unit === 'seconds';
  const planned = opts.planned ?? done[0] ?? 8;
  return {
    exerciseId,
    variant,
    sets: Math.max(1, done.length),
    reps: seconds ? null : planned,
    seconds: seconds ? planned : null,
    done: done.map((amount) => ({
      reps: seconds ? null : amount,
      seconds: seconds ? amount : null,
    })),
  };
}

/** Session n (its id is 00000000-0000-4000-8000-<n, 12 digits>); done rows are stamped. */
export function session(
  n: number,
  fields: Pick<SessionRecord, 'date' | 'templateId'> &
    Partial<
      Pick<SessionRecord, 'status' | 'movements' | 'preCheck' | 'exertion' | 'soreness' | 'energy'>
    >,
): SessionRecord {
  const status = fields.status ?? 'done';
  const done = status === 'done';
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    date: fields.date,
    templateId: fields.templateId,
    status,
    movements: fields.movements ?? [],
    preCheck: fields.preCheck === undefined ? ALL_NO : fields.preCheck,
    exertion: fields.exertion ?? null,
    soreness: fields.soreness ?? null,
    energy: fields.energy ?? null,
    durationMinutes: null,
    completedAt: done ? `${fields.date}T06:00:00.000Z` : null,
    timeZone: done ? 'Pacific/Auckland' : null,
    note: null,
  };
}
