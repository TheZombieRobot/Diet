/**
 * What a restore keeps from the phone, and what the confirmation must say about it (storage spec
 * section 10.6 step 9; D27; full review F1, F3, F12, F13). Pure: the app reads the phone, calls
 * these, and writes the result in one transaction that first checks the phone has not changed.
 *
 * - The Kickstart history is merged, never chosen side by side: every period, every check and every
 *   pre-start "yes" from both the phone and the file, by key, so a restore can never drop a
 *   Kickstart day, an extension, an end or a stop-sign answer (and so never reopens a cap, an offer
 *   after a stop sign, or the 336-hour wait). A period on both sides is taken where it has ended,
 *   since an end is written once and never undone. If the two histories cannot be combined (two
 *   unrelated histories that overlap or pass a cap, say a backup from before a delete-all and a
 *   Kickstart started since; a start too soon after the other side's stop-sign answer; or an end
 *   before days the other side had already lived), the file is refused rather than either side
 *   dropped.
 * - While the phone's latest Kickstart has not finished, the diet mode, the keto-run start and the
 *   Kickstart default eating pattern come from the phone too, so the Kickstart kept is not ended by
 *   an older file's settings (a backup made before the start holds no keto-run start).
 * - A fast running when the backup was made comes back as still running; the confirmation says so
 *   and offers to end it at the time the backup was made.
 */
import { localDateOf } from '../../util/time';
import { isPreStartStopSignRow, preStartStopSignOn } from '../../weight/preStart';
import { gatesFromRecords } from '../../weight/presets';
import { kickstartEndNeeded, latestKickstartPeriod, recentStopSignCheck } from '../../weight/phase';
import { clockHighWater, notBeforeAny } from '../clock';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../dates';
import { findInvariantViolation } from '../invariants';
import {
  effectiveLastDay,
  extensionsOf,
  kickstartPeriodState,
  NEVER_RAN_END_MS,
  periodDay1,
} from '../kickstart';
import { type Instant, instantMs, type TimeZone } from '../primitives';
import type {
  CardStateRecord,
  FastRecord,
  KickstartCheckRecord,
  KickstartPeriodRecord,
  ProfileRecord,
  Snapshot,
  TargetsRecord,
} from '../records';
import { stableStringify } from '../tables';
import { BackupError, KICKSTART_MERGE_RULE } from './errors';

/** The moment a restore is planned at, on this phone. */
export interface RestoreClock {
  readonly now: Instant;
  readonly deviceTimeZone: TimeZone;
}

const isPreStartRow = (row: CardStateRecord): boolean => isPreStartStopSignRow(row);

/** One of two copies of a period with the same id: the ended one, or the later end when both are. */
function laterState(
  phone: KickstartPeriodRecord,
  file: KickstartPeriodRecord,
): KickstartPeriodRecord {
  if (phone.endedAt === null) return file.endedAt === null ? phone : file;
  if (file.endedAt === null) return phone;
  // Both ended (only when one file was restored onto two phones): the later end, so every check
  // either side kept still falls before it, and no Kickstart day is dropped.
  return instantMs(file.endedAt) > instantMs(phone.endedAt) ? file : phone;
}

/** One of two pre-start rows of the same date: the later "yes" (its 336 hours end later). */
function laterAnswer(phone: CardStateRecord, file: CardStateRecord): CardStateRecord {
  const at = (row: CardStateRecord) => row.firstShownAt ?? row.dismissedAt ?? row.doneAt ?? '';
  return at(file) > at(phone) ? file : phone;
}

function mergeBy<T>(
  phone: readonly T[],
  file: readonly T[],
  key: (row: T) => string,
  choose: (phone: T, file: T) => T,
): T[] {
  const merged = new Map<string, T>();
  for (const row of file) merged.set(key(row), row);
  for (const row of phone) {
    const other = merged.get(key(row));
    merged.set(key(row), other === undefined ? row : choose(row, other));
  }
  return [...merged.values()];
}

/** Whether two lists hold the same rows, in any order. */
const sameRows = (a: readonly unknown[], b: readonly unknown[]): boolean => {
  const serial = (rows: readonly unknown[]) => rows.map((row) => stableStringify(row)).sort();
  return stableStringify(serial(a)) === stableStringify(serial(b));
};

export interface MergedKickstart {
  /** The file's snapshot with the merged periods, checks and pre-start answers. */
  readonly snapshot: Snapshot;
  /** The merged history holds Kickstart records from this phone that the file does not. */
  readonly keptFromPhone: boolean;
}

/**
 * How far each side's history had run (re-check V2): the phone's clock now, in its zone, and the
 * time the file was made. Each is lifted to the side's newest saved instant (livedUntil), as an
 * end is (kickstartEndAt), so a clock set back never makes lived days count as fewer.
 */
export interface MergeSeen {
  readonly phone: Instant;
  readonly deviceTimeZone: TimeZone;
  readonly file: Instant;
}

