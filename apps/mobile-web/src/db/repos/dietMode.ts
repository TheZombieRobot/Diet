/**
 * The diet-mode switch, the only writer of profile.dietMode (item 21 design section 5.2; FL-04,
 * C56, C72, C109; T14, T35). The profile repository refuses a patch with its own dietMode, so every
 * change goes through here with its bookkeeping (core dietModeSwitch). One read-write transaction
 * reads the records and writes the profile:
 *
 * - The stored mode again writes nothing.
 * - Leaving keto while a Kickstart can still be ended rejects with 'kickstart-confirm-needed' and
 *   writes nothing unless the owner confirmed (endKickstart), decided from the records here, so a
 *   stale screen can never end a Kickstart unseen, nor skip a switch the owner confirmed.
 * - The Kickstart end itself is written by item 14's one rule, endKickstartIfConditionsFail, which
 *   the switch action calls straight after (screens/targets/dietModeActions.ts). Once the mode has
 *   left keto, or keto restarted with a later carbCeilingStartedAt, the phase and the figures read
 *   Steady at once, whether or not the end has landed yet, and the end latch keeps it so.
 * - Nothing is deleted, no plan day, target or log is touched, and no Kickstart is started.
 */
import { type DietMode, dietModeSwitch, type ProfileRecord } from '@diet/core';
import Dexie from 'dexie';
import { StorageRuleError } from '../errors';
import { prepare } from '../prepare';
import { guardedWrite, type RepoContext } from './context';
import { stampUpdate } from './crud';

export interface DietModeSwitchResult {
  readonly profile: ProfileRecord;
  readonly changed: boolean;
  /** This switch ends a Kickstart that could still be ended (the end is written after it). */
  readonly endsKickstart: boolean;
}

export interface DietModeRepo {
  /**
   * Rejects with StorageRuleError('kickstart_periods', 'kickstart-confirm-needed') and writes
   * nothing when the stored mode is keto, a Kickstart can still be ended, and endKickstart is false.
   */
  readonly switchTo: (
    mode: DietMode,
    options: { readonly endKickstart: boolean },
  ) => Promise<DietModeSwitchResult>;
}

const STORES = [
  'profile',
  'settings',
  'readiness',
  'kickstart_periods',
  'kickstart_checks',
  'weights',
] as const;

export function dietModeRepo(ctx: RepoContext): DietModeRepo {
  const { db, env } = ctx;
  return {
    switchTo: (mode, options) => {
      const now = env.now();
      const zone = env.timeZone();
      return guardedWrite(ctx, () =>
        db.transaction('rw', STORES, () =>
          Dexie.Promise.all([
            db.profile.get('singleton'),
            db.settings.get('singleton'),
            db.readiness.toArray(),
            db.kickstart_periods.toArray(),
            db.kickstart_checks.toArray(),
            db.weights.toArray(),
          ]).then(([profile, settings, readiness, periods, checks, weights]) => {
            if (profile === undefined || settings === undefined) {
              throw new StorageRuleError('profile', 'not-found');
            }
            const decision = dietModeSwitch(
              { profile, settings, readiness, periods, checks, weights },
              mode,
              options.endKickstart,
              now,
              zone,
            );
            if (decision.kind === 'unchanged') {
              return { profile, changed: false, endsKickstart: false };
            }
            if (decision.kind === 'confirm-needed') {
              throw new StorageRuleError('kickstart_periods', 'kickstart-confirm-needed');
            }
            const row = prepare(
              'profile',
              stampUpdate(
                'profile',
                profile as unknown as Record<string, unknown>,
                { ...decision.patch },
                env,
              ),
              env,
              profile,
            );
            return db.profile
              .put(row)
              .then(() => ({ profile: row, changed: true, endsKickstart: decision.endsKickstart }));
          }),
        ),
      );
    },
  };
}
