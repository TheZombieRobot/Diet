/**
 * The fasting screens' writes (item 15 design 3.9 and 6.3). Each calls one repository method (or
 * one transaction) and returns what went wrong as the line to show under the control, or null.
 * None writes on its own initiative. The planned length of a fast is worked out at the moment of
 * the tap, from the stored fasts and the schedule the screen shows.
 */
import {
  type DayWindowChange,
  type FastRecord,
  fastRecordPlan,
  type Instant,
  instantMs,
  type LocalDate,
  planFast,
  type Schedule,
  StorageInvariantError,
  StorageValidationError,
  type SymptomRecord,
} from '@diet/core';
import { fasting, privacy } from '@diet/core/copy/health';
import { StorageClosedError, StorageFullError, StorageRuleError } from '../../db/errors';
import type { AppStorage } from '../../db/runtime';
import { joiningSpanStart } from './view';

/** What a failed action says, and whether trying again can help (design 3.9). */
export interface ActionFailure {
  readonly message: string;
  readonly retry: boolean;
}

export type ActionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ActionFailure };

const RULE_MESSAGES: Readonly<Record<string, string>> = {
  'fasting-gated': fasting.gated.refused,
  'future-time': fasting.history.future,
  'already-ended': fasting.card.alreadyEnded,
  'not-latest': fasting.card.notLatest,
  'not-ended': fasting.card.notEnded,
  'undo-expired': fasting.card.undoExpired,
  'not-found': fasting.card.notFound,
  reopen: fasting.card.notLatest,
};

/** The line for a failed write (design 3.9). */
export function actionFailure(error: unknown): ActionFailure {
  if (error instanceof StorageInvariantError) {
    if (error.rule === 'fast-running')
      return { message: fasting.card.alreadyRunning, retry: false };
    if (error.rule === 'fast-overlap') return { message: fasting.history.overlap, retry: false };
  }
  if (error instanceof StorageRuleError) {
    const message = RULE_MESSAGES[error.rule];
    if (message !== undefined) return { message, retry: false };
  }
  if (error instanceof StorageValidationError)
    return { message: fasting.card.invalid, retry: false };
  if (error instanceof StorageFullError) return { message: privacy.storageFull, retry: true };
  if (error instanceof StorageClosedError)
    return { message: privacy.backupCard.closed, retry: true };
  return { message: fasting.card.failed, retry: true };
}

async function attempt<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, failure: actionFailure(error) };
  }
}

/** A note as typed: trimmed, and null when nothing is left (the repository normalises the rest). */
export function noteValue(text: string): string | null {
  const note = text.trim();
  return note === '' ? null : note;
}

/**
 * Starts a fast now, planned from now to the next window and capped at 24 hours of its span (a
 * fast ended less than an hour ago joins it).
 */
export function startFast(
  storage: AppStorage,
  fasts: readonly FastRecord[],
  schedule: Schedule,
): Promise<ActionResult<FastRecord>> {
  return attempt(() => {
    const now = instantMs(storage.env.now());
    const plan = planFast(now, storage.env.timeZone(), schedule, joiningSpanStart(fasts, now));
    return storage.repos.fasts.start(fastRecordPlan(plan));
  });
}

export const endFast = (storage: AppStorage, id: string): Promise<ActionResult<FastRecord>> =>
  attempt(() => storage.repos.fasts.end(id));

export const undoStart = (storage: AppStorage, id: string): Promise<ActionResult<void>> =>
  attempt(() => storage.repos.fasts.remove(id));

export const undoEnd = (storage: AppStorage, id: string): Promise<ActionResult<FastRecord>> =>
  attempt(() => storage.repos.fasts.undoEnd(id));

export const saveNote = (
  storage: AppStorage,
  id: string,
  text: string,
): Promise<ActionResult<FastRecord>> =>
  attempt(() => storage.repos.fasts.update(id, { note: noteValue(text) }));

/**
 * A running fast's new start, typed in the device zone (which is stored with it), with its plan
 * worked out again for its span.
 */
