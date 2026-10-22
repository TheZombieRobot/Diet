/**
 * What the first-run guard and every gated screen read (item 13 design sections 3.1 and 6.1):
 * the settings row, the readiness rows, the profile and the weigh-ins, live. The gates come only
 * from core readinessGates through weightGateInput (gateInputFromRecords fed item 14's current
 * weight: the lowest of the 7-day average, the latest day's mean and the latest weigh-in), so the
 * guard, every gated screen and the weight screens agree (C54; section 9.1 rules 1 and 2; HS-35).
 */
import {
  gateCurrentWeightKg,
  type GateInput,
  type Instant,
  type LocalDate,
  localDateOf,
  type OnboardingStep,
  onboardingResumeStep,
  type ProfileRecord,
  type ReadinessGates,
  readinessGates,
  type ReadinessRecord,
  type SettingsRecord,
  weightGateInput,
  type WeightRecord,
} from '@diet/core';
import { useLiveQuery } from '../db/liveQuery';
import type { StorageEnv } from '../db/env';
import type { AppStorage } from '../db/runtime';

export interface OnboardingState {
  readonly settings: SettingsRecord;
  readonly readinessRows: readonly ReadinessRecord[];
  readonly profile: ProfileRecord;
  /** The latest weigh-in, which prefills the setup form's weight field (not the gates' weight). */
  readonly latestWeightKg: number | null;
  /** Every weigh-in, for the gates' current weight (gateWeightKgOf; HS-35). */
  readonly weights: readonly WeightRecord[];
}

export type OnboardingRead =
  { readonly ok: true; readonly state: OnboardingState } | { readonly ok: false };

/** The weigh-in with the latest time, or null when there is none. */
export function latestWeightKg(weights: readonly WeightRecord[]): number | null {
  let latest: WeightRecord | null = null;
  for (const w of weights) if (latest === null || w.at > latest.at) latest = w;
  return latest?.kg ?? null;
}

/**
 * The four reads, with every error caught (E57): a missing singleton or a closed database would
 * otherwise be swallowed by the live query and leave the opening screen waiting for ever.
 */
export async function readOnboardingState(storage: AppStorage): Promise<OnboardingRead> {
  try {
    const [settings, readinessRows, profile, weights] = await Promise.all([
      storage.repos.settings.get(),
      storage.repos.readiness.list(),
      storage.repos.profile.get(),
      storage.repos.weights.list(),
    ]);
    return {
      ok: true,
      state: { settings, readinessRows, profile, latestWeightKg: latestWeightKg(weights), weights },
    };
  } catch {
    return { ok: false };
  }
}

/** The live state, or undefined until the first read arrives (or while storage is opening). */
export function useOnboardingState(storage: AppStorage | null): OnboardingRead | undefined {
  return useLiveQuery(storage, readOnboardingState);
}

export interface OnboardingDerived {
  readonly input: GateInput;
  readonly gates: ReadinessGates;
  readonly step: OnboardingStep;
  /** 'repair': setup was finished but an answer or the acknowledgement is missing (RD-08). */
  readonly mode: 'setup' | 'repair';
}

/** Now, and today's date in the device zone. */
const clockOf = (env: StorageEnv): { readonly now: Instant; readonly today: LocalDate } => {
  const now = env.now();
  return { now, today: localDateOf(now, env.timeZone()) };
};

/** The gate input from the stored records, read at today's date in the device zone. */
export function gateInputOf(state: OnboardingState, env: StorageEnv): GateInput {
  const { now, today } = clockOf(env);
  return weightGateInput(
    {
      readiness: state.readinessRows,
      profile: state.profile,
      weights: state.weights,
      homeTimeZone: state.settings.homeTimeZone,
    },
    today,
    now,
  );
}

/** The current weight the gates read (item 14's rule; HS-35), for a form's own low-weight check. */
export function gateWeightKgOf(state: OnboardingState, env: StorageEnv): number | null {
  const { now, today } = clockOf(env);
  return gateCurrentWeightKg(state.weights, today, now, state.settings.homeTimeZone);
}

export function deriveOnboarding(state: OnboardingState, env: StorageEnv): OnboardingDerived {
  const input = gateInputOf(state, env);
  const step = onboardingResumeStep(state.settings, input, state.profile);
  const mode =
    state.settings.onboardingCompletedAt !== null && step !== 'done' ? 'repair' : 'setup';
  return { input, gates: readinessGates(input), step, mode };
}

export interface ReadinessGateView {
  readonly input: GateInput;
  readonly gates: ReadinessGates;
  readonly state: OnboardingState;
}

/**
 * The one hook every gated screen uses (items 13 to 15, 21, 22, 27 and 28): the live gate input
 * and gates, or undefined until the records arrive (or when they cannot be read). A write anywhere
 * re-renders every consumer at once (RD-06).
 */
export function useReadinessGates(storage: AppStorage | null): ReadinessGateView | undefined {
  const read = useReadinessGateRead(storage);
  return read.status === 'ready' ? read.view : undefined;
}

export type ReadinessGateRead =
  | { readonly status: 'pending' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: ReadinessGateView };

/**
 * The same read with a failed read told apart from a pending one (item 27: Move shows a read
 * error rather than waiting for ever). One live query and one gate function with
 * useReadinessGates (C54).
 */
export function useReadinessGateRead(storage: AppStorage | null): ReadinessGateRead {
  const read = useOnboardingState(storage);
  if (storage === null || read === undefined) return { status: 'pending' };
  if (!read.ok) return { status: 'error' };
  const input = gateInputOf(read.state, storage.env);
  return { status: 'ready', view: { input, gates: readinessGates(input), state: read.state } };
}
