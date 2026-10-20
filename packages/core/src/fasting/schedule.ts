/**
 * The eating schedule chosen at setup and in Settings (UX 1e; HEALTH_SAFETY.md section 3; C07,
 * C55; HS-17; item 13 design section 4.8).
 *
 * - The default pattern is 23:1 (18:00–19:00) only when Kickstart is chosen, and 22:2
 *   (17:00–19:00) otherwise. A stored 'kickstart-default' means "23:1 while a Kickstart period
 *   runs"; item 14 moves it to 22:2 when none runs (C55, E51).
 * - With readiness answer 4 (medicine with food, blood pressure or cholesterol) nothing is chosen
 *   for the person (C07, E49), and "No fasting plan for now" is always a choice (E50). A default
 *   the app chose before answer 4 turned yes is set aside: cleared at setup, and a stored Kickstart
 *   default is never used as 23:1 (item 14's effectiveFastingPreset).
 * - presetChosenBy stays a default whenever the saved schedule equals the default, so item 14's
 *   move still applies; a schedule the owner changed is 'user' and never moved silently (E19).
 *   With answer 4 there is no default: whatever the owner saves is their own choice.
 */
import type { TargetsRecord } from '../storage/records';
import {
  type EatingWindow,
  FASTING_PRESETS,
  type FastingPresetId,
  KICKSTART_DEFAULT_PRESET,
  parseClockTime,
  windowLength,
} from './eatingWindow';

/** A preset, custom clock times, or "No fasting plan for now". */
export type ScheduleChoice = FastingPresetId | 'custom' | 'none';

export interface ScheduleDefault {
  readonly preset: FastingPresetId;
  readonly window: EatingWindow;
  readonly chosenBy: 'kickstart-default' | 'default';
}

/** The pattern outside Kickstart (DECISIONS C55/C61/C65 row). */
const STEADY_DEFAULT_PRESET: FastingPresetId = '22:2';

/** A fresh copy of a preset's frozen default window. */
export function presetWindow(id: FastingPresetId): EatingWindow {
  const preset = FASTING_PRESETS.find((p) => p.id === id);
  if (preset === undefined) throw new RangeError(`Unknown fasting preset ${JSON.stringify(id)}`);
  return { start: preset.window.start, end: preset.window.end };
}

/** 23:1, 18:00–19:00 ('kickstart-default') when Kickstart is chosen; otherwise 22:2, 17:00–19:00 ('default'). */
export function defaultSchedule(kickstartChosen: boolean): ScheduleDefault {
  const preset = kickstartChosen ? KICKSTART_DEFAULT_PRESET : STEADY_DEFAULT_PRESET;
  return {
    preset,
    window: presetWindow(preset),
    chosenBy: kickstartChosen ? 'kickstart-default' : 'default',
  };
}

const eatingMinutesOf = (window: EatingWindow): number | null => {
  try {
    return windowLength(window).eatingMinutes;
  } catch {
    return null;
  }
};

/**
 * Editing a time keeps the selected preset only while the window still has the preset's length;
 * otherwise the selection moves to custom times (E20).
 */
export function presetForWindow(
  selected: FastingPresetId | 'custom',
  window: EatingWindow,
): FastingPresetId | 'custom' {
  if (selected === 'custom') return 'custom';
  const minutes = eatingMinutesOf(window);
  return minutes !== null && minutes === eatingMinutesOf(presetWindow(selected))
    ? selected
    : 'custom';
}

type SavedSchedule = { readonly preset: FastingPresetId | 'custom'; readonly window: EatingWindow };
type StoredSchedule = SavedSchedule & {
  readonly chosenBy: 'kickstart-default' | 'default' | 'user';
};

/** The stored schedule with who chose it, or null when no pattern is stored. */
export function storedSchedule(
  targets: Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'>,
): StoredSchedule | null {
  const { fastingPreset, eatingWindow, presetChosenBy } = targets;
  return fastingPreset === null || eatingWindow === null || presetChosenBy === null
    ? null
    : { preset: fastingPreset, window: eatingWindow, chosenBy: presetChosenBy };
}

const sameSchedule = (a: SavedSchedule, b: SavedSchedule): boolean =>
  a.preset === b.preset && a.window.start === b.window.start && a.window.end === b.window.end;

/**
 * The default the app may choose for the owner: none with answer 4 (C07, E49), where nothing is
 * chosen for them; otherwise defaultSchedule.
 */
export function scheduleDefaultFor(gates: {
  readonly pharmacistReminder: boolean;
  readonly kickstartChosen: boolean;
}): ScheduleDefault | null {
  return gates.pharmacistReminder ? null : defaultSchedule(gates.kickstartChosen);
}