/** When a side's history was last seen running: `at`, or its newest saved instant if later. */
export function livedUntil(tables: Snapshot, at: Instant): Instant {
  return notBeforeAny(at, clockHighWater(tables));
}

/**
 * A copy of a period cuts days the other copy had already lived (re-check V2): the two copies
 * disagree on its start (written once, so only an edited file can), or the merged copy is ended
 * on an earlier day than either copy had reached. An open copy had reached the day it was last
 * seen on (as if ended then, so never past its scheduled last day); an ended one, its own last day.
 */
function cutsLivedDays(
  merged: KickstartPeriodRecord,
  copies: readonly (readonly [KickstartPeriodRecord, Instant, TimeZone])[],
  extensions: number,
  home: TimeZone | undefined,
): boolean {
  const kept = effectiveLastDay(merged, extensions, home);
  return copies.some(([copy, seen, zone]) => {
    if (instantMs(copy.startedAt) !== instantMs(merged.startedAt)) return true;
    if (copy.timeZone !== merged.timeZone) return true;
    if (merged.endedAt === null) return false;
    const lived = copy.endedAt === null ? { ...copy, endedAt: seen, endedTimeZone: zone } : copy;
    return effectiveLastDay(lived, extensions, home) > kept;
  });
}

/**
 * A period of the merged history starts less than 336 hours after a stop-sign check of an earlier
 * period, or on the date of a pre-start "yes" (W31; re-check V1). The app never starts one, so a
 * merge that makes one would bring in a Kickstart the phone had refused.
 */
function startsTooSoon(snapshot: Snapshot): boolean {
  const home = snapshot.settings[0]?.homeTimeZone;
  const periods = snapshot.kickstart_periods;
  return periods.some((period) => {
    const start = instantMs(period.startedAt);
    const earlier = new Set(periods.filter((p) => instantMs(p.startedAt) < start).map((p) => p.id));
    const checks = snapshot.kickstart_checks.filter((c) => earlier.has(c.periodId));
    return (
      recentStopSignCheck(checks, period.startedAt) ||
      preStartStopSignOn(snapshot.card_state, periodDay1(period, home))
    );
  });
}

/**
 * The file's snapshot with the Kickstart history of both sides (F1, F12): periods by id (the
 * ended copy, or the later end), checks by id (they never change), and pre-start "yes" rows by
 * date (the later answer). Throws a BackupError ('inconsistent', rule kickstart-merge) when the
 * file is refused, so neither side is dropped: a period's copies disagree on its start, or its
 * merged copy ends before a day either copy had lived by `seen` (re-check V2); when the merge
 * keeps anything of the phone's, the merged history breaks a section 5 rule; or, when the phone
 * holds any Kickstart record, a period in it starts too soon after a stop-sign answer (re-check
 * V1), even in a file that holds all of the phone's records too (an edited plain backup).
 */
export function mergeKickstartHistory(
  phone: Snapshot,
  file: Snapshot,
  seen: MergeSeen,
): MergedKickstart {
  const periods = mergeBy(phone.kickstart_periods, file.kickstart_periods, (p) => p.id, laterState);
  const checks = mergeBy<KickstartCheckRecord>(
    phone.kickstart_checks,
    file.kickstart_checks,
    (c) => c.id,
    (own) => own,
  );
  const fileAnswers = file.card_state.filter(isPreStartRow);
  const answers = mergeBy(
    phone.card_state.filter(isPreStartRow),
    fileAnswers,
    (row) => row.trigger,
    laterAnswer,
  );
  const snapshot: Snapshot = {
    ...file,
    kickstart_periods: periods,
    kickstart_checks: checks,
    card_state: [...file.card_state.filter((row) => !isPreStartRow(row)), ...answers],
  };
  const refused = () => new BackupError('inconsistent', { rule: KICKSTART_MERGE_RULE });
  const home = snapshot.settings[0]?.homeTimeZone;
  const fileCopies = new Map(file.kickstart_periods.map((p) => [p.id, p]));
  for (const own of phone.kickstart_periods) {
    const other = fileCopies.get(own.id);
    if (other === undefined) continue;
    // The file's copy is read in its start zone: the zone of the phone that made it is not known.
    const copies = [
      [own, seen.phone, seen.deviceTimeZone],
      [other, seen.file, other.timeZone],
    ] as const;
    const extensions = extensionsOf(own.id, checks);
    if (cutsLivedDays(laterState(own, other), copies, extensions, home)) throw refused();
  }
  const keptFromPhone =
    !sameRows(periods, file.kickstart_periods) ||
    !sameRows(checks, file.kickstart_checks) ||
    !sameRows(answers, fileAnswers);
  const phoneHistory =
    phone.kickstart_periods.length > 0 ||
    phone.kickstart_checks.length > 0 ||
    phone.card_state.some(isPreStartRow);
  if (keptFromPhone && findInvariantViolation(snapshot) !== null) throw refused();
  if (phoneHistory && startsTooSoon(snapshot)) throw refused();
  return { snapshot, keptFromPhone };
}

