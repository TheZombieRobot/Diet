/**
 * The fasting preset and Kickstart (C55, C07; WT-08; item 13 section 9.1 rule 3; item 14 design
 * section 3.7, W15, W16).
 *
 * - The rule every reader uses: a stored 23:1 that is still the untouched Kickstart default
 *   ('kickstart-default') reads as 22:2, 17:00–19:00, whenever no Kickstart is running, so one meal
 *   a day never applies outside a running Kickstart, whatever has been written. While readiness
 *   answer 4 is "yes" or unanswered it reads as 22:2 even during Kickstart: the app chose that
 *   default before the answer, and nothing is chosen for that owner (C07, E49).
 * - The two stored moves keep the records in line: at a Kickstart start an untouched default moves
 *   to the 23:1 Kickstart default (never for answer 4 "yes" or unanswered, C07); outside Kickstart
 *   an untouched 23:1 Kickstart default moves back to 22:2. A preset the owner chose is never moved,
 *   and nothing moves while fasting is gated (a hidden setting is not changed).
 * Windows come from FASTING_PRESETS, never literals.
 */
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../storage/dates';
import type { Instant, TimeZone } from '../storage/primitives';
import { readinessGates } from '../readiness/gates';
import type { ReadinessGates } from '../storage/readiness';
import type {
  KickstartCheckRecord,
  KickstartPeriodRecord,
  ProfileRecord,
  ReadinessRecord,
  SettingsRecord,
  TargetsRecord,
  WeightRecord,
} from '../storage/records';
import { type EatingWindow, FASTING_PRESETS, type FastingPresetId } from '../fasting/eatingWindow';
import { localDateOf } from '../util/time';
import { weightGateInput } from './gateInput';
import { type Phase, phaseOn } from './phase';

export interface PresetChange {
  readonly fastingPreset: FastingPresetId;
  readonly eatingWindow: EatingWindow;
  readonly presetChosenBy: 'kickstart-default' | 'default';
}

export interface EffectivePreset {
  readonly fastingPreset: FastingPresetId | 'custom' | null;
  readonly eatingWindow: EatingWindow | null;
  readonly presetChosenBy: TargetsRecord['presetChosenBy'];
}

type PresetFields = Pick<TargetsRecord, 'fastingPreset' | 'presetChosenBy'>;

/** A preset's default window, as a fresh object. */
function windowOf(id: FastingPresetId): EatingWindow {
  const preset = FASTING_PRESETS.find((p) => p.id === id);
  if (preset === undefined) throw new RangeError(`No fasting preset ${id}`);
  return { start: preset.window.start, end: preset.window.end };
}

const change = (
  id: FastingPresetId,
  presetChosenBy: PresetChange['presetChosenBy'],
): PresetChange => ({ fastingPreset: id, eatingWindow: windowOf(id), presetChosenBy });

/** The stored preset is the untouched 23:1 Kickstart default. */
const isKickstartDefault = (targets: PresetFields): boolean =>
  targets.fastingPreset === '23:1' && targets.presetChosenBy === 'kickstart-default';

/**
 * The preset every screen and planner uses: an untouched 23:1 Kickstart default reads as 22:2
 * 'default' whenever no Kickstart is running, and always while answer 4 applies (C07).
 */
export function effectiveFastingPreset(
  targets: Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'>,
  kickstartRunning: boolean,
  gates: Pick<ReadinessGates, 'pharmacistReminder'>,
): EffectivePreset {
  if ((!kickstartRunning || gates.pharmacistReminder) && isKickstartDefault(targets)) {
    return change('22:2', 'default');
  }
  return {
    fastingPreset: targets.fastingPreset,
    eatingWindow: targets.eatingWindow,
    presetChosenBy: targets.presetChosenBy,
  };
}

/**
 * At a Kickstart start: an untouched default becomes the 23:1 Kickstart default; otherwise null.
 * Null while fasting is gated, and while answer 4 is "yes" or unanswered, so a start never moves
 * that owner to one meal a day (C07).
 */
export function kickstartStartPresetChange(
  targets: PresetFields,
  gates: Pick<ReadinessGates, 'fastingGated' | 'pharmacistReminder'>,
): PresetChange | null {
  if (gates.fastingGated || gates.pharmacistReminder) return null;
  return targets.presetChosenBy === 'default' ? change('23:1', 'kickstart-default') : null;
}

/**
 * A start leaves the eating window at 23:1: it moves an untouched default there, or finds the 23:1
 * Kickstart default stored. Never while answer 4 applies, when a stored Kickstart default is not
 * used either (effectiveFastingPreset).
 */
export function kickstartStartUses231(
  targets: PresetFields,
  gates: Pick<ReadinessGates, 'fastingGated' | 'pharmacistReminder'>,
): boolean {
  if (gates.fastingGated || gates.pharmacistReminder) return false;
  return kickstartStartPresetChange(targets, gates) !== null || isKickstartDefault(targets);
}

/**
 * Outside Kickstart: a stored 23:1 Kickstart default becomes 22:2 'default'. Null while the phase
 * is Kickstart, fasting is gated or onboarding is incomplete. Never depends on a card's state.
 */
export function presetMoveDue(input: {
  readonly targets: PresetFields;
  readonly phase: Phase;
  readonly fastingGated: boolean;
  readonly onboardingCompleted: boolean;
}): PresetChange | null {
  if (!input.onboardingCompleted || input.fastingGated || input.phase.kind === 'kickstart') {
    return null;
  }
  return isKickstartDefault(input.targets) ? change('22:2', 'default') : null;
}

export interface PresetRecords {
  readonly targets: TargetsRecord;
  readonly profile: ProfileRecord;
  readonly settings: SettingsRecord;
  readonly readiness: readonly ReadinessRecord[];
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  readonly weights: readonly WeightRecord[];
}

/** The gates from stored records, with the weight screens' current weight. */
export function gatesFromRecords(
  records: Pick<PresetRecords, 'readiness' | 'profile' | 'settings' | 'weights'>,
  today: string,
): ReadinessGates {
  return readinessGates(
    weightGateInput(
      {
        readiness: records.readiness,
        profile: records.profile,
        weights: records.weights,
        homeTimeZone: records.settings.homeTimeZone,
      },
      today,
    ),
  );
}

/** presetMoveDue from stored rows, for the repository's in-transaction re-check. */
export function presetMoveDueFromRecords(
  records: PresetRecords,
  now: Instant,
  deviceTimeZone: TimeZone,
): PresetChange | null {
  const home = records.settings.homeTimeZone;
  const today = localDateOf(
    now,
    resolveZone(deviceTimeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone,
  );
  const gates = gatesFromRecords(records, today);
  const phase = phaseOn({
    now,
    today,
    deviceTimeZone,
    homeTimeZone: home,
    dietMode: records.profile.dietMode,
    carbCeilingStartedAt: records.profile.carbCeilingStartedAt,
    gates,
    periods: records.periods,
    checks: records.checks,
  });
  return presetMoveDue({
    targets: records.targets,
    phase,
    fastingGated: gates.fastingGated,
    onboardingCompleted: records.settings.onboardingCompletedAt !== null,
  });
}
