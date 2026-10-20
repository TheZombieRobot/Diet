/**
 * The weight picture from one consistent read of the records (item 14 design section 5.2). The
 * Weight card, the Weight screen, the reconciler and the Kickstart actions all decide from
 * overviewInputFrom, so they apply the same rule: item 13's readiness gates, fed item 14's current
 * weight, the end latch and today's pre-start answer (its record, or this page's hold). On screen the gates come from item 13's hook
 * useReadinessGates (the one every gated screen uses); an action re-reads the records and builds
 * the same gates from them (weightGateInput), so a write always decides from fresh records.
 */
import {
  type CardStateRecord,
  DEFAULT_HOME_TIME_ZONE,
  type GateInput,
  type Instant,
  type KickstartCheckRecord,
  type KickstartPeriodRecord,
  localDateOf,
  missingReadinessAnswers,
  type ProfileRecord,
  type ReadinessRecord,
  readinessGates,
  resolveZone,
  type SettingsRecord,
  type TargetsRecord,
  type TimeZone,
  type WeightOverview,
  type WeightOverviewInput,
  weightGateInput,
  weightOverview,
  type WeightRecord,
} from '@diet/core';
import Dexie from 'dexie';
import { useMemo } from 'react';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { gateInputOf, useReadinessGates } from '../../onboarding/state';
import { useStore } from '../../store';
import { useNow } from '../../useNow';
import { preStartStopSignStore, preStartStopSignToday } from './preStartCheck';
import { endLatchStore } from './stores';

export interface WeightInputs {
  readonly profile: ProfileRecord;
  readonly targets: TargetsRecord;
  readonly settings: SettingsRecord;
  readonly readiness: readonly ReadinessRecord[];
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  readonly weights: readonly WeightRecord[];
  readonly cardStates: readonly CardStateRecord[];
}

/** Every record the weight picture reads, in one read transaction (a few hundred rows a year). */
export async function readWeightInputs(storage: AppStorage): Promise<WeightInputs> {
  const { db } = storage;
  const [profile, targets, settings, readiness, periods, checks, weights, cardStates] =
    await db.transaction(
      'r',
      [
        'profile',
        'targets',
        'settings',
        'readiness',
        'kickstart_periods',
        'kickstart_checks',
        'weights',
        'card_state',
      ],
      () =>
        Dexie.Promise.all([
          db.profile.get('singleton'),
          db.targets.get('singleton'),
          db.settings.get('singleton'),
          db.readiness.toArray(),
          db.kickstart_periods.toArray(),
          db.kickstart_checks.toArray(),
          db.weights.toArray(),
          db.card_state.toArray(),
        ]),
    );
  if (profile === undefined || targets === undefined || settings === undefined) {
    throw new Error('The singleton rows are missing');
  }
  return { profile, targets, settings, readiness, periods, checks, weights, cardStates };
}

/** The moment and the app state the picture is read at. */
export interface WeightEnv {
  readonly now: Instant;
  readonly deviceTimeZone: TimeZone;
  /** The local date of a pre-start stop-sign answer held in this page until its record is written. */
  readonly preStartStopSignDate: string | null;
  readonly endsPending: WeightOverviewInput['endsPending'];
}

/** The environment as it is now. */
export function currentWeightEnv(storage: AppStorage): WeightEnv {
  return {
    now: storage.env.now(),
    deviceTimeZone: storage.env.timeZone(),
    preStartStopSignDate: preStartStopSignStore.get(),
    endsPending: endLatchStore.get(),
  };
}

/**
 * The overview's input. `liveGates` is the gate input of item 13's hook on screen; without it (an
 * action or the reconciler's write) the same gate input is built from these records.
 */
export function overviewInputFrom(
  inputs: WeightInputs,
  env: WeightEnv,
  liveGates?: GateInput,
): WeightOverviewInput {
  const home = inputs.settings.homeTimeZone;
  const zone = resolveZone(env.deviceTimeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone;
  const today = localDateOf(env.now, zone);
  const gateInput =
    liveGates ??
    weightGateInput(
      {
        readiness: inputs.readiness,
        profile: inputs.profile,
        weights: inputs.weights,
        homeTimeZone: home,
      },
      today,
    );
  return {
    now: env.now,
    deviceTimeZone: env.deviceTimeZone,
    homeTimeZone: home,
    weights: inputs.weights,
    profile: inputs.profile,
    targets: inputs.targets,
    settings: inputs.settings,
    gates: readinessGates(gateInput),
    missingReadinessAnswers: missingReadinessAnswers(gateInput),
    periods: inputs.periods,
    checks: inputs.checks,
    cardStates: inputs.cardStates,
    preStartStopSignToday: preStartStopSignToday(
      inputs.cardStates,
      env.preStartStopSignDate,
      today,
    ),
    endsPending: env.endsPending,
  };
}

export interface WeightView {
  readonly inputs: WeightInputs;
  readonly input: WeightOverviewInput;
  readonly overview: WeightOverview;
}

/**
 * The live weight picture: re-read when the records change, recomputed every minute and when the
 * app comes back into view. Undefined while the records are still loading.
 */
export function useWeightView(storage: AppStorage): WeightView | undefined {
  const inputs = useLiveQuery(storage, readWeightInputs);
  // Item 13's gate hook: the same live gates as the setup guard and every gated screen.
  const gateState = useReadinessGates(storage)?.state;
  const now = useNow(storage.env);
  const preStart = useStore(preStartStopSignStore);
  const endsPending = useStore(endLatchStore);
  return useMemo(() => {
    if (inputs === undefined || gateState === undefined) return undefined;
    const input = overviewInputFrom(
      inputs,
      {
        now,
        deviceTimeZone: storage.env.timeZone(),
        preStartStopSignDate: preStart,
        endsPending,
      },
      gateInputOf(gateState, storage.env),
    );
    return { inputs, input, overview: weightOverview(input) };
  }, [inputs, gateState, now, preStart, endsPending, storage]);
}
