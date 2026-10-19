/**
 * The eating schedule chosen at setup and in Settings (UX 1e; HEALTH_SAFETY.md section 3; C07,
 * C55; HS-17; item 13 design section 4.8).
 *
 * - The default pattern is 23:1 (18:00–19:00) only when Kickstart is chosen, and 22:2
 *   (17:00–19:00) otherwise. A stored 'kickstart-default' means "23:1 while a Kickstart period
 *   runs"; item 14 moves it to 22:2 when none runs (C55, E51).
 * - With readiness answer 4 (medicine with food, blood pressure or cholesterol) nothing is chosen
 *   for the person (C07, E49), and "No fasting plan for now" is always a choice (E50).
 * - presetChosenBy stays a default whenever the saved schedule equals the default, so item 14's
 *   move still applies; a schedule the owner changed is 'user' and never moved silently (E19).
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

const sameSchedule = (a: SavedSchedule, b: SavedSchedule): boolean =>
  a.preset === b.preset && a.window.start === b.window.start && a.window.end === b.window.end;

/**
 * Who chose the saved schedule (E19): the stored value when nothing changed; the default's own
 * value when the saved schedule equals the default (also when answer 4 started with nothing
 * chosen and exactly the default was picked, E49); otherwise 'user'.
 */
export function scheduleChosenBy(
  saved: SavedSchedule,
  defaults: ScheduleDefault,
  stored: (SavedSchedule & { readonly chosenBy: 'kickstart-default' | 'default' | 'user' }) | null,
): 'kickstart-default' | 'default' | 'user' {
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
 * Where the schedule form starts (section 3.9) when there is no draft: what is stored (a pattern,
 * or "No fasting plan" once the step was confirmed with none); nothing chosen with answer 4
 * (E49); otherwise the default for the Kickstart choice (C55).
 */
export function scheduleStart(args: {
  readonly stored: Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow'>;
  readonly scheduleConfirmed: boolean;
  readonly pharmacistReminder: boolean;
  readonly kickstartChosen: boolean;
}): { readonly choice: ScheduleChoice | null; readonly window: EatingWindow | null } {
  const { fastingPreset, eatingWindow } = args.stored;
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
 * C55; E52): while fasting is gated nothing is kept in the preset fields at setup, and an
 * untouched default that no longer matches the Kickstart choice is stale. A 'user' schedule is
 * kept. After setup nothing is cleared here (item 14 owns the moves tied to Kickstart).
 */
export function setupScheduleReset(
  targets: Pick<TargetsRecord, 'fastingPreset' | 'presetChosenBy'>,
  ctx: {
    readonly onboardingCompleted: boolean;
    readonly fastingGated: boolean;
    readonly kickstartChosen: boolean;
  },
): boolean {
  if (ctx.onboardingCompleted || targets.fastingPreset === null) return false;
  if (ctx.fastingGated) return true;
  if (targets.presetChosenBy === 'user' || targets.presetChosenBy === null) return false;
  return targets.presetChosenBy !== defaultSchedule(ctx.kickstartChosen).chosenBy;
}
