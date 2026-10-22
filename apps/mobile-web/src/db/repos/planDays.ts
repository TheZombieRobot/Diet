/**
 * Planned days (storage spec sections 4.7 and 8.2): the generic reads only; the per-day
 * eating windows of item 15 (the 5 pm snack, "Eat 1 hour earlier", their Undo and the clean-up
 * when the pattern changes; DOC_REVIEW C30, C73); and item 22's planned meals.
 *
 * setWindows writes all its changes in one transaction, so a pair of days (an earlier window and
 * the next day's wider one) is never left half written. A date with no row gets one with no meals,
 * which holds only the window (readers treat it as no plan; its diet mode is the profile's, because
 * the validator needs one). Clearing a date's window removes a row that has no meals, and sets the
 * window to null on one that has. Whether a change is allowed is a planning rule the screens check
 * first (core dayWindowChangeAllowed); every plan is capped at 24 hours at the start of a fast.
 *
 * writeMeals is the only way to add, change or remove a planned meal (item 22 design 5.3; V32). It
 * runs core's checkPlanWrite inside its own read-write transaction, against the records as they
 * are then, so the floor, the targets, the window's slots, dislikes, hidden recipes and the
 * allergen decision are judged on the rows the write lands on, whatever a screen showed. There is
 * no generic create, update or remove (V32; item 22 review): a meal changes only through
 * writeMeals and a per-day window only through setWindows and clearWindow, so nothing can wipe a
 * day's meals or undo a window and lengthen a fast around the checks.
 */
import {
  addDays,
  checkPlanWrite,
  type DayFloorNote,
  type DayWindowChange,
  DEFAULT_HOME_TIME_ZONE,
  type LocalDate,
  localDateOf,
  type PlanDayRecord,
  planWriteContextFromRecords,
  type PlanWriteRefusal,
  type PlanWriteRequest,
  resolveZone,
  utcRangeCovering,
} from '@diet/core';
import Dexie from 'dexie';
import { planData } from '../../planner/planData';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { type CrudRepo, crudRepo, stampCreate, stampUpdate } from './crud';
import { recipesInScope } from './recipes';

export interface PlanWriteOutcome {
  readonly written: readonly LocalDate[];
  readonly refused: readonly { readonly date: LocalDate; readonly refusal: PlanWriteRefusal }[];
  readonly notes: readonly {
    readonly date: LocalDate;
    readonly note: Exclude<DayFloorNote, null>;
  }[];
}

export interface PlanDaysRepo extends Omit<CrudRepo<'plan_days'>, 'create' | 'update' | 'remove'> {
  /** Sets (or, with a null window, clears) each date's eating window, all in one transaction. */
  readonly setWindows: (changes: readonly DayWindowChange[]) => Promise<void>;
  /** Clears a date's eating window. */
  readonly clearWindow: (date: LocalDate) => Promise<void>;
  /** Whether any row dated before `date` holds a meal (the first planned week, item 20 step 5). */
  readonly hasMealsBefore: (date: LocalDate) => Promise<boolean>;
  /** The only way to add, change or remove a planned meal; re-checks everything as it writes. */
  readonly writeMeals: (request: PlanWriteRequest) => Promise<PlanWriteOutcome>;
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

