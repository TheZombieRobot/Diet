/**
 * What the first-run guard and every gated screen read (item 13 design sections 3.1 and 6.1):
 * the settings row, the readiness rows, the profile and the latest weight, live. The gates come
 * only from core readinessGates through gateInputFromRecords, so the whole app agrees with the
 * guard (C54; section 9.1 rule 1).
 */
import {
  type GateInput,
  gateInputFromRecords,
  localDateOf,
  type OnboardingStep,
  onboardingResumeStep,
  type ProfileRecord,
  type ReadinessGates,
  readinessGates,
  type ReadinessRecord,
  type SettingsRecord,
  type WeightRecord,
} from '@diet/core';
import { useLiveQuery } from '../db/liveQuery';
import type { StorageEnv } from '../db/env';
import type { AppStorage } from '../db/runtime';

export interface OnboardingState {
  readonly settings: SettingsRecord;
  readonly readinessRows: readonly ReadinessRecord[];
  readonly profile: ProfileRecord;
  /** The weight the gates use (HS-35). Item 14 replaces this rule (section 9.1 rule 2). */
  readonly latestWeightKg: number | null;
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
      state: { settings, readinessRows, profile, latestWeightKg: latestWeightKg(weights) },
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

/** The gate input from the stored records, read at today's date in the device zone. */
export function gateInputOf(state: OnboardingState, env: StorageEnv): GateInput {
  return gateInputFromRecords({
    rows: state.readinessRows,
    birthYear: state.profile.birthYear,
    heightCm: state.profile.heightCm,
    currentWeightKg: state.latestWeightKg,
    today: localDateOf(env.now(), env.timeZone()),
  });
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
  const read = useOnboardingState(storage);
  if (storage === null || read === undefined || !read.ok) return undefined;
  const input = gateInputOf(read.state, storage.env);
  return { input, gates: readinessGates(input), state: read.state };
}
