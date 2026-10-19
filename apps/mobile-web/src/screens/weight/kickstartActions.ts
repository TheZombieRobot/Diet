/**
 * Starting and ending a Kickstart, and keeping the stored records in line with the phase rule
 * (item 14 design sections 2.4.3, 2.4.4 and 5.5; C55, C56; W13, W14, W16, W31).
 *
 * - startKickstart is the only caller of startPeriod in the app. It re-reads the records and
 *   re-checks that a start is available just before writing, and never runs without the owner's
 *   "Start Kickstart" after four "no" answers.
 * - endKickstartIfConditionsFail writes the end that is due (a period running, or not started yet,
 *   whose gates or keto run no longer hold; core kickstartEndNeeded). It latches the end first, so
 *   a failed write followed by reopened gates never resumes Kickstart in this session, and it never
 *   starts anything. It is the only way anything ends a Kickstart on a readiness, weight or mode
 *   change: item 13's readiness and profile saves and the weigh-in writes (onboarding/actions.ts)
 *   call it in the same action; the reconciler retries it.
 * - reconcileKickstart also makes the stored 23:1 → 22:2 move outside Kickstart, whatever any
 *   card's state, and keeps the in-memory notice when no other card explains it.
 */
import {
  effectiveFastingPreset,
  type Id,
  type KickstartEndReason,
  type KickstartPeriodRecord,
  latestKickstartPeriod,
  type StartUnavailable,
  StorageInvariantError,
  type WeightOverview,
  weightOverview,
} from '@diet/core';
import { StorageRuleError } from '../../db/errors';
import type { AppStorage } from '../../db/runtime';
import { clearEndLatch, latchEnd, presetMovedStore } from './stores';
import { currentWeightEnv, overviewInputFrom, readWeightInputs } from './useWeightView';

export type StartResult =
  | { readonly ok: true; readonly presetSet: boolean }
  | { readonly ok: false; readonly reason: StartUnavailable };

/**
 * Starts a Kickstart today if one may start now: the period, then carbCeilingStartedAt = its start
 * (storage spec 4.4), then the 23:1 preset move. The later writes are separate; if one fails the
 * period stands and both fall on the safe side (the electrolyte reminder shows through Kickstart
 * anyway, and an unmoved preset stays on the gentler 22:2).
 */
export async function startKickstart(storage: AppStorage): Promise<StartResult> {
  const { repos } = storage;
  const inputs = await readWeightInputs(storage);
  const overviewInput = overviewInputFrom(inputs, currentWeightEnv(storage));
  const { start } = weightOverview(overviewInput).kickstart;
  if (!start.available) return { ok: false, reason: start.reason };
  // The keto run is counted from carbCeilingStartedAt (ketoUnbrokenSince): a missing one is set
  // first, so the new period never reads as broken before its own value is written.
  if (inputs.profile.carbCeilingStartedAt === null) {
    await repos.profile.update({ carbCeilingStartedAt: storage.env.now() });
  }
  const period = await repos.kickstart.startPeriod();
  try {
    await repos.profile.update({ carbCeilingStartedAt: period.startedAt });
    await repos.phase.applyKickstartStartPreset();
  } catch {
    // The period stands; see above.
  }
  const targets = await repos.targets.get().catch(() => null);
  // Read through the one preset rule, so a Kickstart default set aside for answer 4 is not reported.
  const preset =
    targets === null ? null : effectiveFastingPreset(targets, true, overviewInput.gates);
  return {
    ok: true,
    presetSet: preset?.fastingPreset === '23:1' && preset.presetChosenBy === 'kickstart-default',
  };
}

export function endKickstart(
  storage: AppStorage,
  reason: KickstartEndReason,
): Promise<KickstartPeriodRecord> {
  return storage.repos.kickstart.endPeriod(reason);
}

/** The period is already over: its end was written, or it finished. */
const alreadyOver = (error: unknown): boolean =>
  (error instanceof StorageInvariantError && error.rule === 'kickstart-end') ||
  (error instanceof StorageRuleError && error.rule === 'not-found');

async function endIfDue(storage: AppStorage): Promise<KickstartEndReason | null> {
  let latched: Id | null = null;
  try {
    const inputs = await readWeightInputs(storage);
    const { kickstart } = weightOverview(overviewInputFrom(inputs, currentWeightEnv(storage)));
    const latest = latestKickstartPeriod(inputs.periods);
    if (latest === null) return null;
    if (kickstart.endNeeded === null) {
      // Nothing to end (it finished by itself); a latch for it has no more use.
      clearEndLatch(latest.id);
      return null;
    }
    latched = latest.id;
    latchEnd(latest.id, kickstart.endNeeded);
    await endKickstart(storage, kickstart.endNeeded);
    clearEndLatch(latest.id);
    return kickstart.endNeeded;
  } catch (error) {
    if (latched !== null && alreadyOver(error)) clearEndLatch(latched);
    // Otherwise the latch stays and the reconciler tries again on its next tick.
    return null;
  }
}

let ending: Promise<KickstartEndReason | null> | null = null;

/**
 * Ends a Kickstart whose conditions no longer hold (running, or not started yet because its start
 * is dated ahead), with its reason ('readiness-gated' before 'left-keto'): the one way any action
 * ends a Kickstart on a readiness, weight or mode change, and what the reconciler retries. Resolves
 * to the reason written, or null. Never throws, never starts one. One call at a time: a call made
 * while another runs shares the end that one wrote; if that one wrote nothing (it may have read
 * the records before this caller's own write), this call checks the records again afterwards.
 */
export function endKickstartIfConditionsFail(
  storage: AppStorage,
): Promise<KickstartEndReason | null> {
  const run: Promise<KickstartEndReason | null> =
    ending === null ? endIfDue(storage) : ending.then((written) => written ?? endIfDue(storage));
  const settled = run.finally(() => {
    if (ending === settled) ending = null;
  });
  ending = settled;
  return settled;
}

let moving: Promise<void> | null = null;

/** The corrective writes the overview says are due. Errors are swallowed and retried on the next tick. */
export async function reconcileKickstart(
  storage: AppStorage,
  overview: WeightOverview,
): Promise<void> {
  if (overview.kickstart.endNeeded !== null) await endKickstartIfConditionsFail(storage);
  if (overview.kickstart.presetMoveDue === null) return;
  const explained =
    overview.cards.steadyExplainer?.windowLine === true || overview.cards.pendingStart !== null;
  moving ??= storage.repos.phase
    .applyPresetMove()
    .then((change) => {
      if (change !== null && !explained) presetMovedStore.set(change);
    })
    .catch(() => undefined)
    .finally(() => {
      moving = null;
    });
  await moving;
}
