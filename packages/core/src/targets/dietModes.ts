/**
 * The diet modes and the order suggestions take in each (FL-04; C70; item 21 design section 3.8;
 * T13, T31). Ranking never filters: switching mode re-ranks, and nothing is removed or deleted.
 * The key comes from the ceiling in effect, not the stored mode, so readiness, Kickstart and the
 * mode are already applied: with ceilings off, the order is the plain title order.
 */
import { netCarbsOf } from '../nutrition/netCarbs';
import type { Nutrients } from '../nutrition/nutrients';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import { extensionsOf, kickstartPeriodState } from '../storage/kickstart';
import type { Instant, TimeZone } from '../storage/primitives';
import type {
  DietMode,
  KickstartCheckRecord,
  KickstartPeriodRecord,
  NutrientKey,
  ProfileRecord,
  ReadinessRecord,
  SettingsRecord,
  WeightRecord,
} from '../storage/records';
import { localDateOf } from '../util/time';
import { latestKickstartPeriod } from '../weight/phase';
import { gatesFromRecords } from '../weight/presets';
import type { NetCarbCeiling } from './carbs';

/** Every diet mode, in the order the screens list them. Not read by the version-1 validators. */
export const DIET_MODES = Object.freeze([
  'keto',
  'moderate-low-carb',
  'balanced',
] as const satisfies readonly DietMode[]);

export function isDietMode(x: unknown): x is DietMode {
  return typeof x === 'string' && (DIET_MODES as readonly string[]).includes(x);
}

export interface RankableRecipe {
  readonly id: string;
  readonly title: string;
  readonly perServe: Nutrients;
  readonly unknownNutrients: readonly NutrientKey[];
}

/**
 * Lower is better. No ceiling: 0 for every recipe. Keto, Kickstart or held at 50: net carbs per
 * serve. Moderate: net carbs above half the ceiling, so dishes using up to half of it tie at 0.
 * With a ceiling, a recipe whose carbs are not known sorts after every known one.
 */
export function dietModeCarbKey(recipe: RankableRecipe, ceiling: NetCarbCeiling): number {
  if (ceiling.kind === 'none') return 0;
  if (recipe.unknownNutrients.includes('carbsG')) return Number.POSITIVE_INFINITY;
  const net = netCarbsOf(recipe.perServe);
  return ceiling.basis === 'moderate' ? Math.max(0, net - ceiling.grams / 2) : net;
}

const byTitle = (a: RankableRecipe, b: RankableRecipe): number =>
  a.title.localeCompare(b.title, 'en-NZ') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The same recipes, ordered by the carb key and then `tieBreak` (default: title, then id). A new
 * array of the same length with the same members: nothing is removed. Item 22 composes it after
 * its garden-first group (NU-07) with its own tie-break.
 */
export function rankForDietMode<T extends RankableRecipe>(
  recipes: readonly T[],
  ceiling: NetCarbCeiling,
  tieBreak: (a: T, b: T) => number = byTitle,
): T[] {
  return recipes
    .map((recipe) => ({ recipe, key: dietModeCarbKey(recipe, ceiling) }))
    .sort((a, b) => (a.key === b.key ? tieBreak(a.recipe, b.recipe) : a.key < b.key ? -1 : 1))
    .map(({ recipe }) => recipe);
}

/** The records a diet-mode switch decides from, read inside its transaction. */
export interface DietModeSwitchRecords {
  readonly profile: ProfileRecord;
  readonly settings: SettingsRecord;
  readonly readiness: readonly ReadinessRecord[];
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  readonly weights: readonly WeightRecord[];
}

export type DietModeSwitch =
  | { readonly kind: 'unchanged' }
  /** Leaving keto would end a Kickstart, and the owner has not confirmed it: write nothing (C56). */
  | { readonly kind: 'confirm-needed' }
  | {
      readonly kind: 'switch';
      readonly patch: Pick<ProfileRecord, 'dietMode' | 'carbCeilingStartedAt' | 'firstLowCarbAt'>;
      /** A Kickstart can still be ended (running, or not started yet): this switch ends it. */
      readonly endsKickstart: boolean;
    };

/**
 * What switching to `mode` writes (FL-04, C56, C72, C109; T14). The stored mode again changes
 * nothing. A Kickstart that can still be ended (running, or not started yet because its start is
 * dated ahead) is ended by any change of mode; leaving keto then needs the owner's confirmation,
 * decided here from the records, never from what a screen last saw. Every switch into keto writes
 * carbCeilingStartedAt = now, so a keto → other → keto round trip restarts the 14 days and never
 * resumes a Kickstart (ketoUnbrokenSince). firstLowCarbAt is set once, on the first change into or
 * out of a carb ceiling while the keto ceiling gate is open (item 13's rule), and never reset.
 * Nothing here starts a Kickstart, and nothing is deleted.
 */
export function dietModeSwitch(
  records: DietModeSwitchRecords,
  mode: DietMode,
  endKickstart: boolean,
  now: Instant,
  deviceTimeZone: TimeZone,
): DietModeSwitch {
  const { profile } = records;
  if (mode === profile.dietMode) return { kind: 'unchanged' };
  const home = records.settings.homeTimeZone;
  const latest = latestKickstartPeriod(records.periods);
  const state =
    latest === null
      ? null
      : kickstartPeriodState(
          latest,
          extensionsOf(latest.id, records.checks),
          now,
          deviceTimeZone,
          home,
        );
  const endsKickstart = state === 'running' || state === 'not-started';
  if (endsKickstart && profile.dietMode === 'keto' && !endKickstart) {
    return { kind: 'confirm-needed' };
  }
  const today = localDateOf(
    now,
    resolveZone(deviceTimeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone,
  );
  // The two modes differ, so one of them has a carb ceiling: this is a change into or out of one.
  const ceilingOpen = gatesFromRecords(records, today).ketoCeilingAvailable;
  return {
    kind: 'switch',
    patch: {
      dietMode: mode,
      carbCeilingStartedAt: mode === 'keto' ? now : profile.carbCeilingStartedAt,
      firstLowCarbAt: profile.firstLowCarbAt ?? (ceilingOpen ? now : null),
    },
    endsKickstart,
  };
}