  const writeMeals = async (request: PlanWriteRequest): Promise<PlanWriteOutcome> => {
    const dates = [...new Set(request.writes.map((w) => w.date))].sort();
    const first = dates[0];
    const last = dates.at(-1);
    if (first === undefined || last === undefined) return { written: [], refused: [], notes: [] };
    // Before the transaction (section 8.5): the clock and the bundled datasets.
    const now = env.now();
    const zone = env.timeZone();
    const data = planData();
    if (data === null) {
      return {
        written: [],
        refused: dates.map((date) => ({
          date,
          refusal: { reason: 'recipe-missing', recipeId: request.writes[0]?.meal?.recipeId ?? '' },
        })),
        notes: [],
      };
    }
    const keys = [...new Set(dates.flatMap((d) => [addDays(d, -1), d]))];
    const { lower, upper } = utcRangeCovering(addDays(first, -1), last);
    return guardedWrite(ctx, () =>
      db.transaction(
        'rw',
        [
          'plan_days',
          'profile',
          'targets',
          'settings',
          'readiness',
          'kickstart_periods',
          'kickstart_checks',
          'weights',
          'card_state',
          'recipes',
          'ingredients',
          'ingredient_overrides',
          'symptom_log',
        ],
        () =>
          Dexie.Promise.all([
            Dexie.Promise.all([
              db.profile.get('singleton'),
              db.targets.get('singleton'),
              db.settings.get('singleton'),
              db.readiness.toArray(),
              db.kickstart_periods.toArray(),
              db.kickstart_checks.toArray(),
              db.weights.toArray(),
            ]),
            Dexie.Promise.all([
              db.card_state.toArray(),
              recipesInScope(db),
              db.ingredients.toArray(),
              db.ingredient_overrides.toArray(),
              db.symptom_log.where('at').between(lower, upper, true, true).toArray(),
              Dexie.Promise.all(keys.map((key) => db.plan_days.get(key))),
            ]),
          ]).then(
            ([
              [profile, targets, settings, readiness, periods, checks, weights],
              [cardStates, ownRecipes, ownIngredients, overrides, symptoms, days],
            ]) => {
              if (profile === undefined || targets === undefined || settings === undefined) {
                throw new StorageRuleError('profile', 'not-found');
              }
              const deviceZone = resolveZone(
                zone,
                settings.homeTimeZone,
                DEFAULT_HOME_TIME_ZONE,
              ).timeZone;
              const planDays = days.filter((d): d is PlanDayRecord => d !== undefined);
              const context = planWriteContextFromRecords(
                {
                  profile,
                  targets,
                  settings,
                  readiness,
                  periods,
                  checks,
                  weights,
                  cardStates,
                  planDays,
                  ownRecipes,
                  ownIngredients,
                  overrides,
                  symptoms,
                },
                { at: now, today: localDateOf(now, deviceZone), deviceZone },
                data,
              );
              const decided = checkPlanWrite(request, context);
              const writes: PromiseLike<unknown>[] = [];
              for (const day of decided) {
                if (day.status !== 'write') continue;
                const stored = planDays.find((d) => d.date === day.date);
                const meals = day.meals.map((m) => ({ ...m }));
                if (meals.length === 0 && (stored?.eatingWindow ?? null) === null) {
                  if (stored !== undefined) writes.push(db.plan_days.delete(day.date));
                  continue;
                }
                const row =
                  stored === undefined
                    ? prepare(
                        'plan_days',
                        stampCreate(
                          'plan_days',
                          { date: day.date, dietMode: day.dietMode, meals, eatingWindow: null },
                          env,
                        ),
                        env,
                      )
                    : prepare(
                        'plan_days',
                        stampUpdate(
                          'plan_days',
                          stored as unknown as Row,
                          { meals, dietMode: day.dietMode },
                          env,
                        ),
                        env,
                        stored,
                      );
                writes.push(db.plan_days.put(row));
              }
              return Dexie.Promise.all(writes).then((): PlanWriteOutcome => ({
                written: decided.flatMap((d) => (d.status === 'write' ? [d.date] : [])),
                refused: decided.flatMap((d) =>
                  d.status === 'refused' ? [{ date: d.date, refusal: d.refusal }] : [],
                ),
                notes: decided.flatMap((d) =>
                  d.status === 'write' && d.floorNote !== null
                    ? [{ date: d.date, note: d.floorNote }]
                    : [],
                ),
              }));
            },
          ),
      ),
    );
  };

  return {
    get: crud.get,
    list: crud.list,
    listByIndex: crud.listByIndex,
    setWindows,
    clearWindow: (date) => setWindows([{ date, window: null }]),
    hasMealsBefore: (date) =>
      db.plan_days
        .where('date')
        .below(date)
        .filter((row) => row.meals.length > 0)
        .first()
        .then((row) => row !== undefined),
    writeMeals,
  };
}
