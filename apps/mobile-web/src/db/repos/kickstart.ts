/**
 * Kickstart periods and extension checks (storage spec sections 4.5, 5 rule 5 and 8.2; C08, C59;
 * D27, D28). Both stores are written only here: checks are append-only, a period is never removed,
 * and only its end (endedAt, endedTimeZone, endReason) can be set, once.
 *
 * - startPeriod() refuses an overlap, and refuses unless a full 21 days still fit under the
 *   42-day cap across every period.
 * - endPeriod(reason) ends the latest period early, once, only before its scheduled last day ends
 *   (running, or not yet started because its start is dated ahead). It is ended at the latest of
 *   now, the clock high-water mark and 1 ms after its start, so a clock set back never makes the
 *   days already lived count as fewer, and a start dated ahead counts 1 day.
 * - recordCheck(answers) is called only from the Extend action. It refuses outside the current
 *   extension window (the last 3 local days of the scheduled phase) and after a stop-sign check in
 *   that period, derives the outcome, and refuses an extension that would pass 3 extensions or 42
 *   days. A stop-sign outcome is recorded and ends the offers for that period.
 * - startPeriod and recordCheck depend on today, so both refuse with StorageClockError while now
 *   is earlier than the newest saved record by more than 5 minutes (clock.ts; health-rules review).
 * The high-water mark is read from every backed-up store inside the same transaction.
 */
import {
  BACKUP_TABLES,
  canExtendKickstart,
  canStartKickstart,
  clockHighWater,
  DEFAULT_HOME_TIME_ZONE,
  extensionsOf,
  extensionWindow,
  type Instant,
  instantMs,
  inWindow,
  isClockBehind,
  KICKSTART_MAX_EXTENSIONS,
  type KickstartCheckRecord,
  kickstartCheckOutcome,
  kickstartPeriodState,
  kickstartRunningAt,
  type KickstartEndReason,
  type KickstartPeriodRecord,
  kickstartUsage,
  type LocalDate,
  localDateOf,
  notBeforeAny,
  type SettingsRecord,
  type Snapshot,
  type StopSignAnswers,
  StorageInvariantError,
} from '@diet/core';
import Dexie from 'dexie';
import type { StorageEnv } from '../env';
import { StorageClockError, StorageRuleError } from '../errors';
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

interface History {
  readonly periods: KickstartPeriodRecord[];
  readonly checks: KickstartCheckRecord[];
  readonly settings: SettingsRecord | undefined;
  /** The newest instant saved in any backed-up store (clock.ts clockHighWater). */
  readonly highWater: Instant | null;
}

/**
 * The history from every backed-up store, read inside the write's transaction with
 * `Dexie.Promise.all(BACKUP_TABLES.map((name) => db.table(name).toArray()))` (section 8.5: Dexie
 * requests only): the Kickstart periods, checks and settings, and the high-water mark over
 * everything.
 */
function historyOf(lists: readonly unknown[][]): History {
  const tables = Object.fromEntries(
    BACKUP_TABLES.map((name, i) => [name, lists[i] ?? []]),
  ) as unknown as Snapshot;
  return {
    periods: [...tables.kickstart_periods],
    checks: [...tables.kickstart_checks],
    settings: tables.settings[0],
    highWater: clockHighWater(tables),
  };
}

/** Refuses a write that depends on today while the clock reads earlier than the saved records. */
function assertClockNotBehind(history: History, env: StorageEnv): void {
  if (isClockBehind(env.now(), history.highWater)) throw new StorageClockError();
}

const homeOf = (history: History): string =>
  history.settings?.homeTimeZone ?? DEFAULT_HOME_TIME_ZONE;

const today = (env: StorageEnv): LocalDate => localDateOf(env.now(), env.timeZone());

/**
 * The latest period, if it is running now: not ended early, day 1 arrived and the scheduled phase
 * not over, both in the device zone and in its own start zone (kickstartRunningAt; D27).
 */
function currentPeriod(history: History, env: StorageEnv): KickstartPeriodRecord | undefined {
  const latest = [...history.periods].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)).at(-1);
  if (latest === undefined) return undefined;
  const extensions = extensionsOf(latest.id, history.checks);
  return kickstartRunningAt(latest, extensions, env.now(), env.timeZone(), homeOf(history))
    ? latest
    : undefined;
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
        return db.transaction('rw', BACKUP_TABLES, () =>
          Dexie.Promise.all(BACKUP_TABLES.map((name) => db.table(name).toArray()))
            .then(historyOf)
            .then((history) => {
              assertClockNotBehind(history, env);
              const usage = kickstartUsage(history.periods, history.checks, homeOf(history));
              if (!canStartKickstart(usage)) throw new StorageInvariantError('kickstart-days');
              assertConsistent({ ...history, periods: [...history.periods, row] });
              return db.kickstart_periods.add(row);
            })
            .then(() => row),
        );
      }),

    endPeriod: (reason) =>
      guardedWrite(ctx, () =>
        db.transaction('rw', BACKUP_TABLES, () =>
          Dexie.Promise.all(BACKUP_TABLES.map((name) => db.table(name).toArray()))
            .then(historyOf)
            .then((history) => {
              const latest = [...history.periods]
                .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
                .at(-1);
              if (latest === undefined)
                throw new StorageRuleError('kickstart_periods', 'not-found');
              // Never earlier than a record already saved, nor than the start itself.
              const endedAt = notBeforeAny(
                env.now(),
                history.highWater,
                new Date(instantMs(latest.startedAt) + 1).toISOString(),
              );
              const state = kickstartPeriodState(
                latest,
                extensionsOf(latest.id, history.checks),
                endedAt,
                env.timeZone(),
                homeOf(history),
              );
              if (state !== 'running' && state !== 'not-started') {
                throw new StorageInvariantError('kickstart-end');
              }
              const row = prepare(
                'kickstart_periods',
                { ...latest, endedAt, endedTimeZone: env.timeZone(), endReason: reason },
                env,
                latest,
              );
              assertConsistent({
                ...history,
                periods: history.periods.map((p) => (p.id === row.id ? row : p)),
              });
              return db.kickstart_periods.put(row).then(() => row);
            }),
        ),
      ),

    recordCheck: (answers) =>
      guardedWrite(ctx, () => {
        const id = env.randomId();
        return db.transaction('rw', BACKUP_TABLES, () =>
          Dexie.Promise.all(BACKUP_TABLES.map((name) => db.table(name).toArray()))
            .then(historyOf)
            .then((history) => {
              assertClockNotBehind(history, env);
              const { checks: checkRows, periods: periodRows } = history;
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