/** The fields that keep a Kickstart running, kept from the phone while its Kickstart runs (F13). */
export interface RunningKickstartSettings {
  readonly profile: Pick<ProfileRecord, 'dietMode' | 'carbCeilingStartedAt'>;
  /** The 23:1 Kickstart default the start chose (C55), or null when the owner chose the pattern. */
  readonly targets: Pick<TargetsRecord, 'fastingPreset' | 'eatingWindow' | 'presetChosenBy'> | null;
}

/**
 * When the phone's latest Kickstart has not finished at `clock` (running, or not started yet), the
 * phone's diet mode and keto-run start, and its eating pattern when that is the Kickstart default:
 * a restore keeps these with the Kickstart, or the keto-run rule would end it as left-keto on the
 * next launch (F13). Null when no Kickstart is running on the phone.
 */
export function runningKickstartSettings(
  phone: Snapshot,
  clock: RestoreClock,
): RunningKickstartSettings | null {
  const latest = latestKickstartPeriod(phone.kickstart_periods);
  const [profile] = phone.profile;
  const [targets] = phone.targets;
  if (latest === null || profile === undefined || targets === undefined) return null;
  const home = phone.settings[0]?.homeTimeZone;
  const state = kickstartPeriodState(
    latest,
    extensionsOf(latest.id, phone.kickstart_checks),
    clock.now,
    clock.deviceTimeZone,
    home,
  );
  if (state !== 'running' && state !== 'not-started') return null;
  return {
    profile: { dietMode: profile.dietMode, carbCeilingStartedAt: profile.carbCeilingStartedAt },
    targets:
      targets.presetChosenBy === 'kickstart-default'
        ? {
            fastingPreset: targets.fastingPreset,
            eatingWindow: targets.eatingWindow,
            presetChosenBy: targets.presetChosenBy,
          }
        : null,
  };
}

/** The snapshot with the running Kickstart's settings put in (runningKickstartSettings). */
export function withRunningKickstartSettings(
  snapshot: Snapshot,
  kept: RunningKickstartSettings,
): Snapshot {
  const [profile] = snapshot.profile;
  const [targets] = snapshot.targets;
  if (profile === undefined || targets === undefined) return snapshot;
  return {
    ...snapshot,
    profile: [{ ...profile, ...kept.profile }],
    targets: [kept.targets === null ? targets : { ...targets, ...kept.targets }],
  };
}

/**
 * Whether the Kickstart running on the phone would end once `written` is restored (the phase
 * engine's own rule, kickstartEndNeeded, over the restored answers, profile and weigh-ins), so the
 * confirmation can say so before Replace.
 */
export function kickstartEndsAfterRestore(written: Snapshot, clock: RestoreClock): boolean {
  const [profile] = written.profile;
  const [settings] = written.settings;
  if (profile === undefined || settings === undefined) return false;
  const home = settings.homeTimeZone;
  const today = localDateOf(
    clock.now,
    resolveZone(clock.deviceTimeZone, home, DEFAULT_HOME_TIME_ZONE).timeZone,
  );
  const gates = gatesFromRecords(
    { readiness: written.readiness, profile, settings, weights: written.weights },
    today,
    clock.now,
  );
  return (
    kickstartEndNeeded({
      now: clock.now,
      today,
      deviceTimeZone: clock.deviceTimeZone,
      homeTimeZone: home,
      dietMode: profile.dietMode,
      carbCeilingStartedAt: profile.carbCeilingStartedAt,
      gates,
      periods: written.kickstart_periods,
      checks: written.kickstart_checks,
    }) !== null
  );
}

/**
 * The file's fast that was running when the backup was made (it started before exportedAt and has
 * no end), or null (F3). Restored, it shows as still running, counted from its start.
 */
export function fastRunningAtBackup(file: Snapshot, exportedAt: Instant): FastRecord | null {
  const running = file.fasts.find((f) => f.endedAt === null);
  return running !== undefined && instantMs(running.startedAt) < instantMs(exportedAt)
    ? running
    : null;
}

/**
 * The snapshot with that fast ended when the backup was made, which the owner chooses on the
 * confirmation when they have eaten since (F3): at exportedAt (never after this phone's now, never
 * before 1 ms after its start), in the zone it was started in. Its end can be corrected in History.
 */
export function endFastAtBackup(snapshot: Snapshot, exportedAt: Instant, now: Instant): Snapshot {
  const running = fastRunningAtBackup(snapshot, exportedAt);
  if (running === null) return snapshot;
  const endMs = Math.max(
    Math.min(instantMs(exportedAt), instantMs(now)),
    instantMs(running.startedAt) + NEVER_RAN_END_MS,
  );
  const ended: FastRecord = {
    ...running,
    endedAt: new Date(endMs).toISOString(),
    endedTimeZone: running.timeZone,
  };
  return { ...snapshot, fasts: snapshot.fasts.map((f) => (f.id === running.id ? ended : f)) };
}
