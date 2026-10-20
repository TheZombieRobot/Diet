/**
 * Reading the drinks forms (item 28 design 2.3 to 2.6; A19, A21). An earlier time is a date and a
 * time in the device zone, turned into an instant with core zonedWallTimeToInstant, never by
 * parsing a datetime-local string; a time still to come is refused. Numbers are read with core
 * parseOptionalNumber, never Number().
 */
import {
  type BeverageRecord,
  type Instant,
  instantMs,
  isClockTime,
  isLocalDate,
  type LocalDate,
  MAX_ENTRY_COUNT,
  parseClockTime,
  parseOptionalNumber,
  zonedWallTimeToInstant,
} from '@diet/core';
import { alcohol } from '@diet/core/copy/health';
import type { StorageEnv } from '../../db/env';

const a = alcohol.log;

export interface WhenDraft {
  readonly count: string;
  readonly when: 'now' | 'earlier';
  readonly date: LocalDate;
  readonly time: string;
}

export const freshWhen = (date: LocalDate): WhenDraft => ({
  count: '1',
  when: 'now',
  date,
  time: '',
});

export type WhenProblems = Partial<Record<'count' | 'time', string>>;

/** A whole number from 1 to 100 typed into a field, or null. */
export function readCount(text: string): number | null {
  try {
    const value = parseOptionalNumber(text);
    return value !== undefined && Number.isInteger(value) && value >= 1 && value <= MAX_ENTRY_COUNT
      ? value
      : null;
  } catch {
    return null;
  }
}

/** A date and time in the device zone, or why not ('time' when missing, 'future' when ahead). */
export function readEarlier(
  date: string,
  time: string,
  env: StorageEnv,
): { readonly at: Instant } | { readonly problem: string } {
  if (!isLocalDate(date) || !isClockTime(time)) return { problem: a.errors.time };
  const ms = zonedWallTimeToInstant(date, parseClockTime(time), env.timeZone());
  if (ms > instantMs(env.now())) return { problem: a.errors.future };
  return { at: new Date(ms).toISOString() };
}

/** The count and the time to log, or the problems to show. */
export function readWhen(
  draft: WhenDraft,
  env: StorageEnv,
):
  | { readonly ok: true; readonly count: number; readonly at: Instant | undefined }
  | { readonly ok: false; readonly problems: WhenProblems } {
  const problems: WhenProblems = {};
  const count = readCount(draft.count);
  if (count === null) problems.count = a.errors.count;
  let at: Instant | undefined;
  if (draft.when === 'earlier') {
    const earlier = readEarlier(draft.date, draft.time, env);
    if ('problem' in earlier) problems.time = earlier.problem;
    else at = earlier.at;
  }
  if (count === null || problems.time !== undefined) return { ok: false, problems };
  return { ok: true, count, at };
}

/** The first sort order free after every preset, hidden ones included (A19). */
export function nextSortOrder(presets: readonly BeverageRecord[]): number {
  return presets.length === 0 ? 0 : Math.min(999, Math.max(...presets.map((p) => p.sortOrder)) + 1);
}
