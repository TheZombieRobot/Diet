/**
 * The drinks log (storage spec sections 4.10 and 8.2; C21, C94, AL-02, NN-01). The generic
 * repository allows only get and list; logging, editing and removing go through here, because the
 * per-serve figures are a snapshot the repository computes with core drinkFigures()
 * (standardDrinks() and drinkEnergy()): callers never pass them. Figures are stored unrounded (C94).
 *
 * Item 28: log and update are refused before the alcohol notice is acknowledged and while alcohol
 * logging is off (checkAlcoholAccess; HS-20, RD-01), and refuse a drink time more than 5 minutes
 * after now ('future-time'), so an edit cannot move a drink out of today's totals or the help
 * card's windows. remove is always allowed.
 */
import {
  DEFAULT_HOME_TIME_ZONE,
  drinkFigures,
  instantMs,
  latestBookkeepingMs,
  type DrinkLogRecord,
  drinkingDayOf,
  type Instant,
  type LocalDate,
  localDateOf,
  type RefId,
  resolveZone,
  type StoredBeverage,
  utcRangeCovering,
} from '@diet/core';
import Dexie from 'dexie';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { ALCOHOL_ACCESS_STORES, checkAlcoholAccess } from './alcoholAccess';
import { guardedWrite, type RepoContext } from './context';
import { crudRepo } from './crud';

export interface DrinkInput {
  readonly beverageId: RefId | null;
  /** The name as it was at logging (a snapshot). */
  readonly name: string;
  readonly beverage: StoredBeverage;
  readonly count: number;
  /** A backdated drink; the current time when left out. */
  readonly at?: Instant;
}

export type DrinkChanges = Partial<Pick<DrinkInput, 'name' | 'beverage' | 'count' | 'at'>>;

export interface DrinksRepo {
  readonly get: (id: string) => Promise<DrinkLogRecord | undefined>;
  readonly list: () => Promise<DrinkLogRecord[]>;
  readonly log: (input: DrinkInput) => Promise<DrinkLogRecord>;
  readonly update: (id: string, changes: DrinkChanges) => Promise<DrinkLogRecord>;
  readonly remove: (id: string) => Promise<void>;
  /** Drinks whose drinking day (section 3.3), in their own recorded zone, lies in [from, to]. */
  readonly forDrinkingDays: (from: LocalDate, to: LocalDate) => Promise<DrinkLogRecord[]>;
  /**
   * Drinks whose calendar date, in their own recorded zone, lies in [from, to], with no cut-over:
   * the day the energy target is for (item 21 T16). The Drinks card keeps its drinking days.
   */
  readonly forLocalDates: (from: LocalDate, to: LocalDate) => Promise<DrinkLogRecord[]>;
}

/** The drinks in [from, to] by a per-drink day rule, with the settings read in the same transaction. */
async function drinksByDay(
  ctx: RepoContext,
  from: LocalDate,
  to: LocalDate,
  dayOf: (row: DrinkLogRecord, zone: string, cutoverMinutes: number) => LocalDate,
): Promise<DrinkLogRecord[]> {
  const { db } = ctx;
  const { lower, upper } = utcRangeCovering(from, to);
  const [rows, settings] = await db.transaction('r', ['drinks_log', 'settings'], () =>
    Dexie.Promise.all([
      db.drinks_log.where('at').between(lower, upper, true, false).toArray(),
      db.settings.get('singleton'),
    ]),
  );
  const home = settings?.homeTimeZone ?? DEFAULT_HOME_TIME_ZONE;
  const cutover = settings?.drinkingDayCutoverMinutes ?? 300;
  return rows.filter((d) => {
    const day = dayOf(d, resolveZone(d.timeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone, cutover);
    return day >= from && day <= to;
  });
}

/** The stores a guarded drink write reads besides drinks_log (the access check). */
const WRITE_STORES = ['drinks_log', ...ALCOHOL_ACCESS_STORES] as const;

export function drinksRepo(ctx: RepoContext): DrinksRepo {
  const { db, env } = ctx;
  const crud = crudRepo(ctx, 'drinks_log');
  const refuseFuture = (at: string): void => {
    if (instantMs(at) > latestBookkeepingMs(env.now())) {
      throw new StorageRuleError('drinks_log', 'future-time');
    }
  };
  return {
    get: crud.get,
    list: crud.list,
    log: (input) =>
      guardedWrite(ctx, () => {
        if (input.at !== undefined) refuseFuture(input.at);
        const row = prepare(
          'drinks_log',
          {
            id: env.randomId(),
            at: input.at ?? env.now(),
            timeZone: env.timeZone(),
            beverageId: input.beverageId,
            name: input.name,
            count: input.count,
            beverage: input.beverage,
            ...drinkFigures(input.beverage),
          },
          env,
        );
        return db.transaction('rw', WRITE_STORES, () =>
          Dexie.Promise.all([checkAlcoholAccess(ctx, 'drinks_log', 'notice-and-age')])
            .then(() => db.drinks_log.add(row))
            .then(() => row),
        );
      }),
    update: (id, changes) =>
      guardedWrite(ctx, () => {
        if (changes.at !== undefined) refuseFuture(changes.at);
        return db.transaction('rw', WRITE_STORES, () =>
          Dexie.Promise.all([
            db.drinks_log.get(id),
            checkAlcoholAccess(ctx, 'drinks_log', 'notice-and-age'),
          ]).then(([stored]) => {
            if (stored === undefined) throw new StorageRuleError('drinks_log', 'not-found');
            const beverage = changes.beverage ?? stored.beverage;
            const moved = changes.at !== undefined && changes.at !== stored.at;
            const row = prepare(
              'drinks_log',
              {
                ...stored,
                ...changes,
                id: stored.id,
                timeZone: moved ? env.timeZone() : stored.timeZone,
                beverage,
                ...drinkFigures(beverage),
              },
              env,
              stored,
            );
            return db.drinks_log.put(row).then(() => row);
          }),
        );
      }),
    remove: (id) =>
      guardedWrite(ctx, () => db.transaction('rw', ['drinks_log'], () => db.drinks_log.delete(id))),
    forDrinkingDays: (from, to) =>
      drinksByDay(ctx, from, to, (d, zone, cutover) => drinkingDayOf(d.at, zone, cutover)),
    forLocalDates: (from, to) => drinksByDay(ctx, from, to, (d, zone) => localDateOf(d.at, zone)),
  };
}
