/**
 * Kickstart periods and extension checks (storage spec sections 4.5, 5 rule 5 and 8.2; C08, C59;
 * D27, D28). Both stores are written only here: checks are append-only, a period is never removed,
 * and only its end (endedAt, endedTimeZone, endReason) can be set, once.
 *
 * - startPeriod() refuses an overlap, and refuses unless a full 21 days still fit under the
 *   42-day cap across every period.
 * - endPeriod(reason) ends the current period early, once, only before its scheduled last day ends.
 * - recordCheck(answers) is called only from the Extend action. It refuses outside the current
 *   extension window (the last 3 local days of the scheduled phase) and after a stop-sign check in
 *   that period, derives the outcome, and refuses an extension that would pass 3 extensions or 42
 *   days. A stop-sign outcome is recorded and ends the offers for that period.
 */
import {
  canExtendKickstart,
  canStartKickstart,
  DEFAULT_HOME_TIME_ZONE,
  extensionsOf,
  extensionWindow,
  inWindow,
  KICKSTART_MAX_EXTENSIONS,
  type KickstartCheckRecord,
  kickstartCheckOutcome,
  type KickstartEndReason,
  type KickstartPeriodRecord,
  kickstartUsage,
  type LocalDate,
  localDateOf,
  scheduledLastDay,
  type SettingsRecord,
  type StopSignAnswers,
  StorageInvariantError,
} from '@diet/core';
import Dexie from 'dexie';
import type { StorageEnv } from '../env';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext, storesViolation } from './context';
import { crudRepo } from './crud';

export interface CheckAnswers extends StopSignAnswers {
  readonly energyRating?: number | null;
  readonly sleepRating?: number | null;
}

export interface KickstartRepo {
  readonly getPeriod: (id: string) => Promise<KickstartPeriodRecord | undefined>;
  readonly listPeriods: () => Promise<KickstartPeriodRecord[]>;
  readonly getCheck: (id: string) => Promise<KickstartCheckRecord | undefined>;
  readonly listChecks: () => Promise<KickstartCheckRecord[]>;
  readonly startPeriod: () => Promise<KickstartPeriodRecord>;
  readonly endPeriod: (reason: KickstartEndReason) => Promise<KickstartPeriodRecord>;
  readonly recordCheck: (answers: CheckAnswers) => Promise<KickstartCheckRecord>;
}

const STORES = ['kickstart_periods', 'kickstart_checks', 'settings'] as const;

interface History {
  readonly periods: KickstartPeriodRecord[];
  readonly checks: KickstartCheckRecord[];
  readonly settings: SettingsRecord | undefined;
}

const homeOf = (history: History): string =>
  history.settings?.homeTimeZone ?? DEFAULT_HOME_TIME_ZONE;

const today = (env: StorageEnv): LocalDate => localDateOf(env.now(), env.timeZone());

/** The latest period, if it is still running today (not ended early, scheduled phase not over). */
function currentPeriod(history: History, env: StorageEnv): KickstartPeriodRecord | undefined {
  const latest = [...history.periods].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)).at(-1);
  if (latest === undefined || latest.endedAt !== null) return undefined;
  const extensions = extensionsOf(latest.id, history.checks);
  return today(env) <= scheduledLastDay(latest, extensions, homeOf(history)) ? latest : undefined;
}

/** Throws the first section 5 rule the history would break. */
function assertConsistent(history: History): void {
  const rule = storesViolation(
    { kickstart_periods: history.periods, kickstart_checks: history.checks },
    history.settings,
  );
  if (rule !== null) throw new StorageInvariantError(rule);
}

