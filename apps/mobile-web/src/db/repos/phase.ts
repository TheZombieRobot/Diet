/**
 * The two stored fasting-preset moves tied to Kickstart (C55, C07; WT-08; item 14 design section
 * 5.4). Each is one read-write transaction that re-derives its condition from the records inside
 * it, so a concurrent "Use 23:1 instead" or a Kickstart start that lands first always wins, and a
 * repeat finds nothing to do. The condition is core's, read with the same gates the weight screens
 * use; the row goes through the usual preparation and validators.
 */
import {
  DEFAULT_HOME_TIME_ZONE,
  gatesFromRecords,
  kickstartStartPresetChange,
  localDateOf,
  type PresetChange,
  presetMoveDueFromRecords,
  type PresetRecords,
  resolveZone,
} from '@diet/core';
import Dexie from 'dexie';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { stampUpdate } from './crud';

export interface PhaseRepo {
  /** At a Kickstart start: an untouched default preset becomes the 23:1 Kickstart default. Returns the change or null. */
  readonly applyKickstartStartPreset: () => Promise<PresetChange | null>;
  /** Outside Kickstart: a stored 23:1 Kickstart default becomes 22:2. Returns the change or null. */
  readonly applyPresetMove: () => Promise<PresetChange | null>;
}

const STORES = [
  'targets',
  'profile',
  'settings',
  'readiness',
  'kickstart_periods',
  'kickstart_checks',
  'weights',
] as const;

export function phaseRepo(ctx: RepoContext): PhaseRepo {
  const { db, env } = ctx;

  /** Reads the records, asks `decide` for a change, and writes it to targets, all in one transaction. */
  const conditional = (
    decide: (records: PresetRecords) => PresetChange | null,
  ): Promise<PresetChange | null> =>
    guardedWrite(ctx, () =>
      db.transaction('rw', STORES, () =>
        Dexie.Promise.all([
          db.targets.get('singleton'),
          db.profile.get('singleton'),
          db.settings.get('singleton'),
          db.readiness.toArray(),
          db.kickstart_periods.toArray(),
          db.kickstart_checks.toArray(),
          db.weights.toArray(),
        ]).then(([targets, profile, settings, readiness, periods, checks, weights]) => {
          if (targets === undefined || profile === undefined || settings === undefined) {
            throw new StorageRuleError('targets', 'not-found');
          }
          const change = decide({
            targets,
            profile,
            settings,
            readiness,
            periods,
            checks,
            weights,
          });
          if (change === null) return null;
          const row = prepare(
            'targets',
            stampUpdate(
              'targets',
              targets as unknown as Record<string, unknown>,
              { ...change },
              env,
            ),
            env,
            targets,
          );
          return db.targets.put(row).then(() => change);
        }),
      ),
    );

  return {
    applyKickstartStartPreset: () =>
      conditional((records) => {
        const home = records.settings.homeTimeZone;
        const zone = resolveZone(env.timeZone(), home, DEFAULT_HOME_TIME_ZONE).timeZone;
        const gates = gatesFromRecords(records, localDateOf(env.now(), zone));
        return kickstartStartPresetChange(records.targets, gates);
      }),
    applyPresetMove: () =>
      conditional((records) => presetMoveDueFromRecords(records, env.now(), env.timeZone())),
  };
}