export function changeStart(
  storage: AppStorage,
  fast: FastRecord,
  startedAt: Instant,
  fasts: readonly FastRecord[],
  schedule: Schedule,
): Promise<ActionResult<FastRecord>> {
  return attempt(() => {
    const start = instantMs(startedAt);
    const zone = storage.env.timeZone();
    const others = fasts.filter((f) => f.id !== fast.id && instantMs(f.startedAt) < start);
    const plan = planFast(start, zone, schedule, joiningSpanStart(others, start));
    return storage.repos.fasts.update(fast.id, {
      startedAt,
      timeZone: zone,
      ...fastRecordPlan(plan),
    });
  });
}

/**
 * A completed fast's new times and note. A changed time was typed in the device zone, which is
 * stored with it; a changed start clears the planned length.
 */
export function editFast(
  storage: AppStorage,
  fast: FastRecord,
  changes: { readonly startedAt: Instant; readonly endedAt: Instant; readonly note: string },
): Promise<ActionResult<FastRecord>> {
  const zone = storage.env.timeZone();
  const startChanged = changes.startedAt !== fast.startedAt;
  return attempt(() =>
    storage.repos.fasts.update(fast.id, {
      ...(startChanged
        ? { startedAt: changes.startedAt, timeZone: zone, plannedFastMinutes: null }
        : {}),
      ...(changes.endedAt === fast.endedAt
        ? {}
        : { endedAt: changes.endedAt, endedTimeZone: zone }),
      note: noteValue(changes.note),
    }),
  );
}

export const deleteFast = (storage: AppStorage, id: string): Promise<ActionResult<void>> =>
  attempt(() => storage.repos.fasts.remove(id));

/** "Add 5 pm snack", "Eat 1 hour earlier": all the option's changes at once. */
export const setDayWindows = (
  storage: AppStorage,
  changes: readonly DayWindowChange[],
): Promise<ActionResult<void>> => attempt(() => storage.repos.planDays.setWindows(changes));

/** Undo of a per-day change. */
export const clearDayWindow = (storage: AppStorage, date: LocalDate): Promise<ActionResult<void>> =>
  attempt(() => storage.repos.planDays.clearWindow(date));

/** "Not now" on the 5 pm snack offer, for that date only. */
export const dismissSnack = (
  storage: AppStorage,
  date: LocalDate,
): Promise<ActionResult<unknown>> =>
  attempt(() => storage.repos.cardState.dismiss('single-meal-snack', `date:${date}`));

/** "Not now" on the GP nudge: back after 7 days while it is still due. */
export const dismissNudge = (storage: AppStorage): Promise<ActionResult<unknown>> =>
  attempt(() => storage.repos.cardState.dismiss('reflux-gp-nudge', 'rolling'));

/** A tap on a symptom button: logged now, in the device zone (the repository fills both). */
export const logSymptom = (
  storage: AppStorage,
  symptom: SymptomRecord['symptom'],
): Promise<ActionResult<SymptomRecord>> =>
  attempt(() => storage.repos.symptoms.create({ symptom, severity: null, note: null }));

/** A rating, a note or an edit; a changed time carries the device zone it was typed in. */
export const updateSymptom = (
  storage: AppStorage,
  id: string,
  patch: Partial<Pick<SymptomRecord, 'at' | 'timeZone' | 'symptom' | 'severity' | 'note'>>,
): Promise<ActionResult<SymptomRecord>> => attempt(() => storage.repos.symptoms.update(id, patch));

export const deleteSymptom = (storage: AppStorage, id: string): Promise<ActionResult<void>> =>
  attempt(() => storage.repos.symptoms.remove(id));

/** The reflux switches on the Reflux card (F8). */
export const setRefluxPreference = (
  storage: AppStorage,
  which: 'refluxPreferEarlier' | 'refluxPreferSplit',
  on: boolean,
): Promise<ActionResult<unknown>> => attempt(() => storage.repos.targets.update({ [which]: on }));