export function kickstartRepo(ctx: RepoContext): KickstartRepo {
  const { db, env } = ctx;
  const periods = crudRepo(ctx, 'kickstart_periods');
  const checks = crudRepo(ctx, 'kickstart_checks');

  return {
    getPeriod: periods.get,
    listPeriods: periods.list,
    getCheck: checks.get,
    listChecks: checks.list,

    startPeriod: () =>
      guardedWrite(ctx, () => {
        const row = prepare(
          'kickstart_periods',
          {
            id: env.randomId(),
            startedAt: env.now(),
            timeZone: env.timeZone(),
            endedAt: null,
            endedTimeZone: null,
            endReason: null,
          },
          env,
        );
        return db.transaction('rw', STORES, () =>
          Dexie.Promise.all([
            db.kickstart_periods.toArray(),
            db.kickstart_checks.toArray(),
            db.settings.get('singleton'),
          ])
            .then(([periodRows, checkRows, settings]) => {
              const history = { periods: periodRows, checks: checkRows, settings };
              const usage = kickstartUsage(periodRows, checkRows, homeOf(history));
              if (!canStartKickstart(usage)) throw new StorageInvariantError('kickstart-days');
              assertConsistent({ ...history, periods: [...periodRows, row] });
              return db.kickstart_periods.add(row);
            })
            .then(() => row),
        );
      }),

    endPeriod: (reason) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', STORES, () =>
          Dexie.Promise.all([
            db.kickstart_periods.toArray(),
            db.kickstart_checks.toArray(),
            db.settings.get('singleton'),
          ]).then(([periodRows, checkRows, settings]) => {
            const history = { periods: periodRows, checks: checkRows, settings };
            const latest = [...periodRows]
              .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
              .at(-1);
            if (latest === undefined) throw new StorageRuleError('kickstart_periods', 'not-found');
            if (currentPeriod(history, env) === undefined) {
              throw new StorageInvariantError('kickstart-end');
            }
            const row = prepare(
              'kickstart_periods',
              { ...latest, endedAt: env.now(), endedTimeZone: env.timeZone(), endReason: reason },
              env,
              latest,
            );
            assertConsistent({
              ...history,
              periods: periodRows.map((p) => (p.id === row.id ? row : p)),
            });
            return db.kickstart_periods.put(row).then(() => row);
          }),
        ),
      ),

    recordCheck: (answers) =>
      guardedWrite(ctx, () => {
        const id = env.randomId();
        return db.transaction('rw', STORES, () =>
          Dexie.Promise.all([
            db.kickstart_periods.toArray(),
            db.kickstart_checks.toArray(),
            db.settings.get('singleton'),
          ]).then(([periodRows, checkRows, settings]) => {
            const history = { periods: periodRows, checks: checkRows, settings };
            const period = currentPeriod(history, env);
            if (period === undefined) throw new StorageInvariantError('kickstart-check-window');
            const own = checkRows.filter((c) => c.periodId === period.id);
            if (own.some((c) => c.outcome === 'stop-sign')) {
              throw new StorageInvariantError('kickstart-stop-sign');
            }
            const offer = extensionWindow(period, extensionsOf(period.id, own), homeOf(history));
            if (!inWindow(today(env), offer)) {
              throw new StorageInvariantError('kickstart-check-window');
            }
            const outcome = kickstartCheckOutcome(answers);
            if (outcome === 'extended') {
              const usage = kickstartUsage(periodRows, checkRows, homeOf(history));
              if (usage.extensions >= KICKSTART_MAX_EXTENSIONS) {
                throw new StorageInvariantError('kickstart-extensions');
              }
              if (!canExtendKickstart(usage)) throw new StorageInvariantError('kickstart-days');
            }
            const row = prepare(
              'kickstart_checks',
              {
                id,
                periodId: period.id,
                askedAt: env.now(),
                timeZone: env.timeZone(),
                dizzyOnStanding: answers.dizzyOnStanding,
                palpitations: answers.palpitations,
                crampsNotSettling: answers.crampsNotSettling,
                faintAtWork: answers.faintAtWork,
                energyRating: answers.energyRating ?? null,
                sleepRating: answers.sleepRating ?? null,
                outcome,
              },
              env,
            );
            assertConsistent({ ...history, checks: [...checkRows, row] });
            return db.kickstart_checks.add(row).then(() => row);
          }),
        );
      }),
  };
}