/**
 * Who chose the saved schedule (E19): with no default (answer 4), always the owner ('user'), since
 * the app chose nothing for them; otherwise the stored value when nothing changed, the default's
 * own value when the saved schedule equals the default, and 'user' for anything else.
 */
export function scheduleChosenBy(
  saved: SavedSchedule,
  defaults: ScheduleDefault | null,
  stored: StoredSchedule | null,
): 'kickstart-default' | 'default' | 'user' {
  if (defaults === null) return 'user';
  if (stored !== null && sameSchedule(saved, stored)) return stored.chosenBy;
  if (sameSchedule(saved, defaults)) return defaults.chosenBy;
  return 'user';
}

/** The two time fields of the form, as a window the targets validator accepts. */
export function checkEatingWindowForm(
  start: string,
  end: string,
):
  | { readonly ok: true; readonly window: EatingWindow }
  | { readonly ok: false; readonly problem: 'invalid-time' | 'same-time' | 'too-short' } {
  try {
    parseClockTime(start);
    parseClockTime(end);
  } catch {
    return { ok: false, problem: 'invalid-time' };
  }
  if (start === end) return { ok: false, problem: 'same-time' };
  const window = { start, end };
  if (eatingMinutesOf(window) === null) return { ok: false, problem: 'too-short' };
  return { ok: true, window };
}

/**
 * The time fields a window problem belongs to, for marking them and moving focus: the one that is
 * not a time (or both), and both when the times are the same or too close.
 */
export function windowProblemFields(
  start: string,
  end: string,
  problem: 'invalid-time' | 'same-time' | 'too-short',
): readonly ('start' | 'end')[] {
  if (problem !== 'invalid-time') return ['start', 'end'];
  const isTime = (time: string): boolean => {
    try {
      parseClockTime(time);
      return true;
    } catch {
      return false;
    }
  };
  return [...(isTime(start) ? [] : ['start' as const]), ...(isTime(end) ? [] : ['end' as const])];
}

/**
 * Where the schedule form starts (section 3.9) when there is no draft: what is stored (a pattern,
 * or "No fasting plan" once the step was confirmed with none); nothing chosen with answer 4
 * (E49), also in place of a stored Kickstart default, which the app does not use for that owner;
 * otherwise the default for the Kickstart choice (C55).
 */
export function scheduleStart(args: {
  readonly stored: Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'>;
  readonly scheduleConfirmed: boolean;
  readonly pharmacistReminder: boolean;
  readonly kickstartChosen: boolean;
}): { readonly choice: ScheduleChoice | null; readonly window: EatingWindow | null } {
  const { fastingPreset, eatingWindow } = args.stored;
  if (args.pharmacistReminder && args.stored.presetChosenBy === 'kickstart-default') {
    return { choice: null, window: null };
  }
  if (fastingPreset !== null && eatingWindow !== null) {
    return { choice: fastingPreset, window: { start: eatingWindow.start, end: eatingWindow.end } };
  }
  if (args.scheduleConfirmed) return { choice: 'none', window: null };
  if (args.pharmacistReminder) return { choice: null, window: null };
  const defaults = defaultSchedule(args.kickstartChosen);
  return { choice: defaults.preset, window: defaults.window };
}

/**
 * Whether a schedule saved earlier in this setup must be cleared, and its step asked again (C07,
 * C55; E49, E52): while fasting is gated nothing is kept in the preset fields at setup; with
 * answer 4 a default the app chose (before that answer turned yes) is stale, so the step asks
 * again with nothing chosen; and an untouched default that no longer matches the Kickstart choice
 * is stale. A 'user' schedule is kept. After setup nothing is cleared here (item 14 owns the moves
 * tied to Kickstart, and its effectiveFastingPreset sets a Kickstart default aside for answer 4).
 */
export function setupScheduleReset(
  targets: Pick<TargetsRecord, 'fastingPreset' | 'presetChosenBy'>,
  ctx: {
    readonly onboardingCompleted: boolean;
    readonly fastingGated: boolean;
    readonly pharmacistReminder: boolean;
    readonly kickstartChosen: boolean;
  },
): boolean {
  if (ctx.onboardingCompleted || targets.fastingPreset === null) return false;
  if (ctx.fastingGated) return true;
  if (targets.presetChosenBy === 'user' || targets.presetChosenBy === null) return false;
  const defaults = scheduleDefaultFor(ctx);
  return defaults === null || targets.presetChosenBy !== defaults.chosenBy;
}
