/**
 * The food log (storage spec sections 4.7 and 8.2): the generic repository, plus the day's entries
 * by local date for the Nutrition today card (item 21 design section 5.2). Adding, editing and
 * removing entries from a screen are item 23's.
 */
import {
  DEFAULT_HOME_TIME_ZONE,
  type FoodLogRecord,
  type LocalDate,
  localDateOf,
  resolveZone,
  utcRangeCovering,
} from '@diet/core';
import Dexie from 'dexie';
import type { RepoContext } from './context';
import { type CrudRepo, crudRepo } from './crud';

export interface FoodLogRepo extends CrudRepo<'food_log'> {
  /** Entries whose local date, in their own recorded zone, is `date`, in time order. */
  readonly forLocalDate: (date: LocalDate) => Promise<FoodLogRecord[]>;
}

export function foodLogRepo(ctx: RepoContext): FoodLogRepo {
  const crud = crudRepo(ctx, 'food_log');
  const { db } = ctx;
  return {
    ...crud,
    forLocalDate: async (date) => {
      const { lower, upper } = utcRangeCovering(date, date);
      const [rows, settings] = await db.transaction('r', ['food_log', 'settings'], () =>
        Dexie.Promise.all([
          db.food_log.where('at').between(lower, upper, true, false).toArray(),
          db.settings.get('singleton'),
        ]),
      );
      const home = settings?.homeTimeZone ?? DEFAULT_HOME_TIME_ZONE;
      return rows
        .filter(
          (row) =>
            localDateOf(
              row.at,
              resolveZone(row.timeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone,
            ) === date,
        )
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    },
  };
}
