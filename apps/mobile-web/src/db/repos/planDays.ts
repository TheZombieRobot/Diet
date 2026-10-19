/**
 * Planned days (storage spec sections 4.7 and 8.2): the generic repository, plus the per-day
 * eating windows of item 15 (the 5 pm snack, "Eat 1 hour earlier", their Undo and the clean-up
 * when the pattern changes; DOC_REVIEW C30, C73).
 *
 * setWindows writes all its changes in one transaction, so a pair of days (an earlier window and
 * the next day's wider one) is never left half written. A date with no row gets one with no meals,
 * which holds only the window (readers treat it as no plan; its diet mode is the profile's, because
 * the validator needs one). Clearing a date's window removes a row that has no meals, and sets the
 * window to null on one that has. Whether a change is allowed is a planning rule the screens check
 * first (core dayWindowChangeAllowed); every plan is capped at 24 hours at the start of a fast.
 */
import type { DayWindowChange, LocalDate, PlanDayRecord } from '@diet/core';
import Dexie from 'dexie';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { type CrudRepo, crudRepo, stampCreate, stampUpdate } from './crud';

export interface PlanDaysRepo extends CrudRepo<'plan_days'> {
  /** Sets (or, with a null window, clears) each date's eating window, all in one transaction. */
  readonly setWindows: (changes: readonly DayWindowChange[]) => Promise<void>;
  /** Clears a date's eating window. */
  readonly clearWindow: (date: LocalDate) => Promise<void>;
}

type Row = Record<string, unknown>;

export function planDaysRepo(ctx: RepoContext): PlanDaysRepo {
  const { db, env } = ctx;
  const crud = crudRepo(ctx, 'plan_days');
  const setWindows = (changes: readonly DayWindowChange[]): Promise<void> => {
    // One change per date, the last one given.
    const byDate = [...new Map(changes.map((c) => [c.date, c])).values()];
    return guardedWrite(ctx, () =>
      db.transaction('rw', ['plan_days', 'profile'], () =>
        Dexie.Promise.all([
          db.profile.get('singleton'),
          Dexie.Promise.all(byDate.map((c) => db.plan_days.get(c.date))),
        ]).then(([profile, rows]) => {
          if (profile === undefined) throw new StorageRuleError('profile', 'not-found');
          return Dexie.Promise.all(
            byDate.map((change, i): PromiseLike<unknown> => {
              const stored: PlanDayRecord | undefined = rows[i];
              if (change.window === null) {
                if (stored === undefined) return Dexie.Promise.resolve();
                if (stored.meals.length === 0) return db.plan_days.delete(change.date);
                const row = prepare(
                  'plan_days',
                  stampUpdate('plan_days', stored as unknown as Row, { eatingWindow: null }, env),
                  env,
                  stored,
                );
                return db.plan_days.put(row);
              }
              const eatingWindow = { start: change.window.start, end: change.window.end };
              const row =
                stored === undefined
                  ? prepare(
                      'plan_days',
                      stampCreate(
                        'plan_days',
                        { date: change.date, dietMode: profile.dietMode, meals: [], eatingWindow },
                        env,
                      ),
                      env,
                    )
                  : prepare(
                      'plan_days',
                      stampUpdate('plan_days', stored as unknown as Row, { eatingWindow }, env),
                      env,
                      stored,
                    );
              return db.plan_days.put(row);
            }),
          ).then(() => undefined);
        }),
      ),
    );
  };
  return {
    ...crud,
    setWindows,
    clearWindow: (date) => setWindows([{ date, window: null }]),
  };
}
