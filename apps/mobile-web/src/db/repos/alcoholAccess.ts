/**
 * The repository rule for the alcohol stores (HS-20, C53, RD-01; item 28 design 5.3, A22, A46).
 * No drink, milestone, preset or next-day note is stored before the alcohol notice is acknowledged,
 * and no drink or milestone while alcohol logging is switched off (under 18). It is worked out
 * inside the write's own transaction from the stored records, with the rule every screen uses
 * (core alcoholAccess over item 13's readinessGates), so a screen that has not re-rendered since an
 * answer changed cannot write what the screens would refuse. Deleting is never checked: the owner
 * can always remove a record.
 */
import { alcoholAccess, localDateOf, readinessGates, weightGateInput } from '@diet/core';
import Dexie from 'dexie';
import { StorageRuleError } from '../errors';
import type { RepoContext } from './context';

/** The stores the check reads, which a guarded write's transaction must include. */
export const ALCOHOL_ACCESS_STORES = ['settings', 'readiness', 'profile', 'weights'] as const;

export type AlcoholStore = 'drinks_log' | 'beverages' | 'alcohol_day_notes' | 'alcohol_milestones';

/**
 * 'notice': refused until the notice is acknowledged (presets and next-day notes: under 18 they
 * can only bring up more help, never less). 'notice-and-age': also refused while logging is off.
 *
 * @transactionScope Reads inside the caller's read-write transaction (Dexie requests only,
 * storage spec section 8.5) and throws StorageRuleError when the write is not allowed.
 */
export function checkAlcoholAccess(
  ctx: RepoContext,
  table: AlcoholStore,
  rule: 'notice' | 'notice-and-age',
): PromiseLike<void> {
  const { db, env } = ctx;
  return Dexie.Promise.all([
    db.settings.get('singleton'),
    db.readiness.toArray(),
    db.profile.get('singleton'),
    db.weights.toArray(),
  ]).then(([settings, readiness, profile, weights]) => {
    if (settings === undefined || profile === undefined) {
      throw new StorageRuleError(table, 'alcohol-notice-first');
    }
    const now = env.now();
    const gates = readinessGates(
      weightGateInput(
        { readiness, profile, weights, homeTimeZone: settings.homeTimeZone },
        localDateOf(now, env.timeZone()),
        now,
      ),
    );
    const access = alcoholAccess({ alcoholNoticeAckAt: settings.alcoholNoticeAckAt, gates });
    if (access === 'notice-first') throw new StorageRuleError(table, 'alcohol-notice-first');
    if (access === 'logging-off' && rule === 'notice-and-age') {
      throw new StorageRuleError(table, 'alcohol-logging-off');
    }
  });
}
